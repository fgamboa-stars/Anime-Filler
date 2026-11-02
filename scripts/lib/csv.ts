/**
 * Minimal RFC 4180 CSV parser: quoted fields, escaped quotes (""), commas and
 * newlines inside quotes, CRLF or LF line endings, and a UTF-8 BOM.
 */
export interface CsvRecord {
  /** 1-based line number of the record in the source file (header is line 1). */
  line: number;
  values: Record<string, string>;
}

export interface CsvParseResult {
  headers: string[];
  records: CsvRecord[];
  errors: { line: number; message: string }[];
}

export function parseCsvRows(input: string): { cells: string[]; line: number }[] {
  const text = input.replace(/^﻿/, '');
  const rows: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;
  let fieldStarted = false;

  const endField = () => {
    cells.push(field);
    field = '';
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    // Skip fully blank lines.
    if (!(cells.length === 1 && cells[0].trim() === '')) rows.push({ cells, line: rowStartLine });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      rowStartLine = line;
    } else {
      field += ch;
      fieldStarted = true;
    }
  }
  if (field !== '' || cells.length > 0) endRow();
  return rows;
}

export function parseCsv(input: string): CsvParseResult {
  const rows = parseCsvRows(input);
  const errors: CsvParseResult['errors'] = [];
  if (rows.length === 0) return { headers: [], records: [], errors: [{ line: 1, message: 'File is empty' }] };

  const headers = rows[0].cells.map((h) => h.trim());
  const records: CsvRecord[] = [];
  for (const row of rows.slice(1)) {
    if (row.cells.length !== headers.length) {
      errors.push({
        line: row.line,
        message: `Expected ${headers.length} columns but found ${row.cells.length}`,
      });
      continue;
    }
    const values: Record<string, string> = {};
    headers.forEach((h, idx) => {
      values[h] = row.cells[idx].trim();
    });
    records.push({ line: row.line, values });
  }
  return { headers, records, errors };
}

export function toCsvValue(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
