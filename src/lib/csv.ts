/**
 * Writing a CSV that Excel opens without mangling it.
 *
 * WHY IT IS ITS OWN FILE
 * This lived inline inside the `exportCsv` action. The moment a second caller
 * needed it -- offering to save a page's data before deleting the page -- the
 * choice was copy it or extract it. Copying is how the editor and the published
 * renderer drifted apart five times in this codebase, and the details here are
 * exactly the kind that get fixed on one copy and not the other: without the
 * BOM Excel mangles accents, without \r\n it puts every row in one cell, and
 * without doubling quotes one comma in a message shifts every column after it.
 */

import { isoToDateInput } from './rows';

export interface CsvColumn {
  name: string;
  /**
   * Carried so a date column can be written as a plain day.
   *
   * Optional because a caller without types still works -- but a caller that
   * HAS them and does not pass them exports the wrong thing silently, so both
   * call sites pass them and a check makes sure they keep doing it.
   */
  type?: string;
}

/** One field, quoted only when it has to be. */
export function csvCell(value: any): string {
  const str = value === null || value === undefined ? '' : String(value);
  // Excel needs quotes doubled, and any field holding a comma, quote or newline
  // wrapped -- otherwise one comma in a message shifts a column.
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * A whole table.
 *
 * The BOM and the \r\n are not decoration. Excel needs both to open a UTF-8 CSV
 * without mangling accents and without putting every row into one cell, and
 * that was checked with a round trip when the export action was first written.
 */
/**
 * One cell, as a CSV should carry it.
 *
 * A DATE COLUMN IS WRITTEN AS THE DAY, NOT AS THE INSTANT. Dates are stored as
 * local midnight in ISO, so a booking picked for the 20th is
 * `2026-08-19T18:30:00.000Z` in Delhi -- and a builder who exports their
 * bookings and opens the file sees the 19th. Correct to the millisecond, wrong
 * to the person, and wrong in the one direction that gets acted on.
 *
 * `YYYY-MM-DD` is what the picker showed them, sorts correctly in a
 * spreadsheet, and is read as a date by every spreadsheet there is.
 */
function csvValue(value: any, column: CsvColumn): any {
  if (column?.type !== 'date') return value;
  if (value === null || value === undefined || value === '') return '';
  return isoToDateInput(value) || value;
}

export function toCsv(columns: CsvColumn[], rows: Record<string, any>[]): string {
  const header = (columns || []).map(c => csvCell(c.name)).join(',');
  const body = (rows || [])
    .map(r => (columns || []).map(c => csvCell(csvValue(r[c.name], c))).join(','))
    .join('\r\n');
  return '﻿' + header + '\r\n' + body;
}

/** A filename a filesystem will accept, from whatever the block was called. */
export function csvFileName(name: string | undefined | null): string {
  const cleaned = String(name ?? '')
    .replace(/[^a-z0-9\-_ ]/gi, '')
    .trim();
  return (cleaned || 'data') + '.csv';
}

/**
 * Hand a file to the browser.
 *
 * Split out from the writing so the writing can be checked without a DOM --
 * the escaping is the part that goes wrong, and it is pure.
 */
export function downloadCsv(fileName: string, csv: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
