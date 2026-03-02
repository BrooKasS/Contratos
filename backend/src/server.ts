import "dotenv/config";
import express, { Request, Response } from "express";
import fileUpload, { UploadedFile } from "express-fileupload";
import cors from "cors";
import { prisma } from "./lib/prisma";
import { extraerCRP } from "./etl/sections/crp.parser";
import { extraerPolizas } from "./etl/sections/polizas.parser";
import { extraerOtrosi } from "./etl/sections/otrosi.parser";
import { extraerContratoPrincipal } from "./etl/sections/principal.parser";
import { extraerPagoActual } from "./etl/sections/pagoAct.parser";
import { extraerGeneralidades } from "./etl/sections/generalidades.parser";
import { extraerContratoCompleto } from "./contract.service";
import { iniciarCronContratos, ejecutarAlertaHoy } from "./cron.service";

function limpiarUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj
      .filter(v => v !== undefined)
      .map(v => limpiarUndefined(v));
  }

  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, limpiarUndefined(v)])
    );
  }

  return obj;
}

const app = express();
app.use(cors()); // Si quieres restringir: cors({ origin: "http://localhost:3000" })
app.use(fileUpload());
app.use(express.json());

// Salud
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Ruta principal
app.get("/", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    msg: "Endpoint contrato general: /api/upload/contrato",
  });
});

// ---------------------- RUTA CONTRATO COMPLETO ----------------------
app.post("/api/upload/contrato", async (req: Request & { files?: any }, res: Response) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({
        ok: false,
        error: "Falta archivo 'informe' en multipart/form-data.",
      });
    }

    const f = req.files.informe as UploadedFile;
    const buffer = Buffer.from(f.data);

    const contrato = extraerContratoCompleto(buffer, f.name);
    const numeroContrato = contrato.generalidades.generalidades.numeroContrato;

    const existe = await prisma.contrato.findUnique({
      where: { numeroContrato },
    });

    if (existe) {
      return res.status(409).json({
        ok: false,
        error: "El contrato ya existe en la base de datos",
      });
    }

    await prisma.contrato.create({
      data: {
        numeroContrato,
        proveedor: contrato.generalidades.generalidades.contratista,
        tipoContrato: contrato.generalidades.generalidades.tipoContrato ?? null,
        fechaInforme: contrato.generalidades.generalidades.fechaInforme
          ? new Date(contrato.generalidades.generalidades.fechaInforme)
          : null,
        generalidades: limpiarUndefined(contrato.generalidades),
        principal: limpiarUndefined(contrato.principal),
        crp: limpiarUndefined(contrato.crp),
        polizas: limpiarUndefined(contrato.polizas),
        otrosies: limpiarUndefined(contrato.otrosies),
        pagos: limpiarUndefined(contrato.pagos),
      },
    });

    return res.json({
      ok: true,
      resumen: {
        contratista: contrato.generalidades.generalidades.contratista,
        numeroContrato: contrato.generalidades.generalidades.numeroContrato,
        tipoContrato: contrato.generalidades.generalidades.tipoContrato,
        fechaInforme: contrato.generalidades.generalidades.fechaInforme,
      },
      contrato,
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      error: e.message || "Error extrayendo contrato completo",
    });
  }
});

// --------------------- CONTRATO POR ID (UUID String) ---------------------
app.get("/api/contratos/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id); // ← id es string (UUID)

    const contrato = await prisma.contrato.findUnique({
      where: { id },
    });

    if (!contrato) {
      return res.status(404).json({ ok: false, error: "Contrato no encontrado" });
    }

    return res.json({ ok: true, contrato });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Error obteniendo contrato" });
  }
});

// -------------------  RUTA GENERALIDADES DEL CONTRATO ----------------
app.post("/api/upload/generalidades", async (req: Request & { files?: any }, res: Response) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({ ok: false, error: "Falta archivo 'informe' en multipart/form-data." });
    }
    const f = req.files.informe as UploadedFile;
    const buffer = Buffer.from(f.data);
    const result = extraerGeneralidades(buffer, f.name);
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "Error extrayendo las generalidades del contrato. Es posible que no se hayan subido." });
  }
});

// ---------------------- RUTA INFO PRINCIPAL DEL CONTRATO ----------------------
app.post("/api/upload/principal", async (req: Request & { files?: any }, res: Response) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({ ok: false, error: "Falta archivo 'informe' en multipart/form-data." });
    }
    const f = req.files.informe as UploadedFile;
    const buffer = Buffer.from(f.data);
    const result = extraerContratoPrincipal(buffer, f.name);
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "Error extrayendo CONTRATO PRINCIPAL" });
  }
});

// ---------------------- RUTA CRP ----------------------
app.post("/api/upload/crp", async (req: Request & { files?: any }, res: Response) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({ ok: false, error: "Falta archivo 'informe' en multipart/form-data." });
    }

    const f = req.files.informe as UploadedFile;
    const buffer = Buffer.from(f.data);
    const result = extraerCRP(buffer, f.name);

    return res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "Error extrayendo CRP" });
  }
});

// ---------------------- RUTA PÓLIZAS ----------------------
app.post("/api/upload/polizas", async (req: Request & { files?: any }, res: Response) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({ ok: false, error: "Falta archivo 'informe' en multipart/form-data." });
    }

    const f = req.files.informe as UploadedFile;
    const buffer = Buffer.from(f.data);
    const result = extraerPolizas(buffer, f.name);

    return res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "Error, probablemente no hay pólizas para procesar" });
  }
});

// ---------------------- RUTA OTROSÍES ----------------------
app.post("/api/upload/otrosies", async (req: Request & { files?: any }, res: Response) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({ ok: false, error: "Falta archivo 'informe' en multipart/form-data." });
    }
    const f = req.files.informe as UploadedFile;
    const buffer = Buffer.from(f.data);
    const result = extraerOtrosi(buffer, f.name);
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "Error extrayendo OTROSÍES" });
  }
});

// ----------------------- RUTA PAGOS -----------------------
app.post("/api/upload/pagos", async (req: Request & { files?: any }, res: Response) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({ ok: false, error: "Falta archivo 'informe' en multipart/form-data." });
    }

    const f = req.files.informe as UploadedFile;
    const buffer = Buffer.from(f.data);
    const result = extraerPagoActual(buffer, f.name);

    return res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "Hubo un error al extraer el pago actual" });
  }
});

// ---------------------- LISTAR CONTRATOS ----------------------
app.get("/api/contratos", async (req: Request, res: Response) => {
  try {
    const { proveedor, numeroContrato } = req.query;

    const contratos = await prisma.contrato.findMany({
      where: {
        ...(proveedor && {
          proveedor: {
            contains: String(proveedor),
            mode: "insensitive",
          },
        }),
        ...(numeroContrato && {
          numeroContrato: {
            contains: String(numeroContrato),
          },
        }),
      },
      select: {
        id: true,
        numeroContrato: true,
        proveedor: true,
        tipoContrato: true,
        fechaInforme: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ ok: true, contratos });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Error listando contratos" });
  }
});

// ---------------------- OBTENER SEGUIMIENTO ----------------------
app.get("/api/seguimiento", async (_req: Request, res: Response) => {
  try {
    const contratos = await prisma.contrato.findMany({
      select: {
        id: true,
        numeroContrato: true,
        proveedor: true,
        generalidades: true,
        principal: true,
        crp: true,
        abogadoResponsable: true,
        estadoContrato: true,
        sistema: true,
        novedad: true,
        fechaNovedad: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ ok: true, contratos });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Error obteniendo seguimiento" });
  }
});

// ---------------------- ACTUALIZAR SEGUIMIENTO ----------------------
app.put("/api/seguimiento/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id); // ← id string (UUID)

    const {
      abogadoResponsable,
      estadoContrato,
      sistema,
      novedad,
      fechaNovedad,
    } = req.body as {
      abogadoResponsable?: string;
      estadoContrato?: string;
      sistema?: string;
      novedad?: string;
      fechaNovedad?: string;
    };

    const contrato = await prisma.contrato.update({
      where: { id }, // ← string
      data: {
        abogadoResponsable: abogadoResponsable || null,
        estadoContrato: estadoContrato || null,
        sistema: sistema || null,
        novedad: novedad || null,
        fechaNovedad: fechaNovedad ? new Date(fechaNovedad) : null,
      },
    });

    return res.json({ ok: true, contrato });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Error actualizando seguimiento" });
  }
});

// ---------------------- INICIAR SERVIDOR ----------------------
const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`Servidor listo: http://localhost:${PORT}`);
  console.log(`CRP:     POST /api/upload/crp (campo 'informe')`);
  console.log(`PÓLIZAS: POST /api/upload/polizas (campo 'informe')`);
  console.log(`OTROSÍES: POST /api/upload/otrosies (campo 'informe')`);
  console.log(`PRINCIPAL: POST /api/upload/principal (campo 'informe')`);
  console.log(`PAGOS ACTUALES: POST /api/upload/pagos (campo 'informe')`);

  // Cron diario a las 08:00 (configurado en cron.service)
  iniciarCronContratos();

  // Ejecuta HOY inmediatamente por si ya pasaron las 08:00 al iniciar
  ejecutarAlertaHoy().catch((e) => console.error("Error ejecutarAlertaHoy:", e));

  console.log("⏰ Cron de contratos iniciado correctamente");
  
console.log("DEBUG EMAIL_USER:", process.env.EMAIL_USER);
console.log("DEBUG EMAIL_PASS está definida:", !!process.env.EMAIL_PASS)

});