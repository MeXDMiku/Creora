import type { Workflow, FormulaBinding, BlockRuntimeState } from '../types/creora';
import { columnsUsedByFormula } from './rows';
import { nodeTypeFromBlockId } from './blockRegistry';
// The same rule the renderer uses to decide what a block answers to, and the
// same function that finds slots -- a second opinion about either would make
// this panel accuse markup that works.
import { slotNameOf } from '../state/atoms';
import { findSlots } from './sanitizeHtml';

/**
 * What is wrong with this page that nobody has noticed.
 *
 * WHY THIS IS THE OPERATIONS LAYER, NOT A PANEL
 * The third layer was always described as the AWS-console one: what is running,
 * what is published, what is broken. The panel is the easy half. The half worth
 * building is the question with a real answer -- and the answer is almost always
 * a reference to something that no longer exists.
 *
 * A block gets deleted. The wire into it stays in `workflows`. The formula that
 * mentioned it stays in `formulas`. The repeater still names it. Nothing errors,
 * nothing logs, the page simply does slightly less than it used to, and the
 * builder finds out weeks later when a customer says the total is wrong.
 *
 * Every check here is about a name or an id that points at nothing.
 */

export type Severity = 'broken' | 'warning' | 'idle';

export interface Problem {
  severity: Severity;
  /** Short, and about the page rather than about the code. */
  title: string;
  /** What it means and what to do, in one sentence. */
  detail: string;
  /** The block this is about, so the panel can select it. */
  blockId?: string;
}

export interface PageFacts {
  /** Every block id currently on the page. */
  blockIds: string[];
  /** Runtime state by block id, for names and settings. */
  states: Record<string, BlockRuntimeState | undefined>;
  workflows: Workflow[];
  formulas: FormulaBinding[];
  connections: { id: string; sourceBlockId: string; targetBlockId: string }[];
  /**
   * Every page that still exists.
   *
   * Required rather than optional on purpose. Optional would mean a caller that
   * forgets it silently gets fewer checks -- which is the exact failure this
   * panel exists to catch, reproduced inside the panel itself.
   */
  pages: { id: string; name?: string }[];
  /**
   * Whether this page is live.
   *
   * Only one finding uses it, and that finding cannot be made without it: a
   * webhook address is a private thing on a page nobody can open and a public
   * thing the moment it is published, and the code cannot tell those apart by
   * looking at the wire.
   *
   * Optional, unlike `pages`, and for the opposite reason: a caller that does
   * not know gets FEWER findings rather than a wrong one, and telling somebody
   * their private page is leaking would train them to ignore the panel.
   */
  isPublished?: boolean;
}

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;

function nameOf(facts: PageFacts, blockId: string): string {
  const name = facts.states[blockId]?.blockName;
  return name && String(name).trim() !== '' ? String(name) : blockId.slice(-4);
}

function exists(facts: PageFacts, blockId: string | undefined | null): boolean {
  return !!blockId && facts.blockIds.includes(blockId);
}

function pageExists(facts: PageFacts, pageId: string | undefined | null): boolean {
  return !!pageId && (facts.pages || []).some(p => p.id === pageId);
}

/**
 * The identifiers a formula refers to.
 *
 * Formulas are written against block IDS, not names, so this is a scan for
 * anything that looks like a name and is not a number.
 *
 * WHY IT CAN NO LONGER JUST OVER-COLLECT
 * It used to, deliberately: "a false 'this refers to X' is checked against the
 * block list a line later and disappears if X exists". That reasoning was sound
 * while a formula could only be block ids, numbers and `+ - * /`. It stopped
 * being sound the day formulas got functions and text, which was this morning.
 *
 *   if(Stock > 0, "In stock", "Sold out")
 *     -> if, Stock, In, stock, Sold, out
 *
 * Five of those six are not blocks, so the Health panel would report five
 * "uses a block that is gone" problems for one perfectly good formula. A guard
 * that cries wolf gets ignored and then deleted, which costs more than the bug
 * it was watching for.
 *
 * So: quoted text is removed first, then anything being CALLED. Callee names
 * are excluded by the shape `name(` rather than by a list of function names --
 * a list would need updating every time a function is added, and a list of
 * seventeen that silently missed the eighteenth is the exact failure this
 * codebase has paid for twice today.
 */
const CALLEE = /[A-Za-z_$][A-Za-z0-9_$]*\s*\(/g;
const QUOTED = /'[^']*'|"[^"]*"/g;
/** Words a formula understands as values rather than as blocks. */
const FORMULA_WORDS = new Set([
  'true', 'false', 'blank', 'empty',
  /**
   * `and` and `or` became infix operators the same day this scan was written,
   * so `Stock > 0 and Total > 5` reported `and` as a block that is gone. Caught
   * by sweeping for what the new spelling broke, twenty minutes after adding
   * it -- the third time in one session that a new capability invalidated an
   * assumption elsewhere that was correct when it was written.
   */
  'and', 'or',
  /**
   * And `today` and `now` the same way, one cycle later. A formula's scope is
   * keyed by block id, so these could never have been blocks -- but this scan
   * matches identifiers, not meanings, and every date formula written from now
   * on says one of them.
   *
   * FOURTH TIME. The pattern is not "remember to update this list"; it is that
   * a scan built from a regular expression has to be swept every time the
   * language gains a word. Written here rather than in the log, because this is
   * where somebody adding the fifth word will be standing.
   */
  'today', 'now',
]);

export function referencedIds(formula: string | null | undefined): string[] {
  const text = formula === null || formula === undefined ? '' : String(formula);

  // Quoted text is content, never a reference. Removed rather than skipped so
  // an id appearing inside a string cannot be picked up either.
  const withoutText = text.replace(QUOTED, ' ');

  const callees = new Set(
    (withoutText.match(CALLEE) || []).map(m => m.replace(/\s*\($/, '')),
  );

  const found = withoutText.match(IDENTIFIER) || [];
  return Array.from(
    new Set(found.filter(name => !callees.has(name) && !FORMULA_WORDS.has(name.toLowerCase()))),
  );
}

export function diagnosePage(facts: PageFacts): Problem[] {
  const problems: Problem[] = [];

  // --- wires that lead nowhere ---
  for (const workflow of facts.workflows || []) {
    if (!exists(facts, workflow.sourceId)) {
      problems.push({
        severity: 'broken',
        title: 'A wire starts at a block that is gone',
        detail:
          'Something was deleted and this action is still listening to it, so it can never run. Delete the wire.',
        blockId: workflow.sourceId,
      });
      continue;
    }
    for (const step of workflow.steps || []) {
      if (!exists(facts, step.targetId)) {
        problems.push({
          severity: 'broken',
          title: `"${nameOf(facts, workflow.sourceId)}" points at a block that is gone`,
          detail:
            'The block this was wired to has been deleted, so pressing it does nothing. Re-point it or remove it.',
          blockId: workflow.sourceId,
        });
      }
      /**
       * A step that goes to a page that is gone.
       *
       * Deleting a page does not touch the wires pointing at it, so the step
       * runs, finds nothing, and the visitor stays exactly where they were.
       * Nothing throws. That is the whole category this panel exists for, and
       * it could not see pages at all -- it had no list of them.
       */
      if (step.action === 'goToPage') {
        const destination = String((step as any).value ?? '').trim();
        if (!destination) {
          problems.push({
            severity: 'broken',
            title: `"${nameOf(facts, workflow.sourceId)}" goes to no page at all`,
            detail: 'No page was chosen, so pressing it does nothing and says nothing.',
            blockId: workflow.sourceId,
          });
        } else if (!pageExists(facts, destination)) {
          problems.push({
            severity: 'broken',
            title: `"${nameOf(facts, workflow.sourceId)}" goes to a page that is gone`,
            detail:
              'That page was deleted, so this leaves the visitor exactly where they were with no sign anything happened.',
            blockId: workflow.sourceId,
          });
        }
      }

      /**
       * A condition can name a third block, and that one can vanish too.
       *
       * The singular case used to be included only when it had a `fieldId`,
       * which quietly excluded every condition that is a whole formula -- they
       * have no field. That is the SAME guard that made executeWorkflow drop
       * expression conditions and run guarded steps unconditionally, and it was
       * here too: a step guarded by `Qty * Price > 500` with Price deleted is
       * skipped every time, forever, and this panel exists precisely to notice
       * that.
       */
      const isRealCondition = (c: any) =>
        !!c && (!!c.fieldId || String(c.expression || '').trim() !== '');
      const conditions = [
        ...(step.conditions || []).filter(isRealCondition),
        ...(isRealCondition(step.condition) ? [step.condition!] : []),
      ];
      for (const condition of conditions) {
        // A formula condition names its blocks inside the expression, so the
        // ids have to be read out of the text -- the same scan formulas use.
        const namedBlocks = String((condition as any).expression || '').trim()
          ? referencedIds((condition as any).expression)
          : [condition.fieldId];

        for (const named of namedBlocks) {
          if (!exists(facts, named)) {
            problems.push({
              severity: 'broken',
              title: `A condition on "${nameOf(facts, workflow.sourceId)}" checks a block that is gone`,
              detail:
                'The condition can never be true, so this step is skipped every time and nothing says so.',
              blockId: workflow.sourceId,
            });
          }
        }
      }
    }
  }

  /**
   * A repeater's row formula naming a column that is not there.
   *
   * This one hides rather than shouts. A missing column reads as blank, a blank
   * fails every comparison, and every row is filtered out -- so a typo in
   * `{{Prcie}} > 5` empties the list and looks exactly like a table with no
   * data in it. The formula itself is deliberately forgiving of ERRORS for that
   * reason; a name that simply is not there is not an error, so it needs saying
   * here instead.
   */
  for (const blockId of facts.blockIds || []) {
    const state = facts.states[blockId];
    /**
     * The sort formula is read here too, and it was a deliberate second look
     * rather than an afterthought: it is the same syntax over the same columns,
     * so a typo in it goes wrong the same way -- silently, since a blank sort
     * key just parks the row at the end and the list still looks fine.
     */
    const uses: Array<{ formula: string; verb: string; consequence: string }> = [
      {
        formula: String((state as any)?.filterFormula || '').trim(),
        verb: 'filters on',
        consequence:
          'A column that is not there reads as blank, blank fails every comparison, and every row is hidden — so the list looks empty rather than wrong.',
      },
      {
        formula: String((state as any)?.sortFormula || '').trim(),
        verb: 'sorts by',
        consequence:
          'A column that is not there reads as blank, and blanks sort to the end — so the order looks arbitrary rather than broken.',
      },
    ].filter(u => u.formula);
    if (!uses.length) continue;

    const trackedId = String((state as any)?.trackedBlockId || '');
    const tracked = trackedId ? facts.states[trackedId] : undefined;
    // Without a table to compare against there is nothing to be sure about,
    // and guessing would mean accusing a correct formula.
    if (!tracked) continue;

    const known = new Set<string>(
      ((tracked as any)?.columns || []).map((c: any) => String(c?.name)).concat(['Row id']),
    );
    for (const use of uses) {
      for (const used of columnsUsedByFormula(use.formula)) {
        if (!known.has(used)) {
          problems.push({
            severity: 'broken',
            title: `"${nameOf(facts, blockId)}" ${use.verb} a column called "${used}", which is not there`,
            detail: use.consequence,
            blockId,
          });
        }
      }
    }
  }

  /**
   * Markup naming something that is not on the page.
   *
   * Same shape as the row-formula check above, and the same reason for
   * existing: a slot nothing answers renders as EMPTY. Not "{{Prcie}}", not a
   * warning -- nothing at all, in the middle of a card that otherwise looks
   * finished. The most common version is a column renamed months after the
   * markup was written, and the card just quietly loses a line.
   *
   * A repeater's markup can name a column OR a block on the page OR one of the
   * built-ins, because that is exactly what it is handed at render time, so all
   * three are consulted here. Getting that set wrong in either direction is
   * worse than not checking: too small and it accuses working pages, which
   * teaches a builder to ignore the panel.
   */
  {
    const builtIn = new Set(['now', 'today']);
    const blockNames = new Set<string>();
    for (const id of facts.blockIds || []) blockNames.add(slotNameOf(id, facts.states[id]));

    for (const blockId of facts.blockIds || []) {
      const state = facts.states[blockId] as any;
      if (!state) continue;
      const type = nodeTypeFromBlockId(blockId);

      let markup = '';
      const known = new Set<string>(blockNames);

      if (type === 'repeatBlock') {
        const trackedId = String(state?.trackedBlockId || '');
        const tracked = trackedId ? (facts.states[trackedId] as any) : undefined;
        // No table means no list of columns to compare against, and guessing
        // would mean accusing markup that is probably right.
        if (!tracked) continue;
        markup = String(state?.rowHtml || '') + ' ' + String(state?.emptyHtml || '');
        for (const c of tracked?.columns || []) known.add(String(c?.name));
        // Supplied to every row whether the table has them or not.
        known.add('Row id');
        known.add('Row number');
      } else if (type === 'customHtmlBlock') {
        markup = String(state?.html || '');
      } else {
        continue;
      }

      if (!markup.trim()) continue;

      for (const used of findSlots(markup)) {
        if (known.has(used) || builtIn.has(used.trim().toLowerCase())) continue;
        problems.push({
          severity: 'broken',
          title: `"${nameOf(facts, blockId)}" shows "${used}", and nothing on the page has that name`,
          detail:
            'A slot nothing answers renders as nothing at all — no name, no warning, just a gap where the value should be.',
          blockId,
        });
      }
    }
  }

  /**
   * A column of numbers with something that is not a number in it.
   *
   * This is the cause of two different quiet wrongnesses at once, which is why
   * it is worth a check of its own:
   *
   *  - a Database block's own sum SKIPS the bad cell, so the total comes out
   *    short by exactly that row and looks completely plausible
   *  - `sumOf` in a formula refuses outright, and a builder gets an error they
   *    cannot place until they know which cell
   *
   * One mistyped character -- "12o" for "120", or "£200" typed into a text
   * column -- and a revenue figure is wrong on a dashboard with nothing to
   * notice.
   *
   * ONLY MIXED COLUMNS ARE REPORTED. A column of words is a text column and is
   * nobody's business; a column with numbers in it AND one thing that is not a
   * number is a typo, near enough always.
   */
  for (const blockId of facts.blockIds || []) {
    const state = facts.states[blockId] as any;
    const rows = state?.rows;
    if (!Array.isArray(rows) || !rows.length) continue;

    for (const column of (state?.columns || []) as { name?: string }[]) {
      const name = String(column?.name ?? '');
      if (!name) continue;

      let numbers = 0;
      let firstBad: string | null = null;
      for (const row of rows) {
        const value = row?.[name];
        if (value === null || value === undefined || value === '') continue;
        if (isNaN(Number(value))) {
          if (firstBad === null) firstBad = String(value);
        } else {
          numbers += 1;
        }
      }

      // Numbers on one side and something else on the other. Either alone is
      // an ordinary column.
      if (!numbers || firstBad === null) continue;

      const shown = firstBad.length > 30 ? firstBad.slice(0, 30) + '…' : firstBad;
      problems.push({
        severity: 'warning',
        title: `"${nameOf(facts, blockId)}" has "${shown}" in its ${name} column, which is not a number`,
        detail:
          'Totals over this column leave that row out, so the answer comes out short and looks right — and a formula using sumOf will refuse to run at all.',
        blockId,
      });
    }
  }

  /**
   * A DATE column holding something that is not a date.
   *
   * Stricter than the number check above, and it can afford to be: a column
   * DECLARED as a date should hold a readable date or nothing at all, so one
   * bad value is enough to report. There is no "mixed column is a text column"
   * escape here, because the builder has already said what this column is.
   *
   * Where it comes from is worth knowing: a column switched to Date converts
   * what it already holds, and anything unreadable becomes blank — but a value
   * written by a workflow goes through coerceForColumn, which also blanks it.
   * So the loud case is data that predates the type being set. The quiet case
   * — a visitor typing "tomorrow" into a form and having it silently dropped —
   * is a validation problem and is recorded in the backlog rather than guessed
   * at here.
   */
  for (const blockId of facts.blockIds || []) {
    const state = facts.states[blockId] as any;
    const rows = state?.rows;
    if (!Array.isArray(rows) || !rows.length) continue;

    for (const column of (state?.columns || []) as { name?: string; type?: string }[]) {
      if (column?.type !== 'date') continue;
      const name = String(column?.name ?? '');
      if (!name) continue;

      let firstBad: string | null = null;
      for (const row of rows) {
        const value = row?.[name];
        if (value === null || value === undefined || value === '') continue;
        if (isNaN(new Date(value).getTime())) {
          firstBad = String(value);
          // Stopping here is only an early exit. What keeps this to ONE finding
          // per column is that the push is outside the loop -- a control that
          // removed this `break` changed nothing, which is worth knowing before
          // anybody trusts it to be doing that job.
          break;
        }
      }
      if (firstBad === null) continue;

      const shown = firstBad.length > 30 ? firstBad.slice(0, 30) + '…' : firstBad;
      problems.push({
        severity: 'warning',
        title: `"${nameOf(facts, blockId)}" has "${shown}" in its ${name} column, which is not a date`,
        detail:
          'That row sorts in the wrong place, and anything asking how many days away it is will refuse to run.',
        blockId,
      });
    }
  }

  /**
   * A webhook address on a page anyone can open.
   *
   * `get_page` returns a page's workflows WHOLE, and it has to: the wire is
   * fired by the visitor's browser, so the address has to reach the browser.
   * There is no arrangement of client-side code that keeps it private -- it
   * needs somewhere server-side to send from, which this project does not have
   * yet.
   *
   * SO THIS DOES NOT FIX IT. It says it out loud. The address is readable by
   * anyone who opens the page, and a builder who pasted a Zapier or Discord
   * hook in there has no way to find that out from anywhere else. Naming a
   * trade-off nobody can close is the honest half of it -- the same choice
   * migration 0005 makes about wires pointing at a deleted page.
   *
   * A warning rather than broken, because it works exactly as intended. What is
   * wrong is what it costs, and only the builder can weigh that.
   */
  if (facts.isPublished) {
    const seen = new Set<string>();

    // Shortened: an address is often long and often has a token in the middle
    // of it, and printing the whole thing in a panel puts the secret on screen
    // for anyone standing behind them.
    const shorten = (url: string) => (url.length > 40 ? `${url.slice(0, 40)}…` : url);

    const exposed = (blockId: string, url: string, verb: string) => {
      const clean = url.trim();
      if (!clean || seen.has(clean)) return;
      seen.add(clean);
      problems.push({
        severity: 'warning',
        title: `"${nameOf(facts, blockId)}" ${verb} ${shorten(clean)}, and this page is published`,
        detail:
          'Anyone who opens the page can read that address and use it themselves. It travels to the browser because the browser is what calls it — there is nowhere else yet.',
        blockId,
      });
    };

    for (const workflow of facts.workflows || []) {
      for (const step of workflow.steps || []) {
        if (step.action !== 'sendWebhook') continue;
        exposed(workflow.sourceId, String((step as any).webhookUrl || ''), 'sends to');
      }
    }

    /**
     * A Live Data block's address, for exactly the same reason.
     *
     * It is fetched by the visitor's browser -- that is the whole reason Live
     * Data works without a server -- so the address is as public as the page.
     * A builder who pasted an endpoint with a key in the query string has
     * published the key, and this is the only place that would ever tell them.
     */
    for (const blockId of facts.blockIds || []) {
      if (nodeTypeFromBlockId(blockId) !== 'dataSourceBlock') continue;
      exposed(blockId, String((facts.states[blockId] as any)?.url || ''), 'reads from');
    }
  }

  // --- formulas referring to nothing ---
  for (const binding of facts.formulas || []) {
    if (!exists(facts, binding.targetBlockId)) {
      problems.push({
        severity: 'broken',
        title: 'A formula writes into a block that is gone',
        detail: 'It is calculated on every change and the answer goes nowhere.',
        blockId: binding.targetBlockId,
      });
      continue;
    }
    for (const id of referencedIds(binding.formula)) {
      // Anything that is not a known block is either a number, a function name,
      // or a reference to something deleted. Only the last one is a problem, and
      // only ids shaped like ours are worth complaining about.
      const looksLikeABlock = id.includes('__') || id.startsWith('test_');
      if (looksLikeABlock && !exists(facts, id)) {
        problems.push({
          severity: 'broken',
          title: `The formula in "${nameOf(facts, binding.targetBlockId)}" uses a block that is gone`,
          detail: 'It shows an error instead of a number until the formula is edited.',
          blockId: binding.targetBlockId,
        });
      }
    }
  }

  // --- blocks pointing at a Database that is not here ---
  for (const blockId of facts.blockIds) {
    const state = facts.states[blockId];
    if (!state) continue;
    const tracked = state.trackedBlockId;
    if (tracked && !exists(facts, tracked)) {
      problems.push({
        severity: 'warning',
        title: `"${nameOf(facts, blockId)}" reads a Database that is not on this page`,
        detail:
          'It still works if that Database exists on another page, and shows nothing at all if it does not.',
        blockId,
      });
    }
    for (const [field, label] of [
      ['searchBlockId', 'search box'],
      ['filterBlockId', 'filter'],
      ['sortColumnBlockId', 'sort column'],
      ['sortDirectionBlockId', 'sort direction'],
    ] as const) {
      const ref = (state as Record<string, any>)[field];
      if (ref && !exists(facts, ref)) {
        problems.push({
          severity: 'broken',
          title: `"${nameOf(facts, blockId)}" uses a ${label} that is gone`,
          detail: 'That control was deleted, so this behaves as though nothing is set.',
          blockId,
        });
      }
    }
  }

  // --- connections drawn to nothing ---
  for (const connection of facts.connections || []) {
    if (!exists(facts, connection.sourceBlockId) || !exists(facts, connection.targetBlockId)) {
      problems.push({
        severity: 'warning',
        title: 'A drawn wire has no block at one end',
        detail:
          'Only the line is left over. It does nothing, and it is drawn on the canvas where a real wire would be.',
      });
    }
  }

  // --- things that exist but were never finished ---
  for (const blockId of facts.blockIds) {
    const state = facts.states[blockId];
    if (!state) continue;

    if (state.rules && state.rules.length) {
      const bad = state.rules.filter(
        (r) => (r.type === 'matchesBlock' || r.type === 'pattern') && !r.value
      );
      if (bad.length) {
        problems.push({
          severity: 'warning',
          title: `A rule on "${nameOf(facts, blockId)}" was never finished`,
          detail: 'It has no value to check against, so it always passes.',
          blockId,
        });
      }
    }

    const wired = (facts.workflows || []).some((w) => w.sourceId === blockId);
    // Through the registry, not by matching the start of an id. Writing that
    // by hand is what made three block types unsaveable in cycle 2.
    const isTrigger = nodeTypeFromBlockId(blockId) === 'buttonBlock';
    /**
     * A block whose own target page is gone.
     *
     * This predates goToPage entirely -- Buttons and Shapes with the Link role
     * have carried a targetPageId for weeks, and deleting the page it points at
     * has always left a control that looks live and does nothing. The panel
     * read this field already, but only to decide whether the block counted as
     * "wired to something", and never asked whether the page was still there.
     */
    if (state.targetPageId && !pageExists(facts, state.targetPageId)) {
      problems.push({
        severity: 'broken',
        title: `"${nameOf(facts, blockId)}" points at a page that is gone`,
        detail:
          'It still looks like a link, and clicking it does nothing at all. Point it somewhere else or clear it.',
        blockId,
      });
    }

    if (isTrigger && !wired && !state.targetPageId) {
      problems.push({
        severity: 'idle',
        title: `"${nameOf(facts, blockId)}" does nothing`,
        detail: 'Nothing is wired to this button and it does not go to another page.',
        blockId,
      });
    }
  }

  return problems;
}

/** Ordered worst-first, because that is the order anybody wants to read them. */
export function sortProblems(problems: Problem[]): Problem[] {
  const rank: Record<Severity, number> = { broken: 0, warning: 1, idle: 2 };
  return [...problems].sort((a, b) => rank[a.severity] - rank[b.severity]);
}
