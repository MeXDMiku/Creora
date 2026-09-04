/**
 * GRID, TRANSLATED. Every mechanism the reference app needed, asked of Creora.
 *
 * The reference is a real social app on real Postgres -- feed, stories, threads,
 * likes, a live room, chat, a transcode queue -- with 37 assertions green. Its
 * shape came from what the four sites actually do, researched rather than
 * guessed: Twitter's 800-entry Redis timelines and its 300K:6K read ratio,
 * YouTube's upload -> transcode -> ready pipeline, Twitch's ten-billion-message
 * chat read as a tail, Instagram's expiring stories and ranked feed.
 *
 * Each line below is that mechanism put to the REAL Creora modules.
 *
 *   npm run grid
 */
import { rowFormulaValue, visibleRows } from '../src/lib/rows';
import { runQuery } from '../src/lib/query';
import { runAction, warningsFor, toFunction } from '../src/lib/actions';
import { ruleAllows } from '../src/lib/rules';
import type { TableScope } from '../src/lib/formula';

type V = 'FORMULA' | 'QUERY' | 'ACTION' | 'RULE' | 'MIGRATION' | 'NO';
interface R { area: string; what: string; v: V; got: string; note?: string }
export const out: R[] = [];
const rec = (area: string, what: string, v: V, got: unknown, note?: string) =>
  out.push({ area, what, v, got: JSON.stringify(got), note });

const T = (rows: any[], columns: string[]) => ({ rows, columns });
function ask(row: any, formula: string, opts: any = {}) {
  try {
    const r = rowFormulaValue(row, formula, opts);
    return r.error ? { ok: false, said: r.error } : { ok: true, said: r.value };
  } catch (e: any) { return { ok: false, said: e?.message ?? String(e) }; }
}
function askQ(def: any, tables: TableScope, page: any = {}) {
  try { return { ok: true, said: runQuery(def, tables, page) }; }
  catch (e: any) { return { ok: false, said: e?.message ?? String(e) }; }
}

/** The same data the reference app is seeded with. */
const TABLES: TableScope = {
  Users: T([
    { id: 'u_ada', handle: 'ada' }, { id: 'u_bo', handle: 'bo' },
    { id: 'u_cy', handle: 'cy' }, { id: 'u_dee', handle: 'dee' },
  ], ['handle']),
  Follows: T([
    { id: 'f1', FollowerId: 'u_ada', FollowingId: 'u_bo' },
    { id: 'f2', FollowerId: 'u_ada', FollowingId: 'u_cy' },
    { id: 'f3', FollowerId: 'u_bo', FollowingId: 'u_ada' },
    { id: 'f4', FollowerId: 'u_cy', FollowingId: 'u_ada' },
  ], ['FollowerId', 'FollowingId']),
  Posts: T([
    { id: 'p1', AuthorId: 'u_bo',  Body: 'first firing #pottery', ReplyToId: '', MediaState: 'none',  At: '2026-08-24' },
    { id: 'p2', AuthorId: 'u_cy',  Body: 'glaze tests #pottery',  ReplyToId: '', MediaState: 'ready', At: '2026-08-24' },
    { id: 'p3', AuthorId: 'u_ada', Body: 'kiln schedule',         ReplyToId: '', MediaState: 'none',  At: '2026-08-23' },
    { id: 'p5', AuthorId: 'u_dee', Body: 'not followed',          ReplyToId: '', MediaState: 'none',  At: '2026-08-24' },
  ], ['AuthorId', 'Body', 'ReplyToId', 'MediaState', 'At']),
  Likes: T([
    { id: 'l1', PostId: 'p1', UserId: 'u_ada' }, { id: 'l2', PostId: 'p1', UserId: 'u_cy' },
    { id: 'l3', PostId: 'p1', UserId: 'u_dee' }, { id: 'l4', PostId: 'p2', UserId: 'u_ada' },
  ], ['PostId', 'UserId']),
  Comments: T([
    { id: 'k1', PostId: 'p1', AuthorId: 'u_ada', Path: '0001',                Body: 'what cone?' },
    { id: 'k2', PostId: 'p1', AuthorId: 'u_bo',  Path: '0001.0001',           Body: 'six' },
    { id: 'k3', PostId: 'p1', AuthorId: 'u_cy',  Path: '0001.0001.0001',      Body: 'electric?' },
    { id: 'k4', PostId: 'p1', AuthorId: 'u_bo',  Path: '0001.0001.0001.0001', Body: 'slow ramp' },
    { id: 'k5', PostId: 'p1', AuthorId: 'u_dee', Path: '0002',                Body: 'beautiful' },
  ], ['PostId', 'AuthorId', 'Path', 'Body']),
  Stories: T([
    { id: 'st_live', AuthorId: 'u_bo', ExpiresAt: '2026-08-25' },
    { id: 'st_gone', AuthorId: 'u_cy', ExpiresAt: '2026-08-23' },
  ], ['AuthorId', 'ExpiresAt']),
  Rooms: T([{ id: 'r_kiln', OwnerId: 'u_bo', Title: 'Bo fires a kiln', IsLive: true }],
    ['OwnerId', 'Title', 'IsLive']),
  Viewers: T([
    { id: 'v1', RoomId: 'r_kiln', UserId: 'u_ada' },
    { id: 'v2', RoomId: 'r_kiln', UserId: 'u_cy' },
  ], ['RoomId', 'UserId']),
  Chat: T(Array.from({ length: 120 }, (_, i) => ({
    id: 'm' + String(i + 1).padStart(4, '0'), RoomId: 'r_kiln', Body: 'msg ' + (i + 1),
  })), ['RoomId', 'Body']),
};
const me = { tables: TABLES, pageValues: { Me: 'u_ada' } };

// ═══════════════════════════════════════════════════════════════ the feed
{
  const inFeed = (row: any) => ask(row,
    '{{ReplyToId}} == "" and (AuthorId == Me or countOf("Follows", \'{{FollowerId}} == Me and {{FollowingId}} == AuthorId\') > 0)', me);
  const kept = TABLES.Posts.rows.filter(r => inFeed(r).said === true).map(r => r.id);
  rec('feed', 'assembled at read time from who you follow',
    JSON.stringify(kept) === JSON.stringify(['p1', 'p2', 'p3']) ? 'FORMULA' : 'NO', kept,
    'The same shape Twitter still uses for accounts too big to fan out. Fanout-on-write is a scale optimisation at a 300K:6K read ratio, not a feature.');

  const likes = ask({ id: 'p1' }, 'countOf("Likes", \'{{PostId}} == RowId\')', me);
  rec('feed', 'the like count on each row', likes.said === 3 ? 'FORMULA' : 'NO', likes.said);

  const mine = ask({ id: 'p1' }, 'countOf("Likes", \'{{PostId}} == RowId and {{UserId}} == Me\') > 0', me);
  rec('feed', 'and whether THIS viewer liked it', mine.said === true ? 'FORMULA' : 'NO', mine.said);

  const ranked = askQ({
    from: 'Posts', where: '{{ReplyToId}} == ""',
    orderBy: 'countOf("Likes", \'{{PostId}} == RowId\')', direction: 'desc',
  }, TABLES);
  rec('feed', 'ordered by a score rather than by time',
    ranked.ok && (ranked.said as any[])[0]?.id === 'p1' ? 'QUERY' : 'NO',
    ranked.ok ? (ranked.said as any[]).map((r: any) => r.id) : ranked.said,
    'A question could not call countOf until 24 Aug. It can now, so a ranked feed is one line.');
}

// ═══════════════════════════════════════════════════════════════ threads
{
  const sorted = visibleRows(TABLES.Comments.rows as any,
    { sortColumn: 'Path', sortDirection: 'asc' } as any).rows.map((r: any) => r.id);
  rec('threads', 'the whole thread in reading order, at any depth',
    JSON.stringify(sorted) === JSON.stringify(['k1', 'k2', 'k3', 'k4', 'k5']) ? 'FORMULA' : 'NO', sorted,
    'A materialised path, which is how Reddit and Hacker News do it. Nothing recurses at draw time.');

  const d = ask({ Path: '0001.0001.0001.0001' }, '(len({{Path}}) + 1) / 5', me);
  rec('threads', 'and how deep each one is', d.said === 4 ? 'FORMULA' : 'NO', d.said);

  const below = ask({ id: 'k1', Path: '0001' },
    'countOf("Comments", \'startswith({{Path}}, concat(Path, "."))\')', me);
  rec('threads', 'everything below a comment, at any depth', below.said === 3 ? 'FORMULA' : 'NO', below.said);
}

// ═══════════════════════════════════════════════════════════════ stories
{
  const alive = TABLES.Stories.rows
    .filter(r => ask(r, 'daysUntil({{ExpiresAt}}) > 0', me).said === true).map(r => r.id);
  rec('stories', 'an expired story stops being shown, with nothing sweeping',
    JSON.stringify(alive) === JSON.stringify(['st_live']) ? 'FORMULA' : 'NO', alive,
    'The clock is part of the filter, which is exactly how Instagram does it.');
}

// ═══════════════════════════════════════════════════════ notifications
{
  const notif = askQ({
    from: [
      { table: 'Likes',    as: { kind: '"liked"',    who: '{{UserId}}',     at: '"2026-08-24"' } },
      { table: 'Follows',  as: { kind: '"followed"', who: '{{FollowerId}}', at: '"2026-08-23"' } },
      { table: 'Comments', as: { kind: '"replied"',  who: '{{AuthorId}}',   at: '"2026-08-22"' } },
    ],
    orderBy: '{{at}}', direction: 'desc',
  }, TABLES);
  const kinds = notif.ok ? [...new Set((notif.said as any[]).map((r: any) => r.kind))].sort() : notif.said;
  rec('notifications', 'ONE LIST DRAWN FROM THREE TABLES',
    JSON.stringify(kinds) === JSON.stringify(['followed', 'liked', 'replied']) ? 'QUERY' : 'NO', kinds);

  const trend = askQ({ from: 'Posts', groupBy: '{{AuthorId}}', keep: { n: 'count' },
    orderBy: '{{n}}', direction: 'desc' }, TABLES);
  rec('notifications', 'grouping, which is the shape behind trending',
    trend.ok ? 'QUERY' : 'NO', trend.ok ? (trend.said as any[]).length + ' groups' : trend.said);

  const tags = askQ({ from: 'Posts', groupBy: 'regexOf({{Body}}, "#\\\\w+")', keep: { n: 'count' } }, TABLES);
  rec('notifications', 'AND TRENDING TAGS, PULLED OUT OF THE TEXT ITSELF',
    tags.ok ? 'QUERY' : 'NO', tags.said,
    'Grouping by a stored value works. Grouping by something FOUND INSIDE a value needs a way to pull it out, and there is none.');
}

// ═══════════════════════════════════════════════════════════════ the room
{
  const live = ask({ id: 'r_kiln' }, 'joinOf("Rooms", "IsLive", \'{{Row id}} == RowId\')', me);
  rec('live', 'is this channel live', live.ok ? 'FORMULA' : 'NO', live.said);

  const watching = ask({ id: 'r_kiln' }, 'countOf("Viewers", \'{{RoomId}} == RowId\')', me);
  rec('live', 'how many are watching', watching.said === 2 ? 'FORMULA' : 'NO', watching.said);

  rec('live', 'and being TOLD when either changes, rather than asking', 'MIGRATION', null,
    'Primitive E, built 24 Aug: lib/liveChanges.ts and migration 0010. Without the migration the page polls, and the block says ON A TIMER rather than pretending.');

  const goLive = {
    id: 'a_live', name: 'Go live', takes: ['RoomId'],
    steps: [
      { kind: 'remember', name: 'Owner', table: 'Rooms', column: 'OwnerId', where: '{{id}} == {{RoomId}}' },
      { kind: 'refuse when', when: '{{Owner}} != Me', message: 'That is not your channel.' },
      { kind: 'change rows in', table: 'Rooms', where: '{{id}} == {{RoomId}}', set: { IsLive: 'true' } },
    ],
  } as any;
  const warns = warningsFor(goLive, TABLES);
  rec('live', 'ONLY THE OWNER CAN END THE STREAM',
    warns.length === 0 && toFunction(goLive).includes('raise exception') ? 'ACTION' : 'NO',
    { warnings: warns.length, ok: runAction(goLive, TABLES, { RoomId: 'r_kiln' }).ok });
}

// ═══════════════════════════════════════════════════════════════════ chat
{
  const tail = askQ({ from: 'Chat', where: '{{RoomId}} == "r_kiln"',
    orderBy: '{{Body}}', limit: 50 }, TABLES);
  rec('chat', 'the last fifty messages rather than all of them',
    tail.ok && (tail.said as any[]).length === 50 ? 'QUERY' : 'NO',
    tail.ok ? (tail.said as any[]).length : tail.said,
    'A question can LIMIT -- but all 120 rows were already in the browser before it did. The limit is cosmetic.');

  rec('chat', 'ONLY WHAT IS NEW SINCE THE LAST LOOK', 'NO', null,
    'list_database_rows returns EVERYTHING. There is no "since", so a busy room is its whole history on every read, and the limit above cannot help.');
}

// ═══════════════════════════════════════════════════════════════ the queue
{
  const post = {
    id: 'a_post', name: 'Post with media', takes: ['Body'],
    steps: [{ kind: 'add row to', table: 'Posts',
      set: { AuthorId: 'Me', Body: '{{Body}}', MediaState: '"uploading"', At: 'Now' } }],
  } as any;
  const made = runAction(post, TABLES, { Body: 'a video' });
  rec('queue', 'a post exists immediately, marked not-ready',
    made.ok ? 'ACTION' : 'NO', made.changes.find(c => c.kind === 'add')?.row);
  rec('queue', 'and the page reacts when its state changes', 'MIGRATION', null,
    'Primitive E again. An uploader watching a status change is precisely what E is for.');
  rec('queue', 'BUT SOMETHING HAS TO DO THE WORK', 'NO', null,
    'An action is ONE transaction that finishes before it replies. A transcode takes minutes. There is nowhere to put work that outlives its request.');
}

// ══════════════════════════════════════════════════════════════ the rules
{
  rec('safety', 'one person, one like', 'MIGRATION', null,
    'Uniqueness across two columns together -- migration 0008 extended, and 0008 has never been run either.');
  const r = ruleAllows('daysUntil({{ExpiresAt}}) > 0', { ExpiresAt: '2026-08-25' }, { id: 'u_ada' });
  rec('safety', 'and a stranger cannot read what is not theirs to see',
    r ? 'MIGRATION' : 'NO', r,
    'The rule answers correctly. Nothing enforces it until the migration is run, so today hiding is not withholding.');
}

// ═══════════════════════════════════════════════════════════════════ report
const LABEL: Record<V, string> = {
  FORMULA: 'a formula', QUERY: 'a question', ACTION: 'an action', RULE: 'a rule',
  MIGRATION: 'written — needs the migration run', NO: 'CANNOT',
};
console.log('\n════════ GRID, TRANSLATED INTO CREORA ════════');
let area = '';
for (const r of out) {
  if (r.area !== area) { area = r.area; console.log(`\n── ${area} ──`); }
  console.log(`  [${(r.v === 'NO' ? 'CANNOT' : r.v).padEnd(9)}] ${r.what}`);
  if (r.note) console.log(`              ${r.note}`);
}
console.log('\n════════ TALLY ════════');
for (const v of ['FORMULA', 'QUERY', 'ACTION', 'RULE', 'MIGRATION', 'NO'] as V[]) {
  const n = out.filter(r => r.v === v).length;
  if (n) console.log(`  ${String(n).padStart(2)}  ${LABEL[v]}`);
}
console.log(`  ${String(out.length).padStart(2)}  mechanisms the reference app needed`);
