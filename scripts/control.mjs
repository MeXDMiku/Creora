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
    find: `    const rowScope: Record<string, any> = { ...(outer || {}) };`,
    with: `    const rowScope: Record<string, any> = {};`,
    expect: ['PLACES LEFT', 'WHO TEACHES IT', 'AVERAGE RATING'],
  },
  {
    name: 'relation: the invented name goes back to being a fixed one',
    file: 'src/lib/formula.ts',
    find: `  while (where.includes(prefix)) prefix = '_' + prefix;`,
    with: `  // control: no escalation`,
    expect: ['AN INTERNAL NAME LEAKING INTO A CONDITION'],
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
    name: 'the harness itself: a check that throws must be red, not silent',
    file: 'scripts/checks.ts',
    find: `  const card = (row: any, f: string) => ran(() => evaluateExpression(f, { ...row, RowId: row.id }, tables));`,
    with: `  const card = (row: any, f: string) => evaluateExpression(f, { ...row, RowId: row.id }, tables) as any;\n  void 0;`,
    also: {
      file: 'src/lib/formula.ts',
      find: `    const rowScope: Record<string, any> = { ...(outer || {}) };`,
      with: `    const rowScope: Record<string, any> = {};`,
    },
    // Nothing goes red by name -- the point is that the run still ENDS with a
    // countable tally instead of vanishing. See STOPPED EARLY below.
    expect: [],
    wantStoppedEarly: true,
  },
];

const write = (path, text) => {
  writeFileSync(path, text);
  // This working copy is a network mount. Without the flush, the child process
  // below has been observed reading the file as it was BEFORE the edit, which
  // reports a control as green for the one reason that is not about the code.
  const fd = openSync(path, 'r');
  fsyncSync(fd);
  closeSync(fd);
};

const runChecks = () => {
  try {
    return execFileSync('node', ['--experimental-strip-types', '--import', './scripts/register.mjs', 'scripts/checks.ts'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return `${e.stdout || ''}${e.stderr || ''}`;
  }
};

const only = process.argv[2];
const chosen = only ? CONTROLS.filter(c => c.name.includes(only)) : CONTROLS;
if (!chosen.length) {
  console.log(`no control matches "${only}". They are:\n${CONTROLS.map(c => '  ' + c.name).join('\n')}`);
  process.exit(1);
}

let suspicious = 0;
for (const control of chosen) {
  const edits = [control, ...(control.also ? [control.also] : [])];
  const originals = edits.map(e => [e.file, readFileSync(e.file, 'utf8')]);
  let applied = true;
  for (const e of edits) {
    const before = readFileSync(e.file, 'utf8');
    if (!before.includes(e.find)) {
      console.log(`\n${control.name}\n  CANNOT APPLY — the line it breaks is not in ${e.file} any more.`);
      applied = false;
      break;
    }
    write(e.file, before.replace(e.find, e.with));
  }

  if (applied) {
    const out = runChecks();
    const tally = out.match(TALLY);
    const stoppedEarly = out.includes('SUITE STOPPED EARLY');
    const reds = [...out.matchAll(FAIL_LINE)].map(m => m[1].trim());

    console.log(`\n${control.name}`);
    if (!tally) {
      console.log('  NO TALLY AT ALL — the suite did not reach its own last line, and');
      console.log('  nothing here can be read as a pass. First lines of what came back:');
      console.log(out.split('\n').slice(0, 6).map(l => '    ' + l).join('\n'));
      suspicious++;
    } else {
      const [, , failedCount] = tally;
      console.log(`  ${failedCount} failed${stoppedEarly ? '  (SUITE STOPPED EARLY)' : ''}`);
      for (const red of reds.slice(0, 8)) console.log(`    red: ${red}`);
      if (reds.length > 8) console.log(`    …and ${reds.length - 8} more`);

      if (control.wantStoppedEarly) {
        if (!stoppedEarly) { console.log('  ✗ expected the run to be cut short and say so, and it did not.'); suspicious++; }
      } else if (Number(failedCount) === 0) {
        console.log('  ✗ NOTHING WENT RED. The checks do not cover this line — see the note at the top.');
        suspicious++;
      } else {
        const missing = (control.expect || []).filter(want => !reds.some(r => r.includes(want)));
        if (missing.length) {
          console.log(`  ✗ went red, but not where it should: nothing matching ${missing.map(m => `"${m}"`).join(', ')}`);
          suspicious++;
        }
      }
    }
  }

  for (const [file, text] of originals) write(file, text);
}

const after = runChecks().match(TALLY);
console.log(`\nrestored: ${after ? `${after[1]} passed, ${after[2]} failed` : 'NO TALLY — the tree did not come back clean, look at it now'}`);
if (!after || Number(after[2]) !== 0) process.exit(1);
if (suspicious) {
  console.log(`${suspicious} control${suspicious === 1 ? '' : 's'} did not behave. Each one is a check that is not doing its job.`);
  process.exit(1);
}
console.log('every control was caught by the check that names it.');
