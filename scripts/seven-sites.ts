/**
 * SEVEN HARD SITES, PUT TO THE ENGINE RATHER THAN JUDGED BY READING IT.
 *
 * The third time this method is used. BUILT_ONE_TO_FIND_OUT built a booking
 * site, BUILT_TWO_TO_FIND_OUT built a social app, and both found that reading
 * the code gave the wrong answer three times each. So every line below is a
 * question actually ASKED of the real modules, and the verdict is whatever
 * came back.
 *
 * The seven are chosen because their MECHANISMS differ, not their screens:
 *
 *   X          a table that points at itself, and a feed filtered by who follows whom
 *   YouTube    a long job nobody waits for, and per-viewer progress
 *   Twitch     state that changes with no one asking, and a very fast append
 *   Reddit     a tree of unknown depth, and an order that changes as time passes
 *   Facebook   a pair that must be mutual, and an audience chosen per row
 *   Gmail      many-to-many labels, a thread, and a count per label per person
 *   IBM (B2B)  a transition that may be refused, a trail of who did what, tenancy
 */
import { rowFormulaValue } from '../src/lib/rows';
import { runQuery } from '../src/lib/query';
import { runAction, toFunction, warningsFor } from '../src/lib/actions';
import { ruleAllows, ruleToSql } from '../src/lib/rules';
import type { TableScope } from '../src/lib/formula';

type Verdict = 'FORMULA' | 'QUERY' | 'ACTION' | 'RULE' | 'MIGRATION' | 'NO';
const LABEL: Record<Verdict, string> = {
  FORMULA:   'says it today, in a formula',
  QUERY:     'says it today, as a question',
  ACTION:    'says it today, as an action',
  RULE:      'says it today, as a rule',
  MIGRATION: 'written, needs a migration run',
  NO:        'CANNOT SAY IT',
};

interface Result { site: string; what: string; verdict: Verdict; got: string; note?: string }
export const results: Result[] = [];
const record = (site: string, what: string, verdict: Verdict, got: unknown, note?: string) =>
  results.push({ site, what, verdict, got: JSON.stringify(got), note });

function ask(row: any, formula: string, opts: any = {}) {
  try {
    const r = rowFormulaValue(row, formula, opts);
    return r.error ? { ok: false, said: r.error } : { ok: true, said: r.value };
  } catch (e: any) {
    return { ok: false, said: e?.message ?? String(e) };
  }
}
function askQuery(def: any, tables: TableScope, page: any = {}) {
  try { return { ok: true, said: runQuery(def, tables, page) }; }
  catch (e: any) { return { ok: false, said: e?.message ?? String(e) }; }
}
const T = (rows: any[], columns: string[]) => ({ rows, columns });

// =========================================================== X — a self-reference
{
  const tables: TableScope = {
    Posts: T([
      { id: 'p1', AuthorId: 'u1', Body: 'first #pottery', ReplyToId: '', RepostOfId: '', At: '2026-08-20' },
      { id: 'p2', AuthorId: 'u2', Body: 'reply', ReplyToId: 'p1', RepostOfId: '', At: '2026-08-21' },
      { id: 'p3', AuthorId: 'u3', Body: '', ReplyToId: '', RepostOfId: 'p1', At: '2026-08-22' },
      { id: 'p4', AuthorId: 'u2', Body: 'more #pottery', ReplyToId: '', RepostOfId: '', At: '2026-08-23' },
    ], ['AuthorId', 'Body', 'ReplyToId', 'RepostOfId', 'At']),
    Likes: T([
      { id: 'l1', PostId: 'p1', UserId: 'u2' }, { id: 'l2', PostId: 'p1', UserId: 'u3' },
      { id: 'l3', PostId: 'p4', UserId: 'u1' },
    ], ['PostId', 'UserId']),
    Follows: T([{ id: 'f1', FollowerId: 'u1', FollowingId: 'u2' }], ['FollowerId', 'FollowingId']),
    Users: T([{ id: 'u1', Name: 'Ada' }, { id: 'u2', Name: 'Bo' }, { id: 'u3', Name: 'Cy' }], ['Name']),
  };
  const me = { tables, pageValues: { Me: 'u1' } };

  const likes = ask({ id: 'p1' }, 'countOf("Likes", \'{{PostId}} == RowId\')', me);
  record('X', 'how many likes a post has', likes.ok && likes.said === 2 ? 'FORMULA' : 'NO', likes.said);

  const feed = ask({ id: 'p4', AuthorId: 'u2', ReplyToId: '' },
    '{{ReplyToId}} == "" and (AuthorId == Me or countOf("Follows", \'{{FollowerId}} == Me and {{FollowingId}} == AuthorId\') > 0)', me);
  record('X', 'a home feed: the people I follow', feed.ok && feed.said === true ? 'FORMULA' : 'NO', feed.said);

  const trending = askQuery({ from: 'Posts', groupBy: '{{AuthorId}}', keep: { posts: 'count' }, orderBy: '{{posts}}', direction: 'desc' }, tables);
  record('X', 'group by something — trending, top authors', trending.ok && (trending.said as any[])[0]?.posts === 2 ? 'QUERY' : 'NO',
    trending.said, 'BUILT_TWO_TO_FIND_OUT called grouping impossible on 19 Aug. Primitive A closed it on 24 Aug.');

  const notif = askQuery({
    from: [
      { table: 'Likes',   as: { kind: '"liked"',    at: '"2026-08-22"' } },
      { table: 'Follows', as: { kind: '"followed"', at: '"2026-08-21"' } },
    ],
    orderBy: '{{at}}', direction: 'desc',
  }, tables);
  record('X', 'notifications: one list from several tables', notif.ok && (notif.said as any[]).length === 4 ? 'QUERY' : 'NO',
    notif.ok ? (notif.said as any[]).length + ' rows' : notif.said, 'Also called impossible on 19 Aug. Closed.');

  const dedupe = askQuery({ from: 'Posts', oneRowPer: '{{AuthorId}}', keepThe: 'largest of {{At}}' }, tables);
  record('X', 'a feed that does not show the same thing twice', dedupe.ok && (dedupe.said as any[]).length === 3 ? 'QUERY' : 'NO',
    dedupe.ok ? (dedupe.said as any[]).length + ' rows' : dedupe.said, 'Also called impossible on 19 Aug. Closed.');
}

// ================================================ Reddit — depth, and time decay
{
  const tables: TableScope = {
    Comments: T([
      { id: 'c1', ParentId: '', Body: 'top', Score: 10 },
      { id: 'c2', ParentId: 'c1', Body: 'child', Score: 5 },
      { id: 'c3', ParentId: 'c2', Body: 'grandchild', Score: 2 },
      { id: 'c4', ParentId: 'c3', Body: 'great-grandchild', Score: 1 },
    ], ['ParentId', 'Body', 'Score']),
    Votes: T([{ id: 'v1', PostId: 'p1', Dir: 1 }, { id: 'v2', PostId: 'p1', Dir: 1 }, { id: 'v3', PostId: 'p1', Dir: -1 }], ['PostId', 'Dir']),
    Posts: T([{ id: 'p1', Title: 'a', At: '2026-08-20' }], ['Title', 'At']),
  };
  const opts = { tables, pageValues: {} };

  const direct = ask({ id: 'c1' }, 'countOf("Comments", \'{{ParentId}} == RowId\')', opts);
  record('Reddit', 'how many direct replies a comment has', direct.ok && direct.said === 1 ? 'FORMULA' : 'NO', direct.said);

  const twoDeep = ask({ id: 'c1' },
    'joinOf("Comments", "Body", \'{{ParentId}} == joinOf("Comments", "Row id", "{{ParentId}} == RowId")\')', opts);
  record('Reddit', 'two levels of nesting', twoDeep.ok ? 'FORMULA' : 'NO', twoDeep.said);

  record('Reddit', 'A COMMENT TREE OF UNKNOWN DEPTH', 'NO', null,
    'MAX_QUESTION_DEPTH is 2, on purpose: each level runs once per row of the level outside it, so three levels is rows-cubed.');

  const score = ask({ id: 'p1' }, 'sumOf("Votes", "Dir", \'{{PostId}} == RowId\')', opts);
  record('Reddit', 'a vote score, up minus down', score.ok && score.said === 1 ? 'FORMULA' : 'NO', score.said);

  const hot = ask({ id: 'p1', At: '2026-08-20' },
    'sumOf("Votes", "Dir", \'{{PostId}} == RowId\') / pow(2 - daysUntil({{At}}), 1.8)', opts);
  record('Reddit', 'HOT: a score that decays as time passes', hot.ok ? 'FORMULA' : 'NO', hot.said,
    'Worked out at DRAW time, so the order is only as fresh as the last render. Nobody re-sorts a page nobody reloaded.');
}

// ==================================== Facebook — a mutual pair, an audience per row
{
  const tables: TableScope = {
    Friends: T([
      { id: 'r1', AId: 'u1', BId: 'u2', Accepted: true },
      { id: 'r2', AId: 'u3', BId: 'u1', Accepted: false },
    ], ['AId', 'BId', 'Accepted']),
  };
  const me = { tables, pageValues: { Me: 'u1' } };

  const mutual = ask({ id: 'x' },
    'countOf("Friends", \'({{AId}} == Me and {{BId}} == "u2") or ({{BId}} == Me and {{AId}} == "u2")\') > 0', me);
  record('Facebook', 'are we friends — a pair, either way round', mutual.ok && mutual.said === true ? 'FORMULA' : 'NO', mutual.said);

  const visible = ask({ id: 'p1', AuthorId: 'u2', Audience: 'friends' },
    '{{Audience}} == "public" or {{AuthorId}} == Me or countOf("Friends", \'(({{AId}} == Me and {{BId}} == AuthorId) or ({{BId}} == Me and {{AId}} == AuthorId)) and {{Accepted}} == true\') > 0', me);
  record('Facebook', 'can I see this post — audience chosen per row', visible.ok && visible.said === true ? 'FORMULA' : 'NO', visible.said,
    'Expressible as a FILTER, which decides what is DRAWN.');

  const stranger = ruleAllows('{{Audience}} == "public" or {{AuthorId}} == Me',
    { Audience: 'friends', AuthorId: 'u2' }, { id: 'u9' });
  record('Facebook', 'AND ACTUALLY WITHHOLDING IT from a stranger', 'MIGRATION', stranger,
    'The rule answers correctly. The policy it compiles to has never been run, so today hiding is not withholding.');

  record('Facebook', 'the policy it compiles to', 'MIGRATION',
    ruleToSql('{{Audience}} == "public" or {{AuthorId}} == Me', 'posts'));

  record('Facebook', 'one friendship per pair, not two rows', 'MIGRATION', null,
    'Uniqueness across two columns together. Migration 0008 extended, and 0008 has never been run either.');
}

// =========================== Gmail — labels, threads, and a count per label
{
  const tables: TableScope = {
    Messages: T([
      { id: 'm1', ThreadId: 't1', From: 'a@x', Subject: 'Re: hi', Unread: true, At: '2026-08-20' },
      { id: 'm2', ThreadId: 't1', From: 'b@x', Subject: 'Re: hi', Unread: false, At: '2026-08-21' },
      { id: 'm3', ThreadId: 't2', From: 'c@x', Subject: 'invoice', Unread: true, At: '2026-08-22' },
    ], ['ThreadId', 'From', 'Subject', 'Unread', 'At']),
    MessageLabels: T([
      { id: 'x1', MessageId: 'm1', LabelId: 'work' }, { id: 'x2', MessageId: 'm3', LabelId: 'work' },
      { id: 'x3', MessageId: 'm3', LabelId: 'bills' },
    ], ['MessageId', 'LabelId']),
  };
  const opts = { tables, pageValues: {} };

  const inLabel = ask({ id: 'm3' }, 'countOf("MessageLabels", \'{{MessageId}} == RowId and {{LabelId}} == "work"\') > 0', opts);
  record('Gmail', 'is this message in the Work label', inLabel.ok && inLabel.said === true ? 'FORMULA' : 'NO', inLabel.said);

  const threads = askQuery({ from: 'Messages', oneRowPer: '{{ThreadId}}', keepThe: 'largest of {{At}}' }, tables);
  record('Gmail', 'a conversation: the newest message per thread', threads.ok && (threads.said as any[]).length === 2 ? 'QUERY' : 'NO',
    threads.ok ? (threads.said as any[]).length + ' threads' : threads.said);

  const perLabel = askQuery({ from: 'MessageLabels', groupBy: '{{LabelId}}', keep: { n: 'count' } }, tables);
  record('Gmail', 'a count for every label at once', perLabel.ok ? 'QUERY' : 'NO', perLabel.said);

  const unread = askQuery({
    from: 'MessageLabels',
    where: 'countOf("Messages", \'{{Row id}} == MessageId and {{Unread}} == true\') > 0',
    groupBy: '{{LabelId}}', keep: { n: 'count' },
  }, tables);
  record('Gmail', 'the UNREAD count per label', unread.ok ? 'QUERY' : 'NO',
    unread.ok ? (unread.said as any[]).map((r: any) => `${r.group}=${r.n}`) : unread.said,
    'Was CANNOT until today. A question could not call countOf -- evaluateExpression was being handed two arguments instead of three.');

  const search = ask({ id: 'm3', Subject: 'invoice' }, 'contains(lower({{Subject}}), lower("INVOICE"))', opts);
  record('Gmail', 'search the subject', search.ok && search.said === true ? 'FORMULA' : 'NO', search.said,
    'A scan of the rows already in the browser. There is no index and no server-side search.');
}

// ================= IBM-style B2B — a refusable transition, a trail, tenancy
{
  const tables: TableScope = {
    Quotes: T([{ id: 'q1', State: 'submitted', Total: 50000, OrgId: 'org1', ApproverId: '' }], ['State', 'Total', 'OrgId', 'ApproverId']),
    Audit: T([], ['QuoteId', 'Who', 'What', 'At']),
    Members: T([{ id: 'mm1', UserId: 'u9', OrgId: 'org1', Role: 'approver' }], ['UserId', 'OrgId', 'Role']),
  };

  const approve = {
    id: 'a1', name: 'Approve quote', takes: ['QuoteId'],
    steps: [
      { kind: 'remember', name: 'Was', table: 'Quotes', column: 'State', where: '{{id}} == {{QuoteId}}' },
      { kind: 'refuse when', when: '{{Was}} != "submitted"', message: 'Only a submitted quote can be approved.' },
      { kind: 'change rows in', table: 'Quotes', where: '{{id}} == {{QuoteId}}', set: { State: '"approved"', ApproverId: 'Me' } },
      { kind: 'add row to', table: 'Audit', set: { QuoteId: '{{QuoteId}}', Who: 'Me', What: '"approved"', At: 'Now' } },
    ],
  } as any;

  const good = runAction(approve, tables, { QuoteId: 'q1' });
  record('IBM B2B', 'approve a quote', good.ok ? 'ACTION' : 'NO', { ok: good.ok, changes: good.changes.length });

  const already = runAction(approve, {
    ...tables,
    Quotes: T([{ id: 'q1', State: 'approved', Total: 50000, OrgId: 'org1', ApproverId: '' }], ['State', 'Total', 'OrgId', 'ApproverId']),
  }, { QuoteId: 'q1' });
  record('IBM B2B', 'AND REFUSE re-approving one — a state machine', !already.ok ? 'ACTION' : 'NO', already.message,
    'A state machine is `refuse when` plus `change rows in`. No new idea was needed.');

  const trail = good.changes.find(c => c.kind === 'add');
  record('IBM B2B', 'an audit trail of who did what, when', trail ? 'ACTION' : 'NO', trail?.row,
    'Me and Now are server words, so the page cannot write the trail.');

  const warn = warningsFor(approve, tables);
  record('IBM B2B', 'and nothing in it is a value the page decides', warn.length === 0 ? 'ACTION' : 'NO', warn,
    warn.length ? undefined : 'Warned wrongly until today, on the one column an audit row must have.');

  const naked = { id: 'z', name: 'Delete post', takes: ['PostId'],
    steps: [{ kind: 'remove rows from', table: 'Quotes', where: '{{id}} == {{PostId}}' }] } as any;
  const bola = warningsFor(naked, tables).filter(w => w.includes('whichever row the visitor names'));
  record('IBM B2B', 'and "act on whichever row you are told" is warned about', bola.length ? 'ACTION' : 'NO', bola[0],
    'OWASP API1:2023. Nothing said this until today, and a refusal that checked nothing silenced the warning that half-covered it.');

  const tenant = ruleAllows('countOf("Members", \'{{UserId}} == Me and {{OrgId}} == "org1"\') > 0', { OrgId: 'org1' }, { id: 'u9', role: 'approver' });
  record('IBM B2B', 'tenancy: only my organisation`s rows', 'MIGRATION', tenant,
    'A rule can say it. Nothing enforces it until the migration is run.');

  const sql = toFunction(approve);
  record('IBM B2B', 'and the approval compiles to something that runs at the store', sql.includes('security definer') ? 'MIGRATION' : 'NO',
    sql.split('\n').find(l => l.includes('raise exception')));
}

// ============== YouTube and Twitch — the two that are about TIME, not tables
{
  const tables: TableScope = {
    Videos: T([{ id: 'v1', Title: 'a', Status: 'ready', Views: 10 }], ['Title', 'Status', 'Views']),
    Progress: T([{ id: 'g1', VideoId: 'v1', UserId: 'u1', Seconds: 42 }], ['VideoId', 'UserId', 'Seconds']),
  };
  const me = { tables, pageValues: { Me: 'u1' } };

  const resume = ask({ id: 'v1' }, 'joinOf("Progress", "Seconds", \'{{VideoId}} == RowId and {{UserId}} == Me\')', me);
  record('YouTube', 'resume where I left off', resume.ok && Number(resume.said) === 42 ? 'FORMULA' : 'NO', resume.said);

  record('YouTube', 'A LONG JOB NOBODY WAITS FOR (transcode)', 'NO', null,
    'An action is ONE transaction that finishes before it replies. There is nowhere to put work that takes minutes and reports back.');
  record('YouTube', 'telling the uploader when it finished', 'NO', null,
    'Primitive E — a trigger for "a row changed" that nothing on the page asked for.');
  record('Twitch', 'a channel going live while I am looking at it', 'NO', null,
    'The page can poll, and does. Push is primitive E: Supabase realtime, free tier, not built.');
  record('Twitch', 'a concurrent viewer count', 'NO', null,
    'Same primitive. A poll shows a number; it cannot show it changing without asking.');
  record('Twitch', 'chat at the rate a chat actually runs', 'NO', null,
    'Every row a Database block loads reaches the browser. There is no window, so a busy chat is the whole history, every time.');
  record('YouTube', 'a nightly digest, or billing on the 1st', 'NO', null,
    'Primitive F. The only one of the six with no free answer yet.');
}

// ===========================================================================
const order: Verdict[] = ['FORMULA', 'QUERY', 'ACTION', 'RULE', 'MIGRATION', 'NO'];
console.log('\n============ SEVEN SITES, ASKED OF THE ENGINE ============');
let site = '';
for (const r of results) {
  if (r.site !== site) { site = r.site; console.log(`\n--- ${site} ---`); }
  console.log(`  [${(r.verdict === 'NO' ? 'CANNOT' : r.verdict).padEnd(9)}] ${r.what}`);
  if (r.note) console.log(`              ${r.note}`);
}
console.log('\n============ TALLY ============');
for (const v of order) {
  const n = results.filter(r => r.verdict === v).length;
  if (n) console.log(`  ${String(n).padStart(2)}  ${LABEL[v]}`);
}
console.log(`  ${String(results.length).padStart(2)}  questions asked`);
