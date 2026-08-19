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
}));
