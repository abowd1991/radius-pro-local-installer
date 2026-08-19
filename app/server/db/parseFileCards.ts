/**
 * parseFileCards.ts
 *
 * Parse cards from CSV, Word (.docx), or PDF files.
 * Returns raw rows (string[][]) so the caller can pick which column = username / password.
 *
 * Security:
 *  - File size checked before parsing (max 5 MB)
 *  - Max 10,000 rows returned
 *  - All cell values sanitized (strip HTML, control chars)
 */

import mammoth from 'mammoth';
import * as pdfParseModule from 'pdf-parse';
import ExcelJS from 'exceljs';
const pdfParse = (pdfParseModule as any).default || pdfParseModule;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedFileResult {
  /** All rows extracted from the file (including header if present) */
  rows: string[][];
  /** Detected column count */
  columnCount: number;
  /** Total rows before trimming to MAX_ROWS */
  totalRows: number;
  /** File type detected */
  fileType: 'csv' | 'docx' | 'pdf' | 'xlsx';
  /** Suggested mapping derived from header labels, when present */
  suggestedMapping: { usernameCol: number; passwordCol: number; hasHeader: boolean } | null;
}

export interface MappedCard {
  username: string;
  password: string;
}

const MAX_ROWS = 10_000;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_XLSX_ENTRIES = 1_000;
const MAX_XLSX_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;

// ─── Sanitize ─────────────────────────────────────────────────────────────────

function sanitizeCell(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')          // strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
    .trim()
    .slice(0, 500);                    // max cell length
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCsvToRows(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l: string) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = [';', ',', '\t'].reduce((best, candidate) =>
    lines[0].split(candidate).length > lines[0].split(best).length ? candidate : best,
  ';');
  const parseLine = (line: string) => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && quoted && line[i + 1] === '"') { current += '"'; i++; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (char === delimiter && !quoted) { cells.push(sanitizeCell(current)); current = ''; continue; }
      current += char;
    }
    cells.push(sanitizeCell(current));
    return cells;
  };

  const rows: string[][] = [];
  for (const line of lines) {
    const cells = parseLine(line);
    if (cells.length >= 2) rows.push(cells);
    if (rows.length >= MAX_ROWS) break;
  }
  return rows;
}

function detectColumnMapping(rows: string[][]): ParsedFileResult['suggestedMapping'] {
  const header = rows[0]?.map(value => value.trim().toLowerCase()) ?? [];
  const usernameLabels = ['username', 'user', 'user name', 'اسم المستخدم', 'اليوزر', 'الرقم', 'card number'];
  const passwordLabels = ['password', 'pass', 'كلمة المرور', 'كلمة السر', 'الباسورد', 'السر'];
  const usernameCol = header.findIndex(value => usernameLabels.includes(value));
  const passwordCol = header.findIndex(value => passwordLabels.includes(value));
  return usernameCol >= 0 && passwordCol >= 0 && usernameCol !== passwordCol
    ? { usernameCol, passwordCol, hasHeader: true }
    : null;
}

// ─── Word (.docx) Parser ──────────────────────────────────────────────────────

async function parseDocxToRows(buffer: Buffer): Promise<string[][]> {
  // Extract raw HTML from docx
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value;

  // Extract table rows from HTML
  const rows: string[][] = [];

  // Match <tr>...</tr>
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const rowHtml = trMatch[1];
    // Match <td> or <th>
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(sanitizeCell(cellMatch[1]));
    }
    if (cells.length >= 2) rows.push(cells);
    if (rows.length >= MAX_ROWS) break;
  }

  // If no tables found, try to parse plain text lines
  if (rows.length === 0) {
    const textResult = await mammoth.extractRawText({ buffer });
    const lines = textResult.value.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    for (const line of lines) {
      // Try tab, semicolon, comma, or multiple spaces as delimiter
      const cells = line.split(/\t|;|,|\s{2,}/).map((c: string) => sanitizeCell(c));
      if (cells.length >= 2) rows.push(cells);
      if (rows.length >= MAX_ROWS) break;
    }
  }

  return rows;
}

// ─── PDF Parser ───────────────────────────────────────────────────────────────

async function parsePdfToRows(buffer: Buffer): Promise<string[][]> {
  const data = await pdfParse(buffer);
  const text = data.text;

  const rows: string[][] = [];
  const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

  for (const line of lines) {
    // Try tab, semicolon, comma, or multiple spaces as delimiter
    const cells = line.split(/\t|;|,|\s{2,}/).map((c: string) => sanitizeCell(c));
    if (cells.length >= 2) rows.push(cells);
    if (rows.length >= MAX_ROWS) break;
  }

  return rows;
}

// ─── Excel Parser ────────────────────────────────────────────────────────────

function assertSafeXlsxContainer(buffer: Buffer): void {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("ملف Excel يجب أن يكون بصيغة XLSX حديثة وصحيحة");
  }

  const eocdStart = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= eocdStart; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocdOffset = offset; break; }
  }
  if (eocdOffset < 0 || eocdOffset + 22 > buffer.length) {
    throw new Error("بنية ملف XLSX غير صالحة");
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0 || entryCount > MAX_XLSX_ENTRIES || centralDirectoryOffset + centralDirectorySize > eocdOffset) {
    throw new Error("ملف XLSX يتجاوز حدود البنية المسموح بها");
  }

  let offset = centralDirectoryOffset;
  let totalUncompressedBytes = 0;
  let hasContentTypes = false;
  let hasWorkbook = false;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("فهرس ملف XLSX غير صالح");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nextOffset = nameStart + fileNameLength + extraLength + commentLength;
    if (nextOffset > buffer.length || flags & 0x0001 || (compression !== 0 && compression !== 8) || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error("ملف XLSX يحتوي على بنية غير مسموح بها");
    }
    const entryName = buffer.subarray(nameStart, nameStart + fileNameLength).toString("utf8");
    if (!entryName || entryName.includes("\\") || entryName.split("/").includes("..")) {
      throw new Error("ملف XLSX يحتوي على مسار غير آمن");
    }
    hasContentTypes ||= entryName === "[Content_Types].xml";
    hasWorkbook ||= entryName === "xl/workbook.xml";
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new Error("محتوى ملف XLSX يتجاوز الحد المسموح");
    }
    offset = nextOffset;
  }
  if (!hasContentTypes || !hasWorkbook) {
    throw new Error("الملف ليس XLSX صالحاً");
  }
}

async function parseExcelToRows(buffer: Buffer): Promise<string[][]> {
  assertSafeXlsxContainer(buffer);
  const workbook = new ExcelJS.Workbook();
  // ExcelJS يعرّف Buffer بإصدار Node مختلف؛ الحاوية فُحصت قبل هذا التحميل.
  await workbook.xlsx.load(buffer as any);
  if (workbook.worksheets.length === 0 || workbook.worksheets.length > 20) {
    throw new Error("عدد أوراق XLSX خارج الحد المسموح");
  }
  const rows: string[][] = [];

  for (const sheet of workbook.worksheets) {
    for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const cells = Array.from({ length: Math.min(row.cellCount, 100) }, (_, index) =>
        sanitizeCell(row.getCell(index + 1).text ?? ''),
      );
      if (cells.filter(c => c.length > 0).length >= 2) rows.push(cells);
      if (rows.length >= MAX_ROWS) break;
    }
    if (rows.length >= MAX_ROWS) break;
  }

  return rows;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Parse a file buffer into rows.
 * @param buffer - File content as Buffer
 * @param mimeType - MIME type of the file
 * @param fileName - Original file name (used to detect type if mimeType is generic)
 */
export async function parseFileToRows(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ParsedFileResult> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`حجم الملف كبير جداً. الحد الأقصى ${MAX_FILE_SIZE / 1024 / 1024} ميغابايت.`);
  }

  const ext = fileName.toLowerCase().split('.').pop() || '';
  let fileType: 'csv' | 'docx' | 'pdf' | 'xlsx';
  let rows: string[][];

  // Detect file type
  if (
    mimeType === 'text/csv' ||
    mimeType === 'application/csv' ||
    ext === 'csv'
  ) {
    fileType = 'csv';
    const text = buffer.toString('utf-8');
    rows = parseCsvToRows(text);
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    ext === 'docx' ||
    ext === 'doc'
  ) {
    fileType = 'docx';
    rows = await parseDocxToRows(buffer);
  } else if (
    mimeType === 'application/pdf' ||
    ext === 'pdf'
  ) {
    fileType = 'pdf';
    rows = await parsePdfToRows(buffer);
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    ext === 'xlsx'
  ) {
    fileType = 'xlsx';
    rows = await parseExcelToRows(buffer);
  } else {
    throw new Error(`نوع الملف غير مدعوم. المدعوم: CSV, Excel (.xlsx), Word (.docx), PDF`);
  }

  const totalRows = rows.length;
  const columnCount = rows.length > 0 ? Math.max(...rows.map(r => r.length)) : 0;

  return {
    rows: rows.slice(0, MAX_ROWS),
    columnCount,
    totalRows,
    fileType,
    suggestedMapping: detectColumnMapping(rows),
  };
}

/**
 * Map rows to username/password pairs using column indexes.
 * @param rows - Raw rows from parseFileToRows
 * @param usernameCol - 0-based column index for username
 * @param passwordCol - 0-based column index for password
 * @param skipHeader - Skip first row (header)
 */
export function mapRowsToCards(
  rows: string[][],
  usernameCol: number,
  passwordCol: number,
  skipHeader: boolean
): MappedCard[] {
  const startIdx = skipHeader ? 1 : 0;
  const cards: MappedCard[] = [];

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    const username = row[usernameCol]?.trim() || '';
    const password = row[passwordCol]?.trim() || '';

    // Skip empty rows
    if (!username) continue;

    // Validate: username max 64 chars, password max 64 chars
    if (username.length > 64 || password.length > 64) continue;

    // Prevent SQL injection: only allow alphanumeric + common chars
    if (!/^[a-zA-Z0-9_\-\.@]+$/.test(username)) continue;

    cards.push({ username, password });
  }

  return cards;
}
