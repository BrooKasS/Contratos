import XLSX from "xlsx";
import type { Generalidades, GeneralidadesExtract } from "../../types";
import {
  normalize,
  notEmptyRow,
  tryExcelDateToISO,
  findRowIndexByContainsAnyCol,
} from "../utils/excel-utils";
import { read } from "node:fs";

function cellText(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object")
    return String((v as any).v ?? (v as any).w ?? (v as any).t ?? "").trim();
  return String(v).trim();
}

function normalizeLoose(v: any): string {
  return normalize(cellText(v));
}


function readValueOnSameRow(row: any[], labelCol: number, maxOffset: number = 10): string {
  for (let offset = 1; offset <= maxOffset; offset++) {
    if (labelCol + offset >= row.length) break;
    const val = cellText(row[labelCol + offset]);
    const normalized = normalize(val);
    

    if (normalized && 
        !normalized.includes("dependencia") &&
        !normalized.includes("tipo de contrato") &&
        !normalized.includes("nit") &&
        !normalized.includes("c.c") &&
        !normalized.includes("no.") &&
        normalized !== "x") {
      return val;
    }
  }
  return "";
}

/**
 * Construye una fecha desde componentes día/mes/año
 */
function buildDate(dia: any, mes: any, anio: any): string {
  const d = parseInt(String(dia ?? ""), 10);
  const m = parseInt(String(mes ?? ""), 10);
  const a = parseInt(String(anio ?? ""), 10);
  
  if (isNaN(d) || isNaN(m) || isNaN(a)) return "";
  if (d < 1 || d > 31 || m < 1 || m > 12) return "";
  
  const yyyy = a < 100 ? (a >= 50 ? 1900 + a : 2000 + a) : a;
  const date = new Date(yyyy, m - 1, d);
  
  return isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * Parsea una fecha desde múltiples formatos: número Excel, string DD/MM/YYYY, o componentes
 */
function parseDateFromString(dateStr: any): string {
  if (!dateStr) return "";
  
  const str = cellText(dateStr).trim();
  if (!str) return "";
  
  // Intenta primero como número de Excel (fallback)
  const numValue = parseInt(str, 10);
  if (!isNaN(numValue) && numValue > 0 && numValue < 100000) {
    const excelDate = tryExcelDateToISO(numValue);
    if (excelDate) return excelDate;
  }
  
  // Busca el patrón DD/MM/YYYY en el string
  const match = str.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!match) return "";
  
  const d = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const a = parseInt(match[3], 10);
  
  // Validación básica (igual que buildDate)
  if (isNaN(d) || isNaN(m) || isNaN(a)) return "";
  if (d < 1 || d > 31 || m < 1 || m > 12) return "";
  
  const yyyy = a < 100 ? (a >= 50 ? 1900 + a : 2000 + a) : a;
  const date = new Date(yyyy, m - 1, d);
  
  return isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * Busca una fecha en formato DD/MM/YYYY en el contenido de texto
 */
function extractDateFromText(text: string): string {
  if (!text) return "";
  return parseDateFromString(text);
}

export function extraerGeneralidades(
  buffer: Buffer,
  fileName = "informe.xlsx"
): GeneralidadesExtract {
  const wb = XLSX.read(buffer, { type: "buffer", raw: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    blankrows: false,
  });

  // 1) Buscar la sección I.- GENERALIDADES
  const start = findRowIndexByContainsAnyCol(rows, "generalidades");
  if (start === -1)
    throw new Error("No se encontró la sección de GENERALIDADES.");

  // El rango de generalidades va desde start hasta la siguiente sección (II.-)
  let end = start + 20; // Por defecto 20 filas
  for (let r = start + 1; r < Math.min(rows.length, start + 30); r++) {
    const rowText = normalizeLoose(rows[r]?.join(" ") || "");
    if (rowText.includes("ii") || rowText.includes("duracion") || rowText.includes("contrato principal")) {
      end = r - 1;
      break;
    }
  }

  // 2) Extraer Fecha del Informe
  // Primero: busca DD/MM/YYYY o número Excel en TODAS las celdas de las primeras 20 filas
  let fechaInforme = "";
  
  for (let r = 0; r < Math.min(20, rows.length) && !fechaInforme; r++) {
    const row = rows[r] ?? [];
    
    for (let c = 0; c < row.length && !fechaInforme; c++) {
      const cellValue = cellText(row[c]);
      const rawValue = row[c];
      
      // Intenta parsear como cualquier formato de fecha
      fechaInforme = parseDateFromString(cellValue);
      
      // Si la celda es un número crudo, intenta como Excel date number
      if (!fechaInforme && typeof rawValue === "number") {
        fechaInforme = tryExcelDateToISO(rawValue) ?? "";
      }
      
      // Si la celda es un objeto con propiedades (XLSX puede guardar así), intenta los valores
      if (!fechaInforme && typeof rawValue === "object" && rawValue !== null) {
        fechaInforme = parseDateFromString((rawValue.v ?? rawValue.w ?? rawValue.t ?? "").toString());
        if (!fechaInforme && rawValue.v && typeof rawValue.v === "number") {
          fechaInforme = tryExcelDateToISO(rawValue.v) ?? "";
        }
      }
    }
  }
  
  // Segundo: si sigue sin encontrar, busca con lógica de "fecha" + adjacentes + bloques
  if (!fechaInforme) {
    for (let r = 0; r < Math.min(20, rows.length); r++) {
      if (fechaInforme) break;
      
      const row = rows[r] ?? [];
      
      for (let c = 0; c < row.length; c++) {
        const cellValue = cellText(row[c]);
        const label = normalizeLoose(cellValue);
        
        if (label.includes("fecha")) {
          // Busca en las siguientes 10 celdas
          for (let offset = 1; offset <= 10; offset++) {
            if (c + offset >= row.length) break;
            const nextCell = row[c + offset];
            fechaInforme = parseDateFromString(cellText(nextCell));
            if (!fechaInforme && typeof nextCell === "number") {
              fechaInforme = tryExcelDateToISO(nextCell) ?? "";
    
            }
            if (fechaInforme) break;
          }
          
          // Si sigue sin encontrar, intenta método de bloques
          if (!fechaInforme) {
            const dia = row[c + 1];
            const mes = row[c + 3];
            const anio = row[c + 5];
            fechaInforme = buildDate(dia, mes, anio);
          }
          
          if (fechaInforme) break;
        }
      }
    }
  }

  // 3) Función helper para buscar un campo en el rango de generalidades
  function findField(keyword: string): string {
    for (let r = start; r <= end; r++) {
      const row = rows[r] ?? [];
      for (let c = 0; c < Math.min(30, row.length); c++) {
        const label = normalizeLoose(row[c]);
        if (label.includes(normalize(keyword))) {
          return readValueOnSameRow(row, c);
        }
      }
    }
    return "";
  }

  // 4) Función helper para buscar en segunda columna (columna 36+)
  function findFieldSecondColumn(keyword: string): string {
    for (let r = start; r <= end; r++) {
      const row = rows[r] ?? [];
      for (let c = 25; c < row.length; c++) {
        const label = normalizeLoose(row[c]);
        if (label.includes(normalize(keyword))) {
          return readValueOnSameRow(row, c);
        }
      }
    }
    return "";
  }

  // 5) Extraer campos principales
  const nombreSupervisor = findField("nombre supervisor");
  const dependencia = findFieldSecondColumn("dependencia");
  const numeroContrato = findField("no. contrato");
  const tipoContrato = findFieldSecondColumn("tipo de contrato");
  const contratista = findField("contratista");
  const representanteLegal = findField("representante legal");

  
  let nit = "";
  let cedulaCiudadania = "";
  for (let r = start; r <= end; r++) {
    const row = rows[r] ?? [];
    const rowText = normalizeLoose(row.join(" "));
    
    
    if (rowText.includes("contratista") && !rowText.includes("representante")) {
      let nitMarcado = false;
      let ccMarcado = false;
      let numeroContratista = "";
      
      
      for (let c = 25; c < row.length; c++) {
        const label = normalizeLoose(row[c]);
        
        // Buscar "Nit." y verificar si tiene 'x'
        if (label === "nit" || label === "nit.") {
          if (normalizeLoose(row[c + 1]) === "x") {
            nitMarcado = true;
          }
        }
        
        // Buscar "C.C." y verificar si tiene 'x'
        if (label === "c.c" || label === "c.c.") {
          if (normalizeLoose(row[c + 1]) === "x") {
            ccMarcado = true;
          }
        }
        
        // Buscar "No." para encontrar el número
        if (label === "no" || label === "no.") {
          // El número está 1-3 columnas después
          for (let offset = 1; offset <= 3; offset++) {
            const val = cellText(row[c + offset]);
            if (val && val.length > 3) {
              numeroContratista = val;
              break;
            }
          }
        }
      }
      
      // Asignar el número según cuál esté marcado
      if (nitMarcado) {
        nit = numeroContratista;
      } else if (ccMarcado) {
        cedulaCiudadania = numeroContratista;
      }
      
      break;
    }
  }

  
  let cedulaRepresentante = "";
  
  for (let r = start; r <= end; r++) {
    const row = rows[r] ?? [];
    const rowText = normalizeLoose(row.join(" "));
    
    if (rowText.includes("representante legal")) {
      let numeroRepresentante = "";
      
      // Buscar "C.C." con 'x' y "No." para el número
      for (let c = 25; c < row.length; c++) {
        const label = normalizeLoose(row[c]);
        
        // Verificar que C.C. tenga 'x' marcado
        if (label === "c.c" || label === "c.c.") {
          if (normalizeLoose(row[c + 1]) === "x") {
            // Buscar "No." para encontrar el número
            for (let offset = 2; offset <= 5; offset++) {
              const nextLabel = normalizeLoose(row[c + offset]);
              if (nextLabel === "no" || nextLabel === "no.") {
                // El número está 1-3 columnas después de "No."
                for (let numOffset = 1; numOffset <= 3; numOffset++) {
                  const val = cellText(row[c + offset + numOffset]);
                  if (val && val.length > 3) {
                    numeroRepresentante = val;
                    break;
                  }
                }
                break;
              }
            }
          }
        }
      }
      
      cedulaRepresentante = numeroRepresentante;
      break;
    }
  }


  let objetoContrato = "";
  
  for (let r = start; r <= end; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < Math.min(5, row.length); c++) {
      const label = normalizeLoose(row[c]);
      if (label.includes("objeto del contrato") || label.includes("objeto contrato")) {
       
        objetoContrato = cellText(row[8]);
        
        // Si no está en col 8, buscar en las siguientes
        if (!objetoContrato) {
          for (let offset = 1; offset <= 10; offset++) {
            const val = cellText(row[c + offset]);
            if (val && val.length > 20) {
              objetoContrato = val;
              break;
            }
          }
        }
        break;
      }
    }
    if (objetoContrato) break;
  }

  // 9) Extraer Certificación Unidad de Vinculados
  let vigenciaDesde = "";
  let vigenciaHasta = "";
  
  for (let r = start; r <= end; r++) {
    const row = rows[r] ?? [];
    const rowText = normalizeLoose(row.join(" "));
    
    if (rowText.includes("certificacion") || rowText.includes("vinculados")) {
      // Buscar "Vigencia Desde:" y "Vigencia Hasta:"
      for (let c = 0; c < row.length; c++) {
        const label = normalizeLoose(row[c]);
        
        if (label.includes("vigencia desde")) {
          // Formato: día [c+6], mes [c+8], año [c+10] (aproximadamente)
          const dia = row[c + 6] || row[c + 5] || row[c + 4];
          const mes = row[c + 8] || row[c + 7] || row[c + 6];
          const anio = row[c + 10] || row[c + 9] || row[c + 8];
          vigenciaDesde = buildDate(dia, mes, anio);
        }
        
        if (label.includes("vigencia hasta")) {
          const dia = row[c + 5] || row[c + 4] || row[c + 3];
          const mes = row[c + 7] || row[c + 6] || row[c + 5];
          const anio = row[c + 9] || row[c + 8] || row[c + 7];
          vigenciaHasta = buildDate(dia, mes, anio);
        }
      }
      break;
    }
  }

  const generalidades: Generalidades = {
    nombreSupervisor: nombreSupervisor || "",
    dependencia: dependencia || "",
    numeroContrato: numeroContrato || "",
    tipoContrato: tipoContrato || "",
    contratista: contratista || "",
    nit: nit || "",
    cedulaCiudadania: cedulaCiudadania || "",
    representanteLegal: representanteLegal || "",
    cedulaRepresentante: cedulaRepresentante || "",
    objetoContrato: objetoContrato || "",
    certificacionUnidadVinculados: {
      vigenciaDesde: vigenciaDesde || "",
      vigenciaHasta: vigenciaHasta || "",
    },
    fechaInforme: fechaInforme || "",
  };

  return {
    hoja: sheetName,
    seccion: "GENERALIDADES",
    generalidades,
    fuente: { excel: fileName, hoja: sheetName },
  };
}