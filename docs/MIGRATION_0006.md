# Migration 0006 — a save cannot silently replace another save

**Not run yet.** Until it is, the editor saves exactly as it does today: it
tries the guarded function, gets "no such function", and falls back to the old
`save_page` without saying anything to anybody. Nothing breaks; the protection
simply is not there.

## Why it is needed

`save_page` is an unconditional `UPDATE`. Two tabs open on the same page and the
second one to autosave replaces everything the first one did — no error, no
warning, no copy kept. An hour of work disappears and the only evidence is that
the page looks older than it was.

This is not a two-person problem. **One person with the page open in two tabs
hits it**, and autosave here runs 500ms after every keystroke, so the losing tab
overwrites the winning one the moment it is touched. Nothing in the app could
notice it had happened, which is why it is being fixed before it is ever
reported: the report would arrive as "my page reverted" with nothing to look at.

## What it does

The client says which version it believes it is editing; the update only lands
if that is still the version on the server. Optimistic locking — the right shape
here because writes are rare, conflicts are rarer, and a real lock would let one
tab left open all night hold the page hostage.

The new timestamp comes back on success, so the next save already knows where it
stands without another round trip.

## The decisions it makes, and why each one leans that way

Every choice here is one where the wrong answer is **worse than the bug**.

| situation | what happens | why |
| :--- | :--- | :--- |
| this tab does not know its version | **saves anyway** | failing to save loses the work in front of you for certain; an overwrite only loses work sometimes |
| the migration is not run | **saves the old way** | shipping a guard must not stop anybody saving until they have run some SQL |
| the page moved on | **refuses, stops autosave, explains** | retrying either repeats the refusal every 500ms or drops the stamp and performs the exact overwrite this prevents |
| the page was deleted | **refuses, and says reloading will not help** | a conflict is recoverable; a deletion is not, and offering the wrong remedy wastes the only chance to copy the work out |
| the network failed | **keeps trying** | the work exists only in this tab; giving up is the one unrecoverable option |

The old `save_page` is left in place untouched, for the fallback and for
anything else still calling it.

## Steps

1. Supabase → **SQL Editor** → **+ New**
2. Paste all of `supabase/migrations/0006_save_without_overwriting.sql`
3. **Run**. It is wrapped in a transaction, so it either all works or none of it does.
4. Reload the editor.

## Verifying it

1. Open the same page in **two browser tabs**.
2. In tab B, type something. Wait for **Saved**.
3. Go back to tab A and type something.
4. Tab A should show **Not saved** and a panel saying the page was saved
   somewhere else, with two buttons.
5. Press **Reload this page** in tab A. Tab B's text should be there, and typing
   should save normally again.
6. Repeat, but press **Save anyway, keep this version**. Tab A's version wins,
   and tab B will now be the one told it is behind.

**Before running the migration**, step 4 will not happen — tab A will just say
**Saved** and tab B's work will be gone. That is the bug, and it is the fastest
way to see what this migration is for.
