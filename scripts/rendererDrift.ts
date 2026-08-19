import { readFileSync, readdirSync } from 'node:fs';

/**
 * How much of the editor is written out a second time in the published renderer.
 *
 * WHY THIS EXISTS
 * Nine separate bugs in this project have been the same bug: a decision made in
 * two places that stopped agreeing. Each was found by hand, months apart, and
 * each was invisible until somebody happened to look at both copies at once --
 * a chart drawn to different arithmetic, a timer firing different events, a
 * cell shown raw on one side and formatted on the other.
 *
 * Finding the tenth by hand is not a plan. This measures the surface instead,
 * so a new copy has to be argued for rather than merely not noticed.
 *
 * WHAT IT DOES NOT CLAIM
 * A duplicated run is not automatically a bug. Two boxes with the same rounded
 * corners and the same shadow are the same on purpose, and pulling every
 * matching style into a shared component would make both harder to read for no
 * gain. The number is a BUDGET, not a target of zero: it may shrink, and it
 * may not grow without somebody deciding it should.
 */

const WINDOW = 8;

/** Lines that carry meaning. Comments, braces and blanks match everywhere. */
function significantLines(text: string): string[] {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 3 && !/^[)}\];,]+$/.test(l));
}

export interface DuplicatedRun {
  file: string;
  lines: number;
  starts: string;
}

export function duplicatedRuns(): DuplicatedRun[] {
  const published = significantLines(readFileSync('src/components/PublishedRenderer.tsx', 'utf8'));
  const seen = new Set<string>();
  for (let i = 0; i + WINDOW <= published.length; i++) {
    seen.add(published.slice(i, i + WINDOW).join(' '));
  }

  const runs: DuplicatedRun[] = [];
  const blockFiles = readdirSync('src/blocks')
    .filter(f => f.endsWith('.tsx') && !f.includes('inspector'))
    .sort();

  for (const file of blockFiles) {
    const lines = significantLines(readFileSync('src/blocks/' + file, 'utf8'));
    let i = 0;
    while (i + WINDOW <= lines.length) {
      if (!seen.has(lines.slice(i, i + WINDOW).join(' '))) {
        i++;
        continue;
      }
      // Extend while each next window is also present, so one long copy is one
      // finding rather than a dozen overlapping ones.
      let length = WINDOW;
      while (
        i + length < lines.length &&
        seen.has(lines.slice(i + length - WINDOW + 1, i + length + 1).join(' '))
      ) {
        length++;
      }
      runs.push({ file, lines: length, starts: lines[i].slice(0, 60) });
      i += length;
    }
  }

  return runs.sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
}

export function duplicatedLineCount(): number {
  return duplicatedRuns().reduce((total, r) => total + r.lines, 0);
}
