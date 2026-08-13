/**
 * The one vocabulary for "does this value match?".
 *
 * Lifted out of bindingEngine so it can be used by things that must not import
 * the engine -- rows.ts is pure and the engine reaches Supabase. The reason it
 * matters is not the import graph: it is that a visitor typing in a search box
 * and a workflow deciding whether to run a step are asking the same question,
 * and answering it twice would mean "contains" quietly meaning two things.
 *
 * Operators come in pairs on purpose: every positive has a negative, because
 * "only when X has NOT happened" is as common as the other way round.
 */
/**
 * Both sides as numbers, or null when either one is not a number at all.
 *
 * The null case is the point. An empty cell is missing data, not zero, and
 * `Number('')` is 0 -- so "Score is less than 9" was true for every row whose
 * Score had never been filled in. That is the same mistake as sorting blanks
 * first, and it is the one that quietly puts wrong rows in front of people.
 */
function numericPair(actual: any, expected: any): [number, number] | null {
  const blank = (v: any) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  if (blank(actual) || blank(expected)) return null;
  const a = Number(actual);
  const b = Number(expected);
  if (isNaN(a) || isNaN(b)) return null;
  return [a, b];
}

export function evaluateCondition(actual: any, operator: string, expected: any): boolean {
  const asNumber = (v: any) => Number(v);
  const bothNumeric =
    (typeof actual === 'number' || (actual !== null && actual !== '' && !isNaN(Number(actual)))) &&
    expected !== undefined && expected !== null && expected !== '' && !isNaN(Number(expected));

  switch (operator) {
    case 'is ON':
    case 'is_ON':
      return actual === true;
    case 'is OFF':
    case 'is_OFF':
      return actual === false;
    case 'equals':
      return bothNumeric ? asNumber(actual) === asNumber(expected) : actual === expected;
    case 'notEquals':
      return bothNumeric ? asNumber(actual) !== asNumber(expected) : actual !== expected;
    // Every comparison goes through numericPair, so a blank on either side is
    // "cannot be compared" rather than "zero".
    case 'greaterThan':
    case 'greater than': {
      const pair = numericPair(actual, expected);
      return pair ? pair[0] > pair[1] : false;
    }
    case 'lessThan':
    case 'less than': {
      const pair = numericPair(actual, expected);
      return pair ? pair[0] < pair[1] : false;
    }
    case 'greaterOrEqual': {
      const pair = numericPair(actual, expected);
      return pair ? pair[0] >= pair[1] : false;
    }
    case 'lessOrEqual': {
      const pair = numericPair(actual, expected);
      return pair ? pair[0] <= pair[1] : false;
    }
    case 'contains':
      return (typeof actual === 'string' || Array.isArray(actual)) ? actual.includes(expected) : false;
    case 'notContains':
      return (typeof actual === 'string' || Array.isArray(actual)) ? !actual.includes(expected) : true;
    case 'isEmpty':
      if (actual === null || actual === undefined) return true;
      if (typeof actual === 'string' || Array.isArray(actual)) return actual.length === 0;
      return false;
    case 'isNotEmpty':
      if (actual === null || actual === undefined) return false;
      if (typeof actual === 'string' || Array.isArray(actual)) return actual.length > 0;
      return true;
    default:
      return false;
  }
}

