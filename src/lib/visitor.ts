import { supabase } from './supabase';
import { blockRuntimeAtom } from '../state/atoms';
import { ensureSession } from './session';

/**
 * Who is looking at this page right now.
 *
 * This is the primitive under carts, "my orders", profiles, members-only areas
 * and perks for premium users. Those look like six features and they are one
 * question: who is this, and what do they have. Everything needed to USE the
 * answer already exists -- conditions, Otherwise, show and hide, My Design slots.
 *
 * First slice, deliberately: identity, not entitlements. A visitor gets a stable
 * anonymous id, and `signedIn` becomes true once they attach an email. Plans and
 * tiers arrive with payments; the shape here is built so they slot in beside
 * these fields rather than replacing them.
 *
 * A session is only created when a page actually asks -- see below.
 */
export type VisitorField = 'signedIn' | 'id' | 'email' | 'name';

export const VISITOR_FIELDS: { id: VisitorField; label: string; hint: string }[] = [
  { id: 'signedIn', label: 'Is signed in', hint: 'true or false — the one to gate on' },
  { id: 'id', label: 'Their id', hint: 'stable per browser, even before signing in' },
  { id: 'email', label: 'Their email', hint: 'empty until they sign in' },
  { id: 'name', label: 'Their name', hint: 'from their account, if there is one' },
];

function readField(user: any, field: VisitorField | undefined): any {
  const f = field || 'signedIn';
  if (!user) return f === 'signedIn' ? false : '';
  // An anonymous user has no email. That is exactly what makes `signedIn`
  // meaningful: it distinguishes "we can tell you apart" from "we know you".
  const isAnon = !user.email;
  switch (f) {
    case 'signedIn': return !isAnon;
    case 'id': return String(user.id || '').slice(0, 8);
    case 'email': return user.email || '';
    case 'name': return user.user_metadata?.name || user.user_metadata?.full_name || '';
    default: return '';
  }
}

/**
 * Fill in a Visitor block's value.
 *
 * `createSession` is false on published pages unless a Visitor block is present.
 * Every anonymous session is a row in auth.users and the free tier counts 50,000
 * monthly active users across everything -- so a page that never asks who you are
 * should not quietly make an account for you.
 */
export async function refreshVisitor(
  blockId: string,
  store: any,
  createSession: boolean
): Promise<void> {
  const atom = blockRuntimeAtom(blockId);
  const state = store.get(atom);

  try {
    if (createSession) await ensureSession();
    const { data } = await supabase.auth.getUser();
    const value = readField(data?.user, state?.visitorField);
    const current = store.get(atom);
    if (current?.value !== value) {
      store.set(atom, { ...current, value });
    }
  } catch {
    const current = store.get(atom);
    store.set(atom, { ...current, value: state?.visitorField === 'signedIn' ? false : '' });
  }
}
