import type { BlockRuntimeState } from '../types/creora';

/**
 * What a Database block emits from its output port.
 *
 * This lived in EIGHT copies across the engine, the editor block and the
 * published renderer -- the same shape pasted each time. That is precisely how
 * the editor and the published renderer drifted apart before, so it is one
 * function now and every caller shares it.
 *
 * Modes:
 *   row_count            how many rows        (the default, unchanged)
 *   sum | average |
 *   lowest | highest     over `outputColumn`
 *   <a column name>      that column on the newest row  (unchanged)
 *
 * And optionally, only rows where `filterColumn` equals `filterValue` --
 * which is what "how many videos did THIS person upload" actually is:
 * a count with a condition.
 */


type Row = Record<string, any>;

function applyFilter(rows: Row[], state?: BlockRuntimeState): Row[] {
  const col = state?.filterColumn;
  if (!col) return rows;
  const want = state?.filterValue;
  // Compared as text so "5" from a text box matches 5 from a number column.
  // Anyone typing a filter value is typing text.
  const wanted = want === undefined || want === null ? '' : String(want);
  return rows.filter((r) => String(r?.[col] ?? '') === wanted);
}

/**
 * The usable numbers in a column.
 *
 * A cell that is not a number is SKIPPED here, and that is a knowing
 * difference from `sumOf` in the formula language, which refuses. The two are
 * not free to be the same:
 *
 *  - this returns a value that goes straight into a block's output port. It has
 *    nowhere to put a refusal, and eight call sites read it. Throwing would
 *    take a block's whole output away over one mistyped cell.
 *  - `sumOf` is written into a formula box that already shows errors, so it can
 *    refuse and say which value it choked on.
 *
 * The cost of skipping is a total that is quietly SHORT -- plausible, and
 * therefore never noticed. That cost is not accepted silently: the Health panel
 * reports a column holding numbers AND something that is not one, which is the
 * cause of both the short total here and the refusal there. See
 * "holds a value that is not a number" in diagnose.ts.
 */
function numbers(rows: Row[], column?: string): number[] {
  if (!column) return [];
  return rows
    .map((r) => Number(r?.[column]))
    .filter((n) => !isNaN(n));
}

export function computeDatabaseOutput(rows: Row[], state?: BlockRuntimeState): any {
  const all = Array.isArray(rows) ? rows : [];
  const mode = state?.outputMode || 'row_count';
  const scoped = applyFilter(all, state);

  switch (mode) {
    case 'row_count':
      return scoped.length;
    case 'sum': {
      const ns = numbers(scoped, state?.outputColumn);
      return ns.reduce((a, b) => a + b, 0);
    }
    case 'average': {
      const ns = numbers(scoped, state?.outputColumn);
      if (!ns.length) return 0;
      // Two decimals: an average of 21.333333333 in a Number Display is noise.
      return Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 100) / 100;
    }
    case 'lowest': {
      const ns = numbers(scoped, state?.outputColumn);
      return ns.length ? Math.min(...ns) : 0;
    }
    case 'highest': {
      const ns = numbers(scoped, state?.outputColumn);
      return ns.length ? Math.max(...ns) : 0;
    }
    default: {
      // A column name: the value on the newest row, as it has always been.
      const newest = scoped[scoped.length - 1];
      return newest ? newest[mode] : 0;
    }
  }
}
