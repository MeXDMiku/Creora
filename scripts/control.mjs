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
import { readFileSync, writeFileSync, openSync, fsyncSync, closeSync, existsSync, unlinkSync } from 'node:fs';
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
  // ---------------------------------------------------------------- actions
  // Primitive B. The interesting ones are the two that must AGREE — a preview
  // that disagrees with the SQL is a confident lie.
  {
    name: 'import: a query is carried across a copy without its ids rewritten',
    file: 'src/lib/remapBlockIds.ts',
    find: `      queries: (page.queries ?? []).map((q: any) => remapQuery(q, idMap)),`,
    with: `      queries: page.queries,`,
    expect: ['no old id survives', 'a query`s table follows', 'the ids inside its where'],
  },
  {
    name: 'import: a query`s expressions are swapped whole instead of by id',
    file: 'src/lib/remapBlockIds.ts',
    find: `  const expr = (v: unknown) =>
    typeof v === 'string' ? remapFormulaExpression(v, idMap) : v;`,
    with: `  const expr = (v: unknown) => remapString(v, idMap);`,
    expect: ['the ids inside its where'],
  },
  {
    name: 'import: an action is carried across a copy without its ids rewritten',
    file: 'src/lib/remapBlockIds.ts',
    find: `      actions: (page.actions ?? []).map((a: any) => remapAction(a, idMap)),`,
    with: `      actions: page.actions,`,
    expect: ['no old id survives', 'an action`s table follows', 'the ids inside a step`s where'],
  },
  {
    name: 'import: an action`s own vocabulary gets rewritten as if it named blocks',
    file: 'src/lib/remapBlockIds.ts',
    find: `      const next: any = { ...step, table: remapString(step.table, idMap) };`,
    with: `      const next: any = { ...step, table: remapString(step.table, idMap), name: expr(step.name), message: expr(step.message) };`,
    expect: ['a remembered name is not a block', 'nor is what it says when it refuses'],
  },
  {
    name: 'import: an action`s column and kept-row name get rewritten too',
    file: 'src/lib/remapBlockIds.ts',
    find: `      const next: any = { ...step, table: remapString(step.table, idMap) };`,
    with: `      const next: any = { ...step, table: remapString(step.table, idMap), column: remapString(step.column, idMap), remember: remapString(step.remember, idMap) };`,
    expect: ['nor is the column it reads', 'nor is the name it keeps the new row under'],
  },
  {
    name: 'panel: a half-typed line becomes a column named the whole line',
    file: 'src/lib/actions.ts',
    find: `    if (at === -1) continue;`,
    with: `    if (at === -1) { out[line.trim()] = ''; continue; }`,
    expect: ['A LINE WITH NO EQUALS IS HALF-TYPED', 'an empty box is nothing set', 'a blank line does not invent'],
  },
  {
    name: 'panel: the last equals splits it, so a value cannot contain one',
    file: 'src/lib/actions.ts',
    find: `    const at = line.indexOf('=');`,
    with: `    const at = line.lastIndexOf('=');`,
    expect: ['an equals inside the value survives'],
  },
  {
    name: 'panel: the way in to actions is removed',
    file: 'src/App.tsx',
    find: `      {showActions && <ActionsPanel onClose={() => setShowActions(false)} />}`,
    with: `      {false && <ActionsPanel onClose={() => setShowActions(false)} />}`,
    expect: ['THE ACTIONS PANEL IS REACHABLE'],
  },
  {
    name: 'panel: it stops saying which values a visitor could change',
    file: 'src/components/ActionsPanel.tsx',
    find: `                              const origin = originOf(formula, read, tables, remembered)`,
    with: `                              const origin = { fromPage: [], anyTrusted: true, names: [], trusted: true }`,
    expect: ['it says out loud which values a visitor could change'],
  },
  {
    name: 'travel: an action stops being saved when it changes',
    file: 'src/App.tsx',
    find: `    const unsubActions = store.sub(actionsAtom, () => {`,
    with: `    const unsubActions = (() => {})(store.sub, () => {`,
    expect: ['AN ACTION TRAVELS EVERYWHERE A QUESTION DOES'],
  },
  {
    name: 'call: a database error is passed through to the visitor',
    file: 'src/lib/actions.ts',
    find: `  return { message: 'That could not be done just now. Try again in a moment.', refused: false };`,
    with: `  return { message, refused: false };`,
    expect: ['A DATABASE ERROR DOES NOT REACH THE VISITOR'],
  },
  {
    name: 'call: every failure is treated as a refusal, so schema becomes a sentence',
    file: 'src/lib/actions.ts',
    find: `  if (code === REFUSAL_CODE) return { message: message.trim() || 'That cannot be done.', refused: true };`,
    with: `  if (true) return { message: message.trim() || 'That cannot be done.', refused: true };`,
    expect: ['A DATABASE ERROR DOES NOT REACH THE VISITOR', 'it is not called a refusal', 'MIGRATION NEVER RUN IS ITS OWN SENTENCE'],
  },
  {
    name: 'call: the refusal loses the errcode the caller looks for',
    file: 'src/lib/actions.ts',
    find: ` using errcode = \${quote(REFUSAL_CODE)};\`);`,
    with: `;\`);`,
    expect: ['the generated refusal carries the code the caller looks for'],
  },
  {
    name: 'call: a missing given value is left out instead of sent as nothing',
    file: 'src/lib/actions.ts',
    find: `  for (const take of action?.takes || []) out[\`p_\${ident(take)}\`] = (given || {})[take] ?? null;`,
    with: `  for (const take of action?.takes || []) if ((given || {})[take] != null) out[\`p_\${ident(take)}\`] = (given || {})[take];`,
    expect: ['one nobody filled in goes as nothing'],
  },
  {
    name: 'call: the step sends whatever it holds rather than what the action takes',
    file: 'src/lib/actions.ts',
    find: `  const out: Record<string, any> = {};
  for (const take of action?.takes || []) out[\`p_\${ident(take)}\`] = (given || {})[take] ?? null;`,
    with: `  const out: Record<string, any> = { ...(given || {}) };
  for (const take of action?.takes || []) out[\`p_\${ident(take)}\`] = (given || {})[take] ?? null;`,
    expect: ['AND ONLY WHAT THE ACTION DECLARED'],
  },
  {
    name: 'call: a refusal is not shown to the person who was refused',
    file: 'src/lib/bindingEngine.ts',
    find: `            if (now) store.set(blockRuntimeAtom(sayOn), { ...now, error: failure ? failure.message : null });`,
    with: `            if (now) store.set(blockRuntimeAtom(sayOn), { ...now, error: null });`,
    expect: ['A REFUSAL LANDS WHERE THE WIRE POINTS'],
  },
  {
    name: 'call: a working run stops clearing the last refusal',
    file: 'src/lib/bindingEngine.ts',
    find: `            settle(error ? describeActionError(error) : null);`,
    with: `            if (error) settle(describeActionError(error)); else setBusy(false);`,
    expect: ['AND A RUN THAT WORKS CLEARS IT'],
  },
  {
    name: 'call: the button is left saying it is busy for ever',
    file: 'src/lib/bindingEngine.ts',
    find: `          const settle = (failure: { message: string; refused: boolean } | null) => {
            setBusy(false);`,
    with: `          const settle = (failure: { message: string; refused: boolean } | null) => {`,
    expect: ['the button stops saying it is busy even when it was refused'],
  },
  {
    name: 'call: a step whose action is gone asks the server anyway',
    file: 'src/lib/bindingEngine.ts',
    find: `          if (!action) {
            runSteps.push({`,
    with: `          if (false) {
            runSteps.push({`,
    expect: ['A STEP POINTING AT AN ACTION THAT IS GONE'],
  },
  {
    name: 'log: a step that did nothing says it ran anyway',
    file: 'src/lib/bindingEngine.ts',
    find: `      if (runSteps.length === loggedBefore) {`,
    with: `      if (true) {`,
    expect: ['AND DOES NOT ALSO CLAIM IT RAN'],
  },
  {
    name: 'log: the engine keeps its own copy of the validity default again',
    file: 'src/lib/bindingEngine.ts',
    find: `      const guardOn = step.requireValid ?? guardDefaultFor(step.action);`,
    with: `      const guardOn = step.requireValid ?? (step.action === 'addRow' || step.action === 'updateRow');`,
    expect: ['AN EMPTY REQUIRED FIELD STOPS THE ACTION BEING RUN AT ALL'],
  },
  {
    name: 'log: the guard stops knowing which fields an action reads',
    file: 'src/lib/bindingEngine.ts',
    find: `  if (step.given) {
    for (const m of Object.values(step.given)) {`,
    with: `  if (false) {
    for (const m of Object.values(step.given ?? {})) {`,
    expect: ['AN UNFINISHED FIELD THE ACTION DOES NOT READ DOES NOT BLOCK IT'],
  },
  {
    name: 'thread: sorting by a path stops being reading order',
    file: 'src/lib/rows.ts',
    find: `export function compareCells(a: any, b: any): number {`,
    with: `export function compareCells(a: any, b: any): number {\n  if (typeof a === 'string' && typeof b === 'string') return b.localeCompare(a);`,
    expect: ['SORTING BY THE PATH IS READING ORDER'],
  },
  {
    name: 'live: a connection makes the page slower than it was',
    file: 'src/lib/liveChanges.ts',
    find: `  if (!live.connected) return pace.intervalMs;`,
    with: `  if (!live.connected) return LIVE_HEARTBEAT_MS;`,
    expect: ['with no connection the pace is exactly what it was', 'AND THE LIVE PATH CANNOT GO SLOWER'],
  },
  {
    name: 'live: an unproven connection slows things down anyway',
    file: 'src/lib/liveChanges.ts',
    find: `  return proven ? LIVE_HEARTBEAT_MS : Math.min(pace.intervalMs, LIVE_HEARTBEAT_MS);`,
    with: `  return LIVE_HEARTBEAT_MS;`,
    expect: ['CONNECTED BUT UNPROVEN NEVER SLOWS ANYTHING DOWN'],
  },
  {
    name: 'live: a burst of signals becomes a burst of reads',
    file: 'src/lib/liveChanges.ts',
    find: `  return now - live.signalledAt >= SIGNAL_COALESCE_MS;`,
    with: `  return true;`,
    expect: ['a signal that has just landed waits for the burst to settle'],
  },
  {
    name: 'live: a signal already read is read again on every heartbeat',
    file: 'src/lib/liveChanges.ts',
    find: `  if (live.fetchedAt !== null && live.fetchedAt >= live.signalledAt) return false;`,
    with: `  if (false) return false;`,
    expect: ['and once read, it does not read again on its own'],
  },
  {
    name: 'live: the block stops saying which of the two it is doing',
    file: 'src/blocks/DatabaseBlock.tsx',
    find: `              title={describeLive(live.current, Date.now())}`,
    with: `              title=""`,
    expect: ['AND SOMETHING RENDERS WHICH OF THE TWO IT IS DOING'],
  },
  {
    name: 'unfinished: a half-typed step says undefined again',
    file: 'src/lib/actions.ts',
    find: `    if (writesRows && !String(step.table ?? '').trim()) {`,
    with: `    if (false) {`,
    expect: ['AN UNFINISHED STEP NEVER SAYS THE WORD', 'AND DOES NOT CLAIM AN UNFINISHED STEP WILL REMOVE EVERYTHING'],
  },
  {
    name: 'unfinished: a finished step stops warning about every row',
    file: 'src/lib/actions.ts',
    find: `    } else if (writesRows && !String(step.where ?? '').trim()) {`,
    with: `    } else if (false) {`,
    expect: ['but a FINISHED step with no rows named still says so'],
  },
  {
    name: 'bola: nothing notices a row the visitor named',
    file: 'src/lib/actions.ts',
    find: `      if (named.length && !namesAServerWord(step.where) && !looked.has(table)) {`,
    with: `      if (false && named.length) {`,
    expect: ['DELETING BY AN ID THE VISITOR SENT', 'AND A REFUSAL THAT CHECKS NOTHING DOES NOT SILENCE IT'],
  },
  {
    name: 'bola: a refusal on anything at all counts as looking at the row',
    file: 'src/lib/actions.ts',
    find: `      for (const name of slotsIn(step.when)) {
        const table = from.get(name);
        if (table) checked.add(table);
      }`,
    with: `      for (const step2 of action?.steps || []) if (step2.table) checked.add(String(step2.table));`,
    expect: ['AND A REFUSAL THAT CHECKS NOTHING DOES NOT SILENCE IT'],
  },
  {
    name: 'bola: a check on any table counts for every table',
    file: 'src/lib/actions.ts',
    find: `      if (named.length && !namesAServerWord(step.where) && !looked.has(table)) {`,
    with: `      if (named.length && !namesAServerWord(step.where) && looked.size === 0) {`,
    expect: ['a check on a DIFFERENT table does not count'],
  },
  {
    name: 'bola: saying it in the rows themselves stops counting',
    file: 'src/lib/actions.ts',
    find: `      if (named.length && !namesAServerWord(step.where) && !looked.has(table)) {`,
    with: `      if (named.length && !looked.has(table)) {`,
    expect: ['and so is saying it in the rows themselves'],
  },
  {
    name: 'bola: the warning cries wolf on an audit row again',
    file: 'src/lib/actions.ts',
    find: `        const onlyCheckedKeys = origin.fromPage.every(n => looked.size > 0 && usedAsKey.has(n));`,
    with: `        const onlyCheckedKeys = false;`,
    expect: ['AN AUDIT ROW RECORDING WHICH ROW WAS ACTED ON'],
  },
  {
    name: 'question: a question builds its own scope again, losing RowId',
    file: 'src/lib/query.ts',
    find: `  const { value: v, error } = rowFormulaValue(row, text, { pageValues: page, tables });`,
    with: `  const { value: v, error } = rowFormulaValue({}, text, { pageValues: { ...page, ...row }, tables });`,
    expect: ['A QUESTION KNOWS WHICH ROW IT IS STANDING IN'],
  },
  {
    // WENT STALE ONCE, and the tool said so rather than passing. value() used
    // to call evaluateExpression directly; it calls rowFormulaValue now, so the
    // line this used to break stopped existing. A control that hard-codes an
    // internal detail needs the same care as a check that does.
    name: 'question: a question stops being able to ask about another table',
    file: 'src/lib/query.ts',
    find: `  const { value: v, error } = rowFormulaValue(row, text, { pageValues: page, tables });`,
    with: `  const { value: v, error } = rowFormulaValue(row, text, { pageValues: page });`,
    expect: ['A QUESTION`S FILTER CAN ASK ABOUT ANOTHER TABLE', 'WHICH IS UNREAD-COUNT-PER-LABEL'],
  },
  {
    name: 'question: what it works out per group loses the tables again',
    file: 'src/lib/query.ts',
    find: `  tables?: TableScope,
): any {
  const text = String(phrase ?? '').trim();`,
    with: `  _unused?: TableScope,
): any {
  const tables = undefined as any;
  const text = String(phrase ?? '').trim();`,
    expect: ['and so can what it works out per group'],
  },
  {
    name: 'actions: the price stops coming from the table',
    file: 'src/lib/actions.ts',
    find: `          scope[step.name || ''] = step.column ? (rows[0] || {})[step.column] : rows.length;`,
    with: `          scope[step.name || ''] = (given || {})[step.name || ''] ?? null; // control: from the page`,
    expect: ['THE PRICE CAME FROM THE TABLE'],
  },
  {
    name: 'actions: a refusal writes the rows anyway',
    file: 'src/lib/actions.ts',
    find: `              changes: [],
            };
          }
          break;`,
    with: `              changes,
            };
          }
          break;`,
    expect: ['NOTHING AT ALL WAS WRITTEN'],
  },
  {
    name: 'actions: a refusal stops saying which step',
    file: 'src/lib/actions.ts',
    find: `              refusedAt: i,`,
    with: `              refusedAt: 0, // control: no place`,
    expect: ['NAMES WHICH STEP'],
  },
  {
    name: 'actions: the preview changes the page rows in place',
    file: 'src/lib/actions.ts',
    find: `    store[name] = (table?.rows || []).map(r => ({ ...r }));`,
    with: `    store[name] = table?.rows || []; // control: not a copy`,
    // Paired: the shallow copy of the LIST only matters once the copy of each
    // ROW is gone too, so both are broken together.
    also: {
      file: 'src/lib/actions.ts',
      find: `            const next = { ...r };`,
      with: `            const next = r; // control: mutate in place`,
    },
    expect: ['THE REAL TABLES WERE NEVER TOUCHED'],
  },
  {
    name: 'actions: a broken formula counts as false instead of failing',
    file: 'src/lib/actions.ts',
    find: `      if (error) throw new Error(\`\${at}: \${error}\`);`,
    with: `      if (error) return null; // control: fail open`,
    expect: ['FAILS THE ACTION RATHER THAN COUNTING AS FALSE'],
  },
  {
    name: 'actions: the function stops running as the owner',
    file: 'src/lib/actions.ts',
    find: `    'security definer',`,
    with: `    '-- control: not definer',`,
    expect: ['RUNS AS THE OWNER'],
  },
  {
    name: 'actions: search_path is left open',
    file: 'src/lib/actions.ts',
    find: `    'set search_path = public',`,
    with: `    '-- control: no search_path',`,
    expect: ['fixed search_path'],
  },
  {
    name: 'actions: anybody may call it, signed in or not',
    file: 'src/lib/actions.ts',
    find: `    \`revoke all on function \${name}(\${signature}) from public;\`,`,
    with: `    '-- control: no revoke',`,
    expect: ['nobody may call it who is not signed in'],
  },
  {
    name: 'actions: a remembered name compiles to a column instead of a variable',
    file: 'src/lib/actions.ts',
    find: `    if (remembered.has(name)) return \`v_\${ident(name)}\`;`,
    with: `    if (false) return ''; // control: no variables`,
    expect: ['THREE KINDS OF NAME NEVER COLLIDE', 'a remembered one is a variable'],
  },
  {
    name: 'actions: a given value compiles to a column instead of a parameter',
    file: 'src/lib/actions.ts',
    find: `    if (params.has(name)) return \`p_\${ident(name)}\`;`,
    with: `    if (false) return ''; // control: no parameters`,
    expect: ['a given value is a parameter, not a column'],
  },
  {
    name: 'actions: a text value compiles to an identifier again',
    file: 'src/lib/actions.ts',
    find: `  sql = sql.replace(/"((?:[^"\\\\]|\\\\.)*)"/g, (_m, inner) => quote(inner));`,
    with: `  // control: no string masking`,
    expect: ['a text value stays TEXT'],
  },
  {
    name: 'actions: a remembered name stops being trusted, so the warning cries wolf',
    file: 'src/lib/actions.ts',
    find: `    if (step.kind === 'remember' && step.name) remembered.add(step.name);`,
    with: `    // control: nothing remembered is trusted`,
    expect: ['A GOOD ONE IS WARNED ABOUT NOTHING'],
  },
  {
    name: 'actions: a page-supplied price stops being warned about',
    file: 'src/lib/actions.ts',
    // The condition gained `!onlyCheckedKeys` when a key looked up in an earlier
    // step stopped counting as page-supplied. The control has to follow it, or it
    // silently stops testing anything -- which is what it did.
    find: `        if (origin.fromPage.length && !origin.anyTrusted && !onlyCheckedKeys) {`,
    with: `        if (false) {`,
    expect: ['A PRICE THE PAGE SENT IS WARNED ABOUT'],
  },
  {
    name: 'actions: a delete with no where stops being warned about',
    file: 'src/lib/actions.ts',
    // The sentence gained a verb, and a branch in front of it, when an unfinished
    // step stopped being warned about as if it would delete everything.
    find: `    } else if (writesRows && !String(step.where ?? '').trim()) {`,
    with: `    } else if (false) { // control: silent about a missing where`,
    expect: ['A DELETE WITH NO WHERE IS WARNED ABOUT'],
  },

  /**
   * THE FOUR THINGS ADDED IN THE COMMIT THAT MADE THE ENGINE'S OWN RULES
   * READABLE. Every one of them arrived with checks and none with controls,
   * which is the same hole those checks were written to close, one level up.
   *
   * Writing these found four checks that could not fail: two matched a word
   * that also appears in the fallback sentence, one asked `actionWords` about
   * an action whose NAME is the answer, and one compared a function to itself.
   * All four are stronger now. That is what this file is for.
   */

  // --- what may be wired into what ------------------------------------------
  {
    name: 'wire: a trigger goes back to carrying a value, so it must match',
    file: 'src/lib/wireTypes.ts',
    find: `  if (source === 'trigger') return { ok: true, reason: null };`,
    with: `  // control: a trigger carries a value after all`,
    expect: [
      'A TRIGGER MAY FIRE INTO TEXT',
      'and into a block whose type nobody has worked out',
      'and into a table, as it always could',
      'a trigger still fits a number',
      'A BUTTON MAY NOW REACH LIVE DATA',
    ],
  },
  {
    name: 'wire: an unnamed SOURCE stops being refused by name',
    file: 'src/lib/wireTypes.ts',
    find: `  if (source === 'unknown')
    return { ok: false, reason: 'That block has not been told what kind of value it gives yet.' };`,
    with: `  // control: an unnamed source falls through`,
    // It still refuses -- by the mismatch rule, with the WRONG sentence. That
    // is exactly why the check now compares the whole sentence.
    expect: ['and says it was the giving end it could not name'],
  },
  {
    name: 'wire: an unnamed TARGET stops being refused by name',
    file: 'src/lib/wireTypes.ts',
    find: `  if (target === 'unknown')
    return { ok: false, reason: 'That block has not been told what kind of value it holds yet.' };`,
    with: `  // control: an unnamed target falls through`,
    expect: ['and says it was the holding end'],
  },
  {
    name: 'wire: nothing matches itself any more',
    file: 'src/lib/wireTypes.ts',
    find: `  if (source === target) return { ok: true, reason: null };`,
    with: `  // control: sameness is not a match`,
    expect: [
      'text still fits where text is held',
      'a number still fits a number',
      'a yes or no still fits a yes or no',
      'and nothing that passes carries one',
    ],
  },
  {
    name: 'wire: the last refusal turns into a pass, so anything fits anything',
    file: 'src/lib/wireTypes.ts',
    find: `  return {
    ok: false,
    reason: \`This gives \${typeWords(source)}, and that holds \${typeWords(target)}.\`,
  };`,
    with: `  return { ok: true, reason: null }; // control: anything fits anything`,
    expect: [
      'A NUMBER DOES NOT FIT WHERE TEXT IS HELD',
      'nor text where a number is',
      'nor a whole table where a number is',
      'nor a yes or no where text is',
      'every refusal carries a reason a person can read',
    ],
  },
  {
    name: 'wire: the refusal names the internal type instead of the product word',
    file: 'src/lib/wireTypes.ts',
    find: `    case 'string': return 'text';`,
    with: `    case 'string': return 'string'; // control: the internal name`,
    expect: ['the words are the product'],
  },

  // --- refresh, and the list that says it is carried out ---------------------
  {
    name: 'refresh: the words are removed, so the wire reads back as a code word',
    file: 'src/lib/wireWords.ts',
    find: `  refresh: 'refresh',`,
    with: `  // control: no words for refresh`,
    expect: [
      'refresh has words of its own',
      'and words of its own, so no wire reads back as a code word',
    ],
  },
  {
    name: 'refresh: runAction loses its words again, which is how it shipped',
    file: 'src/lib/wireWords.ts',
    find: `  runAction: 'run',`,
    with: `  // control: no words for runAction`,
    expect: ['and words of its own, so no wire reads back as a code word'],
  },
  {
    name: 'refresh: the engine stops carrying it out, so the setting is inert again',
    file: 'src/lib/bindingEngine.ts',
    find: `        case 'refresh': {
          void import('./dataSource').then((m) => m.fetchDataSource(step.targetId, store));
          break;
        }`,
    with: `        // control: refresh is offered and does nothing`,
    expect: ['AND EVERY ONE OF THEM HAS A CASE IN THE ENGINE'],
  },

  // --- the two graphs a page has --------------------------------------------
  {
    name: 'graph: a wire stops counting as drawn, so nothing is on screen',
    file: 'src/lib/pageGraph.ts',
    find: `  for (const c of page.connections ?? []) add(c?.sourceBlockId, c?.targetBlockId, 'wire', true);`,
    with: `  for (const c of page.connections ?? []) add(c?.sourceBlockId, c?.targetBlockId, 'wire', false);`,
    expect: ['THE WIRE IS THE ONLY THING DRAWN', 'and the wire is not among them'],
  },
  {
    name: 'graph: a block is allowed to depend on itself',
    file: 'src/lib/pageGraph.ts',
    find: `    if (!from || !to || from === to) return;`,
    with: `    if (!from || !to) return; // control: self-edges allowed`,
    expect: ['A BLOCK DOES NOT DEPEND ON ITSELF'],
  },
  {
    name: 'graph: an endpoint that is not on the page is kept',
    file: 'src/lib/pageGraph.ts',
    // Was `blocks.has`, until a question and an action became nodes too.
    find: `    if (!nodes.has(from) || !nodes.has(to)) return;`,
    with: `    // control: off-page endpoints are kept`,
    expect: ['nor on a block that is not on the page'],
  },
  {
    name: 'graph: a formula stops being a dependency at all',
    file: 'src/lib/pageGraph.ts',
    find: `    for (const id of referencedIds(f?.formula)) add(id, f?.targetBlockId, 'formula', false);`,
    with: `    void f; // control: formulas depend on nothing`,
    expect: [
      'a formula depends on a block and draws nothing',
      'ONE ROW PER PAIR',
      'and the wire is not among them',
      'two reasons for one pair are merged into one row',
    ],
  },
  {
    name: 'graph: runtime states stop being a place blocks are listed',
    file: 'src/lib/pageGraph.ts',
    find: `  for (const id of Object.keys(page.runtimeStates ?? {})) ids.add(id);`,
    with: `  // control: runtime states list no blocks`,
    expect: ['every block is found, whatever it was listed in'],
  },
  {
    name: 'graph: a block reading another through its settings stops counting',
    file: 'src/lib/pageGraph.ts',
    find: `      if (isBlockId(state?.[field], blocks)) add(state[field], id, \`setting:\${field}\`, false);`,
    with: `      void field; // control: settings point at nothing`,
    expect: [
      'and so does a block reading another through its own settings',
      'a setting is named in words, not in field names',
      'ONE ROW PER PAIR',
    ],
  },

  // --- the same dependencies, written for a person --------------------------
  {
    name: 'hidden: a drawn wire is listed as hidden as well',
    file: 'src/lib/hiddenEdges.ts',
    find: `    if (edge.drawn) continue;`,
    with: `    // control: drawn edges are listed too`,
    expect: ['and the wire is not among them'],
  },
  {
    name: 'hidden: one row per REASON again, which made a short list look like a crisis',
    file: 'src/lib/hiddenEdges.ts',
    find: `    const key = \`\${edge.from}>\${edge.to}\`;`,
    with: `    const key = \`\${edge.from}>\${edge.to}>\${edge.via}\`; // control: per reason`,
    expect: ['two reasons for one pair are merged into one row'],
  },
  {
    name: 'hidden: the canonical order is dropped for whatever order they were found in',
    file: 'src/lib/hiddenEdges.ts',
    find: `  links.sort((a, b) => (a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from)));`,
    with: `  // control: no canonical order`,
    expect: ['the order is by pair'],
  },
  {
    name: 'hidden: a setting nobody wrote words for reads as vague instead of unfinished',
    file: 'src/lib/hiddenEdges.ts',
    find: `    return SETTING_WORDS[field] ?? \`a setting (\${field}) points at it\`;`,
    with: `    return SETTING_WORDS[field] ?? 'a setting points at it'; // control: vague`,
    expect: ['a reason nobody wrote words for looks unfinished rather than vague'],
  },
  {
    name: 'hidden: an unknown reason is swallowed rather than passed through',
    file: 'src/lib/hiddenEdges.ts',
    find: `  return via;`,
    with: `  return 'something points at it'; // control: swallowed`,
    expect: ['and an entirely unknown reason is passed through, not swallowed'],
  },
  {
    name: 'hidden: trackedBlockId loses its words, so a field name reaches the panel',
    file: 'src/lib/hiddenEdges.ts',
    find: `  trackedBlockId: 'that block shows it',`,
    with: `  // control: no words for trackedBlockId`,
    expect: ['a setting is named in words, not in field names'],
  },

  // --- the nodes that drew nothing and counted for nothing -------------------
  {
    name: 'nodes: a question stops being a node, so its edges are dropped again',
    file: 'src/lib/pageGraph.ts',
    find: `  for (const q of page.queries ?? []) if (q?.id) nodes.add(\`query:\${q.id}\`);`,
    with: `  // control: a question is not a node`,
    expect: [
      'A QUESTION READING A TABLE DEPENDS ON IT',
      'and on whatever its condition asks about',
      'so they reach the list a person reads',
      'a question reads as a question there, not as a tag',
      'and so is a question drawn from it',
    ],
  },
  {
    name: 'nodes: an action stops being a node',
    file: 'src/lib/pageGraph.ts',
    find: `  for (const a of page.actions ?? []) if (a?.id) nodes.add(\`action:\${a.id}\`);`,
    with: `  // control: an action is not a node`,
    expect: ['AN ACTION DOES TOO', 'and an action as an action'],
  },
  {
    name: 'nodes: anything SHAPED like a question counts, so a typo invents one',
    file: 'src/lib/pageGraph.ts',
    find: `    if (!nodes.has(from) || !nodes.has(to)) return;`,
    with: `    if (!nodes.has(from) && !String(from).includes(':')) return;
    if (!nodes.has(to) && !String(to).includes(':')) return;`,
    expect: ['A QUESTION WITH NO ID IS NOT A NODE'],
  },

  // --- what breaks if this block goes ---------------------------------------
  {
    name: 'breaks: the direction is flipped, so it lists what the block READS',
    file: 'src/lib/blockDependents.ts',
    find: `    if (edge.from !== blockId) continue;`,
    with: `    if (edge.to !== blockId) continue; // control: the wrong direction`,
    expect: [
      'EVERYTHING THAT USES IT IS FOUND',
      'DELETING SOMETHING IT READS IS A DIFFERENT QUESTION',
    ],
  },
  {
    name: 'breaks: the invisible ones stop coming first',
    file: 'src/lib/blockDependents.ts',
    find: `  rows.sort((a, b) =>
    a.drawn === b.drawn ? a.dependent.localeCompare(b.dependent) : (a.drawn ? 1 : -1));`,
    with: `  rows.sort((a, b) => a.dependent.localeCompare(b.dependent)); // control: name only`,
    expect: ['THE INVISIBLE ONES COME FIRST'],
  },
  {
    name: 'breaks: one wire stops being enough to call a dependency visible',
    file: 'src/lib/blockDependents.ts',
    find: `      existing.drawn = existing.drawn || edge.drawn;`,
    with: `      existing.drawn = false; // control: a later reason hides an earlier wire`,
    expect: ['THE INVISIBLE ONES COME FIRST'],
  },
  {
    name: 'breaks: the summary counts everything as visible, so nothing is a surprise',
    file: 'src/lib/blockDependents.ts',
    find: `  const hidden = rows.filter(r => !r.drawn).length;`,
    with: `  const hidden = 0; // control: nothing is hidden`,
    expect: ['the summary counts the hidden ones separately', 'one thing is a thing that USES it'],
  },
  {
    name: 'breaks: the summary says "0 things" instead of saying nothing',
    file: 'src/lib/blockDependents.ts',
    find: `  if (!rows.length) return '';`,
    with: `  // control: no early return`,
    expect: ['and says nothing at all when nothing uses it, rather than saying zero'],
  },

  // --- the delete that left an otherwise pointing at nothing ------------------
  {
    name: 'delete: the otherwise is left pointing at the deleted block',
    file: 'src/lib/blockDependents.ts',
    find: `    if (!steps.some((s: any) => s?.elseTargetId === blockId)) { out.push(w); continue; }`,
    with: `    out.push(w); continue; // control: the otherwise is never cleared`,
    expect: ['BUT A STEP WHOSE OTHERWISE POINTS AT IT IS KEPT, and the otherwise cleared'],
  },
  {
    name: 'delete: an otherwise pointing ANYWHERE is cleared, not only at the deleted block',
    file: 'src/lib/blockDependents.ts',
    find: `      steps: steps.map((s: any) => (s?.elseTargetId === blockId ? { ...s, elseTargetId: undefined } : s)),`,
    with: `      steps: steps.map((s: any) => ({ ...s, elseTargetId: undefined })), // control: clear them all`,
    expect: ['AND THE OTHERWISE BESIDE IT, POINTING SOMEWHERE ELSE, IS LEFT ALONE'],
  },
  {
    name: 'delete: a workflow that starts at the block is kept',
    file: 'src/lib/blockDependents.ts',
    find: `    if (w.sourceId === blockId) continue;`,
    with: `    // control: a workflow starting at it is kept`,
    expect: ['a workflow that STARTS at the deleted block goes', 'and the two that survive are the two that should'],
  },
  {
    name: 'delete: a workflow nobody touched is rebuilt anyway',
    file: 'src/lib/blockDependents.ts',
    find: `    if (!steps.some((s: any) => s?.elseTargetId === blockId)) { out.push(w); continue; }
    out.push({`,
    with: `    out.push({`,
    expect: ['a workflow nobody touched is the SAME object, so nothing re-renders for nothing'],
  },
  {
    name: 'delete: App.tsx goes back to its own hand-rolled copy of the cleanup',
    file: 'src/App.tsx',
    find: `    setWorkflows(prev => workflowsAfterDeleting(prev, blockId))`,
    with: `    setWorkflows(prev => prev.filter(w => w.sourceId !== blockId && !w.steps.some(step => step.targetId === blockId)))`,
    expect: ['AND APP.TSX HAS NO HAND-ROLLED COPY OF IT LEFT', 'it calls the checked one instead, in both places'],
  },

  // --- the port that was missing, and the default that was absurd -----------
  {
    name: 'ports: Live Data loses its input port, so refresh has nowhere to arrive',
    file: 'src/blocks/DataSourceBlock.tsx',
    find: `        data-port-input={blockId}`,
    with: `        data-control-not-a-port={blockId}`,
    expect: [
      'THE BLOCKS YOU CANNOT WIRE INTO ARE THE FOUR THAT SHOULD NOT BE',
      'and Live Data is not one of them any more',
    ],
  },
  {
    name: 'ports: the default action goes back to adding to a text label',
    file: 'src/App.tsx',
    find: `        setAction(holds === 'string' ? 'setText' : holds === 'boolean' ? 'toggle' : 'increment')`,
    with: `        void holds; setAction('increment')`,
    expect: [
      'a target that holds TEXT does not default to adding to it',
      'a yes or no is flipped',
    ],
  },

  // --- the warning before a block is deleted ---------------------------------
  {
    name: 'warn: a question goes back to printing its raw id',
    file: 'src/lib/blockDependents.ts',
    find: `    return \`the question "\${q?.name || (typeof q?.def?.from === 'string' ? q.def.from : '') || 'unnamed'}"\`;`,
    with: `    return id;`,
    expect: [
      'A QUESTION IS NAMED AS A QUESTION, not printed as a tag',
      'a question with no name falls back to the table it reads',
    ],
  },
  {
    name: 'warn: an action does too',
    file: 'src/lib/blockDependents.ts',
    find: `    return \`the action "\${a?.name || 'unnamed'}"\`;`,
    with: `    return id;`,
    expect: ['and an action as an action'],
  },
  {
    name: 'warn: the Health panel goes back to its own copy of the naming',
    file: 'src/components/HealthPanel.tsx',
    find: `  const nameOf = (id: string) => nodeName(id, (blockId) => {`,
    with: `  const nameOf = (id: string) => ((blockId) => {`,
    expect: ['THE HEALTH PANEL USES THE SAME ONE, rather than a second copy'],
  },
  {
    name: 'warn: the Delete key skips the warning and deletes straight away',
    file: 'src/App.tsx',
    find: `          requestDeleteBlock(selectedId)`,
    with: `          deleteBlock(selectedId)`,
    expect: [
      'THE DELETE KEY ASKS FIRST',
      'AND THERE ARE ONLY THE THREE CALLS TO THE UNGUARDED ONE THAT SHOULD EXIST',
    ],
  },
  {
    name: 'warn: the context menu skips it too',
    file: 'src/App.tsx',
    find: `<ContextMenu editor={editor} deleteBlock={requestDeleteBlock} />`,
    with: `<ContextMenu editor={editor} deleteBlock={deleteBlock} />`,
    expect: ['and so does the context menu'],
  },
  {
    name: 'warn: a block nothing depends on is asked about anyway, which trains clicking through',
    file: 'src/App.tsx',
    find: `    if (!breaks.length) { deleteBlock(blockId); return }`,
    with: `    // control: always ask`,
    expect: [
      'a block nothing depends on is deleted without being asked about',
      'AND THERE ARE ONLY THE THREE CALLS TO THE UNGUARDED ONE THAT SHOULD EXIST',
    ],
  },

  // --- the order formulas are worked out in ----------------------------------
  {
    name: 'order: the plan is ignored and the formulas run as declared',
    file: 'src/lib/bindingEngine.ts',
    find: `  for (const binding of plan.order) {`,
    with: `  for (const binding of formulas) {`,
    expect: [
      'and declaring them backwards changes nothing',
      'nor does shuffling them',
    ],
  },
  {
    name: 'order: an answer is not fed forward, so the next formula reads a stale one',
    file: 'src/lib/bindingEngine.ts',
    find: `        scope[binding.targetBlockId] = calculatedValue;`,
    with: `        // control: the next formula reads the old value`,
    expect: ['A CHAIN FOUR DEEP COMES OUT RIGHT, which two passes could not do'],
  },
  {
    name: 'order: a circle shows whatever number it last had, instead of saying so',
    file: 'src/lib/bindingEngine.ts',
    find: `  for (const blockId of plan.inCircle) {`,
    with: `  for (const blockId of []) {`,
    expect: [
      'A BLOCK IN A CIRCLE SHOWS AN ERROR, NOT A NUMBER',
      'and says which kind of stuck it is',
    ],
  },
  {
    name: 'order: a formula naming itself is not treated as a circle',
    file: 'src/lib/formulaOrder.ts',
    find: `      if (targets.has(id)) needs.add(id);`,
    with: `      if (targets.has(id) && id !== f.targetBlockId) needs.add(id);`,
    expect: [
      'a formula reading its OWN answer is a circle of one',
    ],
  },
  {
    name: 'order: ties stop keeping the order they were written in',
    file: 'src/lib/formulaOrder.ts',
    find: `    if (!ready.length) break;`,
    with: `    if (!ready.length) break;
    ready.reverse(); // control: ties come out backwards`,
    expect: ['two formulas that need nothing keep the order they were written in'],
  },

  // --- every reason the graph can give has words for it ----------------------
  {
    name: 'words: a workflow step loses its words, which is how it reached a panel',
    file: 'src/lib/hiddenEdges.ts',
    find: `  step: 'this makes it change',`,
    with: `  // control: no words for a step`,
    expect: ['AND EVERY ONE OF THEM READS AS WORDS, not as its own internal name'],
  },
  {
    name: 'words: the fifth runtime setting loses its words, the way it never had any',
    file: 'src/lib/hiddenEdges.ts',
    find: `  sortDirectionBlockId: 'it sets which way that block sorts',`,
    with: `  // control: no words for the sort direction`,
    expect: ['AND EVERY SETTING A BLOCK CAN POINT THROUGH HAS ITS OWN WORDS'],
  },
  {
    name: 'words: a markup setting loses its words too',
    file: 'src/lib/hiddenEdges.ts',
    find: `  rowHtml: 'the row markup names it',`,
    with: `  // control: no words for the row markup`,
    expect: ['AND EVERY SETTING A BLOCK CAN POINT THROUGH HAS ITS OWN WORDS'],
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

/**
 * A COPY ON DISK, BECAUSE THE HANDLERS BELOW DO NOT ALWAYS GET TO RUN.
 *
 * `openEdits` lives in memory, so the signal handlers can put every file back
 * when this process is asked to stop. They cannot when it is KILLED -- SIGKILL
 * is not catchable, and that is exactly what a wrapper does when a run outlives
 * the time it was given. Twice now that has left a deliberate lie in a source
 * file, and the next `npm run check` read as "the work you just did is broken",
 * which the note at the top of this file calls the most expensive kind of wrong
 * a test tool can be. Being right about it in a comment did not help.
 *
 * So the originals go to disk BEFORE the first edit and are removed only after
 * everything is back. If this file is here when a run starts, the last run did
 * not finish: put the files back, say so, and carry on. A cheap sidecar beats a
 * clever handler, because it does not need this process to be alive.
 */
const RESTORE_FILE = '.control-restore.json';
const rememberOnDisk = () => {
  try { writeFileSync(RESTORE_FILE, JSON.stringify(Object.fromEntries(openEdits), null, 1)); }
  catch { /* the in-memory path is still there */ }
};
const forgetOnDisk = () => { try { if (existsSync(RESTORE_FILE)) unlinkSync(RESTORE_FILE); } catch { /* ignore */ } };

const restoreAll = () => {
  for (const [file, text] of openEdits) {
    try { write(file, text); } catch { /* nothing better to do while dying */ }
  }
  openEdits.clear();
  forgetOnDisk();
};

/**
 * Put back whatever a killed run left behind, before anything else reads it.
 * Deliberately first: the green-tree test below would otherwise report a
 * PREVIOUS run's sabotage as "the tree is not green before we start", which
 * sends somebody looking for a bug that is not there.
 */
if (existsSync(RESTORE_FILE)) {
  let saved = null;
  try { saved = JSON.parse(readFileSync(RESTORE_FILE, 'utf8')); } catch { /* unreadable */ }
  const files = saved ? Object.keys(saved) : [];
  if (files.length) {
    console.log(`the last run did not finish. Putting back ${files.length} file${files.length === 1 ? '' : 's'}:`);
    for (const file of files) {
      try { write(file, saved[file]); console.log(`  restored ${file}`); }
      catch (e) { console.log(`  COULD NOT RESTORE ${file} — ${e && e.message}. Fix it by hand before reading anything below.`); }
    }
  }
  forgetOnDisk();
}
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

/**
 * A WINDOW SHORTER THAN THE RUN.
 *
 * The whole set takes about five minutes, and it is often run somewhere that
 * cuts a command off before then. That is not an inconvenience, it is a
 * correctness problem: a run killed part way through leaves a DELIBERATE LIE in
 * a source file, which is the failure the restore machinery above was written
 * for and which then has to be noticed and undone by hand.
 *
 * So the set can be run in slices that each fit:
 *
 *   node scripts/control.mjs --from=0 --to=45
 *   node scripts/control.mjs --from=45 --to=90
 *
 * Each slice restores the tree and verifies it, exactly as a whole run does.
 * The indexes are into the full list and are printed with each control, so a
 * slice that dies says where to start again.
 */
const args = process.argv.slice(2);
const numArg = (flag) => {
  const hit = args.find(a => a.startsWith(flag));
  return hit === undefined ? undefined : Number(hit.slice(flag.length));
};
const from = numArg('--from=');
const to = numArg('--to=');
if ([from, to].some(n => n !== undefined && !Number.isFinite(n))) {
  console.log('--from and --to take numbers.');
  process.exit(1);
}
const only = args.find(a => !a.startsWith('--'));
const numbered = CONTROLS.map((c, i) => ({ ...c, index: i }));
let chosen = only ? numbered.filter(c => c.name.includes(only)) : numbered;
if (from !== undefined || to !== undefined) {
  chosen = chosen.slice(from ?? 0, to ?? CONTROLS.length);
}
if (!chosen.length) {
  if (from !== undefined || to !== undefined) {
    console.log(`no control in that range. There are ${CONTROLS.length}.`);
  } else {
    console.log(`no control matches "${only}". They are:\n${CONTROLS.map((c, i) => `  ${i}  ${c.name}`).join('\n')}`);
  }
  process.exit(1);
}
console.log(`running ${chosen.length} of ${CONTROLS.length} controls (${chosen[0].index}..${chosen[chosen.length - 1].index})`);

/**
 * Run one control and say what happened, without deciding what it means.
 */
function attempt(control) {
  const edits = [control, ...(control.also ? [control.also] : [])];
  const originals = edits.map(e => [e.file, readFileSync(e.file, 'utf8')]);
  let fresh = false;
  for (const [file, text] of originals) if (!openEdits.has(file)) { openEdits.set(file, text); fresh = true; }
  // On disk BEFORE the edit, or a kill between the two loses the only copy.
  if (fresh) rememberOnDisk();

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

  console.log(`\n[${control.index}] ${control.name}`);
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

/**
 * THE LAST RUN GETS THE SAME PATIENCE THE CONTROLS DO.
 *
 * It did not, and that asymmetry bit on the first full run after it was written:
 * twenty controls all behaved, the tree WAS restored -- `git diff` clean, the
 * suite green by hand a second later -- and this line still printed "the tree
 * did not come back clean, look at it now". The flake documented above, in the
 * one place that was not allowed to retry.
 *
 * That is worse than a flaky control, because it is the line a person reads
 * last and believes: it accuses the restore, which is the one thing here that
 * must never be doubted without cause. So: a run with NO TALLY is retried, the
 * same bounded way. A run with REDS is not -- reds are a real answer, and
 * retrying a red until it goes green is how a flake becomes a habit.
 */
let after = runChecks().match(TALLY);
let restoreRetries = 0;
while (!after && restoreRetries < 3) {
  restoreRetries++;
  after = runChecks().match(TALLY);
}
const restoreNote = restoreRetries ? `  (after ${restoreRetries} retr${restoreRetries === 1 ? 'y' : 'ies'} — the earlier run produced no tally at all)` : '';
console.log(`\nrestored: ${after ? `${after[1]} passed, ${after[2]} failed${restoreNote}` : 'NO TALLY, three times running — the tree did not come back clean, look at it now'}`);

/**
 * The sidecar goes only once the tree has been SEEN to be clean. Deleting it
 * on the way out regardless would throw away the copy that puts the files back,
 * at the one moment it might still be needed.
 */
if (after && Number(after[2]) === 0) { openEdits.clear(); forgetOnDisk(); }
else console.log(`${RESTORE_FILE} is being kept — it holds the originals, and the next run will put them back.`);
if (!after || Number(after[2]) !== 0) process.exit(1);
if (suspicious) {
  console.log(`${suspicious} control${suspicious === 1 ? '' : 's'} did not behave. Each one is a check that is not doing its job.`);
  process.exit(1);
}
console.log('every control was caught by the check that names it.');
