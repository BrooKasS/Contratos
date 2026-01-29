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

export function extraerPagoActual(
  buffer: Buffer,
  fileName = "informe.xlsx"
): PagoActualExtract {
  const wb = XLSX.read(buffer, { type: "buffer", raw: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    blankrows: false,
  });

  // 1) Buscar la sección de PAGO ACTUAL
  const start = findRowIndexByContainsAnyCol(rows, "pago actual");
  if (start === -1)
    throw new Error("No se encontró la sección de PAGO ACTUAL.");

  // busca los encabezados 
  let headerRowIdx = -1;
  for (let r = start + 1; r < start + 10; r++) {
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
  const pagos: PagoActual[] = [];

  
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!notEmptyRow(row)) continue;

    const joined = normalize(row.join(" "));
    
    if (
      joined.includes("observaciones") ||
      joined.includes("viii") ||
      joined.includes("valor total del contrato") ||
      joined.includes("ciudad donde")
    ) {
      break;
    }

    const numero = colNo !== -1 ? parseInt(row[colNo], 10) || 0 : 0;
    if (!numero) continue;

    const fecha = colFecha !== -1 ? parseDate(row[colFecha]) : "";
    const numeroFactura = colFactura !== -1 ? cellText(row[colFactura]) : "";
    const numeroCRP = colCRP !== -1 ? cellText(row[colCRP]) : "";
    const numeroPedido = colPedido !== -1 ? cellText(row[colPedido]) : "";
    const numeroCDP = colCDP !== -1 ? cellText(row[colCDP]) : "";
    const numeroSolicitud = colSolicitud !== -1 ? cellText(row[colSolicitud]) : "";
    const concepto = colConcepto !== -1 ? cellText(row[colConcepto]) : "";
    const valor = colValor !== -1 ? toNumber(row[colValor]) : 0;
    
   
  
    

  

    if (!(numero || fecha || numeroFactura || valor)) continue;

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

  let valorPagadoAntes = 0;
  let valorAPagarEnEsteInforme = 0;
  let saldoDelContrato = 0;
  let saldoALiberar = 0;

  const resumenStart = headerRowIdx + pagos.length + 2;
  const resumenEnd = Math.min(rows.length - 1, resumenStart + 30);

  for (let r = resumenStart; r <= resumenEnd; r++) {
    const row = rows[r] ?? [];
    
    
    for (let c = 35; c < row.length; c++) {
      const label = normalizeLoose(row[c]);
      
      if (label.includes("valor pagado antes") && valorPagadoAntes === 0) {
        for (let offset = 1; offset <= 5; offset++) {
          const val = toNumber(row[c + offset]);
          if (!isNaN(val) && val > 0) {
            valorPagadoAntes = val;
            break;
          }
        }
      }
      
      if (label.includes("valor a pagar en este informe") && valorAPagarEnEsteInforme === 0) {
        for (let offset = 1; offset <= 5; offset++) {
          const val = toNumber(row[c + offset]);
          if (!isNaN(val) && val > 0) {
            valorAPagarEnEsteInforme = val;
            break;
          }
        }
      }
      
      if (label.includes("saldo del contrato") && saldoDelContrato === 0) {
        for (let offset = 1; offset <= 5; offset++) {
          const val = toNumber(row[c + offset]);
          if (!isNaN(val) && val > 0) {
            saldoDelContrato = val;
            break;
            
          }
        }
      }
      
      if (label.includes("saldo a liberar") && saldoALiberar === 0) {
        for (let offset = 1; offset <= 5; offset++) {
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