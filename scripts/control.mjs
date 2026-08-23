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
/** What this VM prints when it aborts node from under us. Not about the code. */
const VM_DIED = /Fatal error in|FailureMessage Object|Segmentation fault|Illegal instruction/;
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
    name: 'role: a formula stops knowing blocks by the name printed on them',
    file: 'src/lib/bindingEngine.ts',
    find: `  const scope: Record<string, any> = { ...blockValuesByName({ get: (a: any) => store.get(a) }) };`,
    with: `  const scope: Record<string, any> = {};`,
    expect: ['A BLOCK IS IN SCOPE UNDER THE NAME A PERSON CAN SEE'],
  },
  {
    name: 'role: the panel stops saying that hiding is not withholding',
    file: 'src/lib/diagnose.ts',
    find: `        if (step.action !== 'setHidden' && step.action !== 'setVisible') continue;`,
    with: `        continue;`,
    expect: ['A PUBLISHED PAGE THAT HIDES BY WHO IS LOOKING IS TOLD THE TRUTH'],
  },
  {
    name: 'role: the panel says it about every hide, including ordinary ones',
    file: 'src/lib/diagnose.ts',
    find: `        if (!conditionText.trim() || !looksPersonal(conditionText)) continue;`,
    with: `        // control: everything looks personal`,
    expect: ['nor a hide that is just interface'],
  },
  {
    name: 'style: the panel offers an example that does not render',
    file: 'src/lib/rows.ts',
    find: `  return \`<div style="background: {{calc: if(\${simple[0]} > 0, '#dcfce7', '#fee2e2')}}">\`;`,
    with: `  return \`<div style="background: {{calc: if(\${simple[0]} > 0, "#dcfce7", "#fee2e2")}}">\`;`,
    expect: ['THE FORMULA INSIDE IT USES NO DOUBLE QUOTES'],
  },
  {
    name: 'feed: a row formula stops being able to see the page',
    file: 'src/lib/rows.ts',
    find: `  const outer: Record<string, any> = { ...(options.pageValues || {}) };`,
    with: `  const outer: Record<string, any> = {};`,
    expect: ['THE HOME FEED'],
  },
  {
    name: 'feed: a condition stops being able to name this row own column',
    file: 'src/lib/rows.ts',
    find: `    outer[key] = row[key];`,
    with: `    void key;`,
    expect: ['THE HOME FEED'],
  },
  {
    name: 'feed: the page wins over the row instead of the other way round',
    file: 'src/lib/rows.ts',
    find: `  outer.RowId = rowIdOf(row) ?? '';`,
    with: `  Object.assign(outer, options.pageValues || {});\n  outer.RowId = rowIdOf(row) ?? '';`,
    expect: ['A ROW OWN COLUMN BEATS A BLOCK'],
  },
  {
    name: 'feed: a condition loses its view of the other tables',
    file: 'src/lib/formula.ts',
    find: `    return truthy(evaluateExpression(bound.expression, bound.scope, tables, {`,
    with: `    return truthy(evaluateExpression(bound.expression, bound.scope, undefined, {`,
    expect: ['TWO HOPS'],
  },
  {
    name: 'feed: the depth limit is removed and a question may nest for ever',
    file: 'src/lib/formula.ts',
    find: `  if (depth >= MAX_QUESTION_DEPTH) {`,
    with: `  if (false) {`,
    expect: ['THREE LEVELS REFUSES'],
  },
  {
    name: 'facets: the five answers stop being reachable from a formula',
    file: 'src/lib/formula.ts',
    find: `  const bound = rewriteFacets(formula, scope);`,
    with: `  const bound = { expression: formula, scope, error: null };`,
    expect: ['THE FACETS ARE REACHABLE BY THE NAME PRINTED ON THE BLOCK'],
  },
  {
    name: 'facets: empty goes true while it is still loading',
    file: 'src/lib/formula.ts',
    find: `    empty: !loading && !failed && !!rows && rows.length === 0,`,
    with: `    empty: !!rows && rows.length === 0,`,
    expect: ['EMPTY IS NEVER TRUE WHILE LOADING'],
  },
  {
    name: 'facets: a failed read starts claiming there is nothing there',
    file: 'src/lib/formula.ts',
    find: `  const failed = !!state?.error;`,
    with: `  const failed = false;`,
    expect: ['EMPTY IS NEVER TRUE AFTER A FAILURE'],
  },
  {
    name: 'facets: the rewrite runs inside quotes too',
    file: 'src/lib/formula.ts',
    find: `    if (ch === '"' || ch === "'") { quote = ch; out.push(ch); i++; continue; }`,
    with: `    if (false) { out.push(ch); i++; continue; }`,
    expect: ['A DOTTED NAME INSIDE QUOTES IS LEFT ALONE'],
  },
  {
    name: 'facets: a wrong one is refused without naming the right ones',
    file: 'src/lib/formula.ts',
    find: `        ? \`"\${objectName}" has no \${propertyName}. It has: \${FACET_NAMES.join(', ')}.\``,
    with: `        ? \`"\${objectName}" has no \${propertyName}.\``,
    expect: ['A FACET THAT DOES NOT EXIST NAMES THE ONES THAT DO'],
  },
  {
    name: 'facets: a facet used only in markup stops being fetched',
    file: 'src/lib/formula.ts',
    find: `  for (const name of dotted) add(name);`,
    with: `  // control: not fetched`,
    expect: ['A FACET USED ONLY IN MARKUP IS STILL ASKED FOR'],
  },
  {
    name: 'facets: a fetch stops saying it is busy',
    file: 'src/lib/bindingEngine.ts',
    find: `        store.set(listAtom, { ...store.get(listAtom), loading: true });`,
    with: `        // control: never busy`,
    expect: ['THE FETCH SAYS IT IS BUSY BEFORE THE ANSWER ARRIVES'],
  },
  {
    name: 'facets: a failed read goes back to warning a console nobody reads',
    file: 'src/lib/bindingEngine.ts',
    find: `                error: error.message || 'Those rows could not be loaded',`,
    with: `                error: null,`,
    expect: ['A READ THAT FAILS SAYS SO'],
  },
  {
    name: 'facets: a stale error is left behind after a good retry',
    file: 'src/lib/bindingEngine.ts',
    find: `              // CLEARED ON SUCCESS. A stale error left behind is a page saying
              // it is broken when it is not, which is its own kind of wrong.
              error: null,`,
    with: `              error: currentListState?.error ?? null,`,
    expect: ['AND A SUCCESSFUL RETRY CLEARS IT'],
  },
  {
    name: 'rules: a rule mentioning Me stops refusing a signed-out visitor',
    file: 'src/lib/rules.ts',
    find: `  if (/\\bMe\\b/.test(text) && !session?.id) return false;`,
    with: `  // control: signed out is allowed to match`,
    expect: ['AND SIGNED OUT IS NOT A MATCH FOR A BLANK OWNER'],
  },
  {
    name: 'rules: a broken rule fails open instead of closed',
    file: 'src/lib/rules.ts',
    find: `    return false;                          // fail CLOSED`,
    with: `    return true;`,
    expect: ['AND A RULE THAT CANNOT BE WORKED OUT REFUSES'],
  },
  {
    name: 'rules: no rule at all starts meaning anybody',
    file: 'src/lib/rules.ts',
    find: `  if (!text) return false;                 // no rule means nobody, like Supabase`,
    with: `  if (!text) return true;`,
    expect: ['NO RULE AT ALL MEANS NOBODY'],
  },
  {
    name: 'rules: a text value compiles to a column name again',
    file: 'src/lib/rules.ts',
    find: `  sql = sql.replace(/"((?:[^"\\\\]|\\\\.)*)"/g, (_m, inner) => \`'\${String(inner).replace(/'/g, "''")}'\`);`,
    with: `  // control: double quotes left as identifiers`,
    expect: ['A ROLE BECOMES A SQL STRING IN SINGLE QUOTES'],
  },
  {
    name: 'rules: an update policy gets only USING, not WITH CHECK',
    file: 'src/lib/rules.ts',
    find: `        ? \`create policy \${name} on public.\${t} for update using (\${sql}) with check (\${sql});\``,
    with: `        ? \`create policy \${name} on public.\${t} for update using (\${sql});\``,
    expect: ['AND AN UPDATE USES BOTH'],
  },
  {
    name: 'rules: a rule may ask about another table again',
    file: 'src/lib/rules.ts',
    find: `  if (/\\b(countOf|sumOf|avgOf|minOf|maxOf|joinOf)\\b/.test(text)) {`,
    with: `  if (false) {`,
    expect: ['a rule that asks about another table is refused'],
  },
  {
    name: 'rules: the panel stops warning about an unpinned owner',
    file: 'src/lib/rules.ts',
    find: `  if (owner && insert && insert !== 'nobody' && !new RegExp(\`\\\\{\\\\{\\\\s*\${owner}\\\\s*\\\\}\\\\}[^]*\\\\bMe\\\\b\`, 'i').test(insert)) {`,
    with: `  if (false) {`,
    expect: ['AN ADD RULE THAT DOES NOT PIN THE OWNER IS CALLED OUT'],
  },
  {
    name: 'query: grouping stops grouping',
    file: 'src/lib/query.ts',
    find: `      if (!buckets.has(flat)) buckets.set(flat, { key, rows: [] });`,
    with: `      if (true) buckets.set(flat + Math.random(), { key, rows: [] });`,
    expect: ['GROUP BY MONTH'],
  },
  {
    name: 'query: the limit is applied before the order instead of after',
    file: 'src/lib/query.ts',
    find: `  if (String(def.orderBy ?? '').trim()) {`,
    with: `  if (def.limit && def.limit > 0) rows = rows.slice(0, def.limit);\n  if (String(def.orderBy ?? '').trim()) {`,
    expect: ["TOP ONE IS THE BEST SELLER"],
  },
  {
    name: 'query: "keeping the" stops choosing and takes whatever is first',
    file: 'src/lib/query.ts',
    find: `      if (!choose) return group[0];`,
    with: `      return group[0];`,
    expect: ['AND THE OLDEST IS A DIFFERENT ANSWER'],
  },
  {
    name: 'query: a union stops reshaping its rows',
    file: 'src/lib/query.ts',
    find: `      src.as
        ? kept.map(r => {`,
    with: `      false
        ? kept.map(r => {`,
    expect: ['and rows of different shapes came out the same shape'],
  },
  {
    name: 'query: an unknown keep phrase is accepted silently',
    file: 'src/lib/query.ts',
    find: `  if (!word) throw new Error(\`"\${text}" is not something to keep. \${KEEP_HELP}\`);`,
    with: `  if (!word) return rows.length;`,
    expect: ['AND ANYTHING ELSE IS REFUSED BY LISTING THE SEVEN'],
  },
  {
    name: 'query: a preview throws instead of reporting',
    file: 'src/lib/query.ts',
    find: `  } catch (err: any) {
    return { rows: [], columns: [], sentence, error: String(err?.message || 'That question could not be answered') };`,
    with: `  } catch (err: any) {
    return { rows: [], columns: [], sentence, error: null };`,
    expect: ['AND A BROKEN QUERY PREVIEWS AS AN ERROR RATHER THAN THROWING'],
  },
  {
    name: 'query: a preview stops being capped',
    file: 'src/lib/query.ts',
    find: `    const shown = rows.slice(0, limit);`,
    with: `    const shown = rows;`,
    expect: ['it is capped, so a preview of forty thousand rows is not a page'],
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
  // ---------------------------------------------------------------- queries
  // The runtime, not the query itself: a named answer, the order they run in,
  // and the three ways a name goes wrong.
  {
    name: 'queries: a question stops becoming a table',
    file: 'src/lib/bindingEngine.ts',
    find: `  return applyQueries(store, rawTableScope(store));`,
    with: `  return rawTableScope(store);`,
    expect: ['A QUESTION IS ANSWERED OVER THE PAGE'],
  },
  {
    name: 'queries: they run in the order they were typed instead of what they are about',
    file: 'src/lib/queries.ts',
    find: `      if (upstream && upstream.id !== q.id) run(upstream);`,
    with: `      void upstream; // control: no ordering`,
    expect: ['EVEN WHEN IT IS WRITTEN FIRST'],
  },
  {
    name: 'queries: a circle is followed instead of reported',
    file: 'src/lib/queries.ts',
    find: `    if (at !== -1) {`,
    with: `    if (false) {`,
    // A hang would be worse than a failure, so the control has to be able to
    // end. `done` is never set for a looping query, so it simply answers wrong.
    expect: ['A CIRCLE IS REPORTED RATHER THAN HUNG ON'],
  },
  {
    name: 'queries: the loop is reported without saying which questions are in it',
    file: 'src/lib/queries.ts',
    find: `      const loop = [...visiting.slice(at), q.name];`,
    with: `      const loop = [];`,
    expect: ['NAMES THE LOOP'],
  },
  {
    name: 'queries: a question may take a name a block already has',
    file: 'src/lib/queries.ts',
    find: `  if (takenBy.has(clean)) {`,
    with: `  if (false) {`,
    expect: ['MAY NOT TAKE THE NAME OF A TABLE ALREADY ON THE PAGE', 'THE BLOCK KEEPS ITS TABLE'],
  },
  {
    name: 'queries: a name that already means something everywhere is allowed',
    file: 'src/lib/queries.ts',
    find: `  if (RESERVED_NAMES.some(r => r.toLowerCase() === clean.toLowerCase())) {`,
    with: `  if (false) {`,
    expect: ['A NAME THAT ALREADY MEANS SOMETHING EVERYWHERE IS REFUSED'],
  },
  {
    name: 'queries: one bad question takes the others down with it',
    file: 'src/lib/queries.ts',
    find: '      errors[q.id] = `"${q.name}" could not be answered: ${String(err?.message || err)}`;',
    with: `      throw err;`,
    expect: ['DOES NOT STOP THE OTHERS', 'NEVER THROWS'],
  },
  {
    name: 'queries: a table named only inside a formula stops counting as a dependency',
    file: 'src/lib/queries.ts',
    find: `      const name = String(m[1]).trim();`,
    with: `      const name = ''; // control: formulas hide their tables`,
    expect: ['A TABLE NAMED ONLY INSIDE A FORMULA'],
  },
  {
    name: 'queries: an answer stops declaring the columns it invented',
    file: 'src/lib/queries.ts',
    find: `    for (const key of Object.keys(row || {})) if (key !== 'id') seen.add(key);`,
    with: `    void row; // control: no columns`,
    expect: ['THE COLUMNS IT INVENTED'],
  },
  {
    name: 'panel: keep stops parsing what a builder types',
    file: 'src/lib/queries.ts',
    find: `    if (name) out[name] = part.slice(at + 1).trim();`,
    with: `    void name; // control: nothing kept`,
    expect: ['KEEP IS WRITTEN AS ONE LINE'],
  },
  {
    name: 'panel: a part with no equals is guessed at instead of dropped',
    file: 'src/lib/queries.ts',
    find: `    if (at === -1) continue;`,
    with: `    if (at === -1) { out[part.trim()] = part.trim(); continue; }`,
    expect: ['a part with no = is dropped rather than guessed at'],
  },
  {
    name: 'panel: the way in is removed',
    file: 'src/App.tsx',
    find: `      {showQuestions && <QuestionsPanel onClose={() => setShowQuestions(false)} />}`,
    with: `      {false && <QuestionsPanel onClose={() => setShowQuestions(false)} />}`,
    expect: ['THE PANEL IS REACHABLE'],
  },
  {
    name: 'panel: it stops showing what came out',
    file: 'src/components/QuestionsPanel.tsx',
    find: `        const preview = previewQuery(q.def, { ...tables }, page, 8)`,
    with: `        const preview = { rows: [], columns: [], sentence: '', error: null } // control`,
    expect: ['it previews what came out'],
  },
  {
    name: 'panel: it stops saying an answer depends on who is looking',
    file: 'src/components/QuestionsPanel.tsx',
    find: `        const wants = pageNamesIn(q.def).filter(n => !(n in page))`,
    with: `        const wants = [] // control`,
    expect: ['SAYS WHEN AN ANSWER DEPENDS ON WHO IS LOOKING'],
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
    /**
     * THE MACHINE DYING IS NOT THE CODE FAILING, and they look identical from
     * here: both produce a run with no tally. This VM aborts node outright
     * every so often -- `Fatal error ... unreachable code`, a V8 abort, which
     * skips even the exit handler that guarantees a tally. Told apart by the
     * words V8 prints on the way down, so a flake is retried and a real crash
     * is reported.
     */
    if (!tally && VM_DIED.test(out)) return { kind: 'vm-died', out, reds };
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
  let retried = 0;
  // The VM aborting gets more patience than a disagreement does, because it is
  // not about the code at all -- but it is still bounded, or a genuinely
  // crashing suite would be retried for ever.
  while (result.kind !== 'ok' && retried < (result.kind === 'vm-died' ? 3 : 1)) {
    retried++;
    result = attempt(control);
  }

  console.log(`\n${control.name}`);
  /**
   * SUITE STOPPED EARLY is printed WHATEVER the verdict, and that is a fix.
   *
   * It used to be mentioned only when the control passed, so a control that
   * crashed the suite reported "1 failed, but not where it should" with no
   * reds -- which reads as a decorative check and is actually a crash. Same
   * mistake as the `'passed,' in out` one at the top of this file, in a new
   * costume: the instrument leaving out the one word that explains the result.
   */
  const stopped = result.stoppedEarly ? '  (SUITE STOPPED EARLY — something threw, see ran() in checks.ts)' : '';
  const note = (retried ? `  (after ${retried} retr${retried === 1 ? 'y' : 'ies'} — the earlier run disagreed)` : '') + stopped;
  switch (result.kind) {
    case 'ok':
      console.log(`  ${result.failedCount} failed${note}`);
      break;
    case 'cannot-apply':
      // A control aimed at a line that no longer exists is not a control. This
      // used to print and not count, which is how a control quietly stops
      // testing anything while the summary still says all clear.
      console.log(`  CANNOT APPLY — the line it breaks is not in ${result.file} any more, so this control is testing nothing.${note}`);
      suspicious++;
      break;
    case 'vm-died':
      console.log('  THE VM ABORTED node, three times running. That is this machine, not this code —');
      console.log('  but nothing can be concluded from it, so the control is unproven. Run it alone.');
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
