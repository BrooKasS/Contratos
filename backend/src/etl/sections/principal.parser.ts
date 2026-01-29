import XLSX from "xlsx";
import type { ContratoPrincipal, ContratoPrincipalExtract } from "../../types";
import {
  normalize,
  notEmptyRow,
  tryExcelDateToISO,
  findRowIndexByContainsAnyCol,
  toNumber
} from "../utils/excel-utils";

/* -------------------- helpers básicos -------------------- */

function cellText(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return String((v as any).v ?? (v as any).w ?? (v as any).t ?? "").trim();
  return String(v).trim();
}

function rowText(row: any[]): string {
  return normalize((row ?? []).map(cellText).join(" "));
}

function isMarked(v: any): boolean {
  const s = cellText(v).trim().toLowerCase();
  return s === "x" || s === "✓" || s === "✔" || s === "true" || s === "si" || s === "sí";
}

/* -------------------- fechas robustas -------------------- */

function parseDateSmart(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return tryExcelDateToISO(v) ?? "";
  const s = cellText(v);
  if (!s) return "";
  
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let a = parseInt(m[1], 10), b = parseInt(m[2], 10), yy = parseInt(m[3], 10);
    const yyyy = yy < 100 ? (yy >= 50 ? 1900 + yy : 2000 + yy) : yy;
  
    let mm: number, dd: number;
    if (a > 12 && b <= 12) { dd = a; mm = b; }
    else if (b > 12 && a <= 12) { dd = b; mm = a; }
    else { mm = a; dd = b; }
    const d = new Date(yyyy, mm - 1, dd);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  return "";
}

/* -------------------------- PARSER HORIZONTAL -------------------------- */

export function extraerContratoPrincipal(
  buffer: Buffer,
  fileName = "informe.xlsx"
): ContratoPrincipalExtract {

  const wb = XLSX.read(buffer, { type: "buffer", raw: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

  // Seccion "COntrato principal"
  const start = findRowIndexByContainsAnyCol(rows, "contrato principal");
  if (start === -1) throw new Error("No se encontró la sección CONTRATO PRINCIPAL");

  
  let headerRowIdx = -1;
  for (let r = start + 1; r < start + 5; r++) {
    if (notEmptyRow(rows[r])) {
      headerRowIdx = r;
      break;
    }
  }
  if (headerRowIdx === -1) throw new Error("No se encontró la fila de headers de CONTRATO PRINCIPAL");

  const headerRow = rows[headerRowIdx];
  const dataRow = rows[headerRowIdx + 1] ?? [];

  // 3) Normalizar headers y crear función de búsqueda de columna
  const headers = headerRow.map(c => normalize(cellText(c)));

  function findCol(...keywords: string[]): number {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (!h) continue;
      if (keywords.some(k => h.includes(normalize(k)))) return i;
    }
    return -1;
  }

  // Fijar las columnas
  const colFechaPerf = findCol("fecha perfeccion");
  const colDuracion = findCol("duracion");
  const colFechaInicio = findCol("fecha inicio");
  const colActaInicio = findCol("acta inicio");
  const colFechaFin = findCol("fecha termin", "fecha fin");
  const colValor = findCol("valor");

 
  const fechaPerfeccionamiento = colFechaPerf !== -1 
    ? parseDateSmart(dataRow[colFechaPerf]) 
    : "";

  const duracion = colDuracion !== -1 
    ? cellText(dataRow[colDuracion]) 
    : "";

  const fechaInicio = colFechaInicio !== -1 
    ? parseDateSmart(dataRow[colFechaInicio]) 
    : "";

  const fechaTerminacion = colFechaFin !== -1 
    ? parseDateSmart(dataRow[colFechaFin]) 
    : "";

  const valor = colValor !== -1 
    ? toNumber(dataRow[colValor]) 
    : 0;

  // correcion de las x del exlcel
  let actaInicio = false;
  if (colActaInicio !== -1) {
    // Buscar en las siguientes 5 columnas si hay "Si" o "x"
    for (let offset = 0; offset <= 5; offset++) {
      const cell = dataRow[colActaInicio + offset];
      const txt = normalize(cellText(cell));
      
      // Si encontramos "Si" seguido de "x" o si la celda es "x"
      if (txt === "si" || txt === "sí") {
        // Verificar si la siguiente celda tiene "x"
        if (isMarked(dataRow[colActaInicio + offset + 1])) {
          actaInicio = true;
          break;
        }
      }
      
      if (isMarked(cell)) {
        actaInicio = true;
        break;
      }
    }
  }

  // 7) Detectar Indeterminada: buscar "Indeterminada:" con "x" cerca
  let indeterminado = false;
  for (let c = 0; c < dataRow.length; c++) {
    const txt = normalize(cellText(dataRow[c]));
    if (txt.includes("indetermin")) {
      // Buscar "x" en las siguientes 3 columnas
      for (let offset = 1; offset <= 3; offset++) {
        if (isMarked(dataRow[c + offset])) {
          indeterminado = true;
          break;
        }
      }
      break;
    }
  }

  const contrato: ContratoPrincipal = {
    fechaPerfeccionamiento: fechaPerfeccionamiento || "",
    duracion: duracion || "",
    fechaInicio: fechaInicio || "",
    actaInicio,
    indeterminado,
    fechaTerminacion: fechaTerminacion || "",
    valor: valor || 0
  };

  return {
    hoja: sheetName,
    seccion: "CONTRATO PRINCIPAL",
    contrato,
    fuente: { excel: fileName, hoja: sheetName }
  };
}