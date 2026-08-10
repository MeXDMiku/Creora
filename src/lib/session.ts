import { supabase } from './supabase';

/**
 * Creora's identity, such as it is.
 *
 * Until Step 3 there was no identity at all — no supabase.auth call existed
 * anywhere — while every SECURITY DEFINER RPC was granted to `anon` with no
 * caller check. Anyone holding the public anon key could list, read and
 * overwrite any page.
 *
 * An anonymous session gives each browser a stable auth.uid() that the
 * database can scope ownership to, with no login screen. Visitors to a
 * published page need no session at all: can_read_page() allows reads and
 * submissions on published pages regardless of who is asking.
 *
 * CAVEAT worth knowing before this carries real work: an anonymous session
 * lives in browser storage. Clear it, or switch device, and you get a new uid
 * and lose access to your own pages. Real email sign-in should land before
 * anything you would be upset to lose.
 */
export async function ensureSession(): Promise<string | null> {
  const { data: existing } = await supabase.auth.getSession();
  if (existing?.session?.user?.id) return existing.session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    // Most likely: anonymous sign-ins are not enabled for the project yet
    // (Dashboard -> Authentication -> Sign In / Providers -> Anonymous sign-ins).
    console.error('[creora] anonymous sign-in failed:', error.message);
    return null;
  }
  return data?.user?.id ?? null;
}

/**
 * TEMPORARY. Adopts pages created before ownership existed so they are not
 * stranded when the migration lands. Fails harmlessly if the migration has not
 * been applied yet, because the function will not exist. Remove this, and the
 * claim_orphan_pages function in the database, once the existing pages are
 * claimed.
 */
export async function claimOrphanPages(): Promise<void> {
  const { error } = await supabase.rpc('claim_orphan_pages');
  if (error) console.warn('[creora] claim_orphan_pages skipped:', error.message);
}
