import "dotenv/config";
import express from "express";
import fileUpload from "express-fileupload";
import cors from "cors";
import { prisma } from "./lib/prisma";
import { extraerCRP } from "./etl/sections/crp.parser";
import { extraerPolizas } from "./etl/sections/polizas.parser";
import { extraerOtrosi } from "./etl/sections/otrosi.parser";
import { extraerContratoPrincipal } from "./etl/sections/principal.parser";
import { extraerPagoActual } from "./etl/sections/pagoAct.parser";
import { extraerGeneralidades } from "./etl/sections/generalidades.parser";
import { extraerContratoCompleto } from "./contract.service";


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
app.use(cors());
app.use(fileUpload());
app.use(express.json());

// Ruta principal
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    msg: "Endpoint contrato general: /api/upload/contrato"
  });
});

// ---------------------- RUTA CONTRATO COMPLETO ----------------------
app.post("/api/upload/contrato", async (req: any, res) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({
        error: "Falta archivo 'informe' en multipart/form-data."
      });
    }

    const f = req.files.informe;
    const buffer = Buffer.from(f.data);

    const contrato = extraerContratoCompleto(buffer, f.name);
    const numeroContrato = contrato.generalidades.generalidades.numeroContrato;

    const existe = await prisma.contrato.findUnique({
      where: { numeroContrato }
    });

    if (existe) {
      return res.status(409).json({
        ok: false,
        error: "El contrato ya existe en la base de datos"
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
        pagos: limpiarUndefined(contrato.pagos)
      }
    });

    return res.json({
      ok: true,
      resumen: {
        contratista: contrato.generalidades.generalidades.contratista,
        numeroContrato: contrato.generalidades.generalidades.numeroContrato,
        tipoContrato: contrato.generalidades.generalidades.tipoContrato,
        fechaInforme: contrato.generalidades.generalidades.fechaInforme
      },
      contrato
    });

  } catch (e: any) {
    console.error(e);
    return res.status(500).json({
      error: e.message || "Error extrayendo contrato completo"
    });
  }
});

// --------------------- CONTRATOS CON ID ESPECIFICO ---------------------
app.get("/api/contratos/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const contrato = await prisma.contrato.findUnique({
      where: { id }
    });

    if (!contrato) {
      return res.status(404).json({
        ok: false,
        error: "Contrato no encontrado"
      });
    }

    return res.json({
      ok: true,
      contrato
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      error: "Error obteniendo contrato"
    });
  }
});

// -------------------  RUTA GENERALIDADES DEL CONTRATO ----------------
app.post("/api/upload/generalidades", async (req: any, res) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({ error: "Falta archivo 'informe' en multipart/form-data." });
    }
    const f = req.files.informe;
    const buffer = Buffer.from(f.data);
    const result = extraerGeneralidades(buffer, f.name);
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Error extrayendo las generalidades del contrato. es posible que no se hayan subido." });
  }
});

// ---------------------- RUTA INFO PRINCIPAL DEL CONTRATO ----------------------
app.post("/api/upload/principal", async (req: any, res) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({ error: "Falta archivo 'informe' en multipart/form-data." });
    }
    const f = req.files.informe;
    const buffer = Buffer.from(f.data);
    const result = extraerContratoPrincipal(buffer, f.name);
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Error extrayendo CONTRATO PRINCIPAL" });
  }
});

// ---------------------- RUTA CRP ----------------------
app.post("/api/upload/crp", async (req: any, res) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({ error: "Falta archivo 'informe' en multipart/form-data." });
    }

    const f = req.files.informe;
    const buffer = Buffer.from(f.data);
    const result = extraerCRP(buffer, f.name);

    return res.json({ ok: true, ...result });

  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Error extrayendo CRP" });
  }
});

// ---------------------- RUTA PÓLIZAS ----------------------
app.post("/api/upload/polizas", async (req: any, res) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({ error: "Falta archivo 'informe' en multipart/form-data." });
    }

    const f = req.files.informe;
    const buffer = Buffer.from(f.data);
    const result = extraerPolizas(buffer, f.name);

    return res.json({ ok: true, ...result });

  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Error, problablemente no hay polizas para procesar" });
  }
});

// ---------------------- RUTA OTROSÍES ----------------------
app.post("/api/upload/otrosies", async (req: any, res) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({ error: "Falta archivo 'informe' en multipart/form-data." });
    }
    const f = req.files.informe;
    const buffer = Buffer.from(f.data);
    const result = extraerOtrosi(buffer, f.name);
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Error extrayendo OTROSÍES" });
  }
});

//   -----------------------RUTA PAGOS -----------------------
app.post("/api/upload/pagos", async (req: any, res) => {
  try {
    if (!req.files || !req.files.informe) {
      return res.status(400).json({ error: "Falta archivo 'informe' en multipart/form-data." });
    }

    const f = req.files.informe;
    const buffer = Buffer.from(f.data);
    const result = extraerPagoActual(buffer, f.name);

    return res.json({ ok: true, ...result });

  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Hubo un error al extraer el pago actual" });
  }
});

// ---------------------- LISTAR CONTRATOS ----------------------
app.get("/api/contratos", async (req, res) => {
  try {
    const { proveedor, numeroContrato } = req.query;

    const contratos = await prisma.contrato.findMany({
      where: {
        ...(proveedor && {
          proveedor: {
            contains: String(proveedor),
            mode: "insensitive"
          }
        }),
        ...(numeroContrato && {
          numeroContrato: {
            contains: String(numeroContrato)
          }
        })
      },
      select: {
        id: true,
        numeroContrato: true,
        proveedor: true,
        tipoContrato: true,
        fechaInforme: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    });

    return res.json({
      ok: true,
      contratos
    });

  } catch (e: any) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      error: "Error listando contratos"
    });
  }
});

// iniciar el servidor
const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`Servidor listo: http://localhost:${PORT}`);
  console.log(`CRP:     POST /api/upload/crp (campo 'informe')`);
  console.log(`PÓLIZAS: POST /api/upload/polizas (campo 'informe')`);
  console.log(`OTROSÍES: POST /api/upload/otrosies (campo 'informe')`);
  console.log(`PRINCIPAL: POST /api/upload/principal (campo 'informe')`);
  console.log(`PAGOS ACTUALES: POST /api/upload/pagos (campo 'informe')`);
});