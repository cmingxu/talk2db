import * as XLSX from 'xlsx';

/**
 * Generates an .xlsx workbook from a query result and triggers a download.
 * The first row is the header (database fields / column names), followed by
 * all data rows (full length — nothing is truncated).
 */
export function downloadExcel(columns: string[], rows: string[][], filename: string) {
  const aoa: (string | number)[][] = [
    columns,
    ...rows.map(r => r.map(cell => (cell === 'NULL' ? '' : cell))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '结果');
  XLSX.writeFile(wb, `${sanitizeDownloadName(filename)}.xlsx`);
}

/** Fallback name when a result has no filename. */
export function fallbackResultName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `查询结果_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Strip characters that are illegal in filenames, mirroring the backend. */
function sanitizeDownloadName(name: string): string {
  const cleaned = name
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 80);
  return cleaned || '查询结果';
}
