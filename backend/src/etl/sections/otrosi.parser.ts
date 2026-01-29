import XLSX from "xlsx";
import type { Otrosi, OtrosiExtract } from "../../types";
import {
  normalize,
  notEmptyRow,
  tryExcelDateToISO,
  toNumber,
  findRowIndexByContainsAnyCol,
} from "../utils/excel-utils";

// detectar cuando la x está marcada en el excel
function isMarked(value: any): boolean {
  if (value === null || value === undefined) return false;

  if (typeof value === "object") {
    const inner = value.v ?? value.w ?? "";
    const s = String(inner).trim().toLowerCase();
    return s === "x" || s === "✓" || s === "true" || s === "si" || s === "sí";
  }

  const s = String(value).trim().toLowerCase();
  return s === "x" || s === "✓" || s === "true" || s === "si" || s === "sí";
}

/* Convierte fechas de texto español a ISO */
function parseDate(v: any): string {
  if (typeof v === "number") {
    const iso = tryExcelDateToISO(v);
    return iso ?? "";
  }
  const s = String(v ?? "").trim();
  if (!s) return "";

  const meses: Record<string, number> = {
    ene: 1,
    feb: 2,
    mar: 3,
    abr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    ago: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dic: 12,
  };

  const m = normalize(s).match(/^(\d{1,2})[-\/ ]([a-z]+)[-\/ ](\d{2,4})$/i);
  if (m) {
    const dd = parseInt(m[1], 10);
    const monTxt = m[2];
    const yy = parseInt(m[3], 10);
    const mon = meses[monTxt] || 0;
    const yyyy = yy < 100 ? (yy >= 50 ? 1900 + yy : 2000 + yy) : yy;
    if (!mon) return "";
    const d = new Date(yyyy, mon - 1, dd);
  
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }

  return "";
}

function cellText(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object")
    return String(v.v ?? v.w ?? v.t ?? "").trim();
  return String(v).trim();
}

function normalizeLoose(v: any): string {
  return normalize(cellText(v));
}


function resolveTipoFromDataRow(row: any[]): "ADICION" | "PRORROGA" | "MODIFICACION" | "" {
  let colAdicion = -1;
  let colProrroga = -1;
  let colModificacion = -1;

  
  for (let c = 0; c < row.length; c++) {
    const label = normalizeLoose(row[c]);
    
    if (label === "adicion" || label === "adición") {
      colAdicion = c;
    }
    if (label === "prorroga" || label === "prórroga") {
      colProrroga = c;
    }
    if (label === "modificacion" || label === "modificación") {
      colModificacion = c;
    }
  }

  // Ahora buscar marcas "x" en las columnas siguientes (hasta 5 columnas después)
  let markAdi = false;
  let markPro = false;
  let markMod = false;

  // Buscar marca para Adición
  if (colAdicion !== -1) {
    for (let offset = 1; offset <= 5; offset++) {
      if (isMarked(row[colAdicion + offset])) {
        markAdi = true;
        break;
      }
    }
  }

  // Buscar marca para Prórroga
  if (colProrroga !== -1) {
    for (let offset = 1; offset <= 5; offset++) {
      if (isMarked(row[colProrroga + offset])) {
        markPro = true;
        break;
      }
    }
  }

  // Buscar marca para Modificación
  if (colModificacion !== -1) {
    for (let offset = 1; offset <= 5; offset++) {
      if (isMarked(row[colModificacion + offset])) {
        markMod = true;
        break;
      }
    }
  }

  // Prioridad: Modificación > Prórroga > Adición
  if (markMod) return "MODIFICACION";
  if (markPro) return "PRORROGA";
  if (markAdi) return "ADICION";
  return "";
}

export function extraerOtrosi(
  buffer: Buffer,
  fileName = "informe.xlsx"
): OtrosiExtract {
  const wb = XLSX.read(buffer, { type: "buffer", raw: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    blankrows: false,
  });

  let start = findRowIndexByContainsAnyCol(rows, "otrosi");
  if (start === -1)
    throw new Error("No existen OTROSÍES para ser procesados");

  let headerRowIdx = -1;
  for (let r = start + 1; r < start + 10; r++) {
    if (notEmptyRow(rows[r])) {
      headerRowIdx = r;
      break;
    }
  }
  if (headerRowIdx === -1)
    throw new Error("No se encontró la fila de encabezados de OTROSÍES.");

  const header = rows[headerRowIdx].map((c) => String(c ?? "").trim());

  
  const labels = header.map((h) => normalize(h));

  function findCol(...names: string[]): number {
    for (let i = 0; i < labels.length; i++) {
      const lab = labels[i];
      if (!lab || typeof lab !== "string") continue;
      if (names.some((n) => lab === normalize(n))) return i;
    }
    for (let i = 0; i < labels.length; i++) {
      const lab = labels[i];
      if (!lab || typeof lab !== "string") continue;
      if (names.some((n) => lab.includes(normalize(n)))) return i;
    }
    return -1;
  }

  const colNo = findCol("no", "número","numero","No");
  const colFecha = findCol("fecha perfeccion");
  const colDur = findCol("duracion");
  const colIni = findCol("fecha inicio", "inicio");
  const colFin = findCol("fecha fin", "fin");
  const colVal = findCol("valor");

  const otrosies: Otrosi[] = [];
  
// detecta headers o encabezados
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!notEmptyRow(row)) continue;

    const joined = normalize(row.join(" "));
    if (
      joined.includes("valores") ||
      joined.includes("garantias") ||
      joined.includes("iv") ||
      joined.includes("III") ||
      joined.includes("VALORES") ||
      joined.includes("grado")

    )
    {
      break;
    }

    const numero = colNo !== -1 ? parseInt(row[colNo], 10) || 0 : 0;
    const fechaP = colFecha !== -1 ? parseDate(row[colFecha]) : "";


    const tipo = resolveTipoFromDataRow(row);

    const dur = colDur !== -1 ? String(row[colDur] ?? "").trim() : "";
    const ini = colIni !== -1 ? parseDate(row[colIni]) : "";
    const fin = colFin !== -1 ? parseDate(row[colFin]) : "";
    const val = colVal !== -1 ? toNumber(row[colVal]) : 0;

    // Solo agregar si hay al menos algún dato
    if (!(numero || fechaP || tipo || dur || ini || fin || val)) continue;

    otrosies.push({
      numero,
      fechaPerfeccionamiento: fechaP,
      tipo,
      duracionProrroga: dur,
      fechaInicio: ini,
      fechaFin: fin,
      valorAdicion: val,
    });
  }

  return {
    hoja: sheetName,
    seccion: "OTROSÍES",
    columnas: header,
    otrosies,
    fuente: { excel: fileName, hoja: sheetName },
  };
}