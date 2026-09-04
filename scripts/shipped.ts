/**
 * WHAT DID YOU ALREADY SHIP?
 *
 * You hand this a folder. It reads nothing but what is already on disk and already in
 * git, and it tells you what a stranger can have — before anyone runs anything, before
 * anyone logs in, before you have written a single rule.
 *
 * It is the other half of `npm run stranger`. That one asks your live backend what it
 * hands out. This one asks your CODE what it already gave away. Between them:
 *
 *     npm run shipped   what is in the code and in git history        (this file)
 *     npm run stranger  what the live backend hands to a visitor
 *     npm run applied   what is actually installed in the database
 *
 * Three questions, three separate sources of truth, no interpretation step.
 *
 * WHAT THIS COSTS TO RUN: nothing. No API call, no model, no server, no account. It is
 * string matching and `git log`. That matters, because it is the half of "tell a
 * beginner what their code lacks" that can be given away for free forever. Explaining
 * a finding in a beginner's own words, and writing the fix — that is the half that
 * costs money per use, and it is the half the user's own API key should pay for.
 *
 * WHAT THIS IS NOT: it is not a clean bill of health. Every check reports one of five
 * things and NONE of them is "you are secure". The last section of the output lists
 * what was not checked, on purpose, every single run.
 *
 * SAFETY: read-only. It never prints a secret's value — only where it lives, its shape,
 * and its length.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, basename } from 'node:path';

// ---------------------------------------------------------------------------
// vocabulary
// ---------------------------------------------------------------------------

/**
 * FIVE ANSWERS, NOT TWO.
 *
 * The bug this project keeps rediscovering is a tool that only knows "pass" and "fail",
 * so every question it could not answer silently becomes a pass. `npm run sites` claimed
 * for three weeks that no migrations had run, because a hardcoded verdict had no way to
 * say "I did not ask". These five exist so that never happens here.
 */
type Level =
  | 'EXPOSED'   // provable. this is readable by someone who is not you.
  | 'MISSING'   // provable absence. your code relies on X; nothing in this repo provides X.
  | 'DISPUTED'  // your own code says two different things. no file can settle it.
  | 'QUESTION'  // a heuristic fired. might be fine. a person has to look.
  | 'HELD'      // asked, and the answer was good.
  | 'UNKNOWN';  // could not be determined from here. NOT the same as fine.

interface Finding {
  level: Level;
  what: string;
  where: string;
  detail: string;
}

const findings: Finding[] = [];
const say = (level: Level, what: string, where: string, detail: string) =>
  findings.push({ level, what, where, detail });

/** Never print a secret. Print enough to find it and not enough to use it. */
const fingerprint = (s: string) =>
  `${s.slice(0, 6)}…${s.slice(-3)} (${s.length} chars)`;

const git = (...args: string[]): string => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });
  } catch {
    return '';
  }
};

const HAS_GIT = existsSync('.git');

// ---------------------------------------------------------------------------
// which files count as "shipped"
// ---------------------------------------------------------------------------

/**
 * Shipped means: it reaches a machine that is not yours. That is a wider set than most
 * people picture. `src/` is compiled into the bundle. `public/` is served verbatim —
 * every byte of it, whether you linked to it or not. `dist/` is the bundle. And git
 * history is shipped the moment the repo is public or a collaborator clones it, even
 * for files you deleted years ago.
 */
const SHIPPED_ROOTS = ['src', 'public', 'dist', 'index.html', 'supabase'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'coverage']);
const MAX_BYTES = 2 * 1024 * 1024;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (st.size <= MAX_BYTES) out.push(p);
    else out.push(p); // keep the name; contents skipped later
  }
  return out;
}

const files: string[] = [];
for (const root of SHIPPED_ROOTS) {
  if (!existsSync(root)) continue;
  if (statSync(root).isDirectory()) walk(root, files);
  else files.push(root);
}

/**
 * dist/ IS THE SAME CODE TWICE, AND COUNTING IT TWICE IS A LIE.
 *
 * LOG: the first run of this file reported the same three `innerHTML` writes four extra
 * times, because the minified bundle contains the same source. Eight findings, four
 * defects. A tool that inflates its own count is worse than no tool, because the number
 * is the thing people act on.
 *
 * So: the bundle is scanned for SECRETS (a build can bake in a key the source does not
 * literally contain) and for nothing else. Everything else reads the source only — with
 * one exception, marked below, where the bundle knows something the source does not.
 */
const built = (p: string) => p.startsWith('dist');
const source = files.filter((p) => !built(p));

const textOf = (p: string): string => {
  try {
    if (statSync(p).size > MAX_BYTES) return '';
    return readFileSync(p, 'utf8');
  } catch { return ''; }
};

// ---------------------------------------------------------------------------
// 1. secrets that shipped
// ---------------------------------------------------------------------------

/**
 * These shapes are chosen because each one is self-identifying: the string itself says
 * what it is. No entropy guessing, no false-positive tuning. If `sb_secret_` appears in
 * a file that ships, that is not a suspicion.
 */
const SECRET_SHAPES: { name: string; re: RegExp; why: string }[] = [
  { name: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_\-]{10,}/g,
    why: 'bypasses every row-level security policy you will ever write' },
  { name: 'OpenAI key', re: /\bsk-[A-Za-z0-9_\-]{20,}/g, why: 'billable to you, by anyone' },
  { name: 'Google API key', re: /\bAIza[A-Za-z0-9_\-]{30,}/g, why: 'billable to you, by anyone' },
  { name: 'GitHub token', re: /\b(?:ghp_|gho_|ghu_|ghs_|github_pat_)[A-Za-z0-9_]{20,}/g,
    why: 'write access to your repositories' },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/g, why: 'your AWS account' },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9\-]{10,}/g, why: 'reads your workspace' },
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    why: 'whatever it signs or decrypts' },
];

/** A JWT that says role=service_role is the single most expensive thing to leak. */
function jwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch { return null; }
}

let secretsFound = 0;
for (const f of files) {
  const body = textOf(f);
  if (!body) continue;
  const lines = body.split('\n');

  for (const shape of SECRET_SHAPES) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(shape.re);
      if (!m) continue;
      secretsFound++;
      say('EXPOSED', `${shape.name} is in a file that ships`,
        `${f}:${i + 1}`,
        `${fingerprint(m[0])} — ${shape.why}. Rotate it first, then remove it. Removing it without rotating it does nothing: it is already in git history and in anyone's cache.`);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    for (const tok of lines[i].match(/\bey[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g) ?? []) {
      const role = jwtRole(tok);
      if (role && role !== 'anon') {
        secretsFound++;
        say('EXPOSED', `a JWT with role="${role}" is in a file that ships`,
          `${f}:${i + 1}`,
          `${fingerprint(tok)} — service_role ignores every policy in your database. This is the worst single finding this tool can produce.`);
      }
    }
  }
}
if (secretsFound === 0) {
  say('HELD', 'no self-identifying secret found in shipped files',
    `${files.length} files under ${SHIPPED_ROOTS.join(', ')} (the built bundle included)`,
    'This checks for key shapes that name themselves. A password sitting in a variable called `x` would not be caught — see the last section.');
}

// ---------------------------------------------------------------------------
// 2. git history: the mistake that does not go away when you delete the file
// ---------------------------------------------------------------------------

if (HAS_GIT) {
  const everAdded = new Set(
    git('log', '--all', '--pretty=format:', '--name-only', '--diff-filter=A')
      .split('\n').map((s) => s.trim()).filter(Boolean));

  const risky = [...everAdded].filter((p) => {
    const b = basename(p);
    return /^\.env($|\.)/.test(b) || /\.(pem|key|p12|pfx)$/.test(b) ||
      /(credential|secret)s?\.(json|ya?ml|txt)$/i.test(b);
  });

  if (risky.length) {
    say('EXPOSED', `${risky.length} secret-shaped file(s) were committed at some point`,
      risky.slice(0, 8).join(', '),
      'Deleting a file does not remove it from history. Anyone who has ever cloned this repo still has these. Treat every value inside them as public and rotate it.');
  } else {
    say('HELD', 'no .env or key file was ever committed', 'full git history',
      'Checked every commit on every branch for files ADDED with those names.');
  }

  const tracked = new Set(git('ls-files').split('\n').filter(Boolean));
  const ignoredButTracked = [...tracked].filter((p) => {
    const b = basename(p);
    return /^\.env($|\.)/.test(b) || p.startsWith('dist/');
  });
  if (ignoredButTracked.length) {
    say('EXPOSED', 'files are listed in .gitignore but are still tracked',
      ignoredButTracked.slice(0, 8).join(', '),
      '.gitignore only stops UNtracked files. Once a file is tracked, git keeps committing it and ignoring the rule. `git rm --cached <file>` is the fix.');
  }

  const gi = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf8') : '';
  for (const want of ['.env', 'node_modules', 'dist']) {
    if (!gi.split('\n').some((l) => l.trim().replace(/\/$/, '') === want || l.trim().startsWith(want)))
      say('QUESTION', `.gitignore does not mention "${want}"`, '.gitignore',
        'Not automatically wrong — but it is how the file above gets committed by accident next week.');
  }
} else {
  say('UNKNOWN', 'no git repository here', '.', 'History checks were skipped entirely. This is not a pass.');
}

// ---------------------------------------------------------------------------
// 3. public/ is not a folder. it is a website.
// ---------------------------------------------------------------------------

if (existsSync('public')) {
  const pub = walk('public');
  const odd = pub.filter((p) => /\.(sql|md|env|bak|old|zip|tar|gz|csv|db|sqlite|log|txt)$/i.test(p));
  if (odd.length)
    say('QUESTION', `${odd.length} non-asset file(s) sit in public/`, odd.slice(0, 8).join(', '),
      'Everything in public/ is served at a guessable URL whether or not you linked to it. Nobody has to find a link.');
  else
    say('HELD', 'public/ contains only ordinary assets', `${pub.length} files`, '');
}

if (existsSync('dist')) {
  const maps = walk('dist').filter((p) => p.endsWith('.map'));
  if (maps.length)
    say('QUESTION', `${maps.length} source map(s) in dist/`, maps.slice(0, 4).join(', '),
      'A source map reconstructs your original, uncommented source in any browser devtools. Fine if you meant it; a surprise to most people.');
}

// ---------------------------------------------------------------------------
// 4. the real one: tables your code touches, versus rules this repo contains
// ---------------------------------------------------------------------------

/**
 * This is the check nothing else does, and it is the whole product in miniature.
 *
 * A beginner's frontend says `.from('profiles')`. That line is a CLAIM: "there is a
 * table called profiles and I am allowed to read it." Nothing in their editor, their
 * linter, their type checker or their AI assistant ever compares that claim against
 * the rules their database actually has. So the claim goes unexamined until a stranger
 * makes the same request and it succeeds.
 *
 * Here we extract every table the code touches, then read every migration in the repo
 * and see which of those tables anybody remembered to protect.
 */
const tablesIn = (list: string[]) => {
  const found = new Map<string, string>();
  for (const f of list) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f)) continue;
    const body = textOf(f);
    if (!body) continue;
    for (const m of body.matchAll(/\.from\(\s*['"`]([A-Za-z0-9_]+)['"`]/g))
      if (!found.has(m[1])) found.set(m[1], f);
  }
  return found;
};

/**
 * THE ONE PLACE THE BUNDLE IS ALLOWED TO SPEAK.
 *
 * A table name your source builds dynamically — `.from(cfg.table)` — is invisible to
 * every scanner that reads source, and perfectly visible in the bundle, where the
 * compiler has already resolved it. Reading only source is how a scanner misses the
 * table that matters. So both are read, source wins on attribution, and anything the
 * bundle knows alone is labelled as such rather than quietly presented as source.
 */
const touched = new Map<string, string>();
for (const [t, w] of tablesIn(source)) touched.set(t, w);
for (const [t, w] of tablesIn(files.filter(built)))
  if (!touched.has(t))
    touched.set(t, `${w}  <- found in the BUILT bundle only; your source never spells this name out`);

const sqlFiles = existsSync('supabase')
  ? walk('supabase').filter((p) => p.endsWith('.sql')).map((p) => ({ path: p, text: textOf(p) }))
  : [];
const sql = sqlFiles.map((f) => f.text).join('\n');

const rlsOn = new Set<string>();
for (const m of sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+enable\s+row\s+level\s+security/gi))
  rlsOn.add(m[1].toLowerCase());
const hasPolicy = new Set<string>();
for (const m of sql.matchAll(/create\s+policy[\s\S]{0,200}?\s+on\s+(?:public\.)?"?([a-z0-9_]+)"?/gi))
  hasPolicy.add(m[1].toLowerCase());

/**
 * SECURITY DEFINER: THE DOOR BESIDE THE DOOR.
 *
 * A SECURITY DEFINER function runs as the user who CREATED it. Row-level security does
 * not apply inside it. Every policy you wrote is bypassed, by design. The WHERE clause
 * in that function body IS your access rule now — written in a place no policy checker
 * looks, guarding a table every scanner will happily report as protected.
 *
 * LOG, and this is the important one. The first run of this section reported
 * `list_pages()` as wide open, quoting `supabase/schemas/prod.sql`. Then it reported
 * `save_page()` as merely worth a look, because it has a WHERE. Both were wrong, in
 * opposite directions, and each mistake is worth more than the check that made it:
 *
 *   1. prod.sql is a DUMP captured 10 Aug. Migration 0001 replaced that function with
 *      an owner-aware one. The tool read the older file and reported a hole that had
 *      been closed. It remembered instead of asking — the exact sin `npm run applied`
 *      exists to prevent, committed by the tool written to prevent it.
 *
 *   2. `where id = p_id` filters by a value THE CALLER PASSED IN. That is a lookup, not
 *      a permission. If anything hands out ids — and `list_pages()` does — then a
 *      filter on a supplied id stops nobody.
 *
 * So this section now does three things instead of one: it grades the guard by whether
 * the function consults the CALLER'S IDENTITY rather than merely having a WHERE; it
 * treats the newest migration as authoritative over a dump; and when two files define
 * the same function differently, it refuses to pick a winner and says so.
 */

const FN = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([^)]*)\)([\s\S]*?)\$(function|)\$([\s\S]*?)\$\4\$/gi;

/**
 * THREE KINDS OF SQL FILE, AND ONLY TWO OF THEM ARE WITNESSES.
 *
 * LOG: this section first reported `list_database_rows()` as "defined 5 times and the
 * definitions disagree — RUN_ALL_MIGRATIONS.sql vs RUN_ALL_MIGRATIONS.sql". That is not
 * a disagreement. It is one file containing the migrations in order, where a later one
 * legitimately supersedes an earlier one, being read as five independent opinions.
 *
 *   intent   — supabase/migrations/*.sql. Runs in order; the last one wins.
 *   snapshot — a dump of the live database. A photograph, with a date on it.
 *   derived  — a concatenation of the above. Never a witness to anything.
 *
 * A real disagreement is a SNAPSHOT that shows something different from what the
 * MIGRATIONS intend. Then the photograph and the plan do not match, and no file on disk
 * can tell you which one your database is running right now.
 */
const kindOf = (path: string): 'snapshot' | 'intent' | 'derived' =>
  /schemas|dump/i.test(path) ? 'snapshot' : path.includes('migrations') ? 'intent' : 'derived';

interface Def { path: string; text: string; definer: boolean }
/** name -> path -> the LAST definition in that file, because SQL runs top to bottom. */
const defs = new Map<string, Map<string, Def>>();
for (const f of sqlFiles)
  for (const m of f.text.matchAll(FN)) {
    const name = m[1].toLowerCase();
    if (!defs.has(name)) defs.set(name, new Map());
    defs.get(name)!.set(f.path, { path: f.path, text: m[3] + m[5], definer: /security\s+definer/i.test(m[3]) });
  }

/** Migrations run in order and the last one wins. A dump only speaks if nothing else does. */
const authoritative = (byPath: Map<string, Def>): Def => {
  const intent = [...byPath.values()].filter((d) => kindOf(d.path) === 'intent')
    .sort((a, b) => a.path.localeCompare(b.path));
  if (intent.length) return intent[intent.length - 1];
  const snap = [...byPath.values()].find((d) => kindOf(d.path) === 'snapshot');
  return snap ?? [...byPath.values()][0];
};

const anonMayRun = new Set<string>();
for (const m of sql.matchAll(/grant\s+execute\s+on\s+function\s+(?:public\.)?"?([a-z0-9_]+)"?[^;]*?\bto\b([^;]*);/gi))
  if (/\banon\b/i.test(m[2])) anonMayRun.add(m[1].toLowerCase());

/**
 * WHO IS ASKING? A guard that never consults the caller is not a guard.
 * `where owner_id = auth.uid()` is a permission. `where id = p_id` is a SELECT.
 *
 * LOG: the version before this one graded `save_page()` as "a WHERE clause, and it is
 * not a permission". It is a permission — the first line of its body is
 * `if not public.can_edit_page(p_id) then raise`. The check was one function call away
 * and the tool could only see one level. It would have sent a beginner to "fix" code
 * that was already right, which is worse than missing a finding: it spends the only
 * thing a security tool has, which is being believed.
 *
 * So the guard now follows calls into functions this repo also defines, two deep, and
 * reports WHICH function is doing the guarding — because from that moment on, that
 * delegate is the thing whose correctness matters.
 */
const IDENTITY = /auth\.uid\(\)|auth\.jwt\(\)|auth\.role\(\)|current_setting\(|\bcurrent_user\b|\bsession_user\b/i;
const SQL_WORDS = new Set(['select','where','values','set','coalesce','count','now','exists','jsonb_build_object','to_jsonb','array_agg','raise','if','and','or','not','using','order','from','into','update','insert','delete','case','when','then','else','end','returns','table','gen_random_uuid','nullif','greatest','least']);

interface Verdict { kind: 'identity' | 'lookup' | 'none'; via?: string }
function guardOf(body: string, seen = new Set<string>()): Verdict {
  if (IDENTITY.test(body)) return { kind: 'identity' };
  if (seen.size < 2)
    for (const m of body.matchAll(/\b(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
      const callee = m[1].toLowerCase();
      if (SQL_WORDS.has(callee) || seen.has(callee) || !defs.has(callee)) continue;
      const next = new Set(seen); next.add(callee);
      const r = guardOf(authoritative(defs.get(callee)!).text, next);
      if (r.kind === 'identity') return { kind: 'identity', via: r.via ?? callee };
    }
  return { kind: /\bwhere\b/i.test(body) ? 'lookup' : 'none' };
}

/**
 * A FUNCTION THAT RETURNS A BOOLEAN IS NOT A FAUCET.
 *
 * LOG: `get_collection_private()` was reported as "consults nobody — if it returns rows,
 * it returns everyone's". It returns `boolean`. The worst a stranger learns from it is
 * whether a given block is marked private, which is disclosure, not a breach. Grading
 * every unguarded function the same way is how a report trains its reader to skim.
 */
const returnsData = (text: string) =>
  /returns\s+(?:setof\s+)?(?:table\s*\(|setof|jsonb|json\b|record\b|text\s*\[|uuid\s*\[|[a-z_]+\s*\[)/i.test(text);

const tablesIn2 = (body: string): string[] => {
  const out = new Set<string>();
  for (const m of body.matchAll(/\b(?:from|join|update|into)\s+(?:public\.)?"?([a-z0-9_]+)"?/gi))
    if (!SQL_WORDS.has(m[1].toLowerCase())) out.add(m[1].toLowerCase());
  return [...out];
};

const disputes: { name: string; win: string; snap: string; migrationStronger: boolean }[] = [];
const guardedByFunction = new Map<string, string[]>();
const givers = new Map<string, string[]>();   // anon-callable reader, no identity -> tables
const takers = new Map<string, string[]>();   // anon-callable writer, no identity -> tables

for (const [name, byPath] of defs) {
  const win = authoritative(byPath);
  if (!win.definer) continue;

  for (const t of tablesIn2(win.text)) {
    const l = guardedByFunction.get(t) ?? [];
    if (!l.includes(name)) l.push(name);
    guardedByFunction.set(t, l);
  }

  // does the photograph disagree with the plan? collected, not announced — see below.
  const snap = [...byPath.values()].find((d) => kindOf(d.path) === 'snapshot');
  if (snap && snap.path !== win.path && guardOf(snap.text).kind !== guardOf(win.text).kind)
    disputes.push({ name, win: win.path, snap: snap.path,
      migrationStronger: guardOf(win.text).kind === 'identity' });

  if (!anonMayRun.has(name)) continue;
  const g = guardOf(win.text);
  const writes = /\b(update|insert|delete)\b/i.test(win.text);

  if (g.kind === 'identity')
    say('HELD', g.via ? `${name}() checks who is asking, through ${g.via}()` : `${name}() checks who is asking`,
      win.path,
      g.via ? `Your real access rule here lives inside ${g.via}(). That function is the thing worth reviewing — it guards every caller of ${name}(), and it sits somewhere no policy checker looks.`
            : 'It consults the caller’s identity. Whether that is the RIGHT check, this tool cannot say — only that a check exists.');
  else if (!writes && !returnsData(win.text))
    say('QUESTION', `${name}() answers anyone, but only with a yes or no`, win.path,
      'No identity check, and it ignores every policy — but it returns a single value rather than rows. A stranger learns a fact about your data, not the data. Worth knowing; not the same as an open table.');
  else if (g.kind === 'lookup') {
    takers.set(name, tablesIn2(win.text));
    say('MISSING', `${name}() has a WHERE clause, and it is not a permission`, win.path,
      'Anyone may run it, it ignores every policy, and it filters only by values the CALLER passed in — with no identity check here or in anything it calls. That is a lookup. If anything hands out ids, this stops nobody.');
  } else {
    if (writes) takers.set(name, tablesIn2(win.text)); else givers.set(name, tablesIn2(win.text));
    say('MISSING', `${name}() consults nobody`, win.path,
      'Anyone may run it, it ignores every policy, and no identity check was found in it or in anything it calls. It returns rows, so it returns everyone’s.');
  }
}

/**
 * EIGHT LINES, ONE FACT.
 *
 * LOG: this reported the same disagreement once per function — eight entries, all with
 * identical text and an identical remedy, all caused by a single schema dump taken
 * before the migrations ran. Repeating one fact until it looks like eight is the same
 * inflation as counting the bundle twice, wearing a suit.
 *
 * The finding is about the PAIR OF FILES, not about each function. So it is said once,
 * with the roll call underneath it.
 */
for (const snapPath of new Set(disputes.map((d) => d.snap))) {
  const group = disputes.filter((d) => d.snap === snapPath);
  const stronger = group.filter((d) => d.migrationStronger).length;
  say('DISPUTED',
    `${snapPath} disagrees with your migrations about ${group.length} function${group.length === 1 ? '' : 's'}`,
    group.map((d) => `${d.name}()`).join(', '),
    `${stronger === group.length
        ? 'In every case the migration checks the caller and the dump does not — which is what a dump taken BEFORE those migrations ran would look like.'
        : `${stronger} of ${group.length} are stronger in the migrations; the rest are stronger in the dump, which is harder to explain and worth looking at first.`
      } A dump is a photograph with a date on it; a migration is an intention. Neither is the running system. Nothing on disk can settle which of these answered the last real request — only the backend can. Run \`npm run stranger\`, and re-take the dump afterwards so this file stops arguing with itself.`);
}

/**
 * THE CHAIN, AND ONLY WHEN IT IS ONE.
 *
 * LOG: the first version paired every giver with every taker and turned one finding into
 * six alarming lines, including pairs touching entirely different tables. A chain is only
 * a chain if both ends reach the SAME table. Anything looser is a tool inflating itself.
 */
for (const [giver, gt] of givers)
  for (const [taker, tt] of takers) {
    const shared = gt.filter((t) => tt.includes(t));
    if (!shared.length) continue;
    say('EXPOSED', `${giver}() hands out ${shared.join(', ')} ids that ${taker}() will accept from anyone`,
      'supabase/ (both SECURITY DEFINER, both granted to anon)',
      'Each is one line in a report and neither looks urgent alone. Together they are a door: list the ids, then use one. Neither end asks who is calling. This is why a list of findings is not an assessment.');
  }

if (touched.size === 0) {
  say('UNKNOWN', 'no table access found in the frontend', 'src/',
    'Either this frontend does not talk to a database directly, or it does so in a way this pattern does not see.');
} else if (!sql) {
  say('UNKNOWN', `${touched.size} table(s) are read by the frontend; no SQL in this repo to compare against`,
    [...touched.keys()].join(', '),
    'The rules may exist and live somewhere else. This tool cannot tell from here — run `npm run stranger` and let the live backend answer instead.');
} else {
  for (const [table, where] of touched) {
    const t = table.toLowerCase();
    if (rlsOn.has(t) && hasPolicy.has(t))
      say('HELD', `${table}: row-level security enabled and at least one policy written`, where, '');
    else if (rlsOn.has(t) && guardedByFunction.has(t))
      say('HELD', `${table}: locked to everyone, and opened only by ${guardedByFunction.get(t)!.join(', ')}()`, where,
        'Deny-all plus SECURITY DEFINER functions is a deliberate pattern, not a mistake. Your access rules for this table live in those function bodies — graded above, not here.');
    else if (rlsOn.has(t))
      say('MISSING', `${table}: security is ON but this repo writes no policy for it`, where,
        'RLS with no policy denies everything — which is safe, and is usually not what was intended. Expect the feature using this table to be silently broken.');
    else if (hasPolicy.has(t))
      say('MISSING', `${table}: a policy is written but row-level security is never enabled`, where,
        'This is the worst combination, because it LOOKS protected in code review. An unenabled policy is a comment. Every row is public.');
    else
      say('MISSING', `${table}: your frontend reads it, and nothing in this repo protects it`, where,
        'No `enable row level security`, no `create policy`. If that is also true in the live database, every row is readable by anyone holding the key your site already ships.');
  }
}

// ---------------------------------------------------------------------------
// 5. gates that only exist in the interface
// ---------------------------------------------------------------------------

/**
 * A beginner writes `{isAdmin && <DeleteButton/>}` and believes they have built a
 * permission. They have built a decoration: the button is hidden, the request is not.
 * We cannot prove the gate is fake, so this reports as a QUESTION and names the word
 * to search the SQL for.
 */
const GATE_WORDS = ['isAdmin', 'is_admin', 'isOwner', 'is_owner', 'role ===', "role =='", 'isPro', 'canEdit'];
const gates = new Map<string, string>();
for (const f of source) {
  if (!/\.(tsx|jsx|ts|js)$/.test(f)) continue;
  const body = textOf(f);
  for (const w of GATE_WORDS)
    if (body.includes(w) && !gates.has(w)) gates.set(w, f);
}
for (const [w, where] of gates) {
  const stem = w.replace(/[^a-z_]/gi, '').toLowerCase();
  if (sql && !sql.toLowerCase().includes(stem))
    say('QUESTION', `"${w}" decides what the interface shows, and appears nowhere in your SQL`, where,
      'Hiding a button does not stop the request behind it. If this permission is not also written as a database rule, it is decoration.');
}

// ---------------------------------------------------------------------------
// 6. html injection surface
// ---------------------------------------------------------------------------

let inject = 0;
for (const f of source) {
  if (!/\.(tsx|jsx|ts|js|html)$/.test(f)) continue;
  const lines = textOf(f).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/dangerouslySetInnerHTML/.test(l) || /\.innerHTML\s*=\s*[^'"`]/.test(l)) {
      inject++;
      say('QUESTION', 'raw HTML is written into the page', `${f}:${i + 1}`,
        'Safe if the value can never come from a user. If it can, this is how someone runs their script in your visitors’ browsers.');
    }
  }
}
if (inject === 0) say('HELD', 'no raw-HTML insertion found', 'src/, index.html', '');

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const ORDER: Level[] = ['EXPOSED', 'DISPUTED', 'MISSING', 'QUESTION', 'UNKNOWN', 'HELD'];
const MARK: Record<Level, string> = {
  EXPOSED: 'TAKEN   ', DISPUTED: 'DISPUTED', MISSING: 'MISSING ', QUESTION: 'LOOK    ',
  UNKNOWN: 'NOT ASKED', HELD: 'held    ',
};

console.log('\n' + '='.repeat(78));
console.log('  WHAT YOU ALREADY SHIPPED');
console.log('  read from the code and from git history. nothing was run, nothing was sent.');
console.log('='.repeat(78));

for (const level of ORDER) {
  const group = findings.filter((f) => f.level === level);
  if (!group.length) continue;
  console.log('');
  for (const f of group) {
    console.log(`  ${MARK[level]}  ${f.what}`);
    if (f.where) console.log(`              ${f.where}`);
    if (f.detail) console.log(`              ${f.detail}`);
    console.log('');
  }
}

const n = (l: Level) => findings.filter((f) => f.level === l).length;
console.log('='.repeat(78));
console.log(`  ${n('EXPOSED')} already taken   ${n('DISPUTED')} disputed   ${n('MISSING')} unprotected   ${n('QUESTION')} to look at   ${n('UNKNOWN')} not asked   ${n('HELD')} held`);
console.log('='.repeat(78));

/**
 * THIS SECTION PRINTS EVERY RUN, INCLUDING A RUN WHERE EVERYTHING PASSED.
 * A security tool that goes quiet when it finds nothing has taught its user that
 * silence means safety. It does not. It means this list.
 */
console.log(`
  WHAT THIS DID NOT CHECK — every run, on purpose

    - whether the live database agrees with the SQL in this repo   -> npm run applied
    - what the live backend actually hands a visitor               -> npm run stranger
    - secrets that do not announce themselves (a password in a variable named \`x\`)
    - logic bugs, race conditions, anything about correctness
    - your dependencies, your CI, your hosting, your DNS
    - whether a policy that exists is CORRECT, only that it exists
    - whether a SECURITY DEFINER function's WHERE clause is the RIGHT one

  A finding here is a fact. The absence of a finding is not.
`);
