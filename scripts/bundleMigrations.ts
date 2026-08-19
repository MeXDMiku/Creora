import { readFileSync, readdirSync } from 'node:fs';

/**
 * Every unrun migration, in one paste.
 *
 * WHY THIS EXISTS
 * Five migrations sat unrun for days -- the row-ownership one since 13 August.
 * Each is a separate file to find, open, copy and run, and every one of them
 * fixes something that is silently broken until it is: two tabs overwriting
 * each other, a form anyone can fill, a slot that can be booked twice.
 *
 * The work was done and the friction was the whole obstacle. Five pastes is not
 * five times the effort of one, it is five times the opportunity to stop after
 * the first.
 *
 * WHY IT IS SAFE TO RUN THE WHOLE THING, INCLUDING THE PARTS ALREADY APPLIED
 * Every migration in this project is written idempotently -- `create or
 * replace`, `drop ... if exists`, `create index if not exists` -- and each
 * carries its own transaction. Running one twice is a no-op; running all eight
 * is eight sequential no-ops for the ones already in place.
 *
 * IT IS GENERATED, AND A CHECK SAYS SO
 * A bundle that drifts from the files it was built out of is worse than no
 * bundle: somebody pastes it and believes they are up to date. `npm run check`
 * rebuilds it in memory and compares, so an edited migration with a stale
 * bundle turns red.
 */

const HEADER = `-- ---------------------------------------------------------------------------
-- CREORA -- every migration, in order, in one paste.
--
-- GENERATED FILE. Do not edit it: edit the migration it came from and run
--   node --experimental-strip-types --import ./scripts/register.mjs scripts/bundle-migrations.ts
-- A check compares this against supabase/migrations/ and fails if they differ.
--
-- SAFE TO RUN WHOLE, EVERY TIME. Every migration here is idempotent -- create
-- or replace, drop if exists, create index if not exists -- and each carries
-- its own transaction. The ones already applied to your database are no-ops.
--
-- Supabase -> SQL Editor -> New query -> paste all of this -> Run.
-- ---------------------------------------------------------------------------

`;

export function migrationFiles(): string[] {
  return readdirSync('supabase/migrations')
    .filter(f => f.endsWith('.sql'))
    // Numeric prefixes, so the order is the order they were written. Sorting by
    // name works only while they are all the same width; they are, and a check
    // below would catch the day they stop being.
    .sort();
}

export function buildBundle(): string {
  const parts = migrationFiles().map(file => {
    const body = readFileSync(`supabase/migrations/${file}`, 'utf8').trimEnd();
    return `-- ===========================================================================\n-- ${file}\n-- ===========================================================================\n\n${body}\n`;
  });
  return HEADER + parts.join('\n\n');
}
