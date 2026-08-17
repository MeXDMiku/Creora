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

export interface CsvColumn {
  name: string;
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
export function toCsv(columns: CsvColumn[], rows: Record<string, any>[]): string {
  const header = (columns || []).map(c => csvCell(c.name)).join(',');
  const body = (rows || [])
    .map(r => (columns || []).map(c => csvCell(r[c.name])).join(','))
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
