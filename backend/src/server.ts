
import express from "express";
import fileUpload from "express-fileupload";
import cors from "cors";

import { extraerCRP } from "./etl/sections/crp.parser";
import { extraerPolizas } from "./etl/sections/polizas.parser";
import { extraerOtrosi } from "./etl/sections/otrosi.parser";
import { extraerContratoPrincipal } from "./etl/sections/principal.parser";
import { extraerPagoActual } from "./etl/sections/pagoAct.parser";
import { extraerGeneralidades } from "./etl/sections/generalidades.parser";
import { extraerContratoCompleto } from "./contract.service";


const app = express();
app.use(cors());
app.use(fileUpload());
app.use(express.json());
// la ruta principal
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    msg: "Endpoints disponibles: /api/upload/crp y /api/upload/polizas"
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




// ---------------------- RUTA CONTRATO COMPLETO -------------------



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









// iniciar el servidor
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Servidor listo: http://localhost:${PORT}`);
  console.log(`CRP:     POST /api/upload/crp (campo 'informe')`);
  console.log(`PÓLIZAS: POST /api/upload/polizas (campo 'informe')`);
  console.log(`OTROSÍES: POST /api/upload/otrosies (campo 'informe')`);
  console.log(`PRINCIPAL: POST /api/upload/principal (campo 'informe')`);
  console.log(`PAGOS ACTUALES:; ´post /api/upload/pagos (campo 'informe')`);


});
  

