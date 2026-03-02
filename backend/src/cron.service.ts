// backend/src/cron.service.ts
import "dotenv/config";
import cron from "node-cron";
import { prisma } from "./lib/prisma";
import { enviarAlertaContrato as enviarAlertaContratoEmail } from "./email.service";

interface PrincipalContrato {
  contrato?: {
    fechaTerminacion?: string;
  };
}

/**
 * Normaliza "22/03/2026" -> "2026-03-22".
 * Si ya viene "2026-03-22" la deja igual.
 * Devuelve string ISO (YYYY-MM-DD) o null si no puede parsear.
 */
function normalizarFecha(raw: string): string | null {
  if (!raw) return null;

  // Parece ISO "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  // "DD/MM/YYYY"
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const d = dd.padStart(2, "0");
    const m2 = mm.padStart(2, "0");
    return `${yyyy}-${m2}-${d}`;
  }

  // "DD-MM-YYYY"
  const m2 = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m2) {
    const [, dd, mm, yyyy] = m2;
    const d = dd.padStart(2, "0");
    const m3 = mm.padStart(2, "0");
    return `${yyyy}-${m3}-${d}`;
  }

  return null;
}

function diasRestantes(fecha: Date): number {
  const hoy = new Date();
  const fin = new Date(fecha);

  // Normaliza a medianoche local
  hoy.setHours(0, 0, 0, 0);
  fin.setHours(0, 0, 0, 0);

  const diff = fin.getTime() - hoy.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

async function procesarAlertasContratos(): Promise<void> {
  // Buscar contratos que aún no enviaron alerta de 20 días
  const contratos = await prisma.contrato.findMany({
    where: { alerta20Enviada: false },
    select: {
      id: true,
      numeroContrato: true,
      proveedor: true,   // usado en el email
      principal: true,   // JSON con principal.contrato.fechaTerminacion
      alerta20Enviada: true,
    },
  });

  console.log(`Encontrados ${contratos.length} contratos pendientes de alerta`);

  for (const contrato of contratos) {
    const principal = contrato.principal as PrincipalContrato | null | undefined;

    const fechaFinString = principal?.contrato?.fechaTerminacion;
    if (!fechaFinString) {
      console.log(`Contrato ${contrato.numeroContrato} sin fecha de terminación → skip`);
      continue;
    }

    // Normaliza string de fecha antes de parsear
    const iso = normalizarFecha(fechaFinString);
    if (!iso) {
      console.log(`Contrato ${contrato.numeroContrato} tiene fecha no parseable ("${fechaFinString}") → skip`);
      continue;
    }

    const fechaFin = new Date(iso);
    if (isNaN(fechaFin.getTime())) {
      console.log(`Contrato ${contrato.numeroContrato} tiene fecha inválida (${iso}) → skip`);
      continue;
    }

    const dias = diasRestantes(fechaFin);
    console.log(
      `Contrato ${contrato.numeroContrato}: fechaFin=${fechaFin.toISOString().slice(0, 10)} → faltan ${dias} días`
    );

    // Condición estricta de 20 días:
    if (dias === 20 && !contrato.alerta20Enviada) {
      // Si prefieres tolerante, usa: if (dias <= 20 && dias > 0 && !contrato.alerta20Enviada) { ... }
      console.log(`📧 Enviando alerta para contrato ${contrato.numeroContrato} (faltan 20 días)`);

      try {
        await enviarAlertaContratoEmail(
          process.env.EMAIL_USER as string, // destinatario (ajústalo si es otro)
          contrato
        );

        // Marcar como enviada
        await prisma.contrato.update({
          where: { id: contrato.id },
          data: { alerta20Enviada: true },
        });

        console.log(`✅ Alerta enviada y marcada para ${contrato.numeroContrato}`);
      } catch (emailErr) {
        console.error(`Error enviando email para ${contrato.numeroContrato}:`, emailErr);
      }
    } else if (dias < 20 && dias > 0) {
      console.log(`Contrato ${contrato.numeroContrato} ya pasó los 20 días (quedan ${dias})`);
    } else if (dias <= 0) {
      console.log(`Contrato ${contrato.numeroContrato} ya venció o vence hoy (dias=${dias})`);
    } else {
      // dias > 20 → aún no corresponde enviar
    }
  }
}

export function iniciarCronContratos() {
  // Todos los días a las 8:00 AM (Bogotá)
  cron.schedule(
    "0 8 * * *",
    async () => {
      console.log("🔎 Iniciando revisión diaria de contratos (08:00 AM)");
      try {
        await procesarAlertasContratos();
      } catch (err) {
        console.error("Error en el cron de contratos:", err);
      }
    },
    { timezone: "America/Bogota" }
  );

  console.log("⏰ Cron de alertas de contratos programado (diario 08:00 AM)");
}

/**
 * Ejecuta inmediatamente la misma lógica del cron.
 * Útil si iniciaste el servidor después de las 08:00 y quieres disparar hoy.
 * Llama a esta función desde server.ts después de iniciar el cron.
 */
export async function ejecutarAlertaHoy() {
  console.log("⚡ Ejecutando verificación de alertas inmediatamente (por inicio tardío)");
  try {
    await procesarAlertasContratos();
    console.log("✅ Verificación inmediata completada");
  } catch (err) {
    console.error("Error en verificación inmediata:", err);
  }
}

// Utilidad para probar manualmente el envío una vez sobre el primer contrato elegible
export async function probarAlertaContrato() {
  console.log("🔧 Iniciando PRUEBA MANUAL de alerta de contrato");
  try {
    const contratoPrueba = await prisma.contrato.findFirst({
      where: { alerta20Enviada: false },
      select: {
        id: true,
        numeroContrato: true,
        proveedor: true,
        principal: true,
        alerta20Enviada: true,
      },
    });

    if (!contratoPrueba) {
      console.log("❌ No se encontró ningún contrato con alerta20Enviada = false");
      return;
    }

    // Normaliza y verifica fecha para la prueba
    const principal = contratoPrueba.principal as PrincipalContrato | null | undefined;
    const fechaFinString = principal?.contrato?.fechaTerminacion;
    const iso = fechaFinString ? normalizarFecha(fechaFinString) : null;
    const fechaFin = iso ? new Date(iso) : null;
    const dias = fechaFin ? diasRestantes(fechaFin) : null;

    console.log(
      `Contrato de prueba: ${contratoPrueba.numeroContrato}` +
        (iso ? ` | fechaFin=${iso} | faltan=${dias} días` : " | fechaFin=NO DEFINIDA")
    );

    await enviarAlertaContratoEmail(
      process.env.EMAIL_USER as string,
      contratoPrueba
    );

    await prisma.contrato.update({
      where: { id: contratoPrueba.id },
      data: { alerta20Enviada: true },
    });

    console.log("✅ Prueba completada: email enviado y alerta marcada");
  } catch (err) {
    console.error("Error en prueba manual:", err);
  }
}