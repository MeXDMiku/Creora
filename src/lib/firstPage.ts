/**
 * Which page to open when the app starts, and whether one has to be made.
 *
 * THE BUG THIS IS FOR
 * The first page had a HARDCODED id — the same uuid for every person who ever
 * ran Creora — while every later page got `crypto.randomUUID()`. That works for
 * exactly one user:
 *
 *   1. The first signed-in person creates 00000000-…-0001 and owns it.
 *   2. `list_pages` is filtered by ownership, so the SECOND person cannot see
 *      it, decides no default page exists, and calls create_page with that same
 *      id.
 *   3. Postgres refuses — duplicate key on pages_pkey — and start-up throws.
 *   4. The active page falls back to that id anyway, so `get_page` returns
 *      nothing and every save comes back "Only the person who owns this page
 *      can save changes to it".
 *
 * So the second user of a deployed Creora gets an app that cannot load a page
 * and cannot save one, and is told about it in Postgres' words in a console.
 * Found by reading the console of a dev session that had been showing "Error
 * saving" for hours.
 *
 * A shared constant id was never right. Two people cannot own the same row, and
 * the database is correct to say so — `create_page` sets owner_id to auth.uid()
 * and `get_page` hands back only what you own or what is published.
 *
 * WHY THIS IS A FUNCTION AND NOT FOUR LINES INSIDE INIT
 * Because it is a decision with four cases and it decides whether somebody's
 * work is reachable. It was four lines inside a 200-line init effect, where
 * nothing could reach it. The rule that a mechanism deciding what is
 * expressible needs to be readable in one place applies here too.
 */

export interface PageChoice {
  /** The page to open. */
  open: string;
  /**
   * True when nothing existed and `open` is an id that must be created first.
   * Always a fresh id, never a shared one.
   */
  mustCreate: boolean;
}

/**
 * @param visiblePageIds what `list_pages` returned — the pages this person can
 *   actually open. Ownership-filtered by the database, which is the point: a
 *   page missing from here is not a page that does not exist.
 * @param remembered the id left in localStorage from last time, if any.
 * @param newId makes a fresh uuid. Injected so a check can predict it.
 */
export function chooseFirstPage(
  visiblePageIds: string[],
  remembered: string | null | undefined,
  newId: () => string,
): PageChoice {
  const visible = (visiblePageIds ?? []).filter(Boolean);

  // Where you were, if you can still get to it.
  if (remembered && visible.includes(remembered)) return { open: remembered, mustCreate: false };

  // Otherwise anything of yours, rather than making a second empty page for
  // somebody who already has pages -- which is what falling straight through to
  // "create" would do every time the remembered id went stale.
  if (visible.length) return { open: visible[0], mustCreate: false };

  // Nothing of yours exists. A NEW id, never a fixed one: two people cannot own
  // the same row, and the second one to try is the one who finds out.
  return { open: newId(), mustCreate: true };
}
