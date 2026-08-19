/**
 * NEGATIVE CONTROLS: break the code on purpose, and see whether the checks
 * notice.
 *
 *   node scripts/control.mjs            all of them
 *   node scripts/control.mjs relation   only the ones whose name matches
 *
 * WHY THIS IS A FILE AND NOT SOMETHING I DO BY HAND
 * A check that passes tells you nothing on its own -- it might be testing the
 * thing it names, or it might be decorative, or aimed at a line that no longer
 * exists. The only way to tell is to break the thing and watch the NAMED check
 * go red. Twenty of these came back green across one session; about half were
 * real gaps and the rest were hollow checks.
 *
 * THE BUG THIS FILE IS BUILT AROUND
 * I ran controls by hand with a throwaway script that decided a run had
 * finished by looking for `'passed,'` in the output. That string also appears
 * in the NAME of a check -- "...once it has passed, which is what overdue
 * means" -- so a suite that CRASHED read as "finished, 0 failed". A green that
 * meant the exact opposite of green, produced by the instrument, not the code.
 *
 * So: the tally is matched anchored to the start of a line, and a run with no
 * tally at all is reported as its own outcome and never as a pass.
 */
import { readFileSync, writeFileSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const TALLY = /^(\d+) passed, (\d+) failed/m;
const FAIL_LINE = /^ {2}FAIL {2}(.+)$/gm;

/**
 * Each control is one deliberate lie. `expect` names the checks that SHOULD go
 * red -- a substring is enough. Leave it empty only for a control you are
 * exploring rather than asserting.
 */
const CONTROLS = [
  {
    name: 'relation: the condition loses the calling scope',
    file: 'src/lib/formula.ts',
    find: `  const scope: Record<string, any> = { ...(outer || {}) };`,
    with: `  const scope: Record<string, any> = {};`,
    expect: ['PLACES LEFT', 'WHO TEACHES IT', 'AVERAGE RATING'],
  },
  {
    name: 'relation: the invented name goes back to being a fixed one',
    file: 'src/lib/formula.ts',
    find: `  while (text.includes(prefix)) prefix = '_' + prefix;`,
    with: `  // control: no escalation`,
    expect: ['AN INTERNAL NAME LEAKING INTO A CONDITION', 'AN INTERNAL NAME IN A ROW FORMULA'],
  },
  {
    name: 'list: a slot inside a quoted condition gets rewritten anyway',
    file: 'src/lib/formula.ts',
    find: `    if (ch === '"' || ch === "'") { quote = ch; out += ch; i++; continue; }`,
    with: `    if (false) { out += ch; i++; continue; }`,
    expect: ['HIDE FULL', 'a slot inside a condition is NOT'],
  },
  {
    name: 'list: a formula stops being used instead of the sort column',
    file: 'src/lib/rows.ts',
    find: `  if (sortFormula) {`,
    with: `  if (false) {`,
    expect: ['BEST RATED FIRST', 'A FORMULA IS USED INSTEAD OF THE SORT COLUMN'],
  },
  {
    name: 'list: the sort formula is worked out inside the comparator again',
    file: 'src/lib/rows.ts',
    find: `      const by = compareCells(a.key, b.key) * direction;`,
    with: `      const by = compareCells(
        rowFormulaValue(a.row, sortFormula, { tables: spec.tables, now: spec.now }).value,
        rowFormulaValue(b.row, sortFormula, { tables: spec.tables, now: spec.now }).value,
      ) * direction;`,
    expect: ['once per row and not once per comparison'],
  },
  {
    name: 'list: a filter that cannot be worked out goes quiet again',
    file: 'src/lib/rows.ts',
    find: `    if (answer.error && report) report(answer.error);`,
    with: `    // control: the error is dropped`,
    expect: ['AND SAYS SO'],
  },
  {
    name: 'list: equal rows are free to shuffle',
    file: 'src/lib/rows.ts',
    find: `      return by !== 0 ? by : a.i - b.i;`,
    with: `      return by !== 0 ? by : b.i - a.i;`,
    expect: ['EQUAL ROWS DO NOT SHUFFLE'],
  },
  {
    name: 'list: the Health panel stops reading the sort formula',
    file: 'src/lib/diagnose.ts',
    find: `        formula: String((state as any)?.sortFormula || '').trim(),`,
    with: `        formula: '',`,
    expect: ['THE HEALTH PANEL READS THE SORT FORMULA'],
  },
  {
    name: 'relation: a row stops offering its id under a name a formula can type',
    file: 'src/lib/rows.ts',
    find: `  values['RowId'] = row?.id ?? '';`,
    with: `  // control: no RowId`,
    expect: ['SPELLED BOTH WAYS', 'PLACES LEFT, RENDERED'],
  },
  {
    name: 'slots: a name used only inside a condition stops being fetched',
    file: 'src/lib/formula.ts',
    find: `      const conditionAt = fn === 'countOf' ? 1 : 2;`,
    with: `      const conditionAt = -1;`,
    expect: ['only inside a condition is still asked for'],
  },
  {
    name: 'slots: the scanner stops counting braces and takes the first }}',
    file: 'src/lib/sanitizeHtml.ts',
    find: `      if (html[j] === '{' && html[j + 1] === '{') {
        depth++;`,
    with: `      if (html[j] === '{' && html[j + 1] === '{') {
        depth = 1;`,
    expect: ['NESTED SLOT IS PART OF THE OUTER ONE'],
  },
  {
    name: 'step: "the oldest" stops meaning the oldest',
    file: 'src/lib/rows.ts',
    find: `  if (which === 'last') return { indexes: found.slice(-1), error: null };`,
    with: `  if (which === 'first') return { indexes: found.slice(-1), error: null };`,
    expect: ['PROMOTE THE LONGEST WAITER'],
  },
  {
    name: 'step: a broken match formula acts on every row instead of none',
    file: 'src/lib/rows.ts',
    find: `    if (error) return { indexes: [], error };`,
    with: `    if (error) return { indexes: list.map((_, i) => i), error: null };`,
    expect: ['A BROKEN MATCH FORMULA TOUCHES NO ROWS AT ALL'],
  },
  {
    name: 'step: an old applyToAll flag stops being honoured',
    file: 'src/lib/rows.ts',
    find: `  const which: WhichMatches = match.which || (match.applyToAll ? 'all' : 'first');`,
    with: `  const which: WhichMatches = match.which || 'first';`,
    expect: ['an old step with applyToAll still means every match'],
  },
  {
    name: 'step: the popup refuses a formula-only step again',
    file: 'src/lib/connectionDraft.ts',
    find: `    if (String(draft.matchFormula ?? '').trim()) {`,
    with: `    if (false) {`,
    expect: ['A FORMULA-ONLY STEP IS ALLOWED'],
  },
  {
    name: 'the harness itself: a check that throws must be red, not silent',
    file: 'scripts/checks.ts',
    find: `  const card = (row: any, f: string) => ran(() => evaluateExpression(f, { ...row, RowId: row.id }, tables));`,
    with: `  const card = (row: any, f: string) => evaluateExpression(f, { ...row, RowId: row.id }, tables) as any;\n  void 0;`,
    also: {
      file: 'src/lib/formula.ts',
      find: `  const scope: Record<string, any> = { ...(outer || {}) };`,
      with: `  const scope: Record<string, any> = {};`,
    },
    // Nothing goes red by name -- the point is that the run still ENDS with a
    // countable tally instead of vanishing. See STOPPED EARLY below.
    expect: [],
    wantStoppedEarly: true,
  },
];

/**
 * Write, then READ IT BACK until the change is actually there.
 *
 * This working copy is a network mount. A control that writes a file and
 * immediately starts a subprocess has been observed running against the file as
 * it was BEFORE the edit -- so the control reports green, and the green is
 * about the mount rather than about the code. It happened again while this file
 * was being written: one control in a batch of twelve came back wrong, and
 * re-running that control alone was correct.
 *
 * fsync alone was not enough. Reading back is, because it is the same question
 * the child is about to ask.
 */
const write = (path, text) => {
  writeFileSync(path, text);
  const fd = openSync(path, 'r');
  fsyncSync(fd);
  closeSync(fd);
  /**
   * Checked from a CHILD process, not from this one. Re-reading it here was not
   * enough and the flake survived: this process has already got the file in
   * hand, so it can agree with itself while a freshly started node -- which is
   * exactly what runs the checks -- still sees the old bytes.
   */
  const want = createHash('sha1').update(text).digest('hex');
  const deadline = Date.now() + 5000;
  for (;;) {
    const seen = execFileSync('node', [
      '-e',
      'const{readFileSync}=require("fs");const{createHash}=require("crypto");' +
      'process.stdout.write(createHash("sha1").update(readFileSync(process.argv[1])).digest("hex"))',
      path,
    ], { encoding: 'utf8' });
    if (seen === want) return;
    if (Date.now() > deadline) throw new Error(`${path} still reads as it did before the edit after 5s`);
  }
};

const runChecks = () => {
  try {
    return execFileSync('node', ['--experimental-strip-types', '--import', './scripts/register.mjs', 'scripts/checks.ts'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return `${e.stdout || ''}${e.stderr || ''}`;
  }
};

/**
 * PUT EVERY FILE BACK, EVEN IF THIS IS KILLED.
 *
 * Written after doing exactly that: a run was cut short by a timeout part way
 * through a control, and it left a deliberate lie in src/lib/formula.ts. The
 * next `npm run check` said 3 failed and the obvious reading of that -- "the
 * work I just did is broken" -- was wrong, which is the most expensive kind of
 * wrong a test tool can be.
 */
const openEdits = new Map();
const restoreAll = () => {
  for (const [file, text] of openEdits) {
    try { write(file, text); } catch { /* nothing better to do while dying */ }
  }
  openEdits.clear();
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => { restoreAll(); process.exit(130); });
}
process.on('uncaughtException', err => { restoreAll(); throw err; });

// A control's result only means something against a tree that was green to
// start with. Otherwise every control "goes red" and none of them proved it.
const before = runChecks().match(TALLY);
if (!before || Number(before[2]) !== 0) {
  console.log(`the tree is not green before we start (${before ? `${before[2]} failed` : 'no tally at all'}).`);
  console.log('Fix that first -- a control cannot tell you anything from here.');
  process.exit(1);
}

const only = process.argv[2];
const chosen = only ? CONTROLS.filter(c => c.name.includes(only)) : CONTROLS;
if (!chosen.length) {
  console.log(`no control matches "${only}". They are:\n${CONTROLS.map(c => '  ' + c.name).join('\n')}`);
  process.exit(1);
}

/**
 * Run one control and say what happened, without deciding what it means.
 */
function attempt(control) {
  const edits = [control, ...(control.also ? [control.also] : [])];
  const originals = edits.map(e => [e.file, readFileSync(e.file, 'utf8')]);
  for (const [file, text] of originals) if (!openEdits.has(file)) openEdits.set(file, text);

  try {
    for (const e of edits) {
      const before = readFileSync(e.file, 'utf8');
      if (!before.includes(e.find)) {
        return { kind: 'cannot-apply', file: e.file, reds: [] };
      }
      write(e.file, before.replace(e.find, e.with));
    }

    const out = runChecks();
    const tally = out.match(TALLY);
    const reds = [...out.matchAll(FAIL_LINE)].map(m => m[1].trim());
    if (!tally) return { kind: 'no-tally', out, reds };

    const failedCount = Number(tally[2]);
    const stoppedEarly = out.includes('SUITE STOPPED EARLY');
    if (control.wantStoppedEarly) {
      return { kind: stoppedEarly ? 'ok' : 'not-stopped', failedCount, reds, stoppedEarly };
    }
    if (failedCount === 0) return { kind: 'nothing-red', failedCount, reds, stoppedEarly };
    const missing = (control.expect || []).filter(want => !reds.some(r => r.includes(want)));
    if (missing.length) return { kind: 'wrong-reds', failedCount, reds, missing, stoppedEarly };
    return { kind: 'ok', failedCount, reds, stoppedEarly };
  } finally {
    for (const [file, text] of originals) write(file, text);
    openEdits.clear();
  }
}

let suspicious = 0;
for (const control of chosen) {
  let result = attempt(control);
  /**
   * ONE AUTOMATIC RETRY, and only when the news is bad.
   *
   * This mount can hand a freshly started process the file as it was before the
   * edit, however hard the write is flushed and read back -- it has been chased
   * through fsync, a re-read here, and a re-read from a child, and it still
   * turns up about once in a couple of dozen control runs. HOW_HOW_WE_WORK used
   * to say "re-run a green control by hand before concluding anything", which
   * is a correct instruction that somebody will skip at exactly the wrong
   * moment. So the tool does it.
   *
   * Only bad results are retried, deliberately. Retrying a red one until it
   * goes green is how a flake becomes a habit.
   */
  let retried = false;
  if (result.kind !== 'ok') {
    retried = true;
    result = attempt(control);
  }

  console.log(`\n${control.name}`);
  const note = retried ? '  (on the second try — the first disagreed)' : '';
  switch (result.kind) {
    case 'ok':
      console.log(`  ${result.failedCount} failed${result.stoppedEarly ? '  (SUITE STOPPED EARLY)' : ''}${note}`);
      break;
    case 'cannot-apply':
      // A control aimed at a line that no longer exists is not a control. This
      // used to print and not count, which is how a control quietly stops
      // testing anything while the summary still says all clear.
      console.log(`  CANNOT APPLY — the line it breaks is not in ${result.file} any more, so this control is testing nothing.${note}`);
      suspicious++;
      break;
    case 'no-tally':
      console.log(`  NO TALLY AT ALL — the suite did not reach its own last line, and`);
      console.log(`  nothing here can be read as a pass. First lines of what came back:${note}`);
      console.log(result.out.split('\n').slice(0, 6).map(l => '    ' + l).join('\n'));
      suspicious++;
      break;
    case 'nothing-red':
      console.log(`  0 failed${note}`);
      console.log('  ✗ NOTHING WENT RED. The checks do not cover this line — see the note at the top.');
      suspicious++;
      break;
    case 'not-stopped':
      console.log(`  ${result.failedCount} failed${note}`);
      console.log('  ✗ expected the run to be cut short and say so, and it did not.');
      suspicious++;
      break;
    case 'wrong-reds':
      console.log(`  ${result.failedCount} failed${note}`);
      console.log(`  ✗ went red, but not where it should: nothing matching ${result.missing.map(m => `"${m}"`).join(', ')}`);
      suspicious++;
      break;
  }
  for (const red of result.reds.slice(0, 8)) console.log(`    red: ${red}`);
  if (result.reds.length > 8) console.log(`    …and ${result.reds.length - 8} more`);
}

const after = runChecks().match(TALLY);
console.log(`\nrestored: ${after ? `${after[1]} passed, ${after[2]} failed` : 'NO TALLY — the tree did not come back clean, look at it now'}`);
if (!after || Number(after[2]) !== 0) process.exit(1);
if (suspicious) {
  console.log(`${suspicious} control${suspicious === 1 ? '' : 's'} did not behave. Each one is a check that is not doing its job.`);
  process.exit(1);
}
console.log('every control was caught by the check that names it.');
