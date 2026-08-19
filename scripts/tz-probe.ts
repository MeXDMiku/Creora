/**
 * The date checks that cannot be run in this suite's own process.
 *
 * WHY A SEPARATE PROCESS
 * Node reads TZ once, at start. The suite runs in UTC, where local time and UTC
 * are the same number -- so every timezone bug in the date handling is
 * invisible to it, and a negative control proved exactly that: swapping the
 * date-picker reader to `toISOString().slice(0, 10)`, which loses a day for
 * everyone east of Greenwich, broke nothing at all.
 *
 * So checks.ts runs this file with TZ forced to a zone that is NOT UTC and
 * compares what comes back. Asia/Kolkata is +05:30 -- a half-hour offset, which
 * also catches anything that assumes whole-hour zones.
 *
 * Prints one JSON object. Any change here needs the matching read in checks.ts.
 */
import { isoDate, isoToDateInput, dateInputToIso, coerceForColumn } from '../src/lib/rows';
import { evaluateExpression } from '../src/lib/formula';
import { validateValue } from '../src/lib/validation';
import { toCsv } from '../src/lib/csv';
import { fillSlots } from '../src/lib/sanitizeHtml';
import { displayCell } from '../src/lib/rows';

const picked = '2026-08-20';

console.log(JSON.stringify({
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  offsetMinutes: new Date().getTimezoneOffset(),

  // The round trip a builder does: pick a date in a cell, see it again.
  roundTrip: isoToDateInput(dateInputToIso(picked)),

  // The same date arriving from a visitor's form, through the column.
  viaColumn: isoToDateInput(coerceForColumn(picked, { name: 'Due', type: 'date' })),

  // The two write paths, which must agree to the millisecond.
  storedByCell: dateInputToIso(picked),
  storedByColumn: coerceForColumn(picked, { name: 'Due', type: 'date' }),

  // Year boundaries, where an off-by-one-day becomes an off-by-one-YEAR.
  newYear: isoToDateInput(isoDate('2026-01-01')),
  newYearEve: isoToDateInput(isoDate('2026-12-31')),

  /**
   * The formula language, over a date stored the way the app stores one.
   *
   * The exposure is the same and so is the answer: startOfDay reads LOCAL
   * hours. Read UTC hours instead and "three days left" becomes two for half
   * the world -- and the clock here is late in the local evening, where the
   * two readings fall on different days.
   */
  daysUntil: evaluateExpression('daysUntil(Due)', { Due: dateInputToIso('2026-08-20') },
    undefined, { now: new Date(2026, 7, 17, 23, 30) }),
  daysUntilEarly: evaluateExpression('daysUntil(Due)', { Due: dateInputToIso('2026-08-20') },
    undefined, { now: new Date(2026, 7, 17, 0, 30) }),
  todayIsZero: evaluateExpression('daysUntil(today)', {}, undefined,
    { now: new Date(2026, 7, 17, 23, 30) }),

  /**
   * And the form rule. "Must be in the future" compares against local
   * midnight; against UTC midnight, a booking made late in the evening for
   * TOMORROW gets refused.
   */
  tomorrowIsAllowed: validateValue(
    dateInputToIso('2026-08-18'),
    [{ type: 'dateAfter', value: 'today' }] as any,
    { fieldName: 'Date', now: new Date(2026, 7, 17, 23, 30) },
  ),

  /**
   * The case that actually tells the two readings apart, and it took a failed
   * control to find: "tomorrow is allowed" passes either way, because a UTC
   * midnight is only ever MORE permissive here.
   *
   * So ask the opposite question. Early on the 17th, local, a booking FOR the
   * 17th must be refused -- today is not the future. Local midnight sits
   * exactly on the stored value, so it is refused. UTC midnight sits a whole
   * day earlier, and lets it through.
   */
  todayIsRefused: validateValue(
    dateInputToIso('2026-08-17'),
    [{ type: 'dateAfter', value: 'today' }] as any,
    { fieldName: 'Date', now: new Date(2026, 7, 17, 1, 0) },
  ) !== null,

  /**
   * And the export. Dates store as LOCAL midnight, so a booking picked for the
   * 20th is 2026-08-19T18:30:00.000Z here -- correct to the millisecond, and
   * the 19th to anybody who opens the file.
   */
  csv: toCsv(
    [{ name: 'Due', type: 'date' }, { name: 'Who', type: 'text' }],
    [{ id: 'r1', Due: dateInputToIso('2026-08-20'), Who: 'Ada' }],
  ).split('\r\n')[1],

  /**
   * And what a VISITOR reads. The display filter is the last link in the chain
   * -- picked, stored, exported, shown -- and it is the one a stranger actually
   * sees. Reading UTC parts here shows them the 19th for a booking on the 20th.
   */
  shown: fillSlots('<p>{{Due | date: D MMM YYYY}}</p>', { Due: dateInputToIso('2026-08-20') }),
  shownInCalc: fillSlots(
    '<p>{{calc: daysUntil(Due)}}</p>',
    { Due: dateInputToIso('2026-08-20') },
    [],
    { now: new Date(2026, 7, 17, 23, 30) },
  ),

  /**
   * A table cell and a List row, which share one rule and used to share one
   * bug. The stored instant here is what a +05:30 picker actually writes for
   * the 20th, so reading UTC parts shows the 19th.
   */
  cell: displayCell(dateInputToIso('2026-08-20'), 'date'),
}));
