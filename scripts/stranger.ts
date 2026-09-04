/**
 * WHAT CAN A COMPLETE STRANGER ACTUALLY GET?
 *
 * This is the product, in its smallest honest form.
 *
 * It does not read your configuration. It behaves. It arrives with nothing but the
 * anon key that is already in your published frontend — the same key any visitor's
 * browser has — and then it tries to take things.
 *
 * Whatever comes back, came back to a stranger. There is no interpretation step and no
 * judgement call: a row that arrives here is a row on the internet.
 *
 * WHY THIS AND NOT A CONFIG SCANNER
 * Supabase already ships a config scanner. It reads settings and reports known-bad
 * ones. That is useful and it is not this. A policy that DENIES correctly and a policy
 * that is SILENTLY BROKEN produce byte-identical configuration — the difference only
 * appears when somebody asks. So we ask.
 *
 * SAFETY
 * Read-only. No inserts, no updates, no deletes, no service key. It uses the public
 * key your frontend already ships to every visitor, and does nothing a visitor could
 * not do by opening the network tab.
 */

import { readFileSync } from 'node:fs';

interface Finding {
  severity: 'open' | 'closed' | 'unknown';
  what: string;
  detail: string;
}

function credentials() {
  const raw = readFileSync('.env.local', 'utf8');
  const get = (k: string) => raw.split('\n').find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim();
  const url = get('VITE_SUPABASE_URL'); const key = get('VITE_SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('.env.local needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  return { url: url.replace(/\/$/, ''), key };
}

const { url, key } = credentials();

// TWO KEY FORMATS, AND GETTING IT WRONG LOOKS EXACTLY LIKE BEING LOCKED OUT.
//
// LOG: the first run of this file returned 401 against a project whose policies were
// fine. The cause was here, not there. Supabase's legacy anon key is a JWT and is sent
// BOTH as `apikey` and as `Authorization: Bearer`. The newer `sb_publishable_` key is
// not a JWT, and sending it as a Bearer token is rejected outright.
//
// supabase-js handles this, which is why the app worked while this did not — a good
// argument for not hand-rolling the client, and a good reminder that "access denied"
// and "you asked wrongly" are different facts that arrive as the same status code.
const isJwt = key.startsWith('ey');
const H: Record<string, string> = isJwt
  ? { apikey: key, Authorization: `Bearer ${key}` }
  : { apikey: key };

/** Turn whatever came back into something a person can read. Never "[object Object]". */
function readable(body: any): string {
  if (body == null) return '(empty response)';
  if (typeof body === 'string') return body.slice(0, 300);
  if (typeof body === 'object') {
    const m = body.message ?? body.msg ?? body.error_description ?? body.error;
    const hint = body.hint ? ` (hint: ${body.hint})` : '';
    const code = body.code ? ` [${body.code}]` : '';
    if (m) return `${m}${code}${hint}`;
    return JSON.stringify(body).slice(0, 300);
  }
  return String(body).slice(0, 300);
}

async function GET(path: string) {
  try {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers: H });
    const text = await r.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch { /* not json */ }
    return { ok: r.ok, status: r.status, body };
  } catch (e: any) {
    return { ok: false, status: 0, body: e?.message ?? String(e) };
  }
}

const findings: Finding[] = [];
const add = (severity: Finding['severity'], what: string, detail: string) =>
  findings.push({ severity, what, detail });

console.log('\n  arriving as a total stranger, with only the key your frontend already ships\n');

// --- what tables even exist? ------------------------------------------------
const spec = await GET('');
if (!spec.ok) {
  console.log(`  Could not reach the backend — HTTP ${spec.status || 'no response'}`);
  console.log(`  It said: ${readable(spec.body)}`);
  console.log(`  Key format detected: ${isJwt ? 'legacy JWT anon key' : 'new sb_publishable key'}`);
  if (spec.status === 401) {
    console.log('');
    console.log('  A 401 here is almost never your policies — it is the key being wrong or expired.');
    console.log('  Check Supabase > Project Settings > API Keys, and that .env.local matches.');
  }
  console.log('  That is not a pass and it is not a fail. Nothing was learned.\n');
  process.exit(0);
}
const paths = Object.keys(spec.body?.paths ?? {});
const tables = paths.filter((p) => p !== '/' && !p.startsWith('/rpc/')).map((p) => p.slice(1));
const rpcs = paths.filter((p) => p.startsWith('/rpc/')).map((p) => p.slice(5));

console.log(`  the backend exposes ${tables.length} table(s) and ${rpcs.length} function(s) to anonymous callers\n`);

// --- can a stranger read the rows? -----------------------------------------
for (const t of tables) {
  const r = await GET(`${t}?select=*&limit=3`);
  if (r.ok && Array.isArray(r.body) && r.body.length > 0) {
    const cols = Object.keys(r.body[0]);
    add('open', `${t} — a stranger can read the rows`,
      `${r.body.length} row(s) came back with no login at all. Columns visible: ${cols.slice(0, 8).join(', ')}` +
      `${cols.length > 8 ? ` and ${cols.length - 8} more` : ''}. If any of that is meant to be private, it is not.`);
  } else if (r.ok && Array.isArray(r.body)) {
    add('closed', `${t} — nothing came back`,
      'Either the table is empty or a policy is withholding it. From out here those look identical, ' +
      'which is why this needs a second run with a real signed-in account to tell them apart.');
  } else {
    add('closed', `${t} — refused (${r.status})`, readable(r.body));
  }
}

// --- which functions will talk to a stranger? -------------------------------
if (rpcs.length) {
  add(rpcs.length > 0 ? 'unknown' : 'closed', `${rpcs.length} function(s) are callable by anonymous visitors`,
    rpcs.join(', ') + '. Being callable is not the same as being unsafe — each one decides for itself. ' +
    'But every one of them is a door that exists on the public internet.');
}

// --- report -----------------------------------------------------------------
const open = findings.filter((f) => f.severity === 'open');
const shut = findings.filter((f) => f.severity === 'closed');
const unk  = findings.filter((f) => f.severity === 'unknown');

for (const f of [...open, ...unk, ...shut]) {
  const tag = { open: 'READABLE', closed: '  CLOSED', unknown: ' UNKNOWN' }[f.severity];
  console.log(`  [${tag}]  ${f.what}`);
  console.log(`             ${f.detail}\n`);
}

console.log('  ' + '-'.repeat(70));
if (open.length) {
  console.log(`  ${open.length} thing(s) a stranger could read. Whether that is wrong is your call —`);
  console.log('  but it is now a fact rather than an assumption.');
} else {
  console.log('  Nothing came back to a stranger.');
}
console.log(`  ${shut.length} refused or empty, ${unk.length} could not be judged from out here.\n`);
