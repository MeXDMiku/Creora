import jsep from 'jsep';
import { evaluateCondition } from './conditions';

/**
 * What a formula can say.
 *
 * WHAT IT COULD SAY BEFORE
 * `+ - * / %` and nothing else. Not a single function, no comparison, no
 * condition, and every value forced through `Number()` so text was impossible.
 *
 * The worse half was the silence. The old evaluator ended in `default: return 0`,
 * so `if(Stock > 0, "In stock", "Sold out")` -- a CallExpression -- returned **0**
 * with no error, and so did `Price > 100`. A builder writing the most ordinary
 * formula in any spreadsheet got a zero and no reason. Wrong answers that look
 * like answers are the expensive kind.
 *
 * WHAT IT SAYS NOW
 *   if(Stock > 0, "In stock", "Sold out")     a branch, returning text
 *   round(Subtotal * 0.18, 2)                 tax to two places
 *   if(Subtotal >= 500, 0, 50)                free delivery over 500
 *   clamp(Score, 0, 100)                      never off the end of the scale
 *   join(" ", First, Last)                    text out of two fields
 *   and(Agreed, not(isBlank(Email)))          several things at once
 *
 * TWO RULES IT IS BUILT ON
 *
 * 1. Comparisons are not implemented here. `>` `<` `>=` `<=` `==` `!=` all hand
 *    over to `evaluateCondition`, which is the same code a workflow condition
 *    and a visitor's search box already use. Writing them again would mean
 *    "equals" quietly meaning two things depending on where you typed it -- and
 *    it would lose the blank-is-not-zero rule that cost a cycle to find: an
 *    empty cell is missing data, so `Score < 9` is false for a Score nobody
 *    filled in, not true.
 *
 * 2. A formula that cannot be answered THROWS, with a sentence. Blocks already
 *    have an error channel and show `Error` when a formula fails, so the honest
 *    move is to use it. Unknown function, wrong number of arguments, a block
 *    that is not on the page -- all say so by name. The one deliberate
 *    exception is dividing by zero, which returns 0 exactly as it always has,
 *    because a half-typed formula should not shout while it is being typed.
 *
 * Arithmetic still coerces to number exactly as before, so every formula saved
 * before today produces the number it produced yesterday. There is a check that
 * says so.
 */

/** A formula answers with one of these. It was number-only before. */
export type FormulaValue = number | string | boolean;

/** Blank means "nobody filled this in", and is not zero. */
function isBlankValue(v: any): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** Arithmetic coercion: what the old evaluator did to every value it touched. */
function num(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isBlankValue(v)) return 0;
  const n = Number(v);
  return isNaN(n) ? NaN : n;
}

function text(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

/** Truthiness, said the way a builder means it rather than the way JS means it. */
export function truthy(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (isBlankValue(v)) return false;
  const lowered = String(v).trim().toLowerCase();
  if (lowered === 'false' || lowered === 'no' || lowered === '0') return false;
  return true;
}

function need(name: string, args: any[], least: number, most = Infinity): void {
  if (args.length < least || args.length > most) {
    const wanted =
      most === Infinity
        ? `at least ${least}`
        : least === most
          ? `${least}`
          : `${least} to ${most}`;
    throw new Error(
      `${name}() needs ${wanted} ${least === 1 && most === 1 ? 'value' : 'values'}, and was given ${args.length}`,
    );
  }
}

/**
 * The function library.
 *
 * Deliberately small and combinable rather than long: `if`, a handful of number
 * functions and a handful of text ones cover what a page actually computes, and
 * every one of them composes with every other. Twenty more functions would add
 * twenty behaviours; these add the combinations.
 */
export const FORMULA_FUNCTIONS: Record<string, (args: any[]) => FormulaValue> = {
  // --- choosing ---
  if: a => {
    need('if', a, 2, 3);
    return truthy(a[0]) ? a[1] : a.length > 2 ? a[2] : '';
  },
  and: a => {
    need('and', a, 1);
    return a.every(truthy);
  },
  or: a => {
    need('or', a, 1);
    return a.some(truthy);
  },
  not: a => {
    need('not', a, 1, 1);
    return !truthy(a[0]);
  },
  isblank: a => {
    need('isBlank', a, 1, 1);
    return isBlankValue(a[0]);
  },

  // --- numbers ---
  min: a => {
    need('min', a, 1);
    return Math.min(...a.map(num));
  },
  max: a => {
    need('max', a, 1);
    return Math.max(...a.map(num));
  },
  sum: a => a.map(num).reduce((t, n) => t + n, 0),
  avg: a => {
    need('avg', a, 1);
    return a.map(num).reduce((t, n) => t + n, 0) / a.length;
  },
  abs: a => {
    need('abs', a, 1, 1);
    return Math.abs(num(a[0]));
  },
  floor: a => {
    need('floor', a, 1, 1);
    return Math.floor(num(a[0]));
  },
  ceil: a => {
    need('ceil', a, 1, 1);
    return Math.ceil(num(a[0]));
  },
  /**
   * Rounding is done on a shifted integer rather than with toFixed, because
   * toFixed hands back a string and a formula that returns "1.50" instead of
   * 1.5 stops being a number for everything downstream.
   */
  round: a => {
    need('round', a, 1, 2);
    const places = a.length > 1 ? Math.max(0, Math.floor(num(a[1]))) : 0;
    const factor = Math.pow(10, places);
    return Math.round((num(a[0]) + Number.EPSILON) * factor) / factor;
  },
  pow: a => {
    need('pow', a, 2, 2);
    return Math.pow(num(a[0]), num(a[1]));
  },
  sqrt: a => {
    need('sqrt', a, 1, 1);
    const n = num(a[0]);
    // Negative roots are not an error a builder can act on; they are a typo.
    return n < 0 ? 0 : Math.sqrt(n);
  },
  clamp: a => {
    need('clamp', a, 3, 3);
    const [v, lo, hi] = [num(a[0]), num(a[1]), num(a[2])];
    // Written so a swapped low and high still returns something inside them,
    // rather than the empty range Math.min(Math.max(...)) would give.
    return Math.min(Math.max(v, Math.min(lo, hi)), Math.max(lo, hi));
  },

  // --- text ---
  len: a => {
    need('len', a, 1, 1);
    return text(a[0]).length;
  },
  upper: a => {
    need('upper', a, 1, 1);
    return text(a[0]).toUpperCase();
  },
  lower: a => {
    need('lower', a, 1, 1);
    return text(a[0]).toLowerCase();
  },
  trim: a => {
    need('trim', a, 1, 1);
    return text(a[0]).trim();
  },
  join: a => {
    need('join', a, 1);
    // Blanks are skipped so `join(" ", First, Last)` with no surname does not
    // come out with a trailing space.
    return a
      .slice(1)
      .filter(v => !isBlankValue(v))
      .map(text)
      .join(text(a[0]));
  },
  concat: a => a.map(text).join(''),
  contains: a => {
    need('contains', a, 2, 2);
    return text(a[0]).toLowerCase().includes(text(a[1]).toLowerCase());
  },
  startswith: a => {
    need('startsWith', a, 2, 2);
    return text(a[0]).toLowerCase().startsWith(text(a[1]).toLowerCase());
  },
  endswith: a => {
    need('endsWith', a, 2, 2);
    return text(a[0]).toLowerCase().endsWith(text(a[1]).toLowerCase());
  },
  replace: a => {
    need('replace', a, 3, 3);
    return text(a[0]).split(text(a[1])).join(text(a[2]));
  },
  left: a => {
    need('left', a, 2, 2);
    return text(a[0]).slice(0, Math.max(0, Math.floor(num(a[1]))));
  },
  right: a => {
    need('right', a, 2, 2);
    const n = Math.max(0, Math.floor(num(a[1])));
    return n === 0 ? '' : text(a[0]).slice(-n);
  },

  // --- saying which kind of thing it is ---
  number: a => {
    need('number', a, 1, 1);
    const n = num(a[0]);
    return isNaN(n) ? 0 : n;
  },
  text: a => {
    need('text', a, 1, 1);
    return text(a[0]);
  },
};

/** The names as a builder types them, for help text and for the inspector. */
export const FORMULA_FUNCTION_NAMES = [
  'if', 'and', 'or', 'not', 'isBlank',
  'min', 'max', 'sum', 'avg', 'abs', 'floor', 'ceil', 'round', 'pow', 'sqrt', 'clamp',
  'len', 'upper', 'lower', 'trim', 'join', 'concat',
  'contains', 'startsWith', 'endsWith', 'replace', 'left', 'right',
  'number', 'text',
] as const;

/** Every comparison hands over to the one vocabulary. See rule 1 above. */
const COMPARISONS: Record<string, string> = {
  '>': 'greaterThan',
  '<': 'lessThan',
  '>=': 'greaterOrEqual',
  '<=': 'lessOrEqual',
  '==': 'equals',
  '===': 'equals',
  '!=': 'notEquals',
  '!==': 'notEquals',
};

/**
 * `and` and `or` as words, not just as functions.
 *
 * `and(A, B)` and `A && B` both worked; `A and B` did not, and that is what a
 * person who has never written code actually types -- it was written that way
 * in the first draft of a check, by someone who had just built the language.
 * jsep is told about them once, at module load, and they sit at the same
 * precedence as their symbol forms so the two spellings cannot disagree.
 *
 * `not` stays a function: `not X` reads fine in English but binds ambiguously
 * next to a comparison, and `not(X)` is unmistakable.
 */
jsep.addBinaryOp('and', 2);
jsep.addBinaryOp('or', 1);

export function evaluateExpression(formula: string, scope: Record<string, any>): FormulaValue {
  if (!formula || formula.trim() === '') return 0;

  let ast: any;
  try {
    ast = jsep(formula);
  } catch {
    throw new Error('That formula could not be read. Check the brackets and quotes.');
  }

  const walk = (node: any): any => {
    switch (node.type) {
      // Raw, not Number(). This is what makes text possible at all -- the old
      // evaluator put every literal through Number(), so "paid" was NaN.
      case 'Literal':
        return node.value;

      case 'Identifier': {
        const name = node.name;
        // `true`, `false` and `blank` read as words rather than as blocks.
        const lowered = name.toLowerCase();
        if (lowered === 'true') return true;
        if (lowered === 'false') return false;
        if (lowered === 'blank' || lowered === 'empty') return '';
        if (!(name in scope)) {
          throw new Error(`Referenced block "${name}" does not exist`);
        }
        return scope[name];
      }

      case 'UnaryExpression': {
        const arg = walk(node.argument);
        if (node.operator === '-') return -num(arg);
        if (node.operator === '+') return num(arg);
        if (node.operator === '!') return !truthy(arg);
        throw new Error(`"${node.operator}" is not something a formula can do`);
      }

      case 'BinaryExpression': {
        const op = node.operator;

        /**
         * jsep reports `&&` and `||` as BinaryExpression, not LogicalExpression,
         * so they have to be caught here -- and before both sides are worked
         * out, so they short-circuit the way anyone writing them expects.
         * The LogicalExpression case below is kept anyway: jsep has reported
         * them that way in other versions, and a silent behaviour change on a
         * dependency bump is not worth saving four lines.
         */
        if (op === '&&' || op === 'and') return truthy(walk(node.left)) && truthy(walk(node.right));
        if (op === '||' || op === 'or') return truthy(walk(node.left)) || truthy(walk(node.right));

        const left = walk(node.left);
        const right = walk(node.right);

        const asCondition = COMPARISONS[op];
        if (asCondition) return evaluateCondition(left, asCondition, right);

        switch (op) {
          case '+': return num(left) + num(right);
          case '-': return num(left) - num(right);
          case '*': return num(left) * num(right);
          // Kept from the original on purpose: a formula being typed should not
          // shout the moment the divisor is momentarily empty.
          case '/': return num(right) !== 0 ? num(left) / num(right) : 0;
          case '%': return num(right) !== 0 ? num(left) % num(right) : 0;
          default:
            throw new Error(`"${op}" is not something a formula can do`);
        }
      }

      case 'LogicalExpression': {
        const op = node.operator;
        if (op === '&&' || op === 'and') return truthy(walk(node.left)) && truthy(walk(node.right));
        if (op === '||' || op === 'or') return truthy(walk(node.left)) || truthy(walk(node.right));
        throw new Error(`"${op}" is not something a formula can do`);
      }

      case 'ConditionalExpression':
        return truthy(walk(node.test)) ? walk(node.consequent) : walk(node.alternate);

      case 'CallExpression': {
        if (node.callee?.type !== 'Identifier') {
          throw new Error('Only the built-in functions can be called in a formula');
        }
        const typed = node.callee.name;
        const fn = FORMULA_FUNCTIONS[typed.toLowerCase()];
        if (!fn) {
          throw new Error(
            `There is no function called "${typed}". Available: ${FORMULA_FUNCTION_NAMES.join(', ')}`,
          );
        }
        // `if` is not lazy. Both branches are worked out before one is chosen,
        // which is fine because nothing here has an effect -- but it does mean
        // if(isBlank(X), 0, 10 / X) still evaluates the division, and division
        // by zero is 0 rather than an error, so it stays harmless.
        return fn(node.arguments.map(walk));
      }

      case 'ArrayExpression':
        return node.elements.map(walk);

      case 'MemberExpression':
        throw new Error('A formula refers to a block by its own name, not with a dot');

      case 'Compound':
        throw new Error('One formula at a time -- remove the comma or semicolon');

      default:
        throw new Error('That formula could not be read');
    }
  };

  const result = walk(ast);
  if (typeof result === 'number') return isNaN(result) ? 0 : result;
  if (typeof result === 'boolean' || typeof result === 'string') return result;
  if (Array.isArray(result)) return result.join(', ');
  return 0;
}

/**
 * The names a formula reads a value from.
 *
 * WHY THIS EXISTS (and why it is a real parse, not a regular expression)
 * Something has to FETCH those values before the formula can be worked out.
 * A computed slot -- `{{calc: Price * Qty}}` -- is filled by a layer that
 * resolves slot names to values ahead of time, and it can only fetch what it
 * has been told about. Without this the layer asks for a block called
 * "calc: Price * Qty", gets nothing, and every computed slot on a page renders
 * empty while looking completely reasonable in the editor.
 *
 * It walks the parsed formula rather than matching text because the difference
 * is not academic:
 *
 *   round(Total)    -- `round` is a function, not a value to go looking for
 *   "Total is high" -- inside quotes; a name in prose is prose
 *   true, and, or   -- words the language itself owns
 *
 * The Health panel learned each of those three the hard way with a regular
 * expression, and reported five imaginary missing blocks for every formula
 * until it did. Doing it from the syntax tree means it cannot be wrong about
 * which is which.
 *
 * An unreadable formula yields no names rather than throwing. The caller is
 * fetching values, not judging the formula; whoever evaluates it will produce
 * the real error, and there is exactly one place that should.
 */
export function identifiersIn(formula: string | undefined | null): string[] {
  const text = String(formula ?? '').trim();
  if (!text) return [];

  let ast: any;
  try {
    ast = jsep(text);
  } catch {
    return [];
  }

  const found: string[] = [];
  const add = (name: string) => {
    const lowered = name.toLowerCase();
    // The words the language answers itself. Kept in step with the Identifier
    // case in evaluateExpression above -- these never reach a scope lookup.
    if (lowered === 'true' || lowered === 'false' || lowered === 'blank' || lowered === 'empty') return;
    if (!found.includes(name)) found.push(name);
  };

  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    switch (node.type) {
      case 'Identifier':
        add(node.name);
        return;
      case 'CallExpression':
        // The callee is the function's name, not a value. Only arguments hold
        // things to fetch.
        (node.arguments || []).forEach(walk);
        return;
      case 'UnaryExpression':
        walk(node.argument);
        return;
      case 'BinaryExpression':
      case 'LogicalExpression':
        walk(node.left);
        walk(node.right);
        return;
      case 'ConditionalExpression':
        walk(node.test);
        walk(node.consequent);
        walk(node.alternate);
        return;
      case 'ArrayExpression':
        (node.elements || []).forEach(walk);
        return;
      case 'Compound':
        (node.body || []).forEach(walk);
        return;
      default:
        // Literal, MemberExpression and anything a future jsep adds: nothing
        // to fetch, and evaluateExpression is the one that objects.
        return;
    }
  };

  walk(ast);
  return found;
}
