/**
 * WHO MAY DO WHAT, SAID ONCE, ENFORCED AT THE STORE.
 *
 * Primitive C from docs/CONNECTING_THE_TWO.md, and the only one of the six that
 * is a SAFETY problem rather than a convenience. Everything else being missing
 * makes a site harder to build. This being missing makes a built site unsafe,
 * in a way nobody can see from the outside, because hiding a block looks exactly
 * like withholding a row.
 *
 * Two halves, and both are checked:
 *
 *   1. a rule can be READ, so the page and the checks agree about what it says
 *   2. a rule can be COMPILED into the Postgres policy that actually enforces
 *      it, because a rule the browser applies is not a rule
 *
 * The second half is the one that matters and the one that cannot be faked. A
 * builder writes one sentence; the store gets a policy; the page is trusted
 * with nothing.
 *
 * Pure on purpose -- no React, no store, no Supabase -- so `npm run check` runs
 * every line of it, including the SQL it produces.
 */
import { evaluateExpression, truthy, bindSlots } from './formula';

/** What a rule may say about who is asking, and what each becomes in SQL. */
export const RULE_WORDS: Record<string, string> = {
  Me: 'auth.uid()',
  MyRole: "auth.jwt() ->> 'role'",
  MyEmail: "auth.jwt() ->> 'email'",
};

export const RULE_OPERATIONS = ['read', 'insert', 'update', 'delete'] as const;
export type RuleOperation = typeof RULE_OPERATIONS[number];

export interface TableRules {
  read?: string;
  insert?: string;
  update?: string;
  delete?: string;
  /** Column names that must be unique together. `[['slot_id','user_id']]`. */
  unique?: string[][];
}

export interface RuleSession {
  id?: string | null;
  role?: string | null;
  email?: string | null;
}

/**
 * Answer a rule for one row and one person.
 *
 * WHY A BROKEN RULE REFUSES, unlike every other formula in this project.
 *
 * A repeater's filter that cannot be worked out KEEPS every row, because hiding
 * everything looks like a table with no data and showing too much is visible --
 * it leads somebody to the filter. A rule is the other way round: showing too
 * much is a leak, and a leak is not visible to the person it happens to.
 *
 * The two point in opposite directions on purpose. Somebody reading both will
 * otherwise think one of them is a mistake.
 */
export function ruleAllows(
  rule: string | undefined | null,
  row: Record<string, any>,
  session: RuleSession | null | undefined,
): boolean {
  const text = String(rule ?? '').trim();
  if (!text) return false;                 // no rule means nobody, like Supabase
  if (text === 'anybody') return true;
  if (text === 'nobody') return false;
  if (text === 'signed in') return !!session?.id;

  /**
   * A RULE THAT MENTIONS `Me` IS FALSE WHEN NOBODY IS SIGNED IN.
   *
   * Found by a check, and it is the worst bug this primitive could have had.
   * `{{Owner}} == Me` with no session made `Me` blank, and a row whose Owner is
   * also blank made it blank == blank -- TRUE. A signed-out stranger matched
   * every ownerless row.
   *
   * Worse than the leak: Postgres does NOT behave that way. `owner = auth.uid()`
   * with both null is NULL, which a policy reads as refuse. So the page would
   * have shown what the database hid. A rule and the policy it compiles to
   * disagreeing about who may read a row is the one outcome a security
   * primitive must never have.
   *
   * MyRole is exempt: "anon" is a real answer to what role you have.
   */
  if (/\bMe\b/.test(text) && !session?.id) return false;
  if (/\bMyEmail\b/.test(text) && !session?.email) return false;

  const outer: Record<string, any> = {
    Me: session?.id ?? '',
    MyRole: session?.role ?? 'anon',
    MyEmail: session?.email ?? '',
  };
  try {
    // Same `{{Column}}` binding as every other row formula, so there is one
    // syntax to learn and one implementation to be wrong.
    const bound = bindSlots(text, name => (name === 'Row id' ? row?.id : row?.[name]), outer);
    return truthy(evaluateExpression(bound.expression, bound.scope));
  } catch {
    return false;                          // fail CLOSED
  }
}

// ---------------------------------------------------------------- compiling

const ident = (s: string): string => String(s).replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();

/**
 * Turn one rule into SQL, or refuse and say why.
 *
 * ANYTHING IT DOES NOT UNDERSTAND MUST NEVER BECOME `true`. A policy that says
 * true because a compiler shrugged is worse than no policy at all, because
 * somebody is relying on it.
 */
export function ruleToSql(rule: string | undefined | null, table: string): string {
  const text = String(rule ?? '').trim();
  if (!text || text === 'nobody') return 'false';
  if (text === 'anybody') return 'true';
  if (text === 'signed in') return 'auth.uid() is not null';

  /**
   * A rule cannot ask about another table. Checked on the ORIGINAL text, before
   * anything is rewritten, so a function name cannot be smuggled past by the
   * substitutions below.
   */
  if (/\b(countOf|sumOf|avgOf|minOf|maxOf|joinOf)\b/.test(text)) {
    throw new Error(
      `A rule cannot ask about another table (${text}). Put the answer in a column on this ` +
      'table and compare that — otherwise the database has to run a query for every row it looks at.',
    );
  }

  let sql = text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, col) => ident(col));
  for (const [word, replacement] of Object.entries(RULE_WORDS)) {
    sql = sql.replace(new RegExp(`\\b${word}\\b`, 'g'), replacement);
  }
  sql = sql.replace(/==/g, '=').replace(/!=/g, '<>');

  /**
   * A TEXT VALUE HAS TO BECOME A SQL STRING, NOT A COLUMN NAME.
   *
   * The bug this compiler was written with. `MyRole == "agent"` came out as
   * `... = "agent"`, and in SQL double quotes mean an IDENTIFIER: Postgres
   * would have answered `column "agent" does not exist`, or -- if a column
   * called agent happened to exist -- compared against it and said nothing.
   *
   * It was invisible because the check covering it had the same mistake written
   * into its expected value. A check written from the same wrong idea as the
   * code cannot catch the code.
   */
  sql = sql.replace(/"((?:[^"\\]|\\.)*)"/g, (_m, inner) => `'${String(inner).replace(/'/g, "''")}'`);

  /**
   * The safety test runs on the sql WITHOUT its string literals.
   *
   * Testing the whole thing rejected `{{Name}} == "José"` and `"O’Brien"` --
   * any value with a character outside plain ASCII -- because the test could
   * not tell a letter in a comparison from a letter inside a quoted value. A
   * rule about somebody's name is not exotic, and refusing it would have sent
   * people to write the rule some other way, which for security rules means
   * writing it wrong.
   *
   * The apostrophes inside are already doubled by the step above, so masking
   * cannot swallow a quote that ends a string early.
   */
  const withoutStrings = sql.replace(/'(?:[^']|'')*'/g, "''");
  const translatable = /^[\sA-Za-z0-9_'.()<>=,+\-*/]*$/;
  if (!translatable.test(withoutStrings)) {
    throw new Error(
      `This rule on ${table} uses something the database cannot be told: ${text}. A rule can ` +
      'compare columns, Me, MyRole and MyEmail with = != < > and join them with and / or.',
    );
  }
  return sql;
}

/**
 * One table's rules, as one idempotent migration.
 *
 * The same shape as the migrations already in supabase/migrations: one
 * transaction, `drop policy if exists` before `create policy`, so running it
 * twice is a no-op and running it after an edit replaces rather than
 * duplicates.
 */
export function rulesToMigration(table: string, rules: TableRules): string {
  const t = ident(table);
  const out: string[] = [
    `-- Rules for "${table}", written in the panel and compiled here.`,
    '-- GENERATED. Edit the rules in the panel; edits here are overwritten.',
    '',
    'begin;',
    '',
    `alter table public.${t} enable row level security;`,
    '',
  ];

  const policy = (op: RuleOperation, verb: string) => {
    const name = `${t}_${op}`;
    const sql = ruleToSql(rules[op], table);
    out.push(`drop policy if exists ${name} on public.${t};`);
    /**
     * INSERT USES `with check`; UPDATE USES BOTH. `using` alone on an update
     * lets a row be changed OUT of your reach -- you may edit it, and the edit
     * may set the owner to somebody else. The two halves are not the same
     * question and Postgres does not assume they are.
     */
    out.push(
      op === 'insert'
        ? `create policy ${name} on public.${t} for insert with check (${sql});`
        : op === 'update'
        ? `create policy ${name} on public.${t} for update using (${sql}) with check (${sql});`
        : `create policy ${name} on public.${t} for ${verb} using (${sql});`,
    );
    out.push('');
  };
  policy('read', 'select');
  policy('insert', 'insert');
  policy('update', 'update');
  policy('delete', 'delete');

  /**
   * Uniqueness across several columns belongs here for the same reason: it is a
   * promise the store keeps rather than a hope the page holds. One like per
   * person per post is `[['post_id','user_id']]`, and nothing a page does can
   * make it untrue.
   */
  for (const cols of rules.unique || []) {
    const list = (Array.isArray(cols) ? cols : [cols]).map(ident);
    if (!list.length) continue;
    out.push(
      `create unique index if not exists ${t}_unique_${list.join('_')} ` +
      `on public.${t} (${list.join(', ')});`,
    );
    out.push('');
  }

  out.push('commit;');
  return out.join('\n');
}

/**
 * What is wrong with a set of rules, before any of it is written.
 *
 * Three, and all three have been seen in real no-code sites.
 */
export function ruleWarnings(
  table: string,
  rules: TableRules,
  columns: { name: string }[] | undefined | null,
): string[] {
  const names = (columns || []).map(c => String(c?.name ?? ''));
  const out: string[] = [];

  if (!String(rules.read ?? '').trim() || rules.read === 'nobody') {
    out.push(
      `Nothing can read "${table}". Every list of it will be empty, and it will look like the data is gone.`,
    );
  }
  if (rules.read === 'anybody' && names.some(c => /email|phone|address|password|token|secret/i.test(c))) {
    out.push(
      `Anybody can read "${table}", and it has a column that looks personal. ` +
      'Everything in it reaches every visitor’s browser.',
    );
  }
  /**
   * THE ONE NOBODY EXPECTS, and the reason this function exists.
   *
   * An add-rule of "signed in" on a table with an owner column lets anybody
   * signed in write a row IN SOMEBODY ELSE'S NAME. Almost nobody pins the owner
   * first time, and nothing about the page looks wrong afterwards.
   */
  const owner = names.find(c => /^(owner|user_id|userid|author|created_by|createdby)$/i.test(c));
  const insert = String(rules.insert ?? '').trim();
  if (owner && insert && insert !== 'nobody' && !new RegExp(`\\{\\{\\s*${owner}\\s*\\}\\}[^]*\\bMe\\b`, 'i').test(insert)) {
    out.push(
      `Anybody who can add to "${table}" can set ${owner} to somebody else. ` +
      `Say {{${owner}}} == Me in the add rule, or a visitor can write rows in another person’s name.`,
    );
  }
  return out;
}
