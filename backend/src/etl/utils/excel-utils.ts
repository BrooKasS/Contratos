
import XLSX from "xlsx";

export function normalize(x: any): string {
  return String(x ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function findRowIndexByTextAnyCol(rows: any[][], needleRaw: string): number {
  const needle = normalize(needleRaw);
  return rows.findIndex(r => (r ?? []).some(c => normalize(c) === needle));
}

export function findRowIndexByContainsAnyCol(rows: any[][], needleRaw: string): number {
  const needle = normalize(needleRaw);
  return rows.findIndex(r => (r ?? []).some(c => normalize(c).includes(needle)));
}

export function notEmptyRow(r: any[]): boolean {
  if (!r) return false;
  return r.some(c => String(c ?? "").trim() !== "");
}

export function toNumber(x: any): number {
  if (x === null || x === undefined) return 0;
  const n = typeof x === "number" ? x : parseFloat(String(x).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

export function isRecentExcelSerial(n: number): boolean {
  return n >= 40000 && n <= 60000;
}

export function tryExcelDateToISO(n: number): string | null {
  if (typeof n !== "number") return null;
  if (n < 20000 || n > 60000) return null;
  const utcDays = n - 25569;
  const utcValue = utcDays * 86400 * 1000;
  const d = new Date(utcValue);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function isDateString(s: string): boolean {
  const t = s.trim();
  return /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.test(t);
}

export function classifyRowCells(r: any[]) {
  const cells = (r ?? []).map(c => (c === undefined || c === null ? "" : c));

  const texts: string[] = [];
  const numbers: number[] = [];
  const datesISO: string[] = [];
  const codeLike: string[] = [];

  for (const c of cells) {
    if (typeof c === "number") {
      const maybeDate = tryExcelDateToISO(c);
      if (maybeDate) datesISO.push(maybeDate);
      else numbers.push(c);
      continue;
    }
    const s = String(c).trim();
    if (!s) continue;

    if (isDateString(s)) {
      const m = s.replace(/-/g, "/").split("/");
      const y = parseInt(m[2], 10);
      const p1 = parseInt(m[0], 10);
      const p2 = parseInt(m[1], 10);
      const mm = p1 > 12 ? p2 : p1;
      const dd = p1 > 12 ? p1 : p2;
      const d = new Date(y, mm - 1, dd);
      if (!isNaN(d.getTime())) datesISO.push(d.toISOString().slice(0, 10));
      continue;
    }

    if (/^\d{4,}_[0-9]{2,}$/.test(s)) {
      codeLike.push(s);
      continue;
    }

    const numOnly = s.replace(/[^\d.-]/g, "");
    if (numOnly && /^-?\d+(\.\d+)?$/.test(numOnly)) {
      numbers.push(parseFloat(numOnly));
      continue;
    }

    texts.push(s);
  }

  return { texts, numbers, datesISO, codeLike };
}

export function pickRubro(texts: string[]): string {
  const cand = texts
    .filter(t => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(t))
    .sort((a, b) => b.length - a.length);
  return cand[0]?.trim() ?? "";
}

export function pickValor(nums: number[]): number {
  const bigs = nums.filter(n => n >= 100000);
  return bigs.length ? Math.max(...bigs) : 0;
}

export function collectNumeroCandidates(rows: any[][], from: number, to: number) {
  const candidates: { row: number; value: string }[] = [];
  for (let i = from; i < to; i++) {
    const raw = (rows[i] ?? []).map(c => String(c ?? "")).join(" ");
    const matches = raw.match(/\b\d{4,6}\b/g) || [];
    for (const m of matches) {
      const n = parseInt(m, 10);
      if (isNaN(n)) continue;
      if (isRecentExcelSerial(n)) continue;
      candidates.push({ row: i, value: m });
    }
  }
  return candidates;
}

export function assignNumeroByNearest(rowsCRP: any, numeroCandidates: string | any[], maxDistance = 6) {
  const used = new Set<number>();
  for (const crpRow of rowsCRP) {
    let bestIndex = -1;
    let bestDist = Infinity;

    for (let i = 0; i < numeroCandidates.length; i++) {
      if (used.has(i)) continue;
      const cand = numeroCandidates[i];
      const dist = Math.abs(cand.row - crpRow.idx);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      } else if (dist === bestDist && bestIndex >= 0) {
        if (cand.row > crpRow.idx && numeroCandidates[bestIndex].row <= crpRow.idx) {
          bestIndex = i;
        }
      }
    }

    if (bestIndex >= 0 && bestDist <= maxDistance) {
      crpRow.item.numero = numeroCandidates[bestIndex].value;
      used.add(bestIndex);
    } else {
      crpRow.item.numero = "";
    }
  }
}
