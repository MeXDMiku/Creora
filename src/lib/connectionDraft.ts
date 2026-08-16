/**
 * Guessing which block a column wants.
 *
 * WHY THIS EXISTS
 * Wiring a button into a Database, every column starts as "Fixed value" with
 * nothing in it -- which is the one thing almost nobody wants. To get a typed
 * value into a column you had to know to change the source to "From block" and
 * then pick the right one, per column, with no hint that this was the step you
 * were missing. The owner's words: "how do a user know if I type something
 * should be updated in the database, its so damn hard figuring out and finding
 * no way to do it".
 *
 * So the columns arrive already filled in with the fields that obviously belong
 * to them, and the builder changes the ones that are wrong. A guess that is
 * right most of the time and visible when it is not beats a blank that is
 * wrong every time and looks deliberate.
 */

/** Letters and digits only, lowercased. "Your name " and "NAME" both become "name". */
export function normaliseName(value: string | null | undefined): string {
  return (value === null || value === undefined ? '' : String(value))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export interface Candidate {
  id: string;
  label: string;
  /** Only fields a person types into are worth guessing from. */
  dataType?: string;
  type?: string;
}

/**
 * How well a block's name answers to a column's name, 0 when it does not.
 *
 * Exact beats contains beats nothing. "Your name" -> Name scores as contains,
 * which is exactly the shape of every label anybody writes.
 */
export function matchScore(columnName: string, blockLabel: string): number {
  const column = normaliseName(columnName);
  const block = normaliseName(blockLabel);
  if (!column || !block) return 0;
  if (column === block) return 3;
  if (block.includes(column)) return 2;
  if (column.includes(block)) return 1;
  return 0;
}

/**
 * A mapping per column, guessed from the blocks on the page.
 *
 * Each block is used at most once: two columns both grabbing the same input is
 * worse than one column left blank, because it looks like it worked. Best
 * matches are assigned first so "Name" wins the name field before "Nickname"
 * can take it.
 */
export function guessMappings(
  columns: { name: string }[],
  candidates: Candidate[]
): Record<string, { source: 'fixed' | 'block'; value: string }> {
  const out: Record<string, { source: 'fixed' | 'block'; value: string }> = {};
  for (const column of columns) out[column.name] = { source: 'fixed', value: '' };

  const pairs: { column: string; id: string; score: number }[] = [];
  for (const column of columns) {
    for (const candidate of candidates) {
      const score = matchScore(column.name, candidate.label);
      if (score > 0) pairs.push({ column: column.name, id: candidate.id, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.column.localeCompare(b.column));

  const usedBlocks = new Set<string>();
  const filledColumns = new Set<string>();
  for (const pair of pairs) {
    if (usedBlocks.has(pair.id) || filledColumns.has(pair.column)) continue;
    out[pair.column] = { source: 'block', value: pair.id };
    usedBlocks.add(pair.id);
    filledColumns.add(pair.column);
  }
  return out;
}

export interface StepDraft {
  action: string;
  mappings?: Record<string, { source: 'fixed' | 'block'; value: string }>;
  matchColumn?: string;
  matchValue?: { source: 'fixed' | 'block'; value: string };
  webhookUrl?: string;
  value?: string;
}

/**
 * Why this action cannot possibly do anything, or null.
 *
 * The popup used to accept anything. The owner built an Update Row with no
 * value to match on and every column empty, pressed Connect, and got a wire
 * that looked real and did nothing -- no error, no run-log entry that meant
 * anything, no way to tell. Refusing to create it, and saying why, is the
 * difference between a tool and a form.
 */
export function whyItCannotWork(draft: StepDraft): string | null {
  const filled = (m?: { source: string; value: string }) =>
    !!m && String(m.value ?? '').trim() !== '';

  if (draft.action === 'addRow') {
    const mapped = Object.values(draft.mappings || {}).filter(filled);
    if (mapped.length === 0) {
      return 'Every column is empty, so this would add a blank row. Point at least one column at a field, or type a fixed value into it.';
    }
    return null;
  }

  if (draft.action === 'updateRow' || draft.action === 'deleteRow') {
    if (!draft.matchColumn) {
      return 'Nothing says WHICH row to change. Choose a column to find it by.';
    }
    if (!filled(draft.matchValue)) {
      return 'Nothing says which row to find. "' + draft.matchColumn + ' equals ..." has no value, so it will never match anything.';
    }
    if (draft.action === 'updateRow') {
      const mapped = Object.values(draft.mappings || {}).filter(filled);
      if (mapped.length === 0) {
        return 'It finds the row and then changes nothing. Fill in at least one column.';
      }
    }
    return null;
  }

  if (draft.action === 'sendWebhook' && !String(draft.webhookUrl ?? '').trim()) {
    return 'There is nowhere to send it. Paste the address from Zapier, Make or n8n.';
  }

  if (draft.action === 'setText' && !String(draft.value ?? '').trim()) {
    return 'There are no words to set it to.';
  }

  // A step that goes nowhere looks identical to one that works until it is
  // pressed, which is the whole reason this function exists.
  if (draft.action === 'goToPage' && !String(draft.value ?? '').trim()) {
    return 'No page is chosen, so this would go nowhere.';
  }
  if (draft.action === 'openUrl' && !String(draft.value ?? '').trim()) {
    return 'There is no address to open.';
  }

  return null;
}
