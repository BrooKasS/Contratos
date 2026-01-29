
import XLSX from "xlsx";
import type { Poliza, PolizasExtract } from "../../types";
import {
  normalize,
  findRowIndexByTextAnyCol,
  findRowIndexByContainsAnyCol,
  notEmptyRow,
  toNumber,
  tryExcelDateToISO
} from "../utils/excel-utils";

// logica especifica paraextraer la sección de polizas


function parseSpanishDateToISO(s: string): string | null {
  const txt = normalize(String(s)).replace(/\./g, " ").replace(/\s+/g, " ").trim();
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
  // dd-mes-yy/aaaa o dd mes yy/aaaa o dd/mes/yy/aaaa
  const m = txt.match(/^(\d{1,2})[ \/-]([a-záéíóúñ]+)[ \/-](\d{2,4})$/i);
  if (m) {
    const dd = parseInt(m[1], 10);
    const monKey = normalize(m[2]);
    const mm = months[monKey];
    const yy = parseInt(m[3], 10);
    if (!mm || isNaN(dd) || isNaN(yy)) return null;
    const yyyy = yy < 100 ? (yy >= 50 ? 1900 + yy : 2000 + yy) : yy;
    const d = new Date(yyyy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  // dd/mm/aa(aa) o dd-mm-aa(aa)
  const m2 = txt.match(/^(\d{1,2})[ \/-](\d{1,2})[ \/-](\d{2,4})$/);
  if (m2) {
    const dd = parseInt(m2[1], 10);
    const mm = parseInt(m2[2], 10);
    const yy = parseInt(m2[3], 10);
    const yyyy = yy < 100 ? (yy >= 50 ? 1900 + yy : 2000 + yy) : yy;
    const d = new Date(yyyy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}


function mapHeaderColumnsForPolizas(headerRow: any[]) {
  // normaliza etiquetas
  const labels = headerRow.map(v => normalize(String(v ?? "")));

  const findIndex = (preds: string[]): number => {
    // intenta coincidencia por includes con prioridad a coincidencias exactas
    let best = -1;
    for (let i = 0; i < labels.length; i++) {
      const lab = labels[i];
      if (!lab) continue;
      if (preds.some(p => lab === p)) return i; // exact match
    }
    for (let i = 0; i < labels.length; i++) {
      const lab = labels[i];
      if (!lab) continue;
      if (preds.some(p => lab.includes(p))) { best = i; break; }
    }
    return best;
  };

  const colAseg = findIndex(["aseguradora"]);
  // Variantes comunes para número de póliza
  const colNumPoliza = findIndex([
    "no poliza","no. poliza","n° poliza","numero poliza","número poliza",
    "no poliza","no póliza","n° póliza","numero póliza","número póliza",
    "poliza","póliza"
  ]);
  const colAmparo = findIndex(["amparo","amparos"]);
  const colVigIni = findIndex(["vigencia inicio","inicio vigencia","fecha inicio","inicio"]);
  const colVigFin = findIndex(["vigencia final","fin vigencia","fecha fin","final"]);
  // “Valor asegurado” puede venir como “valor asegurado” o solo “valor”
  let colValor = findIndex(["valor asegurado"]);
  if (colValor === -1) colValor = findIndex(["valor"]);

  return {
    aseguradora: colAseg,
    numeroPoliza: colNumPoliza,
    amparo: colAmparo,
    vigenciaInicio: colVigIni,
    vigenciaFin: colVigFin,
    valorAsegurado: colValor
  };
}

// Si faltó alguna columna clave, intenta inferir mirando las siguientes N filas
function backfillPolizaColumns(rows: any[][], startRow: number, endRow: number,
  colMap: ReturnType<typeof mapHeaderColumnsForPolizas>) {

  const probeEnd = Math.min(endRow, startRow + 10);

  // Inferir valor asegurado como la columna con números grandes repetidos
  if (colMap.valorAsegurado === -1) {
    const score: Record<number, number> = {};
    for (let r = startRow; r < probeEnd; r++) {
      const row = rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const n = toNumber(row[c]);
        if (n >= 1000) score[c] = (score[c] ?? 0) + 1;
      }
    }
    const best = Object.entries(score).sort((a,b)=>b[1]-a[1])[0];
    if (best) colMap.valorAsegurado = Number(best[0]);
  }

  // Inferir número de póliza: celda con guiones/dígitos largos tipo "21-45-101498488"
  if (colMap.numeroPoliza === -1) {
    const score: Record<number, number> = {};
    const re = /^[0-9]{2,}(\-[0-9A-Za-z]{2,})+$/; // patrón flexible con guiones
    for (let r = startRow; r < probeEnd; r++) {
      const row = rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const s = String(row[c] ?? "").trim();
        if (re.test(s)) score[c] = (score[c] ?? 0) + 2;
        // también prioriza celdas con muchos dígitos/letras mezclados
        if (s.replace(/[^0-9A-Za-z]/g,"").length >= 8) score[c] = (score[c] ?? 0) + 1;
      }
    }
    const best = Object.entries(score).sort((a,b)=>b[1]-a[1])[0];
    if (best) colMap.numeroPoliza = Number(best[0]);
  }
}

/* ------------------------------ PARSER ------------------------------ */

export function extraerPolizas(buffer: Buffer, fileName = "informe.xlsx"): PolizasExtract {
  const wb = XLSX.read(buffer, { type: "buffer", raw: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

  // 1) Encuentra el bloque de PÓLIZAS
  // El título aparece como "PÓLIZAS (Diligenciar un registro por cada amparo)"
  let start = findRowIndexByContainsAnyCol(rows, "polizas");
  if (start === -1) start = findRowIndexByContainsAnyCol(rows, "pólizas");
  if (start === -1) start = findRowIndexByContainsAnyCol(rows, "garantias del contrato");
  if (start === -1) throw new Error("No se encontró la sección de PÓLIZAS.");

  // 2) Ancla inferior: siguiente sección (V.- GRADO ...) o fin
  let end = -1;
  for (let r = start + 1; r < rows.length; r++) {
    const line = normalize((rows[r] ?? []).join(" "));
    if (/^v[\.\- ]/.test(line) && line.includes("grado de cumplimiento")) { end = r; break; }
  }
  if (end === -1) end = rows.length;

  // 3) Ubicar fila de encabezados: buscar palabras clave en las 6 filas siguientes
  let headerRowIdx = -1;
  for (let r = start + 1; r < Math.min(rows.length, start + 8); r++) {
    const line = normalize((rows[r] ?? []).join(" "));
    if (/(aseguradora).*(poliza|póliza).*(amparo).*(vigencia|fecha).*(valor)/.test(line)) {
      headerRowIdx = r; break;
    }
  }
  if (headerRowIdx === -1) {
    // fallback: la primera fila no vacía luego del título
    for (let r = start + 1; r < Math.min(rows.length, start + 8); r++) {
      if (notEmptyRow(rows[r])) { headerRowIdx = r; break; }
    }
  }
  if (headerRowIdx === -1) throw new Error("No se encontró la fila de encabezados de PÓLIZAS.");

  // 4) Mapear columnas y backfill si faltan
  const headerRow = rows[headerRowIdx] ?? [];
  const colMap = mapHeaderColumnsForPolizas(headerRow);
  backfillPolizaColumns(rows, headerRowIdx + 1, end, colMap);

  const { aseguradora, numeroPoliza, amparo, vigenciaInicio, vigenciaFin, valorAsegurado } = colMap;
  if (aseguradora === -1 && numeroPoliza === -1 && amparo === -1) {
    throw new Error("No fue posible identificar columnas clave de PÓLIZAS (aseguradora/número/amparo).");
  }

  // 5) Recorrer filas reales de datos (sin compactar índices)
  const polizas: Poliza[] = [];
  for (let r = headerRowIdx + 1; r < end; r++) {
    const row = rows[r] ?? [];
    if (!notEmptyRow(row)) continue;

    // ¿Fin por línea de total / cambio de sección en la misma fila?
    const joined = normalize(row.map(x => String(x ?? "")).join(" "));
    if (joined.includes("grado de cumplimiento") || joined.includes("valor total certificados")) break;

    // Extraer valores por columna (MISMA fila)
    const aseg = (aseguradora !== -1) ? String(row[aseguradora] ?? "").toString().trim() : "";
    const nPol = (numeroPoliza !== -1) ? String(row[numeroPoliza] ?? "").toString().trim() : "";
    const amp  = (amparo !== -1) ? String(row[amparo] ?? "").toString().trim() : "";

    // Fechas
    let vIni = ""; let vFin = "";
    if (vigenciaInicio !== -1) {
      const v = row[vigenciaInicio];
      vIni =
        (typeof v === "number" && tryExcelDateToISO(v)) ||
        (typeof v === "string" && parseSpanishDateToISO(v)) || "";
    }
    if (vigenciaFin !== -1) {
      const v = row[vigenciaFin];
      vFin =
        (typeof v === "number" && tryExcelDateToISO(v)) ||
        (typeof v === "string" && parseSpanishDateToISO(v)) || "";
    }

    // Valor asegurado
    let vAseg = 0;
    if (valorAsegurado !== -1) vAseg = toNumber(row[valorAsegurado]);
    // Limpia ruido flotante (ej. 77225643.799999997)
    if (Number.isFinite(vAseg)) vAseg = Number(vAseg.toFixed(2));

    // Fila válida si aporta algo relevante
    if (!(aseg || nPol || amp || vIni || vFin || vAseg > 0)) continue;

    polizas.push({
      aseguradora: aseg,
      numeroPoliza: nPol,
      amparo: amp,
      vigenciaInicio: vIni,
      vigenciaFin: vFin,
      valorAsegurado: vAseg
    });
  }

  const totalValorAsegurado = polizas.reduce((acc, p) => acc + (p.valorAsegurado || 0), 0);

  return {
    hoja: sheetName,
    seccion: "PÓLIZAS",
    columnas: (rows[headerRowIdx] ?? []).map(c => String(c ?? "")),
    polizas,
    totalValorAsegurado,
    fuente: { excel: fileName, hoja: sheetName }
  };
}
