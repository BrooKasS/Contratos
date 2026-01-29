
import XLSX from "xlsx";
import type { CRP, CRPExtract } from "../../types";
import {
  normalize,
  findRowIndexByTextAnyCol,
  findRowIndexByContainsAnyCol,
  notEmptyRow,
  toNumber,
  tryExcelDateToISO,
  isRecentExcelSerial
} from "../utils/excel-utils";

/* ---------- Utilidades locales, específicas para CRP ---------- */

function parseSpanishDateToISO(s: string): string | null {
  const txt = normalize(String(s)).replace(/\./g, "").trim();
  // Meses españoles (abreviados y largos)
  const months: Record<string, number> = {
    ene: 1, enero: 1,
    feb: 2, febrero: 2,
    mar: 3, marzo: 3,
    abr: 4, abril: 4,
    may: 5, mayo: 5,
    jun: 6, junio: 6,
    jul: 7, julio: 7,
    ago: 8, agosto: 8,
    sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9,
    oct: 10, octubre: 10,
    nov: 11, noviembre: 11,
    dic: 12, diciembre: 12,
  };

  // Formatos tipo: 6-ene-26 | 28-oct-2025 | 6 ene 26 | 6/ene/26
  const m = txt.match(/^(\d{1,2})[ \/-]([a-záéíóúñ]+)[ \/-](\d{2,4})$/i);
  if (!m) {
    // dd/mm/yyyy o dd-mm-yyyy
    const m2 = txt.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (m2) {
      const dd = parseInt(m2[1], 10);
      const mm = parseInt(m2[2], 10);
      const yy = parseInt(m2[3], 10);
      const yyyy = yy < 100 ? (yy >= 50 ? 1900 + yy : 2000 + yy) : yy;
      const d = new Date(yyyy, mm - 1, dd);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return null;
  }

  const dd = parseInt(m[1], 10);
  const monRaw = m[2];
  const yy = parseInt(m[3], 10);
  const key = normalize(monRaw);
  const mm = months[key];
  if (!mm) return null;
  const yyyy = yy < 100 ? (yy >= 50 ? 1900 + yy : 2000 + yy) : yy;

  const d = new Date(yyyy, mm - 1, dd);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Determina si una celda textual parece un código CRP (0211310107_0001) */
function looksLikeCodigoCRP(value: any): boolean {
  const s = String(value ?? "").trim();
  return /^\d{6,}_[0-9]{2,}$/.test(s);
}

/** Normaliza “Número” textual/numérico en la MISMA fila (4–6 dígitos, no serial de fecha) */
function extractNumeroFromCell(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    const n = value;
    if (!isRecentExcelSerial(n) && n >= 1000 && n <= 999999) return String(n);
    return "";
  }
  const s = String(value).trim();
  // extrae primer token de 4-6 dígitos
  const m = s.match(/\b\d{4,6}\b/);
  if (!m) return "";
  const n = parseInt(m[0], 10);
  if (!isRecentExcelSerial(n) && n >= 1000 && n <= 999999) return String(n);
  return "";
}

/** Devuelve la fila "normalizada" (strings u numbers; sin fórmulas) */
function getRowValues(ws: XLSX.WorkSheet, colsCount: number, rowIndex1Based: number): any[] {
  const out: any[] = [];
  for (let c = 0; c < colsCount; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: rowIndex1Based - 1, c })];
    out.push(cell ? cell.v : undefined);
  }
  return out;
}

// correccion, se detecta los indiuces de columna y se marcan
function mapHeaderColumns(headerRow: any[]): Record<"fecha"|"numero"|"codigo"|"rubro"|"valor", number> {
  const wanted = {
    fecha: ["fecha"],
    numero: ["numero", "número"],
    codigo: ["codigo", "código"],
    rubro: ["rubro"],
    valor: ["valor"],
  } as const;

  const colMap: any = { fecha: -1, numero: -1, codigo: -1, rubro: -1, valor: -1 };

  // match directo por etiqueta
  for (let i = 0; i < headerRow.length; i++) {
    const lab = normalize(String(headerRow[i] ?? ""));
    if (!lab) continue;
    for (const [k, arr] of Object.entries(wanted)) {
      if (arr.some(w => lab === w || lab.includes(w))) {
        if (colMap[k as keyof typeof colMap] === -1) {
          colMap[k as keyof typeof colMap] = i;
        }
      }
    }
  }

  return colMap as Record<"fecha"|"numero"|"codigo"|"rubro"|"valor", number>;
}

/** Si alguna columna clave no se encontró, intenta inferirla mirando las 10 filas de datos */
function backfillMissingColumns(rows: any[][], startRow: number, endRow: number,
  colMap: Record<"fecha"|"numero"|"codigo"|"rubro"|"valor", number>) {

  // Ventana de observación corta
  const maxProbe = Math.min(endRow, startRow + 10);

  // Código
  if (colMap.codigo === -1) {
    const score: Record<number, number> = {};
    for (let r = startRow; r < maxProbe; r++) {
      const row = rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        if (looksLikeCodigoCRP(row[c])) score[c] = (score[c] ?? 0) + 1;
      }
    }
    const best = Object.entries(score).sort((a,b)=>b[1]-a[1])[0];
    if (best) colMap.codigo = Number(best[0]);
  }

  // Valor (número grande)
  if (colMap.valor === -1) {
    const score: Record<number, number> = {};
    for (let r = startRow; r < maxProbe; r++) {
      const row = rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const n = toNumber(row[c]);
        if (n >= 100000) score[c] = (score[c] ?? 0) + 1;
      }
    }
    const best = Object.entries(score).sort((a,b)=>b[1]-a[1])[0];
    if (best) colMap.valor = Number(best[0]);
  }

  // Fecha (serial de Excel o texto español)
  if (colMap.fecha === -1) {
    const score: Record<number, number> = {};
    for (let r = startRow; r < maxProbe; r++) {
      const row = rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        const iso =
          (typeof v === "number" && tryExcelDateToISO(v)) ||
          (typeof v === "string" && parseSpanishDateToISO(v));
        if (iso) score[c] = (score[c] ?? 0) + 1;
      }
    }
    const best = Object.entries(score).sort((a,b)=>b[1]-a[1])[0];
    if (best) colMap.fecha = Number(best[0]);
  }

  
  if (colMap.numero === -1) {
    const score: Record<number, number> = {};
    for (let r = startRow; r < maxProbe; r++) {
      const row = rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const n = extractNumeroFromCell(row[c]);
        if (n) score[c] = (score[c] ?? 0) + 1;
      }
    }
    const best = Object.entries(score).sort((a,b)=>b[1]-a[1])[0];
    if (best) colMap.numero = Number(best[0]);
  }

  // Rubro (texto largo)
  if (colMap.rubro === -1) {
    const score: Record<number, number> = {};
    for (let r = startRow; r < maxProbe; r++) {
      const row = rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const s = String(row[c] ?? "").trim();
        if (s && !looksLikeCodigoCRP(s) && s.replace(/[^\d]/g, "").length < 4) {
          score[c] = (score[c] ?? 0) + (s.length >= 10 ? 2 : 1);
        }
      }
    }
    const best = Object.entries(score).sort((a,b)=>b[1]-a[1])[0];
    if (best) colMap.rubro = Number(best[0]);
  }
}

/* ------------------------------ PARSER ------------------------------ */

export function extraerCRP(buffer: Buffer, fileName = "informe.xlsx"): CRPExtract {
  const wb = XLSX.read(buffer, { type: "buffer", raw: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // Obtenemos toda la matriz de filas
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

  const INICIO = "CERTIFICADOS DE REGISTRO PRESUPUESTAL";
  const FIN = "Valor total Certificados de Registro Presupuestal";

  // 1) Encuentra el título de la sección (ancla superior)
  let start = findRowIndexByTextAnyCol(rows, INICIO);
  if (start === -1) start = findRowIndexByContainsAnyCol(rows, "certificados de registro presupuestal");
  if (start === -1) throw new Error(`No se encontró la sección de inicio: "${INICIO}"`);

  // 2) Encuentra el final (ancla inferior)
  let end = findRowIndexByContainsAnyCol(rows, normalize(FIN));
  if (end === -1) end = rows.length;

  // 3) Localiza la fila de encabezados (entre start y start+6 típicamente)
  let headerRowIdx = -1;
  for (let r = start + 1; r < Math.min(rows.length, start + 8); r++) {
    const line = normalize((rows[r] ?? []).join(" "));
    if (/(no\b.*fecha.*numero|número.*codigo|código.*rubro.*valor)/.test(line)) {
      headerRowIdx = r;
      break;
    }
  }
  if (headerRowIdx === -1) {
    // Fallback: toma la siguiente fila no vacía como "header"
    for (let r = start + 1; r < Math.min(rows.length, start + 8); r++) {
      if (notEmptyRow(rows[r])) { headerRowIdx = r; break; }
    }
  }
  if (headerRowIdx === -1) throw new Error("No se encontró la fila de encabezados de CRP.");

  // 4) Mapear columnas a partir del header real
  const headerRow = rows[headerRowIdx] ?? [];
  const initialMap = mapHeaderColumns(headerRow);
  backfillMissingColumns(rows, headerRowIdx + 1, end, initialMap);

  const { fecha: colFecha, numero: colNumero, codigo: colCodigo, rubro: colRubro, valor: colValor } = initialMap;

  // Validaciones mínimas (código y valor son críticos)
  if (colCodigo === -1 || colValor === -1) {
    throw new Error(`No fue posible identificar columnas clave de CRP (código=${colCodigo}, valor=${colValor}).`);
  }

  // 5) Recorre filas de datos (MISMAS filas físicas; sin filtrar ni comprimir índices)
  const crp: CRP[] = [];
  for (let r = headerRowIdx + 1; r < end; r++) {
    const row = rows[r] ?? [];
    if (!notEmptyRow(row)) continue;

    // ¿Fin por “valor total...” en la misma fila?
    const joined = normalize(row.map(x => String(x ?? "")).join(" "));
    if (joined.includes(normalize(FIN))) break;

    // Extractores por columna (exclusivamente la MISMA fila)
    // Fecha
    let fecha = "";
    if (colFecha !== -1) {
      const v = row[colFecha];
      fecha =
        (typeof v === "number" && tryExcelDateToISO(v)) ||
        (typeof v === "string" && parseSpanishDateToISO(v)) ||
        "";
    }

    // Número
    let numero = "";
    if (colNumero !== -1) {
      numero = extractNumeroFromCell(row[colNumero]);
    }

    // Código
    let codigo = "";
    if (colCodigo !== -1) {
      const v = row[colCodigo];
      const s = String(v ?? "").trim();
      if (looksLikeCodigoCRP(s)) codigo = s;
    }
    // Fallback: busca en toda la fila si no apareció en su columna
    if (!codigo) {
      for (const v of row) {
        const s = String(v ?? "").trim();
        if (looksLikeCodigoCRP(s)) { codigo = s; break; }
      }
    }

    // Rubro (texto)
    let rubro = "";
    if (colRubro !== -1) {
      rubro = String(row[colRubro] ?? "").toString().trim();
    }

    // Valor (número grande)
    let valor = 0;
    if (colValor !== -1) {
      valor = toNumber(row[colValor]);
    }
    // Fallback: si no encontró en la columna, toma el mayor de la fila
    if (!valor) {
      const nums = (row ?? []).map(toNumber).filter(n => n >= 100000);
      if (nums.length) valor = Math.max(...nums);
    }

    // Fila válida si hay al menos código o valor o rubro o número o fecha
    if (!(codigo || valor > 0 || rubro || numero || fecha)) continue;

    crp.push({ fecha, numero, codigo, rubro, valor });
  }

  const totalCRP = crp.reduce((acc, x) => acc + (x.valor || 0), 0);

  return {
    hoja: sheetName,
    seccion: "CERTIFICADOS DE REGISTRO PRESUPUESTAL",
    hastaAntesDe: "Valor total Certificados de Registro Presupuestal:",
    columnas: (rows[headerRowIdx] ?? []).map(c => String(c ?? "")),
    crp,
    totalCRP,
    fuente: { excel: fileName, hoja: sheetName }
  };
}
