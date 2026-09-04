/**
 * WHICH MIGRATIONS ARE ACTUALLY APPLIED — asked, not remembered.
 *
 * WHY THIS FILE EXISTS
 * `npm run sites` reported "8 written, needs a migration run" for days after all ten
 * migrations had been applied. It was not wrong about the code; it was reciting a
 * hardcoded verdict. The scorecard whose job is to tell the truth about this product
 * was itself a memory rather than a check.
 *
 * That is the whole thesis in miniature, found in our own repo: a claim about a system
 * outliving the last time anybody verified it, with nothing anywhere that would notice.
 *
 * THREE ANSWERS, NEVER TWO
 *
 *   applied      the backend answers to something only this migration creates
 *   absent       it is reachable and that thing is not there
 *   unknown      we could not ask
 *
 * The third is the one that matters and the one every tool gets wrong. "Could not
 * reach the database" must never render as "fine" and must never render as "broken" —
 * both are claims we did not earn. A missing answer is its own answer.
 *
 * HOW IT ASKS
 * One read-only GET to PostgREST's OpenAPI document, which lists every RPC the anon
 * role can see. No writes, no side effects, no service key, nothing that can damage
 * anything. If a migration's function is in that list, the migration ran.
 */

import { readFileSync } from 'node:fs';

export type Standing = 'applied' | 'absent' | 'unknown';

export interface MigrationState {
  id: string;
  what: string;
  standing: Standing;
  why: string;
}

/** What each migration creates that is visible from outside, with the anon key. */
const FINGERPRINTS: Array<{ id: string; what: string; fn?: string; note?: string }> = [
  { id: '0001', what: 'identity and ownership', fn: 'can_edit_page' },
  { id: '0002', what: 'the orphan-claiming door is closed', fn: 'claim_orphan_pages', note: 'inverted' },
  { id: '0003', what: 'publish state', fn: 'get_page' },
  { id: '0004', what: 'per-visitor rows — hiding becomes withholding', fn: 'update_my_database_row' },
  { id: '0005', what: 'deleting a page', fn: 'delete_page' },
  { id: '0006', what: 'two tabs cannot overwrite each other', fn: 'save_page_if_unchanged' },
  // 0007-0010 are triggers and policies. A trigger is not an RPC, so it is not visible
  // from outside with an anon key. Saying so is the point: this file reports what it
  // can see and refuses to guess about the rest.
  { id: '0007', what: 'row limits', note: 'trigger — not visible from outside' },
  { id: '0008', what: 'a slot cannot be booked twice', note: 'trigger — not visible from outside' },
  { id: '0009', what: 'a form cannot write any shape it likes', note: 'trigger — not visible from outside' },
  { id: '0010', what: 'live changes', note: 'trigger and policy — not visible from outside' },
];

function credentials(): { url: string; key: string } | null {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    const get = (k: string) => raw.split('\n').find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim();
    const url = get('VITE_SUPABASE_URL');
    const key = get('VITE_SUPABASE_ANON_KEY');
    if (!url || !key) return null;
    return { url: url.replace(/\/$/, ''), key };
  } catch {
    return null;
  }
}

/**
 * Ask the attached backend. Never throws — an unreachable backend is an ANSWER
 * (`unknown`), not an exception, because a caller that has to catch will eventually
 * catch and ignore.
 */
export async function askBackend(timeoutMs = 8000): Promise<MigrationState[]> {
  const cred = credentials();
  const cannotAsk = (why: string): MigrationState[] =>
    FINGERPRINTS.map((f) => ({ id: f.id, what: f.what, standing: 'unknown' as const, why }));

  if (!cred) {
    return cannotAsk('no .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, so nothing was asked');
  }

  let names: Set<string>;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(`${cred.url}/rest/v1/`, {
      headers: { apikey: cred.key, Authorization: `Bearer ${cred.key}` },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return cannotAsk(`the backend answered ${res.status}, so nothing could be read`);
    const doc: any = await res.json();
    names = new Set(Object.keys(doc?.paths ?? {})
      .filter((p) => p.startsWith('/rpc/'))
      .map((p) => p.slice(5)));
  } catch (e: any) {
    return cannotAsk(`could not reach the backend: ${e?.message ?? e}`);
  }

  return FINGERPRINTS.map((f) => {
    if (!f.fn) {
      return {
        id: f.id, what: f.what, standing: 'unknown' as const,
        why: `${f.note}. Checking it needs a query this key cannot make — so it is reported as ` +
             `not known rather than assumed either way.`,
      };
    }
    const there = names.has(f.fn);
    // 0002's job is to REMOVE a function. Present means it did not run.
    const applied = f.note === 'inverted' ? !there : there;
    return {
      id: f.id, what: f.what,
      standing: applied ? 'applied' as const : 'absent' as const,
      why: f.note === 'inverted'
        ? (there ? `${f.fn} is still exposed, so this has not run` : `${f.fn} is gone, as it should be`)
        : (there ? `${f.fn} answers, so this has run` : `${f.fn} is not exposed, so this has not run`),
    };
  });
}

/** A one-line summary that never says "fine" while anything is unknown. */
export function headline(states: MigrationState[]): string {
  const n = (s: Standing) => states.filter((x) => x.standing === s).length;
  const parts: string[] = [];
  if (n('absent')) parts.push(`${n('absent')} not run`);
  if (n('unknown')) parts.push(`${n('unknown')} could not be checked from here`);
  return parts.length
    ? `${n('applied')} of ${states.length} confirmed applied; ${parts.join('; ')}.`
    : `all ${states.length} confirmed applied.`;
}

// Run directly: `node --experimental-strip-types scripts/applied.ts`
if (process.argv[1]?.endsWith('applied.ts')) {
  const states = await askBackend();
  const mark = { applied: '  APPLIED', absent: '   ABSENT', unknown: '  UNKNOWN' } as const;
  console.log('\n  asking the attached backend what is actually there\n');
  for (const s of states) console.log(`${mark[s.standing]}  ${s.id}  ${s.what}\n            ${s.why}`);
  console.log(`\n  ${headline(states)}\n`);
}
