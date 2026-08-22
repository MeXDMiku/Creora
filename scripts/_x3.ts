import { evaluateExpression } from '../src/lib/formula';
import { visibleRows, rowSlots } from '../src/lib/rows';
const users = [{ id: 'u1', Handle: 'maya', Name: 'Maya' }, { id: 'u2', Handle: 'tomas', Name: 'Tomas' }, { id: 'u4', Handle: 'ada', Name: 'Ada' }];
const posts = [
  { id: 'p1', AuthorId: 'u1', Body: 'a #pottery', ReplyToId: '', RepostOfId: '' },
  { id: 'p3', AuthorId: 'u4', Body: 'b #pottery', ReplyToId: '', RepostOfId: '' },
  { id: 'p5', AuthorId: 'u3', Body: 'c', ReplyToId: '', RepostOfId: '' },
  { id: 'p4', AuthorId: 'u1', Body: 'd', ReplyToId: 'p3', RepostOfId: '' },
  { id: 'p10', AuthorId: 'u2', Body: '', ReplyToId: '', RepostOfId: 'p3' },
];
const follows = [{ id: 'f1', FollowerId: 'u4', FollowingId: 'u1' }, { id: 'f2', FollowerId: 'u4', FollowingId: 'u2' }];
const likes = [{ id: 'l1', PostId: 'p1', UserId: 'u4' }, { id: 'l2', PostId: 'p1', UserId: 'u2' }, { id: 'l3', PostId: 'p3', UserId: 'u1' }];
const tables: any = {
  Users: { rows: users, columns: ['Handle', 'Name'] },
  Posts: { rows: posts, columns: ['AuthorId', 'Body', 'ReplyToId', 'RepostOfId'] },
  Follows: { rows: follows, columns: ['FollowerId', 'FollowingId'] },
  Likes: { rows: likes, columns: ['PostId', 'UserId'] },
};
const page = { Me: 'u4', SearchBox: 'pottery' };
const show = (label: string, spec: any, want?: string) => {
  const v = visibleRows(spec.rows || posts, { ...spec, tables, pageValues: page });
  const got = v.rows.map((r: any) => r.id).join(',');
  const ok = want === undefined ? '?' : (got === want ? 'YES' : 'NO ');
  console.log(`${ok} ${label}\n     rows: ${got}${v.formulaError ? `\n     error: ${v.formulaError}` : ''}`);
};

show('HOME FEED: people I follow, plus me, no replies',
  { filterFormula: `{{ReplyToId}} == "" and (AuthorId == Me or countOf("Follows", '{{FollowerId}} == Me and {{FollowingId}} == AuthorId') > 0)` },
  'p1,p3,p10');
show('WHO TO FOLLOW: users I do not follow and am not',
  { rows: users, filterFormula: `RowId != Me and countOf("Follows", '{{FollowerId}} == Me and {{FollowingId}} == RowId') == 0` },
  'u4'.replace('u4','') || '');
show('MY LIKES: posts I have liked',
  { filterFormula: `countOf("Likes", '{{PostId}} == RowId and {{UserId}} == Me') > 0` }, 'p1');
show('SEARCH: posts containing what is in the box',
  { filterFormula: `SearchBox == "" or contains({{Body}}, SearchBox)` }, 'p1,p3');
show('SORT by like count, most first',
  { sortFormula: `countOf("Likes", '{{PostId}} == RowId')`, sortDirection: 'desc' }, 'p1,p3,p5,p4,p10');

const card = (row: any, f: string) => {
  try { return evaluateExpression(f, { ...rowSlots(row as any, 0), ...page }, tables); }
  catch (e: any) { return 'THREW: ' + e.message; }
};
console.log('\nTWO HOPS: the author of the post this repost repeats');
console.log('   ', card(posts[4], `joinOf("Users", "Name", '{{Row id}} == joinOf("Posts", "AuthorId", "{{Row id}} == RepostOfId")')`));
console.log('THREE deep, which must refuse rather than crawl');
console.log('   ', card(posts[4], `countOf("Posts", 'countOf("Posts", "countOf(\\'Users\\', \\'{{Row id}} == \\\\"u1\\\\"\\') > 0") > 0')`));
