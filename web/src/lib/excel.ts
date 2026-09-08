import * as XLSX from 'xlsx';

export interface ExcelAttachment {
  filename: string;
  headers: string[];
  rows: string[][];
}

export const MAX_UPLOAD_ROWS = 2000;
export const MAX_UPLOAD_CHARS = 50000;
const MAX_CELL_CHARS = 200;

/** Collapse all whitespace (tabs/newlines) and cap cell length. */
export function sanitizeCell(v: unknown): string {
  const s = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > MAX_CELL_CHARS ? s.slice(0, MAX_CELL_CHARS) : s;
}

/** Serialize headers + rows into a tab-separated string (shorter rows padded). */
export function attachmentTSV(att: ExcelAttachment): string {
  const headerCount = att.headers.length;
  const lines: string[] = [att.headers.map(sanitizeCell).join('\t')];
  for (const row of att.rows) {
    const line = row.map(sanitizeCell);
    while (line.length < headerCount) line.push('');
    lines.push(line.join('\t'));
  }
  return lines.join('\n');
}

/** Returns an error message if the attachment exceeds limits, else null. */
export function validateAttachment(att: ExcelAttachment): string | null {
  if (att.rows.length > MAX_UPLOAD_ROWS) {
    return `Excel 超过 ${MAX_UPLOAD_ROWS} 行限制（当前 ${att.rows.length} 行）`;
  }
  if (att.headers.length === 0) {
    return 'Excel 文件为空';
  }
  if (attachmentTSV(att).length > MAX_UPLOAD_CHARS) {
    return 'Excel 内容超过大小限制，请精简列或行';
  }
  return null;
}

/** Parse the first sheet of an Excel/CSV file into an attachment. */
export async function parseExcelFile(file: File): Promise<ExcelAttachment> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('文件中没有工作表');
  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });

  // Drop fully-empty trailing rows.
  while (data.length > 0 && data[data.length - 1].every(c => String(c ?? '').trim() === '')) {
    data.pop();
  }
  if (data.length === 0) throw new Error('Excel 文件为空');

  const headers = (data[0] ?? []).map(c => sanitizeCell(String(c ?? '')));
  const rows = data.slice(1).map(r => r.map(sanitizeCell));
  return { filename: file.name, headers, rows };
}
