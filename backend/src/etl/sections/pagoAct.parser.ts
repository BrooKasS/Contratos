import XLSX from "xlsx";
import type { PagoActual, PagoActualExtract } from "../../types";
import {
  normalize,
  notEmptyRow,
  tryExcelDateToISO,
  toNumber,
  findRowIndexByContainsAnyCol,
} from "../utils/excel-utils";

function cellText(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object")
    return String((v as any).v ?? (v as any).w ?? (v as any).t ?? "").trim();
  return String(v).trim();
}

function normalizeLoose(v: any): string {
  return normalize(cellText(v));
}

function parseDate(v: any): string {
  if (typeof v === "number") {
    const iso = tryExcelDateToISO(v);
    return iso ?? "";
  }
  const s = String(v ?? "").trim();
  if (!s) return "";
  const meses: Record<string, number> = {
    ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
    jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
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

// Función para expandir celdas combinadas (merged cells) - del ejemplo que proporcionaste
function fillMergedCells(ws: XLSX.WorkSheet) {
  const merges = (ws["!merges"] ?? []) as XLSX.Range[];

  for (const m of merges) {
    if (!m?.s || !m?.e) continue;

    const r0 = m.s.r;
    const r1 = m.e.r;
    const c0 = m.s.c;
    const c1 = m.e.c;

    // Buscar el valor base dentro del merge real en el worksheet
    let base: any = undefined;

    for (let r = r0; r <= r1 && base === undefined; r++) {
      for (let c = c0; c <= c1 && base === undefined; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r, c });
        const cell = ws[cellAddress];
        if (cell && cell.v !== undefined && cell.v !== null && cell.v !== "") {
          base = cell.v;
        }
      }
    }

    if (base === undefined) continue;

    // Rellenar todas las celdas del merge en el worksheet
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r, c });

        // Si la celda no existe o está vacía, crearla con el valor base
        if (!ws[cellAddress] || ws[cellAddress].v === undefined || ws[cellAddress].v === "") {
          ws[cellAddress] = {
            t: "s",
            v: base
          };
        }
      }
    }
  }
}

// Función para backfill vertical en columnas clave (solo texto, sin valor para evitar extras)
function backfillPagoColumns(rows: any[][], startRow: number, endRow: number, colMap: { [key: string]: number }) {
  const { colConcepto, colCRP, colPedido } = colMap; // Solo texto común en merges; sin colNo ni colValor

  // Backfill para concepto (muy común en merges multilínea)
  if (colConcepto !== -1) {
    let lastValue = "";
    for (let r = startRow; r < endRow; r++) {
      const row = rows[r];
      if (!row || row.length <= colConcepto) continue;
      let current = cellText(row[colConcepto]);
      if (current) {
        lastValue = current;
      } else if (lastValue) {
        row[colConcepto] = lastValue;
      }
    }
  }

  // Backfill para CRP (si aplica merges)
  if (colCRP !== -1) {
    let lastValue = "";
    for (let r = startRow; r < endRow; r++) {
      const row = rows[r];
      if (!row || row.length <= colCRP) continue;
      let current = cellText(row[colCRP]);
      if (current) {
        lastValue = current;
      } else if (lastValue) {
        row[colCRP] = lastValue;
      }
    }
  }

  // Backfill para Pedido (si aplica merges)
  if (colPedido !== -1) {
    let lastValue = "";
    for (let r = startRow; r < endRow; r++) {
      const row = rows[r];
      if (!row || row.length <= colPedido) continue;
      let current = cellText(row[colPedido]);
      if (current) {
        lastValue = current;
      } else if (lastValue) {
        row[colPedido] = lastValue;
      }
    }
  }
}

export function extraerPagoActual(
  buffer: Buffer,
  fileName = "informe.xlsx"
): PagoActualExtract {
  const wb = XLSX.read(buffer, { type: "buffer", raw: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // ✅ Expandir celdas combinadas DIRECTAMENTE en el worksheet
  fillMergedCells(ws);

  // Obtener JSON (blankrows: true para merges)
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    blankrows: true,
  });

  // 1) Buscar la sección de PAGO ACTUAL
  const start = findRowIndexByContainsAnyCol(rows, "pago actual");
  if (start === -1)
    throw new Error("No se encontró la sección de PAGO ACTUAL.");

  // 2) Definir fin de sección
  let end = rows.length;
  for (let r = start + 1; r < rows.length; r++) {
    const line = normalize((rows[r] ?? []).join(" "));
    if (line.includes("observaciones") || line.includes("viii") || line.includes("valor total del contrato") || line.includes("ciudad donde")) {
      end = r;
      break;
    }
  }

  // Busca los encabezados
  let headerRowIdx = -1;
  for (let r = start + 1; r < Math.min(end, start + 20); r++) {
    if (r >= rows.length) break;
    if (notEmptyRow(rows[r])) {
      headerRowIdx = r;
      break;
    }
  }
  if (headerRowIdx === -1)
    throw new Error("No se encontró la fila de encabezados de PAGO ACTUAL.");

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

  const colNo = findCol("no", "número", "numero");
  const colFecha = findCol("fecha");
  const colFactura = findCol("factura");
  const colCRP = findCol("crp", "numero crp");
  const colPedido = findCol("pedido", "numero pedido");
  const colCDP = findCol("cdp", "numero cdp");
  const colSolicitud = findCol("solicitud", "numero solicitud");
  const colConcepto = findCol("concepto");
  const colValor = findCol("valor");

  // Backfill solo para campos de texto (concepto, etc.)
  const colMap = { colConcepto, colCRP, colPedido };
  backfillPagoColumns(rows, headerRowIdx + 1, end, colMap);

  const pagos: PagoActual[] = [];

  for (let r = headerRowIdx + 1; r < end; r++) {
    const row = rows[r];
    if (!notEmptyRow(row)) continue;

    const joined = normalize(row.join(" "));

    // Break por secciones
    let shouldBreak = false;
    for (const cell of row) {
      const cellNorm = normalizeLoose(cell);
      if (
        cellNorm.includes("observaciones") ||
        cellNorm.includes("viii") ||
        cellNorm === "valor total del contrato" ||
        cellNorm.includes("ciudad donde")
      ) {
        shouldBreak = true;
        break;
      }
    }
    if (shouldBreak) {
      break;
    }

    const numero = colNo !== -1 ? parseInt(cellText(row[colNo]), 10) || 0 : 0;
    const fecha = colFecha !== -1 ? parseDate(row[colFecha]) : "";
    const numeroFactura = colFactura !== -1 ? cellText(row[colFactura]) : "";
    const numeroCRP = colCRP !== -1 ? cellText(row[colCRP]) : "";
    const numeroPedido = colPedido !== -1 ? cellText(row[colPedido]) : "";
    const numeroCDP = colCDP !== -1 ? cellText(row[colCDP]) : "";
    const numeroSolicitud = colSolicitud !== -1 ? cellText(row[colSolicitud]) : "";
    const concepto = colConcepto !== -1 ? cellText(row[colConcepto]) : "";
    const valor = colValor !== -1 ? toNumber(row[colValor]) : 0;

    // Filtro simple: solo captura filas con valor > 0 (evita extras, captura merged via fill/backfill)
    if (valor === 0) {
      continue;
    }

    pagos.push({
      numero,
      fecha,
      numeroFactura,
      numeroCRP,
      numeroPedido,
      numeroCDP,
      numeroSolicitud,
      concepto,
      valor,
    });
  }

  // Resto del código para valorTotalContrato
  let valorTotalContrato = 0;
  const seccionValoresIdx = findRowIndexByContainsAnyCol(rows, "iii");

  if (seccionValoresIdx !== -1) {
    for (let r = seccionValoresIdx; r < Math.min(seccionValoresIdx + 10, rows.length); r++) {
      const row = rows[r] ?? [];

      for (let c = 0; c < Math.min(15, row.length); c++) {
        const cellValue = normalizeLoose(row[c]);

        if (cellValue.includes("valor") && cellValue.includes("total") && cellValue.includes("contrato")) {
          for (let offset = 1; offset <= Math.min(14 - c, 10); offset++) {
            const val = toNumber(row[c + offset]);
            if (!isNaN(val) && val > 0) {
              valorTotalContrato = val;
              break;
            }
          }
          if (valorTotalContrato > 0) break;
        }
      }
      if (valorTotalContrato > 0) break;
    }
  }

  // Resumen
  let valorPagadoAntes = 0;
  let valorAPagarEnEsteInforme = 0;
  let saldoDelContrato = 0;
  let saldoALiberar = 0;
  const resumenStart = headerRowIdx + pagos.length + 1;
  const resumenEnd = Math.min(rows.length - 1, resumenStart + 30);
  for (let r = resumenStart; r <= resumenEnd; r++) {
    const row = rows[r] ?? [];

    for (let c = 0; c < row.length; c++) {
      const label = normalizeLoose(row[c]);

      if (label.includes("valor pagado antes") && valorPagadoAntes === 0) {
        for (let offset = 1; offset <= 5; offset++) {
          if (c + offset >= row.length) break;
          const val = toNumber(row[c + offset]);
          if (!isNaN(val) && val > 0) {
            valorPagadoAntes = val;
            break;
          }
        }
      }

      if (label.includes("valor a pagar en este informe") && valorAPagarEnEsteInforme === 0) {
        for (let offset = 1; offset <= 5; offset++) {
          if (c + offset >= row.length) break;
          const val = toNumber(row[c + offset]);
          if (!isNaN(val) && val > 0) {
            valorAPagarEnEsteInforme = val;
            break;
          }
        }
      }

      if (label.includes("saldo del contrato") && saldoDelContrato === 0) {
        for (let offset = 1; offset <= 5; offset++) {
          if (c + offset >= row.length) break;
          const val = toNumber(row[c + offset]);
          if (!isNaN(val) && val > 0) {
            saldoDelContrato = val;
            break;
          }
        }
      }

      if (label.includes("saldo a liberar") && saldoALiberar === 0) {
        for (let offset = 1; offset <= 5; offset++) {
          if (c + offset >= row.length) break;
          const val = toNumber(row[c + offset]);
          if (!isNaN(val) && val > 0) {
            saldoALiberar = val;
            break;
          }
        }
      }
    }
  }

  return {
    hoja: sheetName,
    seccion: "PAGO ACTUAL",
    columnas: header,
    pagos,
    resumen: {
      valorTotalContrato,
      valorPagadoAntes,
      valorAPagarEnEsteInforme,
      saldoDelContrato,
      saldoALiberar,
    },
    fuente: { excel: fileName, hoja: sheetName },
  };
}