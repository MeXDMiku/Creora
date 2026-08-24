/**
 * Primitive B: the Action — a named sequence of writes that happens where the
 * data is, all of it or none of it.
 *
 * WHY THIS IS THE ONE THAT MATTERS
 * The other five primitives make a page say more. This is the only place a page
 * can be **wrong on purpose**. Today a button runs its steps in the browser: the
 * page decides the price, the page decides who the author is, the page decides
 * whether there is enough stock — and every one of those is a sentence a visitor
 * can edit before it is sent. The oldest bug in commerce is trusting a price the
 * page sent, and Creora has no way to not.
 *
 * THE SENTENCE THIS FILE DISAGREES WITH
 * `docs/CONNECTING_THE_TWO.md` ranked Actions third with the note *"Needs a
 * server, which is the real cost"*, and that is what kept it behind two other
 * primitives. It assumed **server** meant a place to run code that somebody has
 * to pay for. Creora already has somewhere to put trusted code, already pays
 * nothing for it, and already trusts it with every row: a Postgres function,
 * `security definer`, on the free tier that is holding the tables.
 *
 * Rules compile to a policy. An Action compiles to a function. Same shape, same
 * migration button, same promise — written here, enforced there.
 *
 * AND ALL-OR-NONE COMES FREE. A plpgsql function is one transaction; a refusal
 * raises, and Postgres rolls back everything before it. Nothing here implements
 * that. It is INHERITED, which is the whole argument for compiling rather than
 * interpreting: an interpreter would have to get it right, a compiler gets to
 * not have to.
 *
 * TWO THINGS THAT MUST AGREE
 *   runAction    what the panel previews, in TypeScript
 *   toFunction   what actually runs, in SQL
 * They share no code, and the checks hold them to the same answers on the same
 * actions. If a preview says "this would refuse" and the function lets it
 * through, the preview is a lie — and a confident lie is worse than none.
 *
 * LOG
 * 2026-08-23  Written. Interpreter, compiler, warnings, and the checks that
 *             hold the first two to each other.
 */
import { truthy, type TableScope } from './formula';
import { rowFormulaValue } from './rows';

const SLOT = /\{\{\s*([^}]+?)\s*\}\}/g;

// ---------------------------------------------------------------- the words

/**
 * The five things a step can be.
 *
 * DELIBERATELY FIVE. Fifty years of these tools say a thousand nodes is the same
 * problem as a thousand functions. Everything the lab's seven sites wanted —
 * checkout, assigning a ticket, taking a booking, closing a thread, a file and
 * its row going up together — is these five in a different order.
 */
export const STEP_WORDS = [
  'refuse when', 'remember', 'add row to', 'change rows in', 'remove rows from',
] as const;
export type StepKind = typeof STEP_WORDS[number];

/** Values only the server can know, and therefore the only safe spellings. */
export const SERVER_WORDS = ['Me', 'MyEmail', 'MyRole', 'Now'];

export interface ActionStep {
  kind: StepKind | string;
  /** refuse when */
  when?: string;
  message?: string;
  /** remember / change / remove / add */
  table?: string;
  where?: string;
  /** remember */
  name?: string;
  column?: string;
  /** add / change */
  set?: Record<string, string>;
  /** add — keep the new row's id under this name for later steps */
  remember?: string;
}

export interface CreoraAction {
  id: string;
  name: string;
  /** What a visitor is allowed to hand it. Everything else must be read. */
  takes?: string[];
  steps: ActionStep[];
}

export interface ActionChange {
  at: string;
  kind: 'remember' | 'add' | 'change' | 'remove';
  table?: string;
  name?: string;
  value?: any;
  row?: Record<string, any>;
  count?: number;
}

export interface ActionResult {
  ok: boolean;
  /** Which step said no, so the panel can point at it. */
  refusedAt?: number;
  message?: string;
  changes: ActionChange[];
  tables?: Record<string, Record<string, any>[]>;
}

const columnsOf = (tables: TableScope | undefined, name: string): string[] => {
  const table = (tables || {})[name];
  const declared = (table?.columns || []).map(c => String(c));
  if (declared.length) return declared;
  const seen = new Set<string>();
  for (const row of table?.rows || []) {
    for (const key of Object.keys(row || {})) if (key !== 'id') seen.add(key);
  }
  return [...seen];
};

/**
 * Where a value came from, which is the whole point of this primitive.
 *
 * A formula mentioning a column of a table the action itself read is TRUSTED:
 * that value is fetched inside the transaction and a visitor never touched it.
 * A `{{Slot}}` that is not a column of anything the action read came from the
 * page — which is fine for a message and catastrophic for a price.
 */
export function originOf(
  text: string,
  tablesRead: Set<string> | string[],
  tables: TableScope | undefined,
  remembered: Set<string> = new Set(),
): { names: string[]; fromPage: string[]; anyTrusted: boolean; trusted: boolean } {
  const raw = String(text ?? '');
  const names = [...raw.matchAll(SLOT)].map(m => m[1].trim());
  const columns = new Set<string>();
  for (const name of tablesRead) for (const column of columnsOf(tables, name)) columns.add(column);
  const isTrusted = (n: string) => columns.has(n) || remembered.has(n) || SERVER_WORDS.includes(n);
  const fromPage = names.filter(n => !isTrusted(n));
  // A bare server word is trusted too, and is not a {{slot}}, so it has to be
  // looked for in the text rather than in the list of names.
  const anyTrusted = names.some(isTrusted) || SERVER_WORDS.some(w => new RegExp(`\\b${w}\\b`).test(raw));
  return { names, fromPage, anyTrusted, trusted: fromPage.length === 0 };
}

// ---------------------------------------------------------------- reading it

/** The action as one sentence, for somebody checking their own work. */
export function describeAction(action: CreoraAction | null | undefined): string {
  const steps = (action?.steps || []).length;
  return `${action?.name || 'This action'}: ${steps} step${steps === 1 ? '' : 's'}`
    + (action?.takes?.length ? `, given ${action.takes.join(', ')}` : ', given nothing');
}

/**
 * Everything about this action that should stop somebody publishing it.
 *
 * Same job as ruleWarnings: printed beside the boxes, and the difference between
 * a builder who knows what they built and one who finds out from a stranger.
 */
export function warningsFor(
  action: CreoraAction | null | undefined,
  tables: TableScope | undefined,
): string[] {
  const out: string[] = [];
  const read = new Set<string>();
  /**
   * A REMEMBERED NAME IS TRUSTED, AND ONLY FROM THE STEP THAT REMEMBERED IT.
   *
   * Without this the warning fired on `Total = {{Price}} * {{Qty}}` — the
   * CORRECT spelling, the one this whole primitive exists to make possible —
   * because Price is not a column of anything and not a server word. A warning
   * that goes off on the right answer is worse than no warning at all: it is
   * exactly how people learn to click past them.
   */
  const remembered = new Set<string>();

  for (const [i, step] of (action?.steps || []).entries()) {
    const at = `Step ${i + 1}`;
    if (step.table && (step.kind === 'remember' || step.kind === 'change rows in' || step.kind === 'remove rows from')) {
      read.add(step.table);
    }
    if (step.kind === 'add row to' || step.kind === 'change rows in') {
      for (const [column, formula] of Object.entries(step.set || {})) {
        const origin = originOf(formula, read, tables, remembered);
        /**
         * WARN WHEN NOTHING IN THE VALUE IS TRUSTED, not when anything in it is
         * untrusted. `{{Price}} * {{Qty}}` is safe BECAUSE the price is
         * trusted: a visitor may choose how many they want, and the money
         * still comes from the table. `{{Total}}` on its own is the bug.
         */
        if (origin.fromPage.length && !origin.anyTrusted) {
          out.push(
            `${at}: ${column} is whatever the page said (${origin.fromPage.join(', ')}). `
            + 'If that is a price, a total, or who did it, a visitor can change it. '
            + `Read it from a table in an earlier step instead, or use ${SERVER_WORDS.join(', ')}.`,
          );
        }
      }
    }
    if (step.kind === 'remember' && step.name) remembered.add(step.name);
    if (step.kind === 'add row to' && step.remember) remembered.add(step.remember);
    if (step.kind === 'remove rows from' && !String(step.where ?? '').trim()) {
      out.push(`${at}: this removes EVERY row in ${step.table}. Say which ones.`);
    }
    if (step.kind === 'change rows in' && !String(step.where ?? '').trim()) {
      out.push(`${at}: this changes EVERY row in ${step.table}. Say which ones.`);
    }
  }

  if (!(action?.steps || []).some(s => s.kind === 'refuse when')) {
    out.push(
      'Nothing in this action can refuse. Every action that writes something a '
      + 'visitor asked for wants at least one — "not enough left", "already taken", "not yours".',
    );
  }
  return out;
}

// ---------------------------------------------------------------- running it

/**
 * What the action WOULD do, in the browser, so the panel can show it.
 *
 * NOT WHAT ACTUALLY RUNS — `toFunction` is. This exists so a builder can press a
 * button and read "would add 1 row to Orders, would refuse: there are not that
 * many left" before any of it is real. It writes to a copy and hands the copy
 * back; nothing it does can reach the store.
 */
export function runAction(
  action: CreoraAction | null | undefined,
  tables: TableScope | undefined,
  given?: Record<string, any>,
): ActionResult {
  /**
   * THE SERVER WORDS ARE THIS FILE'S VOCABULARY, NOT THE FORMULA ENGINE'S.
   *
   * Found by the checks in the lab: `At = Now` threw "there is nothing called
   * Now here", so the whole happy path came back as a crash while every
   * refusal check passed — a suite that looked mostly green about an action
   * that could not run at all. The words only mean anything inside an action,
   * so an action supplies them rather than asking the expression language to
   * grow four globals for one caller's benefit.
   */
  const scope: Record<string, any> = {
    Now: new Date().toISOString(), Me: '', MyEmail: '', MyRole: '', ...(given || {}),
  };
  const changes: ActionChange[] = [];
  const store: Record<string, Record<string, any>[]> = {};
  for (const [name, table] of Object.entries(tables || {})) {
    store[name] = (table?.rows || []).map(r => ({ ...r }));
  }
  const asScope = (): TableScope => Object.fromEntries(
    Object.entries(store).map(([n, rows]) => [n, { rows, columns: columnsOf(tables, n) }]),
  );

  for (const [i, step] of (action?.steps || []).entries()) {
    const at = `Step ${i + 1}`;
    /**
     * ONE EVALUATOR, THE SAME ONE EVERY OTHER BOX IN CREORA USES.
     *
     * `rowFormulaValue`, not `evaluateExpression` — because `{{Slot}}` is only
     * bound in a ROW context, and calling the plain engine got
     * "that formula could not be read" on `{{id}} == {{ProductId}}`, which is
     * a sentence about brackets in a formula whose brackets are fine.
     *
     * The row is `{ ...scope, ...row }` so `{{ProductId}}` reaches a given
     * value and `{{Stock}}` reaches the row's own column — the ROW WINS on a
     * collision, because inside a step about a row, that is what the name is
     * plainly about.
     */
    const ev = (text: string | undefined, row?: Record<string, any>) => {
      const { value, error } = rowFormulaValue({ ...scope, ...(row || {}) }, String(text ?? ''), {
        tables: asScope(),
        pageValues: scope,
      });
      // A formula that cannot be worked out FAILS THE ACTION rather than
      // counting as false. Failing open here would write the row anyway.
      if (error) throw new Error(`${at}: ${error}`);
      return value;
    };

    try {
      switch (step.kind) {
        case 'refuse when': {
          if (truthy(ev(step.when))) {
            return {
              ok: false,
              refusedAt: i,
              // The builder's own words. A refusal a visitor cannot act on is
              // the same as a refusal with no words at all.
              message: String(step.message || 'That cannot be done.'),
              changes: [],
            };
          }
          break;
        }
        case 'remember': {
          const rows = (store[step.table || ''] || []).filter(
            r => !String(step.where ?? '').trim() || truthy(ev(step.where, r)),
          );
          scope[step.name || ''] = step.column ? (rows[0] || {})[step.column] : rows.length;
          changes.push({ at, kind: 'remember', name: step.name, value: scope[step.name || ''] });
          break;
        }
        case 'add row to': {
          const row: Record<string, any> = { id: `new${changes.length}` };
          for (const [column, formula] of Object.entries(step.set || {})) row[column] = ev(formula);
          store[step.table || ''] = [...(store[step.table || ''] || []), row];
          if (step.remember) scope[step.remember] = row.id;
          changes.push({ at, kind: 'add', table: step.table, row });
          break;
        }
        case 'change rows in': {
          let n = 0;
          store[step.table || ''] = (store[step.table || ''] || []).map(r => {
            if (String(step.where ?? '').trim() && !truthy(ev(step.where, r))) return r;
            n++;
            const next = { ...r };
            for (const [column, formula] of Object.entries(step.set || {})) next[column] = ev(formula, r);
            return next;
          });
          changes.push({ at, kind: 'change', table: step.table, count: n });
          break;
        }
        case 'remove rows from': {
          const before = (store[step.table || ''] || []).length;
          store[step.table || ''] = (store[step.table || ''] || []).filter(
            r => (String(step.where ?? '').trim() ? !truthy(ev(step.where, r)) : false),
          );
          changes.push({ at, kind: 'remove', table: step.table, count: before - store[step.table || ''].length });
          break;
        }
        default:
          return { ok: false, refusedAt: i, message: `${at}: no idea what "${step.kind}" means.`, changes: [] };
      }
    } catch (err: any) {
      // Nothing partial is handed back. The real thing is one transaction, so
      // a preview that showed three of six steps would be showing a state the
      // database will never be in.
      return { ok: false, refusedAt: i, message: String(err?.message || err), changes: [] };
    }
  }
  return { ok: true, changes, tables: store };
}

// ---------------------------------------------------------------- compiling it

const quote = (s: any) => `'${String(s).replace(/'/g, "''")}'`;
const ident = (s: any) => String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * A formula becomes a SQL expression.
 *
 * THE THREE KINDS OF NAME, which are one `{{Name}}` on the builder's screen and
 * must be three different things in the SQL:
 *
 *   given      p_qty     the page — a visitor typed it
 *   remembered v_left    a table, read inside the transaction
 *   a column   stock     the row being written
 *
 * Getting this wrong is not a syntax error. It is a price a visitor can set.
 */
export function toSql(
  text: string | undefined,
  { rowAlias = '', params = new Set<string>(), remembered = new Set<string>() } = {},
): string {
  let sql = String(text ?? '').trim();
  if (!sql) return 'true';

  sql = sql.replace(SLOT, (_m, raw) => {
    const name = String(raw).trim();
    if (remembered.has(name)) return `v_${ident(name)}`;
    if (params.has(name)) return `p_${ident(name)}`;
    return rowAlias ? `${rowAlias}.${ident(name)}` : ident(name);
  });

  sql = sql.replace(/\bMe\b/g, 'auth.uid()');
  sql = sql.replace(/\bMyEmail\b/g, "(auth.jwt() ->> 'email')");
  sql = sql.replace(/\bMyRole\b/g, "(auth.jwt() ->> 'role')");
  sql = sql.replace(/\bNow\b/g, 'now()');

  // A double-quoted value is TEXT. In Postgres a double quote is an IDENTIFIER,
  // and `MyRole == "agent"` compiling to a quoted identifier is a real bug this
  // project has already had once: the policy matched a column that did not
  // exist and failed open.
  sql = sql.replace(/"((?:[^"\\]|\\.)*)"/g, (_m, inner) => quote(inner));

  sql = sql.replace(/([^=!<>])==([^=])/g, '$1=$2');
  sql = sql.replace(/!=/g, '<>');
  return sql;
}

/**
 * The whole action as one Postgres function.
 *
 * `security definer` is what makes it trusted: it runs as the owner, so it can
 * write tables the visitor's own policies would refuse — the entire reason to
 * move the work here.
 *
 * `set search_path = public` is not decoration. A `security definer` function
 * without one is the standard way to hand somebody else's schema the keys.
 *
 * `revoke all … from public` is there because a function is callable by default,
 * and an action nobody has to be signed in for is not an action, it is an
 * endpoint.
 */
export function toFunction(action: CreoraAction | null | undefined): string {
  const name = `creora_${ident(action?.name || 'action')}`;
  const params = new Set(action?.takes || []);
  const args = [...params].map(p => `p_${ident(p)} text`).join(', ');
  const signature = [...params].map(() => 'text').join(', ');
  const remembered = new Set<string>();
  const lines: string[] = [];
  const declares: string[] = [];
  const opts = () => ({ params, remembered });

  for (const [i, step] of (action?.steps || []).entries()) {
    lines.push(`  -- step ${i + 1}: ${step.kind}`);
    switch (step.kind) {
      case 'refuse when':
        lines.push(`  if ${toSql(step.when, opts())} then`);
        lines.push(`    raise exception ${quote(step.message || 'That cannot be done.')};`);
        lines.push('  end if;');
        break;
      case 'remember':
        declares.push(`  v_${ident(step.name)} ${step.column ? 'text' : 'integer'};`);
        lines.push(
          `  select ${step.column ? ident(step.column) : 'count(*)'} into v_${ident(step.name)}`
          + ` from ${ident(step.table)}`
          + (String(step.where ?? '').trim() ? ` where ${toSql(step.where, opts())}` : '')
          + (step.column ? ' limit 1' : '') + ';',
        );
        remembered.add(String(step.name));
        break;
      case 'add row to': {
        const cols = Object.keys(step.set || {});
        if (step.remember) declares.push(`  v_${ident(step.remember)} uuid;`);
        lines.push(
          `  insert into ${ident(step.table)} (${cols.map(ident).join(', ')})`
          + ` values (${cols.map(c => toSql((step.set || {})[c], opts())).join(', ')})`
          + (step.remember ? ` returning id into v_${ident(step.remember)}` : '') + ';',
        );
        if (step.remember) remembered.add(step.remember);
        break;
      }
      case 'change rows in': {
        const cols = Object.keys(step.set || {});
        lines.push(
          `  update ${ident(step.table)} set `
          + cols.map(c => `${ident(c)} = ${toSql((step.set || {})[c], opts())}`).join(', ')
          + (String(step.where ?? '').trim() ? ` where ${toSql(step.where, opts())}` : '') + ';',
        );
        break;
      }
      case 'remove rows from':
        lines.push(
          `  delete from ${ident(step.table)}`
          + (String(step.where ?? '').trim() ? ` where ${toSql(step.where, opts())}` : '') + ';',
        );
        break;
      default:
        lines.push(`  -- unknown step "${step.kind}" — nothing generated`);
    }
  }

  return [
    `-- ${describeAction(action)}`,
    '-- Written in Creora. Until this migration is run, this action is NOT running.',
    `create or replace function ${name}(${args})`,
    'returns void',
    'language plpgsql',
    'security definer',
    'set search_path = public',
    'as $$',
    ...(declares.length ? ['declare', ...declares] : []),
    'begin',
    ...lines,
    'end;',
    '$$;',
    '',
    `revoke all on function ${name}(${signature}) from public;`,
    `grant execute on function ${name}(${signature}) to authenticated;`,
  ].join('\n');
}
