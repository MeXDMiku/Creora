/**
 * Runnable checks for validation and form states.
 *
 * WHY THIS FILE EXISTS
 * "It typechecks" and "I read the code and it looks right" are the two things
 * this project has most often mistaken for verification. These run the real
 * modules -- not a copy of the logic -- and print a pass or fail per case.
 *
 *   npm run check
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createStore } from 'jotai';
import { validateValue, isValidPattern, RULE_TYPES } from '../src/lib/validation';
import type { ValidationRule } from '../src/lib/validation';
import { blockRuntimeAtom, workflowsAtom, allBlockIdsAtom, workflowRunsAtom, formulasAtom, switchPageFnAtom } from '../src/state/atoms';
import { executeWorkflow, validationErrorFor, markValidated } from '../src/lib/bindingEngine';
import { evaluateCondition } from '../src/lib/conditions';
import { describeCollectionError, MIGRATION_DOC } from '../src/lib/collections';
import { parseParams, readParam, buildQuery, parseParamTemplate } from '../src/lib/pageParams';
import { resolvePageValue, buildParamsFromTemplate } from '../src/lib/pageValue';
import { diagnosePage, sortProblems, referencedIds } from '../src/lib/diagnose';
import { guessMappings, matchScore, normaliseName, whyItCannotWork, draftFromWorkflow, defaultWireDraft } from '../src/lib/connectionDraft';
import { clampZoom, stepZoom, zoomToFit, zoomLabel, contentExtent, toCanvasPoint, MIN_ZOOM, MAX_ZOOM } from '../src/lib/zoom';
import { wireSentence, actionWords, eventWords, outputMeaning, PORT_OUT_HINT, PORT_IN_HINT } from '../src/lib/wireWords';
import {
  resolveLayout,
  layoutPage,
  stackOrder,
  isPlacedOnPhone,
  breakpointForWidth,
  PHONE_MAX_WIDTH,
} from '../src/lib/layout';
import {
  parseOptions,
  parseChosen,
  toggleChosen,
  pruneToOptions,
  needsOptions,
  fieldMeta,
  FIELD_TYPES,
} from '../src/lib/fields';
import { withoutVisitorState, isBlockNodeType, BLOCK_NODE_TYPES, portableTypeFromNodeType, nodeTypeFromPortableType, nodeTypeFromBlockId } from '../src/lib/blockRegistry';
import { getBlockTypeDisplayName } from '../src/state/atoms';
import { remapBlockIds, shouldRemapOnImport, remapFormulaExpression } from '../src/lib/remapBlockIds';
import { summarisePageData, describeWhatWillBeLost, describeDeleteError } from '../src/lib/pageDelete';
import { toCsv, csvCell, csvFileName } from '../src/lib/csv';
import { evaluateExpression, FORMULA_FUNCTION_NAMES, explainUnreadableFormula } from '../src/lib/formula';
import { stepConditionResult, formulaScope, recalculateAllFormulas, runPageLoadWorkflows, fetchListBlockRows, shouldFetchListRows } from '../src/lib/bindingEngine';
import { safeUrl, isSafeUrlValue, schemeOf, stripIgnorable } from '../src/lib/urls';
import { fillSlots, leadingSlotName, findSlots as findSlotsForCheck } from '../src/lib/sanitizeHtml';
import { slotValuesFrom } from '../src/lib/useSlotValues';
import { slotNameOf, slotNameForNodeType } from '../src/state/atoms';
import { interpretSave, shouldKeepAutosaving, PageStamps } from '../src/lib/savePage';
import { describeRowWriteError, withoutRow } from '../src/lib/rowWrite';
import { chartBars, MIN_BAR_HEIGHT } from '../src/lib/chartBars';
import { timerStep, timerResetValue } from '../src/lib/useTimer';
import { duplicatedRuns, duplicatedLineCount } from './rendererDrift';
import { buildBundle, migrationFiles } from './bundleMigrations';
import { measurePage, verdictForPage, byteLength, describeBytes } from '../src/lib/pageSize';
import { costLines, inlinedImages } from '../src/lib/pageCost';
import { startingPace, nextPace, rowsFingerprint, POLL_FAST_MS, POLL_SLOW_MS, POLL_PATIENCE } from '../src/lib/pollPace';
import { BLOCK_DISPLAY_NAMES } from '../src/lib/blockRegistry';
import { RULE_TYPES as AUDIT_RULES } from '../src/lib/validation';
import { TABLE_FUNCTION_NAMES, DATE_FUNCTION_NAMES } from '../src/lib/formula';
import { visibleRows, rowSlots, compareCells, slotNamesFor, rowMatchesSearch, MAX_RENDERED_ROWS, rowIndexesForStep, coerceForColumn, rowMatchesFormula, columnsUsedByFormula, calcExampleFor, calcExampleWithFilter, shareExampleFor, isoDate, isoToDateInput, dateInputToIso, displayCell, COLUMN_TYPE_LABELS, listRowLines, listIsEmpty } from '../src/lib/rows';
import {
  parseSlot,
  applyFilters,
  renderTemplate,
  formatDate,
  relativeTime,
  parseDuration,
  toDate,
  builtInSlotValue,
} from '../src/lib/format';
import {
  checkImageFile,
  normalizeImageUrl,
  isProbablyImageUrl,
  storagePathFor,
  describeUploadError,
  MAX_IMAGE_BYTES,
  IMAGE_BUCKET,
} from '../src/lib/images';
import { defaultRuntimeForNodeType } from '../src/lib/blockRegistry';

/**
 * The binding engine narrates every run to the console. Useful in a browser,
 * deafening here -- it buries the one line per check that this file exists to
 * print. Kept, not deleted: it is the engine's own voice, not the test's.
 */
const say = console.log.bind(console);
console.log = () => {};

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    say(`  ok    ${name}`);
  } else {
    failed++;
    say(`  FAIL  ${name}\n          expected ${e}\n          got      ${a}`);
  }
}

function group(title: string) {
  say(`\n${title}`);
}

/**
 * Run something that might throw, and turn the throw into a VALUE.
 *
 * FOUND BY A NEGATIVE CONTROL LYING TO ME. `check()` takes an already-worked-out
 * `actual`, so a check whose expression throws does not go red -- it kills the
 * process before `check` is ever called. Every check after it never runs, and
 * the tally line never prints.
 *
 * That is not a theoretical tidiness point. I broke the relation feature on
 * purpose to see which check caught it, and what came back was a crash. A crash
 * says "something moved". A FAIL says WHICH SENTENCE STOPPED BEING TRUE, and
 * lets the other 1,700 checks answer too. Use this anywhere an expression is
 * allowed to be wrong.
 */
function ran<T>(f: () => T): T | string {
  try {
    return f();
  } catch (e: any) {
    return `threw: ${e?.message ?? String(e)}`;
  }
}

/**
 * ...and if something throws anyway, the run still ends with a countable line.
 *
 * The other half of the same lesson. My control harness decided a run had
 * finished by looking for `'passed,'` in the output -- which also matches the
 * NAME of a check ("...once it has passed, which is what overdue means"). A
 * crashed suite therefore read as "finished, 0 failed": a green that meant the
 * opposite. The tally is the only line that should be able to say so, and now
 * there is always exactly one, crash or no crash.
 */
let reachedTheEnd = false;
process.on('exit', () => {
  if (reachedTheEnd) return;
  say(`\n${passed} passed, ${failed + 1} failed   <- SUITE STOPPED EARLY, the tally above is partial`);
});

// ---------------------------------------------------------------- rules
group('rules, one at a time');

const req: ValidationRule[] = [{ type: 'required' }];
check('required rejects empty', validateValue('', req, { fieldName: 'Email' }), 'Email is required');
check('required rejects whitespace only', validateValue('   ', req, { fieldName: 'Email' }), 'Email is required');
check('required accepts text', validateValue('a', req), null);

const email: ValidationRule[] = [{ type: 'email' }];
check('email accepts a real one', validateValue('sam@example.com', email), null);
check('email accepts a plus tag', validateValue('sam+news@example.co.uk', email), null);
check('email rejects no at', validateValue('sam.example.com', email, { fieldName: 'Email' }), 'Email must be an email address');
check('email rejects no dot', validateValue('sam@example', email, { fieldName: 'Email' }), 'Email must be an email address');
check('EMPTY passes a non-required rule', validateValue('', email), null);

check('number accepts negative decimal', validateValue('-4.5', [{ type: 'number' }]), null);
check('number rejects letters', validateValue('12a', [{ type: 'number' }], { fieldName: 'Age' }), 'Age must be a number');
check('whole number rejects a decimal', validateValue('4.5', [{ type: 'wholeNumber' }], { fieldName: 'Qty' }), 'Qty must be a whole number');

check('url accepts bare domain', validateValue('example.com', [{ type: 'url' }]), null);
check('url accepts https', validateValue('https://example.com/x', [{ type: 'url' }]), null);
check('url rejects a sentence', validateValue('not a url', [{ type: 'url' }], { fieldName: 'Site' }), 'Site must be a web address');

check('phone accepts punctuation', validateValue('+44 (0)20 7946 0018', [{ type: 'phone' }]), null);
check('phone rejects too few digits', validateValue('12345', [{ type: 'phone' }], { fieldName: 'Phone' }), 'Phone must be a phone number');
check('phone rejects letters', validateValue('call me', [{ type: 'phone' }], { fieldName: 'Phone' }), 'Phone must be a phone number');

check('minLength counts characters', validateValue('abc', [{ type: 'minLength', value: 8 }], { fieldName: 'Password' }), 'Password must be at least 8 characters');
check('maxLength allows exactly the limit', validateValue('abcd', [{ type: 'maxLength', value: 4 }]), null);
check('min compares as a number', validateValue('3', [{ type: 'min', value: 5 }], { fieldName: 'Qty' }), 'Qty must be 5 or more');
check('max allows the boundary', validateValue('100', [{ type: 'max', value: 100 }]), null);
check('startsWith is literal', validateValue('+4477', [{ type: 'startsWith', value: '+44' }]), null);
check('endsWith rejects a near miss', validateValue('a.co', [{ type: 'endsWith', value: '.com' }], { fieldName: 'Site' }), 'Site must end with .com');

check('pattern matches', validateValue('AB1234', [{ type: 'pattern', value: '^[A-Z]{2}[0-9]{4}$' }]), null);
check('pattern rejects', validateValue('ab1234', [{ type: 'pattern', value: '^[A-Z]{2}[0-9]{4}$' }], { fieldName: 'Code' }), 'Code is not in the right format');
check('a broken pattern fails open rather than locking everyone out', validateValue('anything', [{ type: 'pattern', value: '([' }]), null);
check('isValidPattern spots the broken one', isValidPattern('(['), false);

group('order, and the builder\'s own words');
check(
  'the first failing rule wins',
  validateValue('', [{ type: 'required', message: 'We need your email' }, { type: 'email', message: 'That is not an email' }]),
  'We need your email'
);
check(
  'a later rule speaks once the earlier one passes',
  validateValue('nope', [{ type: 'required', message: 'We need your email' }, { type: 'email', message: 'That is not an email' }]),
  'That is not an email'
);
check('a blank custom message falls back to ours', validateValue('', [{ type: 'required', message: '   ' }], { fieldName: 'Name' }), 'Name is required');
check('no rules means nothing to say', validateValue('', []), null);
check('undefined rules means nothing to say', validateValue('', undefined), null);

// ------------------------------------------------------- against the store
group('rules that read another field');
{
  const store = createStore();
  const a = 'inputBlock__aaaa';
  const b = 'inputBlock__bbbb';
  store.set(blockRuntimeAtom(a), { ...defaultRuntimeForNodeType('inputBlock'), blockName: 'Email', value: 'sam@example.com' });
  store.set(blockRuntimeAtom(b), {
    ...defaultRuntimeForNodeType('inputBlock'),
    blockName: 'Confirm email',
    value: 'sam@exampl.com',
    rules: [{ type: 'matchesBlock', value: a, message: 'The two emails are different' }],
  });
  check('mismatch is caught', validationErrorFor(b, store), 'The two emails are different');
  store.set(blockRuntimeAtom(b), { ...store.get(blockRuntimeAtom(b)), value: 'sam@example.com' });
  check('match passes', validationErrorFor(b, store), null);
  check('a field with no rules is always fine', validationErrorFor(a, store), null);
}

group('touched: an error exists before it is shown');
{
  const store = createStore();
  const id = 'inputBlock__cccc';
  store.set(blockRuntimeAtom(id), {
    ...defaultRuntimeForNodeType('inputBlock'),
    blockName: 'Email',
    value: '',
    rules: [{ type: 'required' }],
  });
  check('the rule already fails', validationErrorFor(id, store), 'Email is required');
  check('but nothing is marked yet', store.get(blockRuntimeAtom(id)).touched, undefined);
  markValidated(id, store, false);
  check('checking without touching records the message', store.get(blockRuntimeAtom(id)).validationError, 'Email is required');
  check('and still does not mark it touched', !!store.get(blockRuntimeAtom(id)).touched, false);
  markValidated(id, store, true);
  check('touching marks it', store.get(blockRuntimeAtom(id)).touched, true);
}

// -------------------------------------------------------------- the engine
group('the submit guard');
{
  const store = createStore();
  const btn = 'buttonBlock__1111';
  const field = 'inputBlock__2222';
  const table = 'databaseBlock__3333';
  store.set(allBlockIdsAtom, [btn, field, table]);
  store.set(blockRuntimeAtom(btn), defaultRuntimeForNodeType('buttonBlock'));
  store.set(blockRuntimeAtom(field), {
    ...defaultRuntimeForNodeType('inputBlock'),
    blockName: 'Email',
    value: 'not-an-email',
    rules: [{ type: 'required' }, { type: 'email' }],
  });
  store.set(blockRuntimeAtom(table), {
    ...defaultRuntimeForNodeType('databaseBlock'),
    columns: [{ name: 'Email', type: 'text' }],
    rows: [],
  });
  store.set(workflowsAtom, [
    {
      id: 'wf1',
      sourceId: btn,
      sourceEvent: 'onClick',
      steps: [{ targetId: table, action: 'addRow', mappings: { Email: { source: 'block', value: field } } }],
    },
  ] as any);

  executeWorkflow(btn, 'onClick', store);
  check('an invalid field stops the row being written', store.get(blockRuntimeAtom(table)).rows!.length, 0);
  check('and pressing submit reveals the problem', store.get(blockRuntimeAtom(field)).touched, true);
  check('with the right message', store.get(blockRuntimeAtom(field)).validationError, 'Email must be an email address');

  store.set(blockRuntimeAtom(field), { ...store.get(blockRuntimeAtom(field)), value: 'sam@example.com' });
  executeWorkflow(btn, 'onClick', store);
  check('fixing it lets the row through', store.get(blockRuntimeAtom(table)).rows!.length, 1);
  check('and the row carries the value', store.get(blockRuntimeAtom(table)).rows![0].Email, 'sam@example.com');
}

group('the guard can be switched off, because a default is not a ceiling');
{
  const store = createStore();
  const btn = 'buttonBlock__4444';
  const field = 'inputBlock__5555';
  const table = 'databaseBlock__6666';
  store.set(allBlockIdsAtom, [btn, field, table]);
  store.set(blockRuntimeAtom(btn), defaultRuntimeForNodeType('buttonBlock'));
  store.set(blockRuntimeAtom(field), {
    ...defaultRuntimeForNodeType('inputBlock'),
    blockName: 'Email',
    value: '',
    rules: [{ type: 'required' }],
  });
  store.set(blockRuntimeAtom(table), {
    ...defaultRuntimeForNodeType('databaseBlock'),
    columns: [{ name: 'Email', type: 'text' }],
    rows: [],
  });
  store.set(workflowsAtom, [
    {
      id: 'wf2',
      sourceId: btn,
      sourceEvent: 'onClick',
      steps: [{ targetId: table, action: 'addRow', requireValid: false, mappings: { Email: { source: 'block', value: field } } }],
    },
  ] as any);
  executeWorkflow(btn, 'onClick', store);
  check('requireValid:false writes the row anyway', store.get(blockRuntimeAtom(table)).rows!.length, 1);
}

group('pages saved before any of this behave exactly as they did');
{
  const store = createStore();
  const btn = 'buttonBlock__7777';
  const field = 'inputBlock__8888';
  const table = 'databaseBlock__9999';
  store.set(allBlockIdsAtom, [btn, field, table]);
  store.set(blockRuntimeAtom(btn), defaultRuntimeForNodeType('buttonBlock'));
  // No `rules` at all -- which is every block on every page that exists today.
  store.set(blockRuntimeAtom(field), { ...defaultRuntimeForNodeType('inputBlock'), blockName: 'Email', value: '' });
  store.set(blockRuntimeAtom(table), {
    ...defaultRuntimeForNodeType('databaseBlock'),
    columns: [{ name: 'Email', type: 'text' }],
    rows: [],
  });
  store.set(workflowsAtom, [
    { id: 'wf3', sourceId: btn, sourceEvent: 'onClick', steps: [{ targetId: table, action: 'addRow', mappings: { Email: { source: 'block', value: field } } }] },
  ] as any);
  executeWorkflow(btn, 'onClick', store);
  check('an empty field with no rules still submits', store.get(blockRuntimeAtom(table)).rows!.length, 1);
}

group('busy and switched off');
{
  const store = createStore();
  const btn = 'buttonBlock__aaaa1';
  const counter = 'numberDisplayBlock__bbbb1';
  store.set(allBlockIdsAtom, [btn, counter]);
  store.set(blockRuntimeAtom(btn), defaultRuntimeForNodeType('buttonBlock'));
  store.set(blockRuntimeAtom(counter), defaultRuntimeForNodeType('numberDisplayBlock'));
  store.set(workflowsAtom, [
    { id: 'wf4', sourceId: btn, sourceEvent: 'onClick', steps: [{ targetId: counter, action: 'increment', amount: 1 }] },
  ] as any);

  executeWorkflow(btn, 'onClick', store);
  check('a normal press counts', store.get(blockRuntimeAtom(counter)).value, 1);

  store.set(blockRuntimeAtom(btn), { ...store.get(blockRuntimeAtom(btn)), loading: true });
  executeWorkflow(btn, 'onClick', store);
  check('a press while busy does nothing', store.get(blockRuntimeAtom(counter)).value, 1);

  store.set(blockRuntimeAtom(btn), { ...store.get(blockRuntimeAtom(btn)), loading: false, disabled: true });
  executeWorkflow(btn, 'onClick', store);
  check('a press while switched off does nothing', store.get(blockRuntimeAtom(counter)).value, 1);

  store.set(blockRuntimeAtom(btn), { ...store.get(blockRuntimeAtom(btn)), disabled: false });
  executeWorkflow(btn, 'onClick', store);
  check('switching it back on restores it', store.get(blockRuntimeAtom(counter)).value, 2);
}

group('the form-state actions');
{
  const store = createStore();
  const btn = 'buttonBlock__cccc1';
  const field = 'inputBlock__dddd1';
  store.set(allBlockIdsAtom, [btn, field]);
  store.set(blockRuntimeAtom(btn), defaultRuntimeForNodeType('buttonBlock'));
  store.set(blockRuntimeAtom(field), {
    ...defaultRuntimeForNodeType('inputBlock'),
    blockName: 'Email',
    value: '',
    rules: [{ type: 'required' }],
  });
  store.set(workflowsAtom, [
    { id: 'wf5', sourceId: btn, sourceEvent: 'onClick', steps: [{ targetId: field, action: 'validate' }] },
    { id: 'wf6', sourceId: btn, sourceEvent: 'onClick', steps: [{ targetId: field, action: 'setDisabled' }] },
  ] as any);
  executeWorkflow(btn, 'onClick', store);
  check('validate marks it touched', store.get(blockRuntimeAtom(field)).touched, true);
  check('validate records the message', store.get(blockRuntimeAtom(field)).validationError, 'Email is required');
  check('setDisabled switches the field off', store.get(blockRuntimeAtom(field)).disabled, true);
}

group('a condition can ask whether a field is valid');
{
  const store = createStore();
  const btn = 'buttonBlock__eeee1';
  const field = 'inputBlock__ffff1';
  const counter = 'numberDisplayBlock__gggg1';
  store.set(allBlockIdsAtom, [btn, field, counter]);
  store.set(blockRuntimeAtom(btn), defaultRuntimeForNodeType('buttonBlock'));
  store.set(blockRuntimeAtom(counter), defaultRuntimeForNodeType('numberDisplayBlock'));
  store.set(blockRuntimeAtom(field), {
    ...defaultRuntimeForNodeType('inputBlock'),
    blockName: 'Email',
    value: 'bad',
    rules: [{ type: 'email' }],
  });
  store.set(workflowsAtom, [
    {
      id: 'wf7',
      sourceId: btn,
      sourceEvent: 'onClick',
      steps: [
        {
          targetId: counter,
          action: 'increment',
          amount: 1,
          requireValid: false,
          condition: { fieldId: field, operator: 'isValid' },
          elseAction: 'set',
          elseTargetId: counter,
          elseValue: -1,
        },
      ],
    },
  ] as any);
  executeWorkflow(btn, 'onClick', store);
  check('an invalid field takes the otherwise branch', store.get(blockRuntimeAtom(counter)).value, -1);
  store.set(blockRuntimeAtom(field), { ...store.get(blockRuntimeAtom(field)), value: 'sam@example.com' });
  executeWorkflow(btn, 'onClick', store);
  check('a valid field takes the main branch', store.get(blockRuntimeAtom(counter)).value, 0);
}

group('reset clears the red');
{
  const store = createStore();
  const btn = 'buttonBlock__hhhh1';
  const field = 'inputBlock__iiii1';
  store.set(allBlockIdsAtom, [btn, field]);
  store.set(blockRuntimeAtom(btn), defaultRuntimeForNodeType('buttonBlock'));
  store.set(blockRuntimeAtom(field), {
    ...defaultRuntimeForNodeType('inputBlock'),
    blockName: 'Email',
    value: 'bad',
    rules: [{ type: 'email' }],
    touched: true,
    validationError: 'Email must be an email address',
  });
  store.set(workflowsAtom, [
    { id: 'wf8', sourceId: btn, sourceEvent: 'onClick', steps: [{ targetId: field, action: 'reset' }] },
  ] as any);
  executeWorkflow(btn, 'onClick', store);
  const after = store.get(blockRuntimeAtom(field));
  check('the value is cleared', after.value, '');
  check('touched is cleared', after.touched, false);
  check('no error is left on screen', after.validationError, null);
}

// --------------------------------------------------- persistence and registry
group('what gets saved, and what must never be');
{
  const dirty = {
    ...defaultRuntimeForNodeType('inputBlock'),
    blockName: 'Email',
    value: 'sam@example.com',
    rules: [{ type: 'required' as const }],
    touched: true,
    validationError: 'Email is required',
    loading: true,
    fetchError: 'network down',
    uploadError: 'the bucket is missing',
  };
  const clean = withoutVisitorState(dirty);
  check('touched is dropped', 'touched' in clean, false);
  check('the error is dropped', 'validationError' in clean, false);
  check('a stale fetch error is dropped', 'fetchError' in clean, false);
  check('an upload failure is dropped', 'uploadError' in clean, false);

  /**
   * Found by opening the live site, not by any of these. The Feedback page was
   * serving `dsad` and `321dsa` in its fields to every visitor, because the
   * builder typed them while building.
   */
  const typedIn = { ...defaultRuntimeForNodeType('inputBlock'), blockName: 'Email', value: 'dsad' };
  check(
    'WHAT SOMEBODY TYPED INTO A FIELD IS NOT PUBLISHED',
    withoutVisitorState(typedIn, 'inputBlock').value,
    ''
  );
  const clicked = { ...defaultRuntimeForNodeType('repeatBlock'), value: 'row_7' };
  check(
    'nor is the row the builder last clicked',
    withoutVisitorState(clicked, 'repeatBlock').value,
    ''
  );
  const counter = { ...defaultRuntimeForNodeType('numberDisplayBlock'), value: 42 };
  check(
    'BUT A SHARED COUNT IS THE WHOLE PRODUCT AND MUST SURVIVE',
    withoutVisitorState(counter, 'numberDisplayBlock').value,
    42
  );
  check(
    'a toggle keeps its shared state too',
    withoutVisitorState({ ...defaultRuntimeForNodeType('toggleBlock'), value: true }, 'toggleBlock').value,
    true
  );
  check(
    'an image keeps its picture -- the value is the address, not something typed',
    withoutVisitorState({ ...defaultRuntimeForNodeType('imageBlock'), value: 'https://x/a.png' }, 'imageBlock').value,
    'https://x/a.png'
  );
  check(
    'a text label keeps its words',
    withoutVisitorState({ ...defaultRuntimeForNodeType('textLabelBlock'), value: 'Hello' }, 'textLabelBlock').value,
    'Hello'
  );
  check(
    'called without a type, nothing is cleared -- old call sites keep working',
    withoutVisitorState(typedIn).value,
    'dsad'
  );
  check(
    'a field keeps its rules, name and placeholder',
    withoutVisitorState({ ...typedIn, placeholder: 'you@example.com' }, 'inputBlock').placeholder,
    'you@example.com'
  );
  check('busy is forced off', clean.loading, false);
  check('the rules survive, because they are the page', clean.rules!.length, 1);
  check('the name survives', clean.blockName, 'Email');
  check('the value survives', clean.value, 'sam@example.com');
  check('the original is untouched', dirty.touched, true);
}

group('every block type is a block type');
{
  const missed = BLOCK_NODE_TYPES.filter((t) => !isBlockNodeType(t));
  check('every declared type is recognised', missed, []);
  // Deliberately not a hardcoded count. A number here goes stale the first time
  // a block is added, and a check that has to be edited to keep passing trains
  // you to edit checks.
  check('no duplicates in the list', BLOCK_NODE_TYPES.length, new Set(BLOCK_NODE_TYPES).size);
  check('the ones added most recently are included', ['dataSourceBlock', 'customHtmlBlock', 'visitorBlock', 'imageBlock'].every(isBlockNodeType), true);
  check('a paragraph is not a block', isBlockNodeType('paragraph'), false);
  check('undefined is not a block', isBlockNodeType(undefined), false);
}


// ------------------------------------------------- registration, mechanically
/**
 * The check that would have caught the bug this cycle found.
 *
 * Live Data, My Design and Visitor were rendered, inserted and typed correctly,
 * and were still thrown away on save -- because "is this one of our blocks?" was
 * written out by hand in nine places and three of them were never updated.
 * Reading the code did not catch it. Counting does.
 */
group('every block type is registered everywhere it has to be');
{
  const app = readFileSync('src/App.tsx', 'utf8');
  const published = readFileSync('src/components/PublishedRenderer.tsx', 'utf8');

  const missingInspector: string[] = [];
  const missingInsert: string[] = [];
  const missingExtension: string[] = [];
  const missingPublished: string[] = [];

  for (const type of BLOCK_NODE_TYPES) {
    const pascal = type.charAt(0).toUpperCase() + type.slice(1);
    if (!existsSync(`src/blocks/${pascal}.inspector.tsx`)) missingInspector.push(type);
    if (!app.includes(`insertBlock('${type}')`)) missingInsert.push(type);
    if (!new RegExp(`^\\s*${pascal},\\s*$`, 'm').test(app)) missingExtension.push(type);
    if (!published.includes(`block.type === '${type}'`)) missingPublished.push(type);
  }

  check('every type has an inspector', missingInspector, []);
  check('every type can be inserted', missingInsert, []);
  check('every type is a TipTap extension', missingExtension, []);
  check('every type renders when published', missingPublished, []);

  /**
   * And the other direction, which the four above cannot see.
   *
   * An inspector for a type that no longer exists is dead weight that still
   * looks maintained -- and the day somebody renames a block type it is how the
   * old name survives: the new one gets its four registrations, the old file
   * sits there being imported by the glob, and nothing anywhere disagrees.
   */
  const expectedInspectors = new Set(
    BLOCK_NODE_TYPES.map(t => `${t.charAt(0).toUpperCase()}${t.slice(1)}.inspector.tsx`),
  );
  const orphanInspectors = readdirSync('src/blocks')
    .filter(f => f.endsWith('.inspector.tsx'))
    .filter(f => !expectedInspectors.has(f));
  check('NO INSPECTOR IS LEFT BEHIND FOR A TYPE THAT NO LONGER EXISTS', orphanInspectors, []);
}

// -------------------------------------------------------------------- images
group('which files may be uploaded');
{
  const png = { name: 'photo.png', type: 'image/png', size: 200_000 };
  check('a normal png is fine', checkImageFile(png), null);
  check('a jpeg is fine', checkImageFile({ name: 'a.jpg', type: 'image/jpeg', size: 10 }), null);
  check('an svg is fine', checkImageFile({ name: 'logo.svg', type: 'image/svg+xml', size: 900 }), null);
  check('nothing chosen', checkImageFile(null), 'No file was chosen');
  check('an empty file', checkImageFile({ name: 'a.png', type: 'image/png', size: 0 }), 'That file is empty');
  check(
    'too big says how big, and what the limit is',
    checkImageFile({ name: 'a.png', type: 'image/png', size: 9 * 1024 * 1024 }),
    'That image is 9.0MB. The limit is 5.0MB - try exporting it smaller.'
  );
  check('exactly at the limit is allowed', checkImageFile({ name: 'a.png', type: 'image/png', size: MAX_IMAGE_BYTES }), null);
  check(
    'HEIC is named, not just refused',
    checkImageFile({ name: 'IMG_4021.HEIC', type: 'image/heic', size: 1000 }),
    'iPhone photos are saved as HEIC, which browsers cannot show. Export or convert it to JPEG first.'
  );
  check(
    'HEIC caught by extension when the browser gives no type',
    checkImageFile({ name: 'IMG_4021.heic', type: '', size: 1000 }),
    'iPhone photos are saved as HEIC, which browsers cannot show. Export or convert it to JPEG first.'
  );
  check(
    'a pdf is refused by name',
    checkImageFile({ name: 'a.pdf', type: 'application/pdf', size: 1000 }),
    'application/pdf is not an image format a browser can show. Use PNG, JPEG, GIF, WebP, AVIF or SVG.'
  );
}

group('addresses that may become a picture');
{
  check('https survives untouched', normalizeImageUrl('https://x.com/a.png'), 'https://x.com/a.png');
  check('http survives', normalizeImageUrl('http://x.com/a.png'), 'http://x.com/a.png');
  check('surrounding space is trimmed', normalizeImageUrl('  https://x.com/a.png  '), 'https://x.com/a.png');
  check('a bare domain gets https', normalizeImageUrl('example.com/logo.png'), 'https://example.com/logo.png');
  check('a site-relative path is left alone', normalizeImageUrl('/logo.png'), '/logo.png');
  check('an inline image is allowed', normalizeImageUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  check('nothing in, nothing out', normalizeImageUrl(''), '');
  check('undefined in, nothing out', normalizeImageUrl(undefined), '');
}

group('addresses that must never become a picture');
{
  check('javascript is refused', normalizeImageUrl('javascript:alert(1)'), '');
  check('mixed case javascript is refused', normalizeImageUrl('JaVaScRiPt:alert(1)'), '');
  check('javascript split by a newline is refused', normalizeImageUrl('java\nscript:alert(1)'), '');
  check('javascript split by a tab is refused', normalizeImageUrl('java\tscript:alert(1)'), '');
  check('leading whitespace before the scheme is refused', normalizeImageUrl('  javascript:alert(1)'), '');
  check('a data url holding markup is refused', normalizeImageUrl('data:text/html,<script>alert(1)</script>'), '');
  check('vbscript is refused', normalizeImageUrl('vbscript:msgbox(1)'), '');
  check('a file url is refused', normalizeImageUrl('file:///etc/passwd'), '');
}

group('does this look like a picture');
{
  check('a png does', isProbablyImageUrl('https://x.com/a.png'), true);
  check('a jpeg with a query string does', isProbablyImageUrl('https://x.com/a.jpg?w=400'), true);
  check('an inline image does', isProbablyImageUrl('data:image/webp;base64,AA'), true);
  check('a bare page does not', isProbablyImageUrl('https://x.com/gallery'), false);
  check('a refused address does not', isProbablyImageUrl('javascript:alert(1)'), false);
}

group('where an uploaded file lands');
{
  check(
    'page, block, random, then the original name',
    storagePathFor('page_1', 'imageBlock__abc', 'My Photo.PNG', 'r4nd0m'),
    'page_1/imageBlock__abc/r4nd0m-my-photo.png'
  );
  check(
    'a nameless file still gets a path',
    storagePathFor('page_1', 'imageBlock__abc', '', 'r4nd0m'),
    'page_1/imageBlock__abc/r4nd0m-image'
  );
  check(
    'no page means unfiled, not a path starting with a slash',
    storagePathFor(null, 'imageBlock__abc', 'a.png', 'r4nd0m'),
    'unfiled/imageBlock__abc/r4nd0m-a.png'
  );
  check(
    'a hostile name cannot climb out of the folder',
    storagePathFor('p', 'b', '../../secret.png', 'r4nd0m'),
    'p/b/r4nd0m-secret.png'
  );
}

group('upload failures say what to do');
{
  const missing = describeUploadError({ message: 'Bucket not found' });
  check('a missing bucket names the bucket', missing.includes(IMAGE_BUCKET), true);
  check('a missing bucket points at the setup doc', missing.includes('SETUP_STORAGE.md'), true);
  const denied = describeUploadError({ message: 'new row violates row-level security policy' });
  check('a policy refusal does not repeat the jargon', denied.includes('row-level'), false);
  check('a policy refusal points at the setup doc', denied.includes('SETUP_STORAGE.md'), true);
  check(
    'an unknown failure is passed through rather than swallowed',
    describeUploadError({ message: 'teapot' }),
    'The upload failed: teapot'
  );
  check(
    'a silent failure still says something',
    describeUploadError(null),
    'The upload failed, and the server did not say why.'
  );
}

// ------------------------------------------------------------- the URL policy
group('one policy: what may be an address');
{
  check('https survives', safeUrl('https://x.com/a'), 'https://x.com/a');
  check('http survives', safeUrl('http://x.com/a'), 'http://x.com/a');
  check('mailto is a link people write', safeUrl('mailto:a@b.com'), 'mailto:a@b.com');
  check('tel is too', safeUrl('tel:+441234567890'), 'tel:+441234567890');
  check('a fragment is fine', safeUrl('#section-2'), '#section-2');
  check('a relative path is fine', safeUrl('images/logo.png'), 'images/logo.png');
  check('empty is nothing, not an error', safeUrl(''), null);

  check('javascript is refused', safeUrl('javascript:alert(1)'), null);
  check('vbscript is refused', safeUrl('vbscript:msgbox(1)'), null);
  check('file is refused', safeUrl('file:///etc/passwd'), null);
  check('data:text/html is refused', safeUrl('data:text/html,<b>x</b>'), null);
  check('data:image is refused where pictures are not expected', safeUrl('data:image/png;base64,AA'), null);
  check(
    'data:image is allowed where they are',
    safeUrl('data:image/png;base64,AA', { allowInlineImages: true }),
    'data:image/png;base64,AA'
  );
}

group('the hole that started this: characters a browser ignores');
{
  // Each of these is what an attribute actually contains after the DOM has
  // decoded the entity a page author wrote. The old check compared the string
  // it was handed; a browser compares that string with the noise taken out.
  check('a newline inside the scheme', safeUrl('java\nscript:alert(1)'), null);
  check('a tab inside the scheme', safeUrl('java\tscript:alert(1)'), null);
  check('a carriage return inside the scheme', safeUrl('java\rscript:alert(1)'), null);
  check('a NUL inside the scheme', safeUrl('java\u0000script:alert(1)'), null);
  check('a zero-width space inside the scheme', safeUrl('java\u200bscript:alert(1)'), null);
  check('a BOM in front of it', safeUrl('\ufeffjavascript:alert(1)'), null);
  check('a non-breaking space in front of it', safeUrl('\u00a0javascript:alert(1)'), null);
  check('ordinary leading spaces', safeUrl('    javascript:alert(1)'), null);
  check('mixed case', safeUrl('JaVaScRiPt:alert(1)'), null);
  check(
    'all of it at once',
    safeUrl('  Ja\tVa\nScRiPt\u200b:alert(1)'),
    null
  );

  check('the noise is what gets removed', stripIgnorable('a b\u200bc\td'), 'abcd');
  check('the scheme is read after the noise goes', schemeOf('java\nscript:x'), 'javascript');
  check('no scheme is null, not a guess', schemeOf('/a/b'), null);

  check('nothing at all is not dangerous', isSafeUrlValue(''), true);
  check('undefined is not dangerous', isSafeUrlValue(undefined), true);
  check('but javascript still is', isSafeUrlValue('javascript:alert(1)'), false);
}

group('a slot at the front of a URL decides the scheme');
{
  check('a slot that is the whole value', leadingSlotName('{{Link}}'), 'Link');
  check('with spaces inside the braces', leadingSlotName('{{ Link }}'), 'Link');
  check('with spaces before it', leadingSlotName('  {{Link}}'), 'Link');
  check('a slot that starts a longer value', leadingSlotName('{{Base}}/photo.png'), 'Base');
  check('only the first of several', leadingSlotName('{{A}}/{{B}}'), 'A');
  check('a slot after literal text is not it', leadingSlotName('/user/{{Id}}'), null);
  check('a plain address is not it', leadingSlotName('https://x.com'), null);
  check('nothing is not it', leadingSlotName(''), null);
}

group('filling a slot that lands in an href');
{
  const html = '<a href="{{Link}}">go</a>';
  check(
    'a normal address goes in',
    fillSlots(html, { Link: 'https://x.com' }, ['Link']),
    '<a href="https://x.com">go</a>'
  );
  check(
    'javascript out of a database row does not',
    fillSlots(html, { Link: 'javascript:alert(1)' }, ['Link']),
    '<a href="">go</a>'
  );
  check(
    'nor when the newline trick is used',
    fillSlots(html, { Link: 'java\nscript:alert(1)' }, ['Link']),
    '<a href="">go</a>'
  );
  check(
    'THE BUG: without the urlSlots list nothing is checked, which is what used to happen every time',
    fillSlots(html, { Link: 'javascript:alert(1)' }).includes('javascript:'),
    true
  );
  check(
    'a slot that is not a URL is escaped, not scheme-checked',
    fillSlots('<p>{{Name}}</p>', { Name: 'javascript:alert(1)' }, ['Link']),
    '<p>javascript:alert(1)</p>'
  );
  check(
    'markup in a value is text, never markup',
    fillSlots('<p>{{Name}}</p>', { Name: '<b>hi</b>' }),
    '<p>&lt;b&gt;hi&lt;/b&gt;</p>'
  );
  check(
    'a quote in a value cannot break out of an attribute',
    fillSlots('<a title="{{Name}}">x</a>', { Name: '" onmouseover="alert(1)' }),
    '<a title="&quot; onmouseover=&quot;alert(1)">x</a>'
  );
  check('a missing value becomes nothing', fillSlots('<p>{{Gone}}</p>', {}), '<p></p>');
}

// ---------------------------------------------------------------- for each row
const PEOPLE = [
  { id: 'r1', Name: 'Ada', Score: 9, City: 'London' },
  { id: 'r2', Name: 'Bo', Score: 10, City: 'Leeds' },
  { id: 'r3', Name: 'Cy', Score: 2, City: 'London' },
  { id: 'r4', Name: 'Di', Score: '', City: 'Leeds' },
];

group('which rows, in what order, how many');
{
  check('no settings means every row, in order', visibleRows(PEOPLE, {} as any).rows.map(r => r.id), ['r1', 'r2', 'r3', 'r4']);
  check('no rows is not an error', visibleRows([], {} as any).rows, []);
  check('undefined rows is not an error', visibleRows(undefined, {} as any).rows, []);

  check(
    'a filter keeps only what matches',
    visibleRows(PEOPLE, { filterColumn: 'City', filterValue: 'London' } as any).rows.map(r => r.id),
    ['r1', 'r3']
  );
  check(
    'the filter compares as text, so a typed 10 finds a numeric 10',
    visibleRows(PEOPLE, { filterColumn: 'Score', filterValue: '10' } as any).rows.map(r => r.id),
    ['r2']
  );
  check(
    'a filter that matches nothing gives nothing, not everything',
    visibleRows(PEOPLE, { filterColumn: 'City', filterValue: 'Perth' } as any).rows,
    []
  );

  check(
    'sorting is numeric where the values are numbers',
    visibleRows(PEOPLE, { sortColumn: 'Score' } as any).rows.map(r => r.Score),
    [2, 9, 10, '']
  );
  check(
    'descending reverses it, and blanks still sort last',
    visibleRows(PEOPLE, { sortColumn: 'Score', sortDirection: 'desc' } as any).rows.map(r => r.Score),
    ['', 10, 9, 2]
  );
  check(
    'sorting by text is alphabetical',
    visibleRows(PEOPLE, { sortColumn: 'Name' } as any).rows.map(r => r.Name),
    ['Ada', 'Bo', 'Cy', 'Di']
  );
  check(
    'no column plus last-to-first is newest first, which is what a feed means',
    visibleRows(PEOPLE, { sortDirection: 'desc' } as any).rows.map(r => r.id),
    ['r4', 'r3', 'r2', 'r1']
  );

  check('a limit takes the first N after ordering', visibleRows(PEOPLE, { maxRows: 2 } as any).rows.map(r => r.id), ['r1', 'r2']);
  check(
    'THE ORDER MATTERS: the two cheapest London rows, not the London rows out of the two cheapest',
    visibleRows(PEOPLE, { filterColumn: 'City', filterValue: 'London', sortColumn: 'Score', maxRows: 2 } as any).rows.map(r => r.Name),
    ['Cy', 'Ada']
  );
  check('matched counts what passed the filter, before the limit', visibleRows(PEOPLE, { filterColumn: 'City', filterValue: 'Leeds', maxRows: 1 } as any).matched, 2);

  check('asking for a number of rows is not a truncation', visibleRows(PEOPLE, { maxRows: 2 } as any).truncatedNote, null);
  check('nor is showing all of them', visibleRows(PEOPLE, {} as any).truncatedNote, null);
}

group('the rendering ceiling is admitted, not hidden');
{
  const many = Array.from({ length: MAX_RENDERED_ROWS + 30 }, (_, i) => ({ id: 'r' + i, N: i }));
  const out = visibleRows(many, {} as any);
  check('it stops at the ceiling', out.rows.length, MAX_RENDERED_ROWS);
  check('and says so rather than implying completeness', out.truncatedNote, 'Showing 200 of 230 (30 not shown)');
  check(
    'a builder asking for more than the ceiling still gets the ceiling',
    visibleRows(many, { maxRows: 5000 } as any).rows.length,
    MAX_RENDERED_ROWS
  );
}

group('comparing two cells without being told the type');
{
  check('numbers as numbers, not as text', compareCells(9, 10) < 0, true);
  check('numeric strings too, so 10 does not sort before 9', compareCells('9', '10') < 0, true);
  check('text alphabetically', compareCells('apple', 'banana') < 0, true);
  check('false before true', compareCells(false, true) < 0, true);
  check('equal is zero', compareCells('a', 'a'), 0);
  check('a blank sorts after a value', compareCells('', 'a') > 0, true);
  check('and after a value the other way round too', compareCells('a', '') < 0, true);
  check('two blanks are equal', compareCells('', null), 0);
}

group('what a row offers a template');
{
  const slots = rowSlots(PEOPLE[1], 1);
  check('columns come through by name', slots.Name, 'Bo');
  check('row number is 1-based, because people count from one', slots['Row number'], 2);
  check('the row id is available under a readable name', slots['Row id'], 'r2');
  check('the raw id key is not leaked as a slot', 'id' in slots, false);
  check('a row with nothing in it does not throw', rowSlots({} as any, 0)['Row number'], 1);

  check(
    'the inspector lists columns plus the two extras',
    slotNamesFor({ columns: [{ name: 'Title', type: 'text' }] } as any),
    ['Title', 'Row number', 'Row id']
  );
  check('with no columns it still offers the extras', slotNamesFor({} as any), ['Row number', 'Row id']);
}

group('a template filled from a row');
{
  const template = '<div><h3>{{Name}}</h3><a href="{{Link}}">{{City}}</a></div>';
  const row = { id: 'r9', Name: 'Ada', City: 'London', Link: 'https://x.com/ada' };
  check(
    'columns land where the slots are',
    fillSlots(template, rowSlots(row, 0), ['Link']),
    '<div><h3>Ada</h3><a href="https://x.com/ada">London</a></div>'
  );
  check(
    'a hostile link IN A ROW is refused, which is the whole reason urlSlots exists',
    fillSlots(template, rowSlots({ ...row, Link: 'javascript:alert(1)' }, 0), ['Link']),
    '<div><h3>Ada</h3><a href="">London</a></div>'
  );
  check(
    'a row value containing markup stays text',
    fillSlots('<p>{{Name}}</p>', rowSlots({ id: 'x', Name: '<b>bold</b>' }, 0)),
    '<p>&lt;b&gt;bold&lt;/b&gt;</p>'
  );
  check(
    'a slot with no column becomes nothing rather than showing the braces',
    fillSlots('<p>{{Nope}}</p>', rowSlots(row, 0)),
    '<p></p>'
  );
}

// ------------------------------------------------------- text and date filters
/**
 * Every date here is built from local parts on purpose. Asserting on a
 * formatted UTC string would pass in London and fail in Sydney, and a check
 * that depends on where it runs is worse than no check.
 */
const NOW = new Date(2026, 7, 13, 12, 0, 0); // 13 Aug 2026, midday, local
const f = (name: string, arg = '') => [{ name, arg }];

group('reading a slot and its filters');
{
  check('a plain name', parseSlot('Total'), { name: 'Total', filters: [] });
  check('a name with a space stays whole', parseSlot('Row number'), { name: 'Row number', filters: [] });
  check('one filter', parseSlot('Created | ago'), { name: 'Created', filters: [{ name: 'ago', arg: '' }] });
  check(
    'an argument containing colons survives',
    parseSlot('Created | date: HH:mm:ss'),
    { name: 'Created', filters: [{ name: 'date', arg: 'HH:mm:ss' }] }
  );
  check(
    'a pipeline in order',
    parseSlot('now | plus: 7 days | date: D MMM'),
    { name: 'now', filters: [{ name: 'plus', arg: '7 days' }, { name: 'date', arg: 'D MMM' }] }
  );
  check('filter names are case-insensitive', parseSlot('X | UPPER').filters[0].name, 'upper');
  check('nothing is nothing', parseSlot(''), { name: '', filters: [] });
}

group('writing a date the way a person would');
{
  const d = new Date(2026, 7, 3, 9, 5, 7); // 3 Aug 2026, 09:05:07
  check('the readable default', formatDate(d, 'D MMM YYYY'), '3 Aug 2026');
  check('padded numbers', formatDate(d, 'DD/MM/YYYY'), '03/08/2026');
  check('the long month is not the short one repeated', formatDate(d, 'MMMM'), 'August');
  check('longest token wins, so MMMM is not MMM plus M', formatDate(d, 'MMMM YYYY'), 'August 2026');
  check('weekday, long and short', formatDate(d, 'dddd, ddd'), 'Monday, Mon');
  check('24 hour clock', formatDate(d, 'HH:mm:ss'), '09:05:07');
  check('12 hour clock with a suffix', formatDate(d, 'h:mm a'), '9:05 am');
  check('afternoon', formatDate(new Date(2026, 7, 3, 17, 30), 'h:mm A'), '5:30 PM');
  check('midnight is 12, not 0', formatDate(new Date(2026, 7, 3, 0, 30), 'h:mm a'), '12:30 am');
  check('two digit year', formatDate(d, 'YY'), '26');
  check(
    'square brackets protect your own words, which matters because a is a token',
    formatDate(d, 'D MMM YYYY [at] HH:mm'),
    '3 Aug 2026 at 09:05'
  );
  check('without brackets, a really does mean am', formatDate(d, '[x]a[y]'), 'xamy');
  check('an unclosed bracket is left as it was typed', formatDate(d, 'D [Aug'), '3 [Aug');
}

group('reading a date out of whatever a column holds');
{
  check('an ISO string', toDate('2026-08-13T11:25:09.390Z')?.getTime(), Date.parse('2026-08-13T11:25:09.390Z'));
  check('milliseconds', toDate(1786000000000)?.getTime(), 1786000000000);
  check('seconds, which is what most APIs send', toDate(1786000000)?.getTime(), 1786000000000);
  check('a numeric string', toDate('1786000000000')?.getTime(), 1786000000000);
  check('a Date passes through', toDate(NOW)?.getTime(), NOW.getTime());
  check('nonsense is null, not an Invalid Date', toDate('not a date'), null);
  check('empty is null', toDate(''), null);
  check('null is null', toDate(null), null);
}

group('durations');
{
  check('a plural', parseDuration('7 days'), 7 * 86400000);
  check('a singular', parseDuration('1 week'), 604800000);
  check('a bare unit means one', parseDuration('day'), 86400000);
  check('negative', parseDuration('-2 hours'), -7200000);
  check('MONTHS ARE REFUSED, because a month is not a fixed length', parseDuration('1 month'), null);
  check('nonsense', parseDuration('soon'), null);
  check('empty', parseDuration(''), null);
}

group('how long ago');
{
  const ago = (ms: number) => relativeTime(new Date(NOW.getTime() - ms), NOW);
  check('seconds are just now', ago(10 * 1000), 'just now');
  check('one minute is singular', ago(60 * 1000), '1 minute ago');
  check('several minutes', ago(5 * 60 * 1000), '5 minutes ago');
  check('hours', ago(3 * 3600 * 1000), '3 hours ago');
  check('a day', ago(86400000), '1 day ago');
  check('days', ago(3 * 86400000), '3 days ago');
  check('weeks', ago(3 * 604800000), '3 weeks ago');
  check('four weeks still counts weeks', ago(4 * 604800000), '4 weeks ago');
  check(
    'past a month a real date is more use than counting weeks',
    ago(60 * 86400000),
    formatDate(new Date(NOW.getTime() - 60 * 86400000), 'D MMM YYYY')
  );
  check('the future reads forwards', relativeTime(new Date(NOW.getTime() + 2 * 86400000), NOW), 'in 2 days');
}

group('the filters themselves');
{
  const run = (v: any, name: string, arg = '') => applyFilters(v, f(name, arg), { now: NOW });

  check('upper', run('ada', 'upper'), 'ADA');
  check('lower', run('ADA', 'lower'), 'ada');
  check('title', run('ada LOVELACE', 'title'), 'Ada Lovelace');
  check('trim', run('  hi  ', 'trim'), 'hi');

  check('truncate leaves short text alone', run('short', 'truncate', '20'), 'short');
  check('truncate cuts at a word and never exceeds the limit', run('the quick brown fox jumps', 'truncate', '15').length <= 15, true);
  check('truncate ends with an ellipsis', run('the quick brown fox jumps', 'truncate', '15').endsWith('…'), true);

  check('default fills a blank', run('', 'default', 'none yet'), 'none yet');
  check('default fills a null', run(null, 'default', 'none yet'), 'none yet');
  check('DEFAULT DOES NOT FILL A ZERO, because 0 is an answer', run(0, 'default', 'none yet'), 0);
  check('default leaves a value alone', run('here', 'default', 'none yet'), 'here');

  check('round to whole', run(4.567, 'round'), '5');
  check('round to places', run(4.567, 'round', '2'), '4.57');
  check('round pads to the places asked for', run(4.5, 'round', '2'), '4.50');
  check('number groups thousands', run(1204000, 'number'), '1,204,000');
  check('number with decimals', run(1204000.5, 'number', '2'), '1,204,000.50');

  check('money takes the symbol the builder wants', run(4.5, 'money', '$'), '$4.50');
  check('money groups thousands', run(1234.5, 'money', '$'), '$1,234.50');
  check('money puts the sign before the symbol', run(-9.5, 'money', '$'), '-$9.50');
  check('money with no symbol is still money', run(4.5, 'money'), '4.50');
  check('money reads a numeric string', run('12', 'money', '$'), '$12.00');

  check('percent', run(0.125, 'percent', '1'), '12.5%');
  check('percent whole', run(0.5, 'percent'), '50%');

  check('date', run(new Date(2026, 0, 9), 'date', 'D MMM YYYY'), '9 Jan 2026');
  check('date has a readable default pattern', run(new Date(2026, 0, 9), 'date'), '9 Jan 2026');
  check('time', run(new Date(2026, 0, 9, 14, 30), 'time'), '14:30');
  check('ago', run(new Date(NOW.getTime() - 3600000), 'ago'), '1 hour ago');
}

group('a filter never puts rubbish on a page');
{
  const run = (v: any, name: string, arg = '') => applyFilters(v, f(name, arg), { now: NOW });
  check('date of nonsense is the nonsense, not Invalid Date', run('hello', 'date'), 'hello');
  check('ago of nonsense is the nonsense', run('hello', 'ago'), 'hello');
  check('money of nonsense is the nonsense, not NaN', run('hello', 'money', '$'), 'hello');
  check('round of nonsense is the nonsense', run('hello', 'round'), 'hello');
  check('percent of nothing is nothing', run('', 'percent'), '');
  check('an unknown filter is a typo, not a blank page', run('kept', 'nosuchfilter'), 'kept');
  check('date of an empty cell stays empty', run('', 'date'), '');
}

group('chaining, and the clock');
{
  const opts = { now: NOW };
  check(
    'move a date and then format it',
    applyFilters(new Date(2026, 7, 13), [{ name: 'plus', arg: '7 days' }, { name: 'date', arg: 'D MMM YYYY' }], opts),
    '20 Aug 2026'
  );
  check(
    'minus goes the other way',
    applyFilters(new Date(2026, 7, 13), [{ name: 'minus', arg: '1 week' }, { name: 'date', arg: 'D MMM' }], opts),
    '6 Aug'
  );
  check(
    'a Date left at the end of a pipe still becomes words',
    applyFilters(new Date(2026, 7, 13), [{ name: 'plus', arg: '1 day' }], opts),
    '14 Aug 2026'
  );
  check('now is the clock we were given', (builtInSlotValue('now', opts) as Date).getTime(), NOW.getTime());
  check('today is midnight of it', (builtInSlotValue('today', opts) as Date).getHours(), 0);
  check('anything else is not a built-in', builtInSlotValue('Price', opts), undefined);
}

group('filling a plain string, where nothing is markup');
{
  const values = { Name: 'Ada & Co', Total: 1234.5, Created: new Date(2026, 7, 13) };
  check(
    'values go in as themselves, ampersand and all',
    renderTemplate('Hello {{Name}}', values),
    'Hello Ada & Co'
  );
  check(
    'filters work here too',
    renderTemplate('That is {{Total | money: $}}', values),
    'That is $1,234.50'
  );
  check(
    'so do dates',
    renderTemplate('Posted {{Created | date: D MMM YYYY}}', values),
    'Posted 13 Aug 2026'
  );
  check(
    'and the clock',
    renderTemplate('Due {{now | plus: 7 days | date: D MMM YYYY}}', values, { now: NOW }),
    'Due 20 Aug 2026'
  );
  check('an unknown name is nothing, not braces on the page', renderTemplate('[{{Nope}}]', values), '[]');
  check('a real column called now beats the built-in', renderTemplate('{{now}}', { now: 'mine' }), 'mine');
}

group('filters in markup: escaped, and still URL-checked');
{
  check(
    'a value is still escaped after a filter runs',
    fillSlots('<p>{{Name | upper}}</p>', { Name: '<b>ada</b>' }),
    '<p>&lt;B&gt;ADA&lt;/B&gt;</p>'
  );
  check(
    'findSlots reports the name without its filters, so lookups still work',
    findSlotsForCheck('<p>{{Created | date: D MMM}}</p>'),
    ['Created']
  );
  check(
    'the URL guard keys on the name, not the whole slot',
    leadingSlotName('{{Link | default: /home}}'),
    'Link'
  );
  check(
    'A FILTER CANNOT SMUGGLE A SCHEME PAST THE GUARD: filters run first, the check runs after',
    fillSlots('<a href="{{Link | default: javascript:alert(1)}}">x</a>', { Link: '' }, ['Link']),
    '<a href="">x</a>'
  );
  check(
    'a harmless default still works',
    fillSlots('<a href="{{Link | default: /home}}">x</a>', { Link: '' }, ['Link']),
    '<a href="/home">x</a>'
  );
  check(
    'a date in markup',
    fillSlots('<p>{{Created | date: D MMM YYYY}}</p>', { Created: new Date(2026, 7, 13) }),
    '<p>13 Aug 2026</p>'
  );
}

// ------------------------------------------------ search, filter, sort, pages
const STAFF = [
  { id: 'a', Name: 'Ada Lovelace', City: 'London', Role: 'Engineer', Score: 9 },
  { id: 'b', Name: 'Bo Nguyen', City: 'Leeds', Role: 'Designer', Score: 10 },
  { id: 'c', Name: 'Cy Adams', City: 'London', Role: 'Engineer', Score: 2 },
  { id: 'd', Name: 'Di Patel', City: 'Bristol', Role: 'Writer', Score: '' },
];

group('comparing a blank is not comparing a zero');
{
  check('less than, blank actual', evaluateCondition('', 'lessThan', 9), false);
  check('less than, blank expected', evaluateCondition(5, 'lessThan', ''), false);
  check('more than, blank actual', evaluateCondition(null, 'greaterThan', 0), false);
  check('at most, blank actual', evaluateCondition(undefined, 'lessOrEqual', 100), false);
  check('a real zero still compares', evaluateCondition(0, 'lessThan', 9), true);
  check('a zero as text still compares', evaluateCondition('0', 'lessThan', 9), true);
  check('words never compare as numbers', evaluateCondition('nine', 'lessThan', 10), false);
  check('normal comparisons are untouched', evaluateCondition(10, 'greaterThan', 9), true);
}

group('search: one box, several columns');
{
  const ids = (spec: any) => visibleRows(STAFF, spec).rows.map(r => r.id);

  check('an empty search shows everything', ids({ search: '' }), ['a', 'b', 'c', 'd']);
  check('whitespace only shows everything', ids({ search: '   ' }), ['a', 'b', 'c', 'd']);
  check('a word in one column', ids({ search: 'leeds' }), ['b']);
  check('search does not care about case', ids({ search: 'LOVELACE' }), ['a']);
  check('a partial word matches', ids({ search: 'lov' }), ['a']);
  check(
    'TWO WORDS ACROSS TWO COLUMNS, which is what people actually type',
    ids({ search: 'lovelace lon' }),
    ['a']
  );
  check('order of the words does not matter', ids({ search: 'lon lovelace' }), ['a']);
  check('all the words must be there', ids({ search: 'lovelace bristol' }), []);
  check(
    'a term matches inside a word, so "ada" finds Adams as well as Ada',
    ids({ search: 'ada' }),
    ['a', 'c']
  );
  check('a word matching several rows', ids({ search: 'engineer' }), ['a', 'c']);
  check('searching only named columns', ids({ search: 'london', searchColumns: ['Name'] }), []);
  check('and finding it when the column is included', ids({ search: 'london', searchColumns: ['City'] }), ['a', 'c']);
  check('numbers are searchable as text', ids({ search: '10' }), ['b']);
  check(
    'the row id is not searched, so an id nobody can see cannot match',
    visibleRows([{ id: 'zzqq', Name: 'Ada' }], { search: 'zzqq' }).rows.length,
    0
  );

  check('the helper agrees on its own', rowMatchesSearch(STAFF[0], 'ada london'), true);
  check('and disagrees when it should', rowMatchesSearch(STAFF[0], 'ada paris'), false);
  check('nothing to search for is a match', rowMatchesSearch(STAFF[0], ''), true);
}

group('filter: the product operators, not a second set');
{
  const ids = (spec: any) => visibleRows(STAFF, spec).rows.map(r => r.id);

  check('equals', ids({ filterColumn: 'City', filterOperator: 'equals', filterValue: 'London' }), ['a', 'c']);
  check('is not', ids({ filterColumn: 'City', filterOperator: 'notEquals', filterValue: 'London' }), ['b', 'd']);
  check('contains matches inside a word too', ids({ filterColumn: 'Name', filterOperator: 'contains', filterValue: 'Ada' }), ['a', 'c']);
  check('contains is exact about case, unlike search', ids({ filterColumn: 'Name', filterOperator: 'contains', filterValue: 'ada' }), []);
  check('more than', ids({ filterColumn: 'Score', filterOperator: 'greaterThan', filterValue: 8 }), ['a', 'b']);
  check('at least', ids({ filterColumn: 'Score', filterOperator: 'greaterOrEqual', filterValue: 9 }), ['a', 'b']);
  check(
    'AN EMPTY CELL IS NOT ZERO: "less than 9" must not sweep up rows with no score',
    ids({ filterColumn: 'Score', filterOperator: 'lessThan', filterValue: 9 }),
    ['c']
  );
  check(
    'nor the other way round',
    ids({ filterColumn: 'Score', filterOperator: 'greaterOrEqual', filterValue: 0 }),
    ['a', 'b', 'c']
  );
  check('is empty', ids({ filterColumn: 'Score', filterOperator: 'isEmpty' }), ['d']);
  check('is not empty', ids({ filterColumn: 'Score', filterOperator: 'isNotEmpty' }), ['a', 'b', 'c']);
  check('the default operator is equals', ids({ filterColumn: 'City', filterValue: 'Leeds' }), ['b']);

  check(
    'A BLANK VALUE MEANS NO FILTER, so an empty box shows everything rather than nothing',
    ids({ filterColumn: 'City', filterOperator: 'equals', filterValue: '' }),
    ['a', 'b', 'c', 'd']
  );
  check(
    'but is-empty needs no value and still applies',
    ids({ filterColumn: 'Score', filterOperator: 'isEmpty', filterValue: '' }),
    ['d']
  );
  check('no column means no filter', ids({ filterOperator: 'equals', filterValue: 'nonsense' }).length, 4);
}

group('search and filter together, then order, then the page');
{
  check(
    'search narrows, then the filter narrows that',
    visibleRows(STAFF, { search: 'e', filterColumn: 'Role', filterValue: 'Engineer' }).rows.map(r => r.id),
    ['a', 'c']
  );
  check(
    'ordering applies to what survived',
    visibleRows(STAFF, { filterColumn: 'Role', filterValue: 'Engineer', sortColumn: 'Score' }).rows.map(r => r.Score),
    [2, 9]
  );
  check(
    'matched counts what survived, not what is on the page',
    visibleRows(STAFF, { pageSize: 2 }).matched,
    4
  );
}

group('pages');
{
  const page = (n: number) => visibleRows(STAFF, { pageSize: 2, page: n });

  check('page one', page(1).rows.map(r => r.id), ['a', 'b']);
  check('page two', page(2).rows.map(r => r.id), ['c', 'd']);
  check('how many pages', page(1).pageCount, 2);
  check('which page is being shown', page(2).page, 2);

  check('PAST THE END SHOWS THE LAST PAGE, never an empty one', page(9).rows.map(r => r.id), ['c', 'd']);
  check('and reports the page it actually showed', page(9).page, 2);
  check('before the beginning shows the first', page(0).rows.map(r => r.id), ['a', 'b']);
  check('a fractional page is floored, not rejected', visibleRows(STAFF, { pageSize: 2, page: 2.7 }).page, 2);

  check('no page asked for means page one', visibleRows(STAFF, { pageSize: 2 }).page, 1);
  check('a page size larger than the list is one page', visibleRows(STAFF, { pageSize: 50 }).pageCount, 1);
  check('nothing to show is still page one of one', visibleRows([], { pageSize: 2 }).pageCount, 1);
  check('paging never claims to be truncating', page(1).truncatedNote, null);

  check(
    'a search changes how many pages there are',
    visibleRows(STAFF, { pageSize: 2, search: 'london' }).pageCount,
    1
  );
  check(
    'THE TRAP: page 2 of a search that now has one page shows the last page, not nothing',
    visibleRows(STAFF, { pageSize: 2, search: 'london', page: 2 }).rows.length,
    2
  );

  check('paging beats maxRows when both are set', visibleRows(STAFF, { pageSize: 3, maxRows: 1 }).rows.length, 3);
  check('a page size over the ceiling is capped', visibleRows(STAFF, { pageSize: 9999 }).rows.length, 4);
}

group('nothing set behaves exactly as it did before any of this');
{
  const out = visibleRows(STAFF, {});
  check('every row', out.rows.length, 4);
  check('page one of one', [out.page, out.pageCount], [1, 1]);
  check('no note', out.truncatedNote, null);
  check('no spec at all is the same', visibleRows(STAFF).rows.length, 4);
}

// -------------------------------------------------------- per-visitor rows
group('the switch says what is missing, rather than failing quietly');
{
  const missing = describeCollectionError({ code: 'PGRST202', message: 'Could not find the function public.set_collection_private' });
  check('a missing function names the migration file', missing.includes('0004_row_ownership.sql'), true);
  check('and points at the doc', missing.includes(MIGRATION_DOC), true);
  check('without repeating PostgREST jargon', missing.toLowerCase().includes('pgrst'), false);

  // These two are here because a negative control caught the originals being
  // decoration: their messages ALSO matched the "could not find the function"
  // clause, so removing the code check and the schema-cache check broke
  // nothing. Each signal now has a case where it is the only signal.
  check(
    'the error code alone is enough, even when the message says nothing useful',
    describeCollectionError({ code: 'PGRST202', message: 'Not Found' }).includes('0004'),
    true
  );
  check(
    'a stale schema cache alone is enough',
    describeCollectionError({ message: 'stale schema cache, retry' }).includes('0004'),
    true
  );
  check(
    'a refusal explains who may do it',
    describeCollectionError({ code: '42501', message: 'not allowed' }),
    'Only the person who owns this page can change that.'
  );
  check(
    'an unsaved block says so, because that is the confusing one',
    describeCollectionError({ message: 'unknown block' }),
    'Save the page first — this Database has not reached the server yet.'
  );
  check(
    'an unknown failure is passed through rather than swallowed',
    describeCollectionError({ message: 'teapot' }),
    'That did not work: teapot'
  );
  check(
    'silence still says something',
    describeCollectionError(null),
    'That did not work, and the server did not say why.'
  );
}

// ------------------------------------------------------------ page parameters
group('reading what a page was opened with');
{
  check('one value', parseParams('?id=abc'), { id: 'abc' });
  check('several', parseParams('?id=abc&tab=details'), { id: 'abc', tab: 'details' });
  check('the question mark is optional', parseParams('id=abc'), { id: 'abc' });
  check('nothing at all', parseParams(''), {});
  check('null', parseParams(null), {});
  check('a name with no value', parseParams('?id='), { id: '' });
  check('a name with no equals sign', parseParams('?flag'), { flag: '' });
  check('a repeated name keeps the first, so a mistake stays visible', parseParams('?id=1&id=2'), { id: '1' });

  check('percent encoding is decoded', parseParams('?q=tea%20%26%20coffee'), { q: 'tea & coffee' });
  check('a plus is a space, as it is in every form', parseParams('?q=tea+coffee'), { q: 'tea coffee' });
  check('a slash survives', parseParams('?path=%2Fa%2Fb'), { path: '/a/b' });
  check(
    'A LONE PERCENT DOES NOT BLANK THE PAGE, because decodeURIComponent throws',
    parseParams('?q=100%'),
    { q: '100%' }
  );

  check('readParam finds it', readParam('?id=abc', 'id'), 'abc');
  check('readParam falls back when absent', readParam('?other=1', 'id', 'none'), 'none');
  check('readParam falls back when empty', readParam('?id=', 'id', 'none'), 'none');
  check('readParam with no name at all', readParam('?id=abc', '', 'none'), 'none');
}

group('building an address to open a page with');
{
  check('one value', buildQuery({ id: 'abc' }), '?id=abc');
  check('several, in order', buildQuery({ id: 'abc', tab: 'x' }), '?id=abc&tab=x');
  check('nothing to carry is no question mark at all', buildQuery({}), '');
  check('an empty value is dropped, not written as id=', buildQuery({ id: '' }), '');
  check('a blank name is dropped', buildQuery({ '': 'x' }), '');

  check(
    'AN AMPERSAND IN A VALUE STAYS ONE VALUE',
    buildQuery({ title: 'Tea & Coffee' }),
    '?title=Tea%20%26%20Coffee'
  );
  check('a space', buildQuery({ q: 'two words' }), '?q=two%20words');
  check('an equals sign', buildQuery({ q: 'a=b' }), '?q=a%3Db');
  check('a hash', buildQuery({ q: 'a#b' }), '?q=a%23b');
  check('a slash', buildQuery({ path: '/a/b' }), '?path=%2Fa%2Fb');
  check(
    'and it survives the round trip, which is the only thing that matters',
    parseParams(buildQuery({ title: 'Tea & Coffee', q: 'a=b#c' })),
    { title: 'Tea & Coffee', q: 'a=b#c' }
  );
}

group('the builder writes a template, not a finished address');
{
  check('one pair', parseParamTemplate('id={{Row id}}'), [{ name: 'id', valueTemplate: '{{Row id}}' }]);
  check(
    'two pairs',
    parseParamTemplate('id={{Row id}}&tab=details'),
    [{ name: 'id', valueTemplate: '{{Row id}}' }, { name: 'tab', valueTemplate: 'details' }]
  );
  check('a leading question mark is tolerated', parseParamTemplate('?id=1'), [{ name: 'id', valueTemplate: '1' }]);
  check('a pair with no equals sign is skipped', parseParamTemplate('id=1&broken'), [{ name: 'id', valueTemplate: '1' }]);
  check('nothing', parseParamTemplate(''), []);

  const row = { 'Row id': 'r7', Name: 'Tea & Coffee', Price: 4.5 };
  check(
    'filled from a row',
    buildParamsFromTemplate('id={{Row id}}', row),
    '?id=r7'
  );
  check(
    'THE ORDERING THAT MATTERS: split first, fill second, encode last — so an ampersand in a title cannot become a second parameter',
    buildParamsFromTemplate('id={{Row id}}&title={{Name}}', row),
    '?id=r7&title=Tea%20%26%20Coffee'
  );
  check(
    'and it comes back out whole',
    parseParams(buildParamsFromTemplate('id={{Row id}}&title={{Name}}', row)).title,
    'Tea & Coffee'
  );
  check(
    'filters work in a link, because it is the same template engine',
    buildParamsFromTemplate('price={{Price | money: $}}', row),
    '?price=%244.50'
  );
  check(
    'a slot with no value drops the whole pair rather than sending an empty one',
    buildParamsFromTemplate('id={{Row id}}&missing={{Nope}}', row),
    '?id=r7'
  );
  check('no template is no address', buildParamsFromTemplate('', row), '');
}

group('what a Page value block shows');
{
  const state = { paramName: 'id', previewValue: 'preview-row', fallbackValue: 'none' };

  check('in the editor there is no address, so the stand-in shows', resolvePageValue(null, state), 'preview-row');
  check(
    'with no stand-in the editor falls back',
    resolvePageValue(null, { paramName: 'id', fallbackValue: 'none' }),
    'none'
  );
  check('on a real page the address wins', resolvePageValue({ id: 'r7' }, state), 'r7');
  check(
    'A PUBLISHED PAGE IGNORES THE STAND-IN, or every visitor would see the same row',
    resolvePageValue({}, state),
    'none'
  );
  check('an empty value counts as absent', resolvePageValue({ id: '' }, state), 'none');
  check('a different name is not read by accident', resolvePageValue({ other: 'x' }, state), 'none');
  check('no name configured means the fallback', resolvePageValue({ id: 'r7' }, { fallbackValue: 'none' }), 'none');
  check('no state at all does not throw', resolvePageValue({ id: 'r7' }, undefined), '');
}

group('a value out of the address is still untrusted');
{
  // A URL parameter is typed by whoever sent the link. It reaches markup through
  // exactly the same door as everything else, and that door is already guarded.
  check(
    'markup in a parameter is text',
    fillSlots('<p>{{Q}}</p>', { Q: parseParams('?q=%3Cb%3Ehi%3C%2Fb%3E').q }),
    '<p>&lt;b&gt;hi&lt;/b&gt;</p>'
  );
  check(
    'a scheme in a parameter cannot reach an href',
    fillSlots('<a href="{{Link}}">x</a>', { Link: parseParams('?link=javascript%3Aalert(1)').link }, ['Link']),
    '<a href="">x</a>'
  );
}

// ------------------------------------------------------------- kinds of field
group('one block, many kinds of field');
{
  check('text is the default when nothing is set', fieldMeta(undefined).type, 'text');
  check('an unknown kind falls back rather than breaking the field', fieldMeta('nonsense' as any).type, 'text');
  check('a number field asks the browser for a number', fieldMeta('number').inputType, 'number');
  check('a date field asks for a date, so the browser draws its own calendar', fieldMeta('date').inputType, 'date');
  check('several lines is not an input at all', fieldMeta('longText').inputType, undefined);

  check('a dropdown needs choices', needsOptions('dropdown'), true);
  check('radio needs choices', needsOptions('radio'), true);
  check('checkboxes need choices', needsOptions('checkboxes'), true);
  check('a text field does not', needsOptions('text'), false);
  check('every kind has a label', FIELD_TYPES.every(f => !!f.label), true);
}

group('the choices a builder types');
{
  check('one per line', parseOptions('Small\nMedium\nLarge'), ['Small', 'Medium', 'Large']);
  check('surrounding space is trimmed', parseOptions('  Small  \n Large '), ['Small', 'Large']);
  check('blank lines are dropped, so a trailing newline is not a blank choice', parseOptions('Small\n\n\nLarge\n'), ['Small', 'Large']);
  check('repeats are dropped, because two identical choices cannot be told apart', parseOptions('Small\nSmall'), ['Small']);
  check('carriage returns from a paste are handled', parseOptions('Small\r\nLarge'), ['Small', 'Large']);
  check('nothing typed', parseOptions(''), []);
  check('null', parseOptions(null), []);
  check(
    'A COMMA IS NOT A SEPARATOR, so a place name can be one choice',
    parseOptions('Bristol, Avon\nLeeds'),
    ['Bristol, Avon', 'Leeds']
  );
}

group('ticking several boxes');
{
  const options = ['Small', 'Medium', 'Large'];
  check('nothing ticked', parseChosen(''), []);
  check('one', parseChosen('Small'), ['Small']);
  check('several', parseChosen('Small, Large'), ['Small', 'Large']);
  check('space around the comma does not matter', parseChosen('Small ,Large'), ['Small', 'Large']);

  check('tick one', toggleChosen('', 'Medium', true, options), 'Medium');
  check('tick a second', toggleChosen('Medium', 'Small', true, options), 'Small, Medium');
  check(
    'THE ORDER IS THE BUILDER\'S, not the order they were clicked',
    toggleChosen('Large', 'Small', true, options),
    'Small, Large'
  );
  check('untick', toggleChosen('Small, Large', 'Small', false, options), 'Large');
  check('unticking the last leaves nothing', toggleChosen('Small', 'Small', false, options), '');
  check('ticking twice does not duplicate', toggleChosen('Small', 'Small', true, options), 'Small');
}

group('a value that is no longer a choice');
{
  const options = ['Small', 'Large'];
  check('a value still on the list is kept', pruneToOptions('Small', 'dropdown', options), 'Small');
  check(
    'A REMOVED CHOICE IS NOT SILENTLY KEPT, because nobody could re-pick it',
    pruneToOptions('Medium', 'dropdown', options),
    ''
  );
  check('radio behaves the same', pruneToOptions('Medium', 'radio', options), '');
  check('checkboxes keep what survives', pruneToOptions('Small, Medium, Large', 'checkboxes', options), 'Small, Large');
  check('checkboxes with nothing left', pruneToOptions('Medium', 'checkboxes', options), '');
  check('no choices at all means no value', pruneToOptions('Small', 'dropdown', []), '');
  check('a text field is never pruned', pruneToOptions('anything at all', 'text', []), 'anything at all');
  check('a number field is never pruned', pruneToOptions('42', 'number', []), '42');
}

group('validation still applies whatever kind of field it is');
{
  // The whole argument for one block rather than six: none of this was written
  // again for dropdowns or dates, and none of it can drift.
  check('required on an unanswered dropdown', validateValue('', [{ type: 'required' }], { fieldName: 'Size' }), 'Size is required');
  check('required on ticked checkboxes passes', validateValue('Small, Large', [{ type: 'required' }]), null);
  check(
    'contains, which is how you ask whether one box was ticked',
    evaluateCondition('Small, Large', 'contains', 'Large'),
    true
  );
  check('and when it was not', evaluateCondition('Small', 'contains', 'Large'), false);
  check('a number field still gets number rules', validateValue('abc', [{ type: 'number' }], { fieldName: 'Age' }), 'Age must be a number');
}

// ------------------------------------------------------------ the layout model
group('which screen size is this');
{
  check('a phone', breakpointForWidth(390), 'phone');
  check('exactly the boundary is still a phone', breakpointForWidth(PHONE_MAX_WIDTH), 'phone');
  check('one pixel over is not', breakpointForWidth(PHONE_MAX_WIDTH + 1), 'base');
  check('a laptop', breakpointForWidth(1440), 'base');
}

group('a phone placement inherits the desktop one, field by field');
{
  const placement = { x: 400, y: 100, width: 300, height: 80 };

  check('with nothing overridden, the desktop layout is used', resolveLayout(placement, 'phone'), {
    x: 400, y: 100, width: 300, height: 80, hidden: undefined,
  });
  check(
    'OVERRIDING ONE FIELD DOES NOT RESET THE OTHERS',
    resolveLayout({ ...placement, phone: { x: 16 } }, 'phone'),
    { x: 16, y: 100, width: 300, height: 80, hidden: undefined }
  );
  check(
    'width alone',
    resolveLayout({ ...placement, phone: { width: 340 } }, 'phone').width,
    340
  );
  check(
    'hidden on a phone, present everywhere else',
    [resolveLayout({ ...placement, phone: { hidden: true } }, 'phone').hidden,
     resolveLayout({ ...placement, phone: { hidden: true } }, 'base').hidden],
    [true, undefined]
  );
  check('the desktop layout ignores phone overrides entirely', resolveLayout({ ...placement, phone: { x: 16 } }, 'base').x, 400);
  check('a missing placement does not throw', resolveLayout(undefined, 'phone'), {
    x: 0, y: 0, width: undefined, height: undefined, hidden: undefined,
  });
}

group('placed, or automatic');
{
  check('never touched on a phone', isPlacedOnPhone({ x: 0, y: 0 }), false);
  check('an empty phone object is still not placed', isPlacedOnPhone({ x: 0, y: 0, phone: {} }), false);
  check('a width alone is not a position', isPlacedOnPhone({ x: 0, y: 0, phone: { width: 300 } }), false);
  check('HALF a position is not a position', isPlacedOnPhone({ x: 0, y: 0, phone: { x: 16 } }), false);
  check('both is', isPlacedOnPhone({ x: 0, y: 0, phone: { x: 16, y: 20 } }), true);
  check('the origin counts, because 0 is a real coordinate', isPlacedOnPhone({ x: 0, y: 0, phone: { x: 0, y: 0 } }), true);
}

group('the order automatic blocks stack in');
{
  // Two columns: labels on the left, values on the right.
  const twoColumns = [
    { id: 'labelA', placement: { x: 0, y: 0 }, width: 100, height: 30 },
    { id: 'valueA', placement: { x: 200, y: 0 }, width: 100, height: 30 },
    { id: 'labelB', placement: { x: 0, y: 60 }, width: 100, height: 30 },
    { id: 'valueB', placement: { x: 200, y: 60 }, width: 100, height: 30 },
  ];
  check(
    'COLUMN BY COLUMN, not top to bottom -- otherwise a two-column form reads label, label, value, value',
    stackOrder(twoColumns),
    ['labelA', 'labelB', 'valueA', 'valueB']
  );

  const oneColumn = [
    { id: 'c', placement: { x: 10, y: 200 }, width: 300, height: 30 },
    { id: 'a', placement: { x: 0, y: 0 }, width: 300, height: 30 },
    { id: 'b', placement: { x: 20, y: 100 }, width: 300, height: 30 },
  ];
  check('overlapping blocks are one column, read downwards', stackOrder(oneColumn), ['a', 'b', 'c']);
  check('nothing to stack', stackOrder([]), []);
  check('one block', stackOrder([{ id: 'only', placement: { x: 5, y: 5 }, width: 10, height: 10 }]), ['only']);
}

group('the whole page, at one screen size');
{
  const items = [
    { id: 'a', placement: { x: 0, y: 0 }, width: 300, height: 40 },
    { id: 'b', placement: { x: 0, y: 100 }, width: 300, height: 40 },
  ];

  const desktop = layoutPage(items, 'base');
  check('on a desktop nothing moves', [desktop.placed.a.x, desktop.placed.a.y, desktop.placed.b.y], [0, 0, 100]);
  check('and nothing is automatic', desktop.auto, []);

  const phone = layoutPage(items, 'phone');
  check('on a phone, untouched blocks are automatic rather than positioned', phone.auto, ['a', 'b']);
  check(
    'AND THEY COME BACK AS AN ORDER, NOT AS COORDINATES -- nothing here knows how tall a Text label is',
    Object.keys(phone.placed),
    []
  );

  const withPlaced = [
    { id: 'header', placement: { x: 0, y: 0, phone: { x: 0, y: 0, width: 390 } }, width: 800, height: 60 },
    ...items,
  ];
  const mixed = layoutPage(withPlaced, 'phone');
  check('a placed block keeps exactly what it was given', [mixed.placed.header.x, mixed.placed.header.y, mixed.placed.header.width], [0, 0, 390]);
  check('the rest stay automatic, in order', mixed.auto, ['a', 'b']);
  check('a placed block is not also in the automatic list', mixed.auto.includes('header'), false);

  const hiddenOnPhone = layoutPage(
    [{ id: 'x', placement: { x: 0, y: 0, phone: { hidden: true } }, width: 100, height: 20 }],
    'phone'
  );
  check(
    'an automatic block can still be hidden on a phone, though it was never placed there',
    hiddenOnPhone.hidden.x,
    true
  );
  check('and it is visible on a desktop', layoutPage(
    [{ id: 'x', placement: { x: 0, y: 0, phone: { hidden: true } }, width: 100, height: 20 }],
    'base'
  ).hidden.x, false);
}

group('pages saved before any of this are untouched');
{
  // Every page in existence has {x, y} and no phone key at all.
  const old = [
    { id: 'a', placement: { x: 40, y: 80 }, width: 200, height: 40 },
    { id: 'b', placement: { x: 300, y: 80 }, width: 200, height: 40 },
  ];
  const desktop = layoutPage(old, 'base');
  check('the desktop layout is exactly what was saved', [desktop.placed.a.x, desktop.placed.a.y, desktop.placed.b.x], [40, 80, 300]);
  check('no width is invented', desktop.placed.a.width, undefined);
  check('nothing is hidden that was not', desktop.hidden.a, false);
  check('and on a phone they are all automatic, which is what they get today', layoutPage(old, 'phone').auto, ['a', 'b']);
}

group('a block can be given back to automatic');
{
  // The other half of "automatic until you touch it". Without a way back, one
  // accidental nudge means hand-placing that block forever.
  const backToAutomatic = (placement: any) => {
    const phone = { ...(placement.phone || {}) };
    delete phone.x;
    delete phone.y;
    const next: any = { ...placement };
    if (Object.keys(phone).length === 0) delete next.phone;
    else next.phone = phone;
    return next;
  };

  const placed = { x: 0, y: 0, phone: { x: 16, y: 40 } };
  check('it was placed', isPlacedOnPhone(placed), true);
  check('and afterwards it is automatic again', isPlacedOnPhone(backToAutomatic(placed)), false);
  check(
    'THE PHONE KEY IS REMOVED, NOT EMPTIED -- an empty object still reads as "there is a phone placement"',
    backToAutomatic(placed).phone,
    undefined
  );
  check(
    'but a phone-only setting that is not a position survives',
    backToAutomatic({ x: 0, y: 0, phone: { x: 16, y: 40, hidden: true } }).phone,
    { hidden: true }
  );
  check('and it is still hidden afterwards', resolveLayout(backToAutomatic({ x: 0, y: 0, phone: { x: 16, y: 40, hidden: true } }), 'phone').hidden, true);
  check('doing it to a block that was never placed changes nothing', backToAutomatic({ x: 5, y: 5 }), { x: 5, y: 5 });
}

// ------------------------------------------------------------ chains of wires
group('a change travels down the whole chain, not one link');
{
  /**
   * The bug the owner found by clicking his own Submit button: the Database
   * went to Count: 3 and the Total wired to it stayed at 2. It was never a
   * counter bug -- no two-step chain worked anywhere.
   */
  const store = createStore();
  const btn = 'buttonBlock__c1';
  const table = 'databaseBlock__c2';
  const total = 'numberDisplayBlock__c3';
  const badge = 'textLabelBlock__c4';
  store.set(allBlockIdsAtom, [btn, table, total, badge]);
  store.set(blockRuntimeAtom(btn), defaultRuntimeForNodeType('buttonBlock'));
  store.set(blockRuntimeAtom(total), defaultRuntimeForNodeType('numberDisplayBlock'));
  store.set(blockRuntimeAtom(badge), defaultRuntimeForNodeType('textLabelBlock'));
  store.set(blockRuntimeAtom(table), {
    ...defaultRuntimeForNodeType('databaseBlock'),
    columns: [{ name: 'Name', type: 'text' }],
    rows: [],
    outputMode: 'row_count',
  });
  store.set(workflowsAtom, [
    { id: 'w1', sourceId: btn, sourceEvent: 'onClick', steps: [{ targetId: table, action: 'addRow', requireValid: false, mappings: {} }] },
    { id: 'w2', sourceId: table, sourceEvent: 'onChange', steps: [{ targetId: total, action: 'set', value: '__sourceValue__' }] },
    { id: 'w3', sourceId: total, sourceEvent: 'onChange', steps: [{ targetId: badge, action: 'setText', value: 'There are {{Number Display}}' }] },
  ] as any);

  executeWorkflow(btn, 'onClick', store);
  check('the row is added, as it always was', store.get(blockRuntimeAtom(table)).rows!.length, 1);
  check('the table counts it, as it always did', store.get(blockRuntimeAtom(table)).value, 1);
  check(
    'THE SECOND LINK NOW RUNS -- this is the one that was broken',
    store.get(blockRuntimeAtom(total)).value,
    1
  );
  check('and so does the third', store.get(blockRuntimeAtom(badge)).value, 'There are 1');

  executeWorkflow(btn, 'onClick', store);
  check('and again on the next press', [store.get(blockRuntimeAtom(table)).value, store.get(blockRuntimeAtom(total)).value], [2, 2]);
}

group('a chain that leads back to itself stops instead of freezing');
{
  const store = createStore();
  const btn = 'buttonBlock__l1';
  const a = 'numberDisplayBlock__l2';
  const b = 'numberDisplayBlock__l3';
  store.set(allBlockIdsAtom, [btn, a, b]);
  for (const id of [btn, a, b]) store.set(blockRuntimeAtom(id), defaultRuntimeForNodeType(id.startsWith('button') ? 'buttonBlock' : 'numberDisplayBlock'));
  store.set(workflowsAtom, [
    { id: 'w1', sourceId: btn, sourceEvent: 'onClick', steps: [{ targetId: a, action: 'increment', amount: 1, requireValid: false }] },
    // A feeds B, B feeds A. Left unbounded this never returns.
    { id: 'w2', sourceId: a, sourceEvent: 'onChange', steps: [{ targetId: b, action: 'increment', amount: 1, requireValid: false }] },
    { id: 'w3', sourceId: b, sourceEvent: 'onChange', steps: [{ targetId: a, action: 'increment', amount: 1, requireValid: false }] },
  ] as any);

  executeWorkflow(btn, 'onClick', store);
  check('IT TERMINATES, which is the only thing that matters here', true, true);
  check('and it stopped somewhere sane rather than running away', store.get(blockRuntimeAtom(a)).value <= 10, true);
  const runs = store.get(workflowRunsAtom) as any[];
  check(
    'and it says so in the run log rather than stopping silently',
    runs.some(r => r.steps?.some((s: any) => s.action === '(chain stopped)')),
    true
  );
}

group('a step that changes nothing does not start a chain');
{
  const store = createStore();
  const btn = 'buttonBlock__n1';
  const num = 'numberDisplayBlock__n2';
  const other = 'numberDisplayBlock__n3';
  store.set(allBlockIdsAtom, [btn, num, other]);
  store.set(blockRuntimeAtom(btn), defaultRuntimeForNodeType('buttonBlock'));
  store.set(blockRuntimeAtom(num), { ...defaultRuntimeForNodeType('numberDisplayBlock'), value: 5 });
  store.set(blockRuntimeAtom(other), defaultRuntimeForNodeType('numberDisplayBlock'));
  store.set(workflowsAtom, [
    { id: 'w1', sourceId: btn, sourceEvent: 'onClick', steps: [{ targetId: num, action: 'set', value: 5, requireValid: false }] },
    { id: 'w2', sourceId: num, sourceEvent: 'onChange', steps: [{ targetId: other, action: 'increment', amount: 1, requireValid: false }] },
  ] as any);
  executeWorkflow(btn, 'onClick', store);
  check(
    'setting a value to what it already was is not a change, so nothing downstream fires',
    store.get(blockRuntimeAtom(other)).value,
    0
  );
}

// ------------------------------------------------------- what is broken here
/**
 * The button carries a page target so it is never ALSO reported as idle. A
 * fixture that trips a second, unrelated finding makes every count in this
 * group a puzzle -- which is exactly what happened when these were first run.
 */
const facts = (over: any = {}) => ({
  blockIds: ['buttonBlock__a', 'numberDisplayBlock__b', 'databaseBlock__c'],
  states: {
    'buttonBlock__a': { blockName: 'Submit', targetPageId: 'page-2' },
    'numberDisplayBlock__b': { blockName: 'Total' },
    'databaseBlock__c': { blockName: 'Orders' },
  },
  workflows: [],
  formulas: [],
  connections: [],
  /**
   * The fixture's own pages. It was missing entirely until the panel learned
   * about pages, and `page-2` above then read as a page that had been deleted
   * -- eight checks went red at once. The fixture was incomplete, not the
   * check, which is what making `pages` REQUIRED rather than optional is for:
   * an optional field would have left every one of these silently unchecked.
   */
  pages: [{ id: 'page-1', name: 'Home' }, { id: 'page-2', name: 'Thanks' }],
  ...over,
} as any);

group('a healthy page reports nothing');
{
  const wired = facts({
    workflows: [{ id: 'w', sourceId: 'buttonBlock__a', sourceEvent: 'onClick', steps: [{ targetId: 'numberDisplayBlock__b', action: 'increment' }] }],
  });
  check('nothing wrong', diagnosePage(wired), []);
  check('an empty page is not broken', diagnosePage(facts({ blockIds: [], states: {} })), []);
}

group('wires that lead nowhere');
{
  const deletedTarget = facts({
    workflows: [{ id: 'w', sourceId: 'buttonBlock__a', sourceEvent: 'onClick', steps: [{ targetId: 'numberDisplayBlock__GONE', action: 'increment' }] }],
  });
  const found = diagnosePage(deletedTarget);
  check('a deleted target is found', found.length, 1);
  check('and it is called broken', found[0].severity, 'broken');
  check('and it names the block by NAME, not by id', found[0].title.includes('Submit'), true);
  check('and it points at something selectable', found[0].blockId, 'buttonBlock__a');

  const deletedSource = facts({
    workflows: [{ id: 'w', sourceId: 'buttonBlock__GONE', sourceEvent: 'onClick', steps: [{ targetId: 'numberDisplayBlock__b', action: 'increment' }] }],
  });
  check('a deleted source is found once, not once per step', diagnosePage(deletedSource).length, 1);

  const deletedCondition = facts({
    workflows: [{
      id: 'w', sourceId: 'buttonBlock__a', sourceEvent: 'onClick',
      steps: [{ targetId: 'numberDisplayBlock__b', action: 'increment', condition: { fieldId: 'toggleBlock__GONE', operator: 'is ON' } }],
    }],
  });
  const cond = diagnosePage(deletedCondition);
  check('A CONDITION CHECKING A DELETED BLOCK IS FOUND -- it silently skips the step forever', cond.length, 1);
  check('and says so', cond[0].detail.includes('skipped'), true);
}

group('formulas pointing at nothing');
{
  check('a plain reference', referencedIds('numberDisplayBlock__b + 1'), ['numberDisplayBlock__b']);
  check('two of them, deduplicated', referencedIds('a__1 + a__1 + b__2'), ['a__1', 'b__2']);
  check('numbers are not references', referencedIds('2 + 2'), []);
  check('nothing', referencedIds(''), []);

  const gone = facts({ formulas: [{ targetBlockId: 'numberDisplayBlock__b', formula: 'databaseBlock__GONE * 2' }] });
  const out = diagnosePage(gone);
  check('a formula using a deleted block is found', out.length, 1);
  check('and named after the block it writes into', out[0].title.includes('Total'), true);

  check(
    'a formula of plain numbers is not accused of anything',
    diagnosePage(facts({ formulas: [{ targetBlockId: 'numberDisplayBlock__b', formula: '2 + 2' }] })),
    []
  );
  check(
    'a formula writing into a deleted block is found too',
    diagnosePage(facts({ formulas: [{ targetBlockId: 'numberDisplayBlock__GONE', formula: '1' }] })).length,
    1
  );
}

group('controls that were deleted out from under a list');
{
  const withSearch = facts({
    blockIds: ['repeatBlock__r', 'databaseBlock__c'],
    states: {
      'repeatBlock__r': { blockName: 'Posts', trackedBlockId: 'databaseBlock__c', searchBlockId: 'inputBlock__GONE' },
      'databaseBlock__c': { blockName: 'Orders' },
    },
  });
  const out = diagnosePage(withSearch);
  check('a deleted search box is found', out.length, 1);
  check('and says which control it was', out[0].title.includes('search box'), true);

  const noDatabase = facts({
    blockIds: ['repeatBlock__r'],
    states: { 'repeatBlock__r': { blockName: 'Posts', trackedBlockId: 'databaseBlock__ELSEWHERE' } },
  });
  const warn = diagnosePage(noDatabase);
  check(
    'a Database on another page is a WARNING, not broken -- it may be perfectly deliberate',
    warn[0].severity,
    'warning'
  );
}

group('things that exist but do nothing');
{
  const lonely = facts({ blockIds: ['buttonBlock__a'], states: { 'buttonBlock__a': { blockName: 'Submit' } } });
  const out = diagnosePage(lonely);
  check('a button wired to nothing is reported', out.length, 1);
  check('as idle rather than broken, because it may be half-built', out[0].severity, 'idle');

  const navigates = facts({
    blockIds: ['buttonBlock__a'],
    states: { 'buttonBlock__a': { blockName: 'Submit', targetPageId: 'page-2' } },
  });
  check('a button that only navigates is doing its job', diagnosePage(navigates), []);

  const unfinishedRule = facts({
    blockIds: ['inputBlock__i'],
    states: { 'inputBlock__i': { blockName: 'Email', rules: [{ type: 'matchesBlock' }] } },
  });
  check('a rule with nothing to compare against always passes, and is reported', diagnosePage(unfinishedRule).length, 1);
  check('a finished rule is not', diagnosePage(facts({
    blockIds: ['inputBlock__i'],
    states: { 'inputBlock__i': { blockName: 'Email', rules: [{ type: 'required' }] } },
  })), []);
}

group('worst first');
{
  const mixed = [
    { severity: 'idle', title: 'c', detail: '' },
    { severity: 'broken', title: 'a', detail: '' },
    { severity: 'warning', title: 'b', detail: '' },
  ] as any;
  check('read in the order anybody wants them', sortProblems(mixed).map((p: any) => p.title), ['a', 'b', 'c']);
  check('sorting does not mutate the original', mixed[0].title, 'c');
}

// --------------------------------------------------- wiring a button to a table
group('which field does this column want');
{
  check('the same word', matchScore('Name', 'Name'), 3);
  check('case and spacing do not matter', matchScore('Name', 'your name'), 2);
  check('THE SHAPE EVERYBODY WRITES: a label like "Your message" answers to Message', matchScore('Message', 'Your message'), 2);
  check('the other way round scores lower but still counts', matchScore('Full name', 'Name'), 1);
  check('unrelated words do not match', matchScore('Name', 'Submit'), 0);
  check('nothing matches nothing', matchScore('', 'Name'), 0);
  check('punctuation is ignored', normaliseName('Your name! '), 'yourname');
}

group('the columns arrive already pointed at the right fields');
{
  const columns = [{ name: 'Name' }, { name: 'Message' }];
  const blocks = [
    { id: 'inputBlock__1', label: 'Your name' },
    { id: 'inputBlock__2', label: 'Your message' },
    { id: 'buttonBlock__3', label: 'Submit' },
  ];
  const guessed = guessMappings(columns, blocks);
  check('the name field lands in Name', guessed.Name, { source: 'block', value: 'inputBlock__1' });
  check('the message field lands in Message', guessed.Message, { source: 'block', value: 'inputBlock__2' });

  check(
    'a column with nothing that answers to it is left blank rather than filled with a guess',
    guessMappings([{ name: 'Postcode' }], blocks).Postcode,
    { source: 'fixed', value: '' }
  );

  const clash = guessMappings(
    [{ name: 'Name' }, { name: 'Nickname' }],
    [{ id: 'inputBlock__1', label: 'Name' }]
  );
  check('ONE BLOCK IS USED ONCE -- two columns sharing a field looks like it worked and is worse', clash.Name, { source: 'block', value: 'inputBlock__1' });
  check('so the other column stays empty and visibly needs a decision', clash.Nickname, { source: 'fixed', value: '' });

  check('no blocks on the page means no guesses', guessMappings(columns, []).Name, { source: 'fixed', value: '' });
  check('every column is present even when nothing matched', Object.keys(guessMappings(columns, [])).sort(), ['Message', 'Name']);
}

group('refusing to create something that cannot work');
{
  const filled = { source: 'block' as const, value: 'inputBlock__1' };

  check(
    'ADD ROW WITH EVERY COLUMN EMPTY would add a blank row',
    whyItCannotWork({ action: 'addRow', mappings: { Name: { source: 'fixed', value: '' } } })?.includes('blank row'),
    true
  );
  check('one filled column is enough', whyItCannotWork({ action: 'addRow', mappings: { Name: filled } }), null);
  check('a fixed value counts as filled', whyItCannotWork({ action: 'addRow', mappings: { Name: { source: 'fixed', value: 'x' } } }), null);
  check('whitespace does not count as filled', whyItCannotWork({ action: 'addRow', mappings: { Name: { source: 'fixed', value: '   ' } } }) !== null, true);

  // The exact thing the owner built: Update Row, nothing to match on, nothing to change.
  const ownersStep = whyItCannotWork({
    action: 'updateRow',
    matchColumn: 'Name',
    matchValue: { source: 'fixed', value: '' },
    mappings: { Name: { source: 'fixed', value: '' } },
  });
  check('THE ONE THE OWNER BUILT is refused', ownersStep !== null, true);
  check('and it says which part is missing, by name', ownersStep?.includes('Name equals'), true);

  check(
    'update row that finds a row and changes nothing is refused too',
    whyItCannotWork({
      action: 'updateRow',
      matchColumn: 'Name',
      matchValue: { source: 'fixed', value: 'Ada' },
      mappings: { Name: { source: 'fixed', value: '' } },
    })?.includes('changes nothing'),
    true
  );
  check(
    'a complete update row is allowed',
    whyItCannotWork({
      action: 'updateRow',
      matchColumn: 'Name',
      matchValue: { source: 'fixed', value: 'Ada' },
      mappings: { Name: { source: 'fixed', value: 'Bo' } },
    }),
    null
  );
  check(
    'delete row needs only something to find it by',
    whyItCannotWork({ action: 'deleteRow', matchColumn: 'Name', matchValue: { source: 'fixed', value: 'Ada' } }),
    null
  );
  check(
    'a webhook with nowhere to send is refused',
    whyItCannotWork({ action: 'sendWebhook', webhookUrl: '  ' })?.includes('nowhere'),
    true
  );
  check('setText with no words is refused', whyItCannotWork({ action: 'setText', value: '' }) !== null, true);
  check('an ordinary increment is never blocked', whyItCannotWork({ action: 'increment' }), null);
  check('nor is a toggle', whyItCannotWork({ action: 'toggle' }), null);
}

// ----------------------------------------------------------------- the canvas
group('zooming');
{
  check('life size stays life size', clampZoom(1), 1);
  check('too far in is capped', clampZoom(99), MAX_ZOOM);
  check('too far out is capped', clampZoom(0.01), MIN_ZOOM);
  check('nonsense becomes life size rather than a blank canvas', clampZoom(NaN), 1);

  check('in from 100%', stepZoom(1, 1), 1.25);
  check('out from 100%', stepZoom(1, -1), 0.75);
  check(
    'IN THEN OUT RETURNS EXACTLY WHERE YOU WERE, which multiplying by 1.2 does not',
    stepZoom(stepZoom(0.5, 1), -1),
    0.5
  );
  check('it cannot step past the ceiling', stepZoom(MAX_ZOOM, 1), MAX_ZOOM);
  check('or the floor', stepZoom(MIN_ZOOM, -1), MIN_ZOOM);
  check('the steps are the round numbers a person reads', [zoomLabel(0.5), zoomLabel(0.6667), zoomLabel(1)], ['50%', '67%', '100%']);
}

group('fitting everything on screen');
{
  const wide = contentExtent([
    { x: 0, y: 0, width: 200 },
    { x: 1800, y: 40, width: 300 },
  ]);
  check('the extent reaches the far edge of the last block', wide.right, 2100);

  check(
    'a page wider than the window zooms out until it fits',
    zoomToFit(wide, { width: 1000, height: 800 }) < 1,
    true
  );
  check(
    'A PAGE THAT ALREADY FITS IS NOT BLOWN UP -- three blocks at 200% looks broken',
    zoomToFit(contentExtent([{ x: 0, y: 0, width: 100 }]), { width: 1600, height: 900 }),
    1
  );
  check('an empty page is life size', zoomToFit(contentExtent([]), { width: 800, height: 600 }), 1);
  check('fit never goes below the floor', zoomToFit({ right: 999999, bottom: 999999 }, { width: 400, height: 300 }), MIN_ZOOM);
  check('a block with no width still counts, using a fallback', contentExtent([{ x: 100, y: 0 }]).right > 100, true);
}

group('the cursor and the canvas are two coordinate systems');
{
  check('at life size they are the same', toCanvasPoint({ x: 300, y: 200 }, 1), { x: 300, y: 200 });
  check(
    'AT HALF SIZE A CURSOR 300px ACROSS IS 600px INTO THE PAGE -- without this, dragging lands further from the cursor the further out you go',
    toCanvasPoint({ x: 300, y: 200 }, 0.5),
    { x: 600, y: 400 }
  );
  check('and zoomed in, the other way', toCanvasPoint({ x: 300, y: 200 }, 2), { x: 150, y: 100 });
  check('a nonsense zoom does not produce a nonsense position', toCanvasPoint({ x: 300, y: 200 }, NaN), { x: 300, y: 200 });
}

// ------------------------------------------------- saying what a wire will do
group('the wire explains itself');
{
  check(
    'THE SENTENCE THE POPUP OPENS WITH',
    wireSentence({ sourceName: 'Button 1', targetName: 'Submissions', event: 'onClick', action: 'addRow' }),
    'When Button 1 is pressed → add a row to Submissions'
  );
  check(
    'and it changes with the action, so you can see what you are building',
    wireSentence({ sourceName: 'Button 1', targetName: 'Submissions', event: 'onClick', action: 'updateRow' }),
    'When Button 1 is pressed → change a row in Submissions'
  );
  check(
    'a timer reads properly too',
    wireSentence({ sourceName: 'Countdown', targetName: 'Score', event: 'onComplete', action: 'reset' }),
    'When Countdown reaches zero → reset Score'
  );
  check(
    'a conditional wire admits it rather than overpromising',
    wireSentence({ sourceName: 'A', targetName: 'B', event: 'onClick', action: 'set', conditional: true }),
    'When A is pressed → set B, but only sometimes'
  );
  check(
    'nameless blocks still produce a sentence rather than a blank',
    wireSentence({ sourceName: '', targetName: '  ', event: 'onClick', action: 'toggle' }),
    'When this is pressed → flip that'
  );

  // Tested by looking for camelCase leaking through, not by "the words differ
  // from the name" -- `set` and `reset` are already the right words, and the
  // first version of this check called both of them missing.
  check('no action leaks its camelCase name into the sentence', [
    'increment', 'decrement', 'set', 'setText', 'toggle', 'reset', 'turnOn', 'turnOff',
    'addRow', 'updateRow', 'deleteRow', 'exportCsv', 'sendWebhook',
    'validate', 'setLoading', 'clearLoading', 'setDisabled', 'setEnabled',
  ].filter(a => /[A-Z]/.test(actionWords(a))), []);
  check('a name with no words in the list leaks, which is how the check works', /[A-Z]/.test(actionWords('someNewAction')), true);
  check('every event has words', ['onClick', 'onChange', 'onTick', 'onComplete'].filter(e => eventWords(e) === 'happens'), []);
  check('an unknown action still reads as something', actionWords('somethingNew'), 'somethingNew');

  check('ports say what they do instead of showing a letter', outputMeaning('number'), 'gives a number');
  check('text', outputMeaning('string'), 'gives text');
  check('a toggle', outputMeaning('boolean'), 'gives yes or no');
  check('and anything unknown still says something true', outputMeaning('mystery'), 'gives its value');
}

group('every port in every block is labelled');
{
  /**
   * The hints are written into each block's JSX because a title attribute
   * cannot be a call in seventeen files without seventeen imports. Hoping the
   * copies stay in step is exactly how three block types went unsaveable, so
   * this counts them instead.
   */
  const files = readdirSync('src/blocks').filter(f => /Block\.tsx$/.test(f));
  const missingOut: string[] = [];
  const missingIn: string[] = [];
  for (const file of files) {
    const text = readFileSync(`src/blocks/${file}`, 'utf8');
    const outs = (text.match(/data-port-output=\{blockId\}/g) || []).length;
    const ins = (text.match(/data-port-input=\{blockId\}/g) || []).length;
    const outTitles = (text.split(PORT_OUT_HINT).length - 1);
    const inTitles = (text.split(PORT_IN_HINT).length - 1);
    if (outs > outTitles) missingOut.push(file);
    if (ins > inTitles) missingIn.push(file);
  }
  check('no output port is unlabelled', missingOut, []);
  check('no input port is unlabelled', missingIn, []);
}

group('nobody has hand-written the block list again');
{
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  walk('src');

  const chained: string[] = [];
  const listed: string[] = [];
  // Two or more in a row, not one. A single `x === 'matchesBlock' || ...` is a
  // rule type being compared, not a hand-written block list -- the first
  // version of this guard flagged exactly that and was wrong.
  const CHAIN = /===\s*'[A-Za-z]+Block'\s*\|\|[\s\S]{0,120}?===\s*'[A-Za-z]+Block'/;
  const LIST_LINE = /^\s*'[A-Za-z]+Block',?\s*$/;

  for (const file of files) {
    if (file.endsWith('lib/blockRegistry.ts')) continue; // the one list that is allowed
    const text = readFileSync(file, 'utf8');
    if (CHAIN.test(text)) chained.push(file);

    let run = 0;
    for (const line of text.split('\n')) {
      run = LIST_LINE.test(line) ? run + 1 : 0;
      if (run >= 3) {
        listed.push(file);
        break;
      }
    }
  }

  check('no `type === X || type === Y` chains outside the registry', chained, []);
  check('no second copy of the list as an array', listed, []);

  /**
   * The two places that got away, guarded by name rather than by pattern.
   *
   * The .creora exporter and importer each held the list as an `else if` chain
   * -- 11 of 17 types and 10 of 17 -- and the `||` regex above could not see
   * either. The obvious repair was to widen the regex to `else if`. That was
   * tried and reverted: it flagged the published renderer and the style
   * builder, which branch per block type because rendering genuinely must,
   * and it would have flagged the action and data-type chains too. A guard
   * that cries wolf gets deleted, and the first version of the regex above was
   * already corrected once for exactly this.
   *
   * So the real protection is structural and lives in the code, not here:
   * PORTABLE_TYPE_BY_NODE_TYPE is a Record<BlockNodeType, string>, which
   * refuses to compile if a block type has no name in the file. This check
   * only holds the remaining gap -- that these two callers still go through
   * that table instead of quietly growing a chain again beside it.
   */
  const appSource = readFileSync('src/App.tsx', 'utf8');
  check('the exporter asks the registry what to call a block', appSource.includes('portableTypeFromNodeType('), true);
  check('and the importer asks it back', appSource.includes('nodeTypeFromPortableType('), true);

  /**
   * No block type inferred by substring-matching an id.
   *
   * The registry's own header names this as the bug it was created to kill:
   * "block type was inferred by substring-matching the ID (id.includes('db')),
   * so an ID was secretly carrying type information". It capped every page at
   * two blocks and turned a Button into a Database. It was still alive in
   * recalculateAllFormulas on 16 Aug, matching `id.includes('list')` and
   * `id.includes('chart')` -- and the fallback id generator is base36, so the
   * letters really can turn up.
   *
   * Only block-type words count. `id.includes('__')` is checking an id's SHAPE,
   * which is a different and legitimate thing, and diagnose.ts does exactly
   * that.
   */
  const TYPE_WORDS = [
    'button', 'btn', 'number', 'num', 'toggle', 'tgl', 'input', 'inp',
    'label', 'lbl', 'formula', 'frm', 'timer', 'tmr', 'chart', 'history',
    // 'list' and 'db' were left out of the first version of this list, which is
    // almost funny: they are the exact two words the historical bugs used --
    // `id.includes('db')` turned a Button into a Database, and
    // `id.includes('list')` was still live in the engine this morning. The
    // negative control put the substring back, the guard stayed green, and that
    // is the only reason the hole was found.
    'list', 'db', 'database', 'shape', 'shp', 'visitor', 'image', 'repeat',
    'pagevalue', 'customhtml', 'datasource',
  ];
  /**
   * Comments are stripped first.
   *
   * The first version flagged atoms.ts for the comment that DOCUMENTS this very
   * bug -- "a random suffix can contain any letters, so `id.includes('db')`
   * matched by accident". A guard that fires on the explanation of the thing it
   * guards against is a guard somebody deletes, and today's other over-broad
   * regex was reverted for the same reason.
   */
  const withoutComments = (text: string) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Not after a colon, so an https:// inside a string does not eat the line.
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const guessers: string[] = [];
  for (const file of files) {
    if (file.endsWith('lib/blockRegistry.ts')) continue; // the documented legacy fallback
    const text = withoutComments(readFileSync(file, 'utf8'));
    for (const word of TYPE_WORDS) {
      // `.includes('list')` on its own is not enough -- 'list' appears in plenty
      // of honest strings. It has to be applied to something id-shaped.
      const pattern = new RegExp(`\\b(?:\\w*[iI]d|typeName|nodeType)\\b[^;\\n]{0,40}\\.includes\\(\\s*'${word}'`);
      if (pattern.test(text)) { guessers.push(`${file} (${word})`); break; }
    }
  }
  check('no block type is guessed from a substring of an id', guessers, []);

  /**
   * And every block type has a name on screen. This was a seventeen-branch
   * includes() chain ending in 'Block', so a new type was called "Block"
   * everywhere with no error.
   */
  const named = BLOCK_NODE_TYPES.filter(t => {
    const shown = getBlockTypeDisplayName(t);
    return shown && shown !== 'Block';
  });
  check('every block type has a display name', named.length, BLOCK_NODE_TYPES.length);
  check('and no two blocks answer to the same name',
    new Set(BLOCK_NODE_TYPES.map(t => getBlockTypeDisplayName(t))).size, BLOCK_NODE_TYPES.length);
  check('something that is not a block type is still tolerated', getBlockTypeDisplayName('whatever'), 'Block');
}


// ------------------------------------------------------------ ports you see
/**
 * The node system was invisible.
 *
 * Every port set its own opacity to 0 unless the pointer happened to be over
 * that exact block, so the answer to "how would anyone know you can wire these
 * together?" was: they hover the right ten pixels by accident, or they never
 * find out. A feature nobody can see is a feature nobody has.
 *
 * The floor is set once, in CSS, rather than in fourteen block files -- because
 * "the same thing, written out by hand in n places" is precisely how three
 * block types quietly stopped saving. But a shared rule reaching into fourteen
 * blocks is its own hazard, and these checks are about that hazard: the shared
 * rule may say how loud a port is and how big a target it is, and it may never
 * say where a port sits. Ports are NOT positioned the same way -- the
 * repeater's two are placed from the top with no transform at all, while the
 * rest are centred with translateY(-50%) -- so one blanket `transform` here
 * moves half of them sideways off their own edge.
 *
 * That was nearly shipped as `transform: scale(1.5)` on hover. It is caught
 * here now instead of by a person noticing their repeater looks wrong.
 */
group('a port is visible before you touch it');
{
  /** Every rule in the file, descending into @media rather than tripping on it. */
  const cssRules = (text: string): Array<{ selector: string; body: string }> => {
    const src = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const out: Array<{ selector: string; body: string }> = [];
    const walk = (s: string) => {
      let i = 0;
      let start = 0;
      while (i < s.length) {
        if (s[i] === '{') {
          const selector = s.slice(start, i).trim().replace(/\s+/g, ' ');
          let depth = 1;
          let j = i + 1;
          while (j < s.length && depth > 0) {
            if (s[j] === '{') depth++;
            else if (s[j] === '}') depth--;
            j++;
          }
          const body = s.slice(i + 1, j - 1);
          if (selector.startsWith('@')) walk(body);
          else out.push({ selector, body });
          i = j;
          start = j;
        } else i++;
      }
    };
    walk(src);
    return out;
  };

  const value = (body: string, prop: string): string => {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body);
    return m ? m[1].replace('!important', '').trim() : '';
  };

  const rules = cssRules(readFileSync('src/index.css', 'utf8')).filter((r) =>
    /\[data-port-(output|input)\]/.test(r.selector)
  );

  const atRest = rules.find(
    (r) => r.selector.includes(':not(.preview-mode)') && !r.selector.includes(':hover')
  );
  const hovered = rules.find((r) => r.selector.includes(':hover'));
  const grabArea = rules.find((r) => r.selector.includes('::before'));
  const inPreview = rules.find((r) => r.selector.includes('.preview-mode ['));
  const inDesign = rules.find((r) => r.selector.includes('.design-mode ['));

  check('there is a rule for a port nobody is touching', Boolean(atRest), true);
  check('there is a rule for a port under the pointer', Boolean(hovered), true);
  check('there is a rule making a port easier to hit', Boolean(grabArea), true);

  const floor = Number(value(atRest?.body ?? '', 'opacity'));
  check('ports are visible without hovering', floor > 0, true);
  check('but quieter than the one being pointed at', floor < 1, true);
  check('and they can be grabbed', value(atRest?.body ?? '', 'pointer-events'), 'all');

  // Not decoration. A port shown on a published page is a control that does
  // nothing, and design view is for arranging, not wiring.
  check('a published page shows no ports', Number(value(inPreview?.body ?? '', 'opacity')), 0);
  check('design view shows no ports', Number(value(inDesign?.body ?? '', 'opacity')), 0);
  check('a hovered port says so', /box-shadow/.test(hovered?.body ?? ''), true);

  // The load-bearing pair. Ports disagree about where they sit, so the shared
  // rule may only ever change how a port LOOKS, never where it is.
  const positions = /(?:^|;)\s*(top|left|right|bottom|transform|margin)\s*:/;
  check('the shared rule never positions a port at rest', positions.test(atRest?.body ?? ''), false);
  check('and hovering never moves it', positions.test(hovered?.body ?? ''), false);

  // 14px of dot. The grab area is what your hand is actually aiming at, and it
  // is sized here rather than with `inset`, which resolves against the padding
  // box and so quietly loses the 2px border on every side.
  check('the target is bigger than the dot', parseFloat(value(grabArea?.body ?? '', 'width')) >= 24, true);
  check('the target is round, like the dot', value(grabArea?.body ?? '', 'border-radius'), '50%');
  check('and centred on it', value(grabArea?.body ?? '', 'transform'), 'translate(-50%, -50%)');
}

group('ports do not agree on where they sit, which is why the rule above exists');
{
  const files = readdirSync('src/blocks')
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => `src/blocks/${f}`)
    .filter((f) => readFileSync(f, 'utf8').includes('data-port-'));

  let ports = 0;
  let centred = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/data-port-(?:output|input)=/g)) {
      const after = text.slice(m.index ?? 0, (m.index ?? 0) + 900);
      const style = after.slice(after.indexOf('style={{'));
      const end = style.indexOf('}}');
      if (end < 0) continue;
      ports += 1;
      if (style.slice(0, end).includes('translateY(-50%)')) centred += 1;
    }
  }

  check('there are ports to find', ports > 0, true);
  // Both sides non-zero is the whole point: the day this stops being true a
  // transform in the shared rule becomes safe, and not before.
  check('some ports are centred on their edge', centred > 0, true);
  check('and some are placed from the top instead', ports - centred > 0, true);
}


// -------------------------------------------------- what a .creora file says
/**
 * The export format is the one thing a builder is promised is theirs. It was
 * lossy for six of the seventeen block types and nothing said so.
 */
group('a .creora file names every block type');
{
  const portable = BLOCK_NODE_TYPES.map(t => portableTypeFromNodeType(t));

  check('every block type has a name in the file', portable.filter(Boolean).length, BLOCK_NODE_TYPES.length);
  check('and no two share one', new Set(portable).size, BLOCK_NODE_TYPES.length);

  // The bug in one line: these six were all written as 'text'.
  for (const nodeType of ['imageBlock', 'repeatBlock', 'customHtmlBlock', 'dataSourceBlock', 'pageValueBlock', 'visitorBlock'] as const) {
    check(`${nodeType} is not exported as plain text`, portableTypeFromNodeType(nodeType) === 'text', false);
  }

  // A round trip is the only thing that actually matters to a backup.
  const roundTripped = BLOCK_NODE_TYPES.filter(
    t => nodeTypeFromPortableType(portableTypeFromNodeType(t)) === t,
  );
  check('every block type survives export then import', roundTripped.length, BLOCK_NODE_TYPES.length);

  // Files written before formulaDisplayBlock had a name of its own say
  // 'number' for both, and only a formula pointing at the block tells them
  // apart. New files say 'formula' and never take that branch.
  check('an old file`s number block is a number', nodeTypeFromPortableType('number', false), 'numberDisplayBlock');
  check('unless a formula targets it', nodeTypeFromPortableType('number', true), 'formulaDisplayBlock');
  check('a name we do not know is refused, not guessed', nodeTypeFromPortableType('sparkline'), null);
  check('and so is nothing at all', nodeTypeFromPortableType(undefined), null);
}

// ------------------------------------------------- an imported copy is a copy
/**
 * Rows are keyed by block id and by nothing else, so two pages holding the same
 * block ids hold the same rows. Import used to keep the ids exactly as it found
 * them, which made "use my export as a template" silently merge two pages.
 */
group('an imported copy does not share the original`s data');
{
  const OLD_BTN = 'buttonBlock__aaaaaaaaaa';
  const OLD_DB = 'databaseBlock__bbbbbbbbbb';
  const OLD_NUM = 'numberDisplayBlock__cccccccccc';
  const OLD_INPUT = 'inputBlock__dddddddddd';

  const page = () => ({
    id: 'page-one',
    documentContent: {
      type: 'doc',
      content: [
        { type: 'buttonBlock', attrs: { blockId: OLD_BTN, label: 'Submit' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
        { type: 'databaseBlock', attrs: { blockId: OLD_DB } },
      ],
    },
    positions: { [OLD_BTN]: { x: 10, y: 20 }, [OLD_DB]: { x: 30, y: 40 } },
    runtimeStates: {
      [OLD_BTN]: { value: 0, blockName: 'Submit' },
      [OLD_DB]: { value: 0, columns: ['Name'] },
      [OLD_NUM]: { value: 0, trackedBlockId: OLD_DB },
      [OLD_INPUT]: { value: '', searchBlockId: OLD_INPUT, sortColumnBlockId: OLD_DB },
    },
    connections: [{ id: 'c1', sourceBlockId: OLD_BTN, targetBlockId: OLD_DB }],
    workflows: [
      {
        id: 'w1',
        sourceId: OLD_BTN,
        sourceEvent: 'onClick',
        steps: [
          {
            targetId: OLD_DB,
            action: 'addRow',
            elseTargetId: OLD_NUM,
            condition: { fieldId: OLD_INPUT, operator: 'isNotEmpty' },
            conditions: [{ fieldId: OLD_INPUT, operator: 'isNotEmpty' }],
            mappings: {
              Name: { source: 'block', value: OLD_INPUT },
              Note: { source: 'fixed', value: OLD_INPUT },
            },
            matchValue: { source: 'block', value: OLD_INPUT },
          },
        ],
      },
    ],
    formulas: [{ id: 'f1', targetBlockId: OLD_NUM, targetProperty: 'value', formula: `${OLD_DB} + 1`, pageId: 'page-one' }],
    blocks: [{ id: OLD_BTN, type: 'button' }],
  });

  const { page: copy, idMap } = remapBlockIds(page());
  const at = (id: string) => idMap[id];

  check('every block got a new identity', Object.keys(idMap).length, 4);
  check('and none of them kept the old one', Object.values(idMap).some(v => v in idMap), false);

  // The prefix carries the type. Lose it and every block becomes unknown.
  check('a new id still says what kind of block it is', nodeTypeFromBlockId(at(OLD_BTN)), 'buttonBlock');
  check('for a database too', nodeTypeFromBlockId(at(OLD_DB)), 'databaseBlock');

  const step = (copy.workflows as any[])[0].steps[0];
  check('the document node points at the new id', (copy.documentContent as any).content[0].attrs.blockId, at(OLD_BTN));
  check('and keeps its other attrs', (copy.documentContent as any).content[0].attrs.label, 'Submit');
  check('text in the document is left alone', (copy.documentContent as any).content[1].content[0].text, 'hello');
  check('positions are re-keyed', Object.keys(copy.positions as any).sort(), [at(OLD_BTN), at(OLD_DB)].sort());
  check('runtime states are re-keyed', at(OLD_BTN) in (copy.runtimeStates as any), true);
  check('a tracked block follows', (copy.runtimeStates as any)[at(OLD_NUM)].trackedBlockId, at(OLD_DB));
  check('a search box follows', (copy.runtimeStates as any)[at(OLD_INPUT)].searchBlockId, at(OLD_INPUT));
  check('a sort column follows', (copy.runtimeStates as any)[at(OLD_INPUT)].sortColumnBlockId, at(OLD_DB));
  check('both ends of a wire follow', [(copy.connections as any)[0].sourceBlockId, (copy.connections as any)[0].targetBlockId], [at(OLD_BTN), at(OLD_DB)]);
  check('a workflow`s trigger follows', (copy.workflows as any)[0].sourceId, at(OLD_BTN));
  check('a step`s target follows', step.targetId, at(OLD_DB));
  check('an otherwise branch follows', step.elseTargetId, at(OLD_NUM));
  check('the old single condition follows', step.condition.fieldId, at(OLD_INPUT));
  check('and every one in the list', step.conditions[0].fieldId, at(OLD_INPUT));
  check('a column fed from a block follows', step.mappings.Name.value, at(OLD_INPUT));
  check('a match value fed from a block follows', step.matchValue.value, at(OLD_INPUT));
  check('a formula`s target follows', (copy.formulas as any)[0].targetBlockId, at(OLD_NUM));
  check('and the ids inside the expression itself', (copy.formulas as any)[0].formula, `${at(OLD_DB)} + 1`);
  check('the portable blocks array follows', (copy.blocks as any)[0].id, at(OLD_BTN));

  // A fixed value that merely looks like an id is a VALUE. Rewriting it would
  // corrupt the row a form writes, which is worse than the bug being fixed.
  check('a fixed value is never mistaken for a reference', step.mappings.Note.value, OLD_INPUT);

  /**
   * Nothing anywhere in the copy still mentions an old id.
   *
   * This is the completeness sweep: the field-by-field checks above only prove
   * the fields somebody thought of, and a reference missed is a wire pointing
   * at nothing. Written as a text search rather than a field walk on purpose --
   * it does not need to know the shape to find a survivor.
   *
   * Fixed mapping values are removed first, and only those, because the check
   * directly above asserts that they are deliberately NOT rewritten. Two
   * claims, two fixtures, rather than one check quietly loosened until it
   * passes. This first run genuinely failed and found that survivor.
   */
  const sweepable = JSON.parse(JSON.stringify(copy));
  for (const w of sweepable.workflows ?? []) {
    for (const st of w.steps ?? []) {
      for (const [column, m] of Object.entries<any>(st.mappings ?? {})) {
        if (m?.source === 'fixed') delete st.mappings[column];
      }
    }
  }
  const asText = JSON.stringify(sweepable);
  const leftovers = Object.keys(idMap).filter(old => asText.includes(old));
  check('no old id survives anywhere in the copy', leftovers, []);

  // The original is untouched -- the caller may still need it.
  const original = page();
  check('the file it read is not modified', (original.documentContent as any).content[0].attrs.blockId, OLD_BTN);

  // Slots address blocks by NAME, so they keep working without rewriting.
  const named = remapBlockIds({
    runtimeStates: { [OLD_DB]: { value: 0, rowHtml: '<b>{{Name}}</b>' } },
  });
  check('slots are left alone, because they name blocks not id them', (named.page.runtimeStates as any)[named.idMap[OLD_DB]].rowHtml, '<b>{{Name}}</b>');
}

group('restoring a backup keeps its identities, copying does not');
{
  check('a different page is a copy', shouldRemapOnImport('page-one', 'page-two'), true);
  check('the same page is a restore', shouldRemapOnImport('page-one', 'page-one'), false);
  // A file that never recorded a page id is treated as a copy: a needless
  // remap costs a link to rows it probably never had, while a needless keep
  // welds two live pages together.
  check('a file with no page id is a copy', shouldRemapOnImport(undefined, 'page-one'), true);
  check('and so is an import with nowhere to land', shouldRemapOnImport('page-one', undefined), true);
}

group('one id is never rewritten inside another');
{
  // Ids share a prefix by design, so a naive replace can rewrite the short one
  // inside the long one and produce an id that belongs to nothing.
  const shortId = 'inputBlock__aaaa';
  const longId = 'inputBlock__aaaabbbb';
  const map = { [shortId]: 'inputBlock__1111', [longId]: 'inputBlock__2222' };
  check('the longer id wins where they overlap', remapFormulaExpression(`${longId} + ${shortId}`, map), 'inputBlock__2222 + inputBlock__1111');
  check('a bare word that merely starts the same is untouched', remapFormulaExpression(`${shortId}zzz + 1`, map), `${shortId}zzz + 1`);
  check('an empty formula stays empty', remapFormulaExpression('', map), '');
}


// ------------------------------------------------------ what a formula can say
/**
 * The old evaluator was `+ - * / %` over a `default: return 0`, so every
 * function call and every comparison answered 0 in silence.
 */
group('formulas do arithmetic exactly as they always did');
{
  const s = { A: 10, B: 4, T: true, Blank: '', Txt: '7' };
  check('add', evaluateExpression('A + B', s), 14);
  check('subtract', evaluateExpression('A - B', s), 6);
  check('multiply', evaluateExpression('A * B', s), 40);
  check('divide', evaluateExpression('A / B', s), 2.5);
  check('remainder', evaluateExpression('A % B', s), 2);
  check('precedence is not invented here', evaluateExpression('A + B * 2', s), 18);
  check('brackets still win', evaluateExpression('(A + B) * 2', s), 28);
  check('negate', evaluateExpression('-A', s), -10);
  // The old scope turned every block into a number before the formula saw it.
  // Arithmetic must keep behaving that way or existing pages change under you.
  check('a boolean is still 1', evaluateExpression('T + 1', s), 2);
  check('numeric text is still a number', evaluateExpression('Txt + 1', s), 8);
  check('a blank is still zero in arithmetic', evaluateExpression('Blank + 5', s), 5);
  check('dividing by zero is still 0, not an error', evaluateExpression('A / 0', s), 0);
  check('an empty formula is still 0', evaluateExpression('', s), 0);
  check('a block that is not there still says so', (() => {
    try { evaluateExpression('Nope + 1', s); return 'no error'; }
    catch (e: any) { return e.message; }
  })(), 'Referenced block "Nope" does not exist');
}

group('a formula can now ask a question');
{
  const s = { Price: 120, Zero: 0, Blank: '', Status: 'paid', Stock: 3 };
  check('greater than', evaluateExpression('Price > 100', s), true);
  check('less than', evaluateExpression('Price < 100', s), false);
  check('at least', evaluateExpression('Price >= 120', s), true);
  check('at most', evaluateExpression('Price <= 119', s), false);
  check('equals a number', evaluateExpression('Stock == 3', s), true);
  check('does not equal', evaluateExpression('Stock != 3', s), false);
  check('equals text', evaluateExpression('Status == "paid"', s), true);
  check('text that does not match', evaluateExpression('Status == "draft"', s), false);

  /**
   * The reason comparisons are not implemented in formula.ts at all: they hand
   * over to evaluateCondition, so the blank-is-not-zero rule that cost cycle 5
   * a day comes along for free. `Number('')` is 0, so a naive `Blank < 9` is
   * true for every row nobody filled in.
   */
  check('a blank cannot be compared, so it is not less than 9', evaluateExpression('Blank < 9', s), false);
  check('nor greater than -1', evaluateExpression('Blank > -1', s), false);
  check('but a real zero compares normally', evaluateExpression('Zero < 9', s), true);
}

group('a formula can now choose');
{
  const s = { Stock: 3, Empty: 0, Subtotal: 600, Agreed: true, Email: '' };
  check('if, taking the first branch', evaluateExpression('if(Stock > 0, "In stock", "Sold out")', s), 'In stock');
  check('if, taking the second', evaluateExpression('if(Empty > 0, "In stock", "Sold out")', s), 'Sold out');
  check('free delivery over 500', evaluateExpression('if(Subtotal >= 500, 0, 50)', s), 0);
  check('and the other way', evaluateExpression('if(Subtotal >= 5000, 0, 50)', s), 50);
  check('if with no else is blank, not zero', evaluateExpression('if(Empty > 0, "yes")', s), '');
  check('the ternary spelling works too', evaluateExpression('Stock > 0 ? "yes" : "no"', s), 'yes');
  check('and', evaluateExpression('and(Agreed, not(isBlank(Email)))', s), false);
  check('and, both true', evaluateExpression('and(Agreed, isBlank(Email))', s), true);
  check('or', evaluateExpression('or(Agreed, false)', s), true);
  check('not', evaluateExpression('not(Agreed)', s), false);
  check('&& spelling', evaluateExpression('Stock > 0 && Subtotal > 100', s), true);
  /**
   * `and` and `or` as WORDS, which is what somebody who has never written code
   * actually types. Found by writing a check that way without thinking, one
   * hour after building the language -- it read as obviously correct and did
   * not parse.
   */
  check('the word "and"', evaluateExpression('Stock > 0 and Subtotal > 100', s), true);
  check('the word "or"', evaluateExpression('Stock > 99 or Subtotal > 100', s), true);
  check('and it is false when it should be', evaluateExpression('Stock > 99 and Subtotal > 100', s), false);
  check('the word form and the symbol form agree',
    evaluateExpression('Stock > 0 and Subtotal > 100', s),
    evaluateExpression('Stock > 0 && Subtotal > 100', s));
  check('three of them chain', evaluateExpression('Stock > 0 and Subtotal > 100 and Agreed', s), true);
  check('and mixes with the function form', evaluateExpression('and(Stock > 0, Subtotal > 100) or false', s), true);
  check('|| spelling', evaluateExpression('Stock > 99 || Subtotal > 100', s), true);
  check('! spelling', evaluateExpression('!Agreed', s), false);
  // A word, not a block. Someone will write these before they write a block name.
  check('true reads as a word', evaluateExpression('if(true, 1, 2)', {}), 1);
  check('false reads as a word', evaluateExpression('if(false, 1, 2)', {}), 2);
}

group('the number functions');
{
  const s = { A: 10, B: 4, Neg: -7, Sub: 1000 };
  check('min', evaluateExpression('min(A, B, 99)', s), 4);
  check('max', evaluateExpression('max(A, B, 99)', s), 99);
  check('sum', evaluateExpression('sum(A, B, 1)', s), 15);
  check('avg', evaluateExpression('avg(A, B)', s), 7);
  check('abs', evaluateExpression('abs(Neg)', s), 7);
  check('floor', evaluateExpression('floor(2.9)', s), 2);
  check('ceil', evaluateExpression('ceil(2.1)', s), 3);
  check('round to whole', evaluateExpression('round(2.5)', s), 3);
  check('round to places', evaluateExpression('round(Sub * 0.18, 2)', s), 180);
  check('tax on an awkward number', evaluateExpression('round(19.99 * 0.2, 2)', s), 4);
  // toFixed would hand back the string "1.50" and everything downstream would
  // stop treating it as a number. There is a check because it is tempting.
  check('rounding gives a number, not text', typeof evaluateExpression('round(1.5, 2)', s), 'number');
  check('and the classic floating point case', evaluateExpression('round(1.005, 2)', s), 1.01);
  check('pow', evaluateExpression('pow(2, 10)', s), 1024);
  check('sqrt', evaluateExpression('sqrt(16)', s), 4);
  check('sqrt of a negative is 0, not NaN', evaluateExpression('sqrt(0 - 4)', s), 0);
  check('clamp inside', evaluateExpression('clamp(50, 0, 100)', s), 50);
  check('clamp below', evaluateExpression('clamp(0 - 5, 0, 100)', s), 0);
  check('clamp above', evaluateExpression('clamp(150, 0, 100)', s), 100);
  // Swapped bounds should still land inside them rather than collapse.
  check('clamp survives its bounds being the wrong way round', evaluateExpression('clamp(50, 100, 0)', s), 50);
}

group('the text functions');
{
  const s = { First: 'Ada', Last: 'Lovelace', Nothing: '', Msg: 'Hello World' };
  check('len', evaluateExpression('len(First)', s), 3);
  check('upper', evaluateExpression('upper(First)', s), 'ADA');
  check('lower', evaluateExpression('lower(First)', s), 'ada');
  check('trim', evaluateExpression('trim("  a  ")', s), 'a');
  check('join', evaluateExpression('join(" ", First, Last)', s), 'Ada Lovelace');
  // Otherwise a missing surname leaves a trailing space on every name.
  check('join skips a blank instead of leaving a gap', evaluateExpression('join(" ", First, Nothing)', s), 'Ada');
  check('concat', evaluateExpression('concat(First, "!")', s), 'Ada!');
  check('contains', evaluateExpression('contains(Msg, "world")', s), true);
  check('contains is not case fussy', evaluateExpression('contains(Msg, "WORLD")', s), true);
  check('startsWith', evaluateExpression('startsWith(Msg, "hello")', s), true);
  check('endsWith', evaluateExpression('endsWith(Msg, "rld")', s), true);
  check('replace', evaluateExpression('replace(Msg, "World", "there")', s), 'Hello there');
  check('replace changes every one', evaluateExpression('replace("a-a-a", "a", "b")', s), 'b-b-b');
  check('left', evaluateExpression('left(Msg, 5)', s), 'Hello');
  check('right', evaluateExpression('right(Msg, 5)', s), 'World');
  check('right of nothing is nothing, not everything', evaluateExpression('right(Msg, 0)', s), '');
  check('number()', evaluateExpression('number("12") + 1', s), 13);
  check('text()', evaluateExpression('text(12)', s), '12');
  check('isBlank on empty', evaluateExpression('isBlank(Nothing)', s), true);
  check('isBlank on a space is still blank', evaluateExpression('isBlank("   ")', s), true);
  check('isBlank on a real zero is false', evaluateExpression('isBlank(0)', s), false);
}

group('a formula that cannot be answered says so, instead of returning zero');
{
  const say = (f: string, s: any = {}) => {
    try { return { ok: evaluateExpression(f, s) }; }
    catch (e: any) { return { err: e.message }; }
  };
  // This is the whole point of the rewrite. Every one of these used to be 0.
  check('an unknown function is named', say('sparkline(1)').err?.startsWith('There is no function called "sparkline"'), true);
  check('and the real ones are listed', say('sparkline(1)').err?.includes('round'), true);
  check('too few arguments', say('round()').err, 'round() needs 1 to 2 values, and was given 0');
  check('too many arguments', say('abs(1, 2)').err, 'abs() needs 1 value, and was given 2');
  check('if needs at least two', say('if(true)').err, 'if() needs 2 to 3 values, and was given 1');
  check('a dot is explained rather than ignored', say('A.b', { A: 1 }).err, 'A formula refers to a block by its own name, not with a dot');
  check('two formulas at once', say('1; 2').err, 'One formula at a time -- remove the comma or semicolon');
  check('unreadable text', say('((((').err, 'That formula could not be read. Check the brackets and quotes.');
  check('a function name is not case fussy', say('ROUND(2.5)').ok, 3);
}

group('formulas compose with everything already built');
{
  // The reason to add a language rather than a "tax block" or a "discount
  // block": these are all one expression each, and none of them needed code.
  const cart = { Qty: 3, UnitPrice: 19.99, Member: true, Country: 'IN' };
  check('line total', evaluateExpression('round(Qty * UnitPrice, 2)', cart), 59.97);
  check('member discount', evaluateExpression('round(Qty * UnitPrice * if(Member, 0.9, 1), 2)', cart), 53.97);
  check('tax only in one country', evaluateExpression('if(Country == "IN", round(Qty * UnitPrice * 0.18, 2), 0)', cart), 10.79);
  check('delivery banding', evaluateExpression('if(Qty * UnitPrice >= 500, 0, if(Qty * UnitPrice >= 100, 25, 50))', cart), 50);

  const profile = { First: 'Ada', Last: '', Email: 'ada@example.com' };
  check('a display name that survives a missing surname', evaluateExpression('join(" ", First, Last)', profile), 'Ada');
  check('a status sentence', evaluateExpression('if(isBlank(Email), "No email yet", concat("Contact: ", Email))', profile), 'Contact: ada@example.com');

  const stock = { Count: 0, Threshold: 5 };
  check('three-way stock label', evaluateExpression('if(Count == 0, "Sold out", if(Count < Threshold, "Low stock", "In stock"))', stock), 'Sold out');
}


// -------------------------------------------- a condition can be a whole formula
/**
 * A condition could only ever compare ONE block against ONE fixed value. So
 * "only submit when the order is over 500" -- quantity times price -- was not
 * sayable, however many conditions were added. Adding more rows cannot multiply.
 */
group('a condition can now be a whole formula');
{
  const mk = () => {
    const store = createStore();
    const QTY = 'numberDisplayBlock__qty0000001';
    const PRICE = 'numberDisplayBlock__price00001';
    const NAME = 'inputBlock__name000000001';
    const AGREED = 'toggleBlock__agreed000001';
    const base = { visible: true, disabled: false, loading: false, error: null };
    store.set(allBlockIdsAtom, [QTY, PRICE, NAME, AGREED]);
    store.set(blockRuntimeAtom(QTY), { ...base, value: 3 });
    store.set(blockRuntimeAtom(PRICE), { ...base, value: 200 });
    store.set(blockRuntimeAtom(NAME), { ...base, value: 'Ada' });
    store.set(blockRuntimeAtom(AGREED), { ...base, value: true });
    return { store, QTY, PRICE, NAME, AGREED };
  };

  const { store, QTY, PRICE, NAME, AGREED } = mk();
  const ask = (expression: string) => stepConditionResult({ fieldId: '', operator: 'equals', expression } as any, store);

  check('two blocks multiplied, over a threshold', ask(`${QTY} * ${PRICE} > 500`).pass, true);
  check('and under it', ask(`${QTY} * ${PRICE} > 5000`).pass, false);
  check('several things at once', ask(`and(${AGREED}, not(isBlank(${NAME})))`).pass, true);
  check('text compared', ask(`${NAME} == "Ada"`).pass, true);
  check('a function over a field', ask(`len(${NAME}) >= 3`).pass, true);

  /**
   * Braces here are a step condition written in the repeater's spelling. It
   * fails closed either way; the point is that the run log says which spelling
   * this box takes instead of sending somebody to check their brackets.
   */
  const braced = ask(`{{${QTY}}} > 1`);
  check('braces in a step condition fail closed', braced.pass, false);
  check('AND THE RUN LOG SAYS WHICH SPELLING THIS BOX TAKES',
    braced.describe.includes('without the braces'), true);
  check('a correct expression is not lectured',
    ask(`${QTY} > 1`).describe.includes('braces'), false);

  // The old shape still has to work, because every page saved so far uses it.
  const plain = stepConditionResult({ fieldId: QTY, operator: 'greaterThan', value: 1 } as any, store);
  check('a plain field condition still works', plain.pass, true);
  check('and still explains itself', plain.describe.includes('actual 3'), true);

  /**
   * Failing closed is the safe direction. A broken condition guarding a row
   * write should stop the write, not wave it through -- the opposite choice
   * silently writes rows nobody asked for and looks like it worked.
   */
  const broken = ask('sparkline(1) > 0');
  check('a formula that cannot be worked out is false, not true', broken.pass, false);
  check('and the run log says why, by name', broken.describe.includes('There is no function called "sparkline"'), true);

  const missing = ask('NoSuchBlock > 1');
  check('a deleted block is false, not true', missing.pass, false);
  check('and is named in the log', missing.describe.includes('does not exist'), true);

  // Empty means "no expression", so the row falls back to the field comparison
  // rather than becoming a condition that is always false.
  const blankExpr = stepConditionResult({ fieldId: QTY, operator: 'greaterThan', value: 1, expression: '   ' } as any, store);
  check('a blank expression falls back to the field row', blankExpr.pass, true);

  // The description is what a builder reads in the Runs panel. An expression
  // condition has no fieldId or operator to print, so it prints itself.
  check('an expression describes itself rather than a blank id', ask(`${QTY} > 99`).describe.startsWith(QTY), true);
  check('and reports what it answered', ask(`${QTY} > 99`).describe.includes('answered false'), true);
}

group('formulas and conditions look at the same values');
{
  // Two scope builders would drift, and the one that drifted would be whichever
  // was edited second. There is one, and this is the check that says so.
  const store = createStore();
  const A = 'numberDisplayBlock__aaa0000001';
  const B = 'inputBlock__bbb000000001';
  store.set(allBlockIdsAtom, [A, B]);
  store.set(blockRuntimeAtom(A), { value: 12, visible: true, disabled: false, loading: false, error: null });
  store.set(blockRuntimeAtom(B), { value: 'paid', visible: true, disabled: false, loading: false, error: null });

  const scope = formulaScope(store);
  check('every block is in scope', Object.keys(scope).sort(), [A, B].sort());
  check('a number arrives as a number', scope[A], 12);
  // The old scope ran everything through Number(), so "paid" arrived as 0 --
  // which is exactly why text could never be compared.
  check('and text arrives as text, not as zero', scope[B], 'paid');
  check('a condition sees what a formula sees', stepConditionResult({ fieldId: '', operator: 'equals', expression: `${B} == "paid"` } as any, store).pass, true);
}

group('an expression condition actually gates the step');
{
  /**
   * Every check above calls stepConditionResult directly. Not one of them came
   * through executeWorkflow, and the bug was in executeWorkflow: the gate
   * decided "is this a real condition?" by looking for a fieldId, and an
   * expression condition has none -- so it was dropped and the step ran with no
   * condition at all. A discount guarded by "only over 500" was given on every
   * order. Found by running a workflow in a browser.
   *
   * So these go through the engine, which is where the gate lives.
   */
  const BTN = 'buttonBlock__gate00000001';
  const QTY = 'numberDisplayBlock__gq0000001';
  const PRICE = 'numberDisplayBlock__gp0000001';
  const OUT = 'numberDisplayBlock__go0000001';
  const base = { visible: true, disabled: false, loading: false, error: null };

  const run = (qty: number) => {
    const store = createStore();
    store.set(allBlockIdsAtom, [BTN, QTY, PRICE, OUT]);
    store.set(blockRuntimeAtom(BTN), { ...base, value: 0 });
    store.set(blockRuntimeAtom(QTY), { ...base, value: qty });
    store.set(blockRuntimeAtom(PRICE), { ...base, value: 200 });
    store.set(blockRuntimeAtom(OUT), { ...base, value: 0 });
    store.set(formulasAtom, []);
    store.set(workflowsAtom, [{
      id: 'w', sourceId: BTN, sourceEvent: 'onClick',
      steps: [{
        targetId: OUT, action: 'set', value: 50,
        condition: { fieldId: '', operator: 'equals', expression: `${QTY} * ${PRICE} > 500` },
        elseAction: 'set', elseTargetId: OUT, elseValue: 0,
      }],
    }] as any);
    executeWorkflow(BTN, 'onClick', store);
    return {
      out: store.get(blockRuntimeAtom(OUT)).value,
      reason: (store.get(workflowRunsAtom)[0] as any)?.steps?.[0]?.reason || '',
    };
  };

  const under = run(2);   // 400
  const over = run(5);    // 1000
  check('an order under the threshold does NOT get the discount', under.out, 0);
  check('an order over it does', over.out, 50);
  check('and the run log names the formula that failed', under.reason.includes(`${QTY} * ${PRICE} > 500`), true);
  check('and what it answered', under.reason.includes('answered false'), true);

  // The same guard in the many-conditions shape.
  const store = createStore();
  store.set(allBlockIdsAtom, [BTN, QTY, PRICE, OUT]);
  store.set(blockRuntimeAtom(BTN), { ...base, value: 0 });
  store.set(blockRuntimeAtom(QTY), { ...base, value: 2 });
  store.set(blockRuntimeAtom(PRICE), { ...base, value: 200 });
  store.set(blockRuntimeAtom(OUT), { ...base, value: 0 });
  store.set(formulasAtom, []);
  store.set(workflowsAtom, [{
    id: 'w2', sourceId: BTN, sourceEvent: 'onClick', match: 'all',
    steps: [{
      targetId: OUT, action: 'set', value: 50,
      conditions: [{ fieldId: '', operator: 'equals', expression: `${QTY} * ${PRICE} > 500` }],
    }],
  }] as any);
  executeWorkflow(BTN, 'onClick', store);
  check('the many-conditions shape gates too', store.get(blockRuntimeAtom(OUT)).value, 0);

  // A condition row with neither a field nor an expression is not a condition,
  // and must not turn into one that is always false.
  const empty = createStore();
  empty.set(allBlockIdsAtom, [BTN, OUT]);
  empty.set(blockRuntimeAtom(BTN), { ...base, value: 0 });
  empty.set(blockRuntimeAtom(OUT), { ...base, value: 0 });
  empty.set(formulasAtom, []);
  empty.set(workflowsAtom, [{
    id: 'w3', sourceId: BTN, sourceEvent: 'onClick',
    steps: [{ targetId: OUT, action: 'set', value: 9, condition: { fieldId: '', operator: 'equals', expression: '' } }],
  }] as any);
  executeWorkflow(BTN, 'onClick', store === empty ? store : empty);
  check('an empty condition row is no condition, so the step still runs', empty.get(blockRuntimeAtom(OUT)).value, 9);
}

group('a formula is not a dead end in the chain');
{
  /**
   * Cycle 12 made a workflow step that changes a block fire that block's own
   * onChange, and called every two-step chain fixed. Formulas were not part of
   * that fix: they write their answers with store.set, so anything wired OUT of
   * a Formula block never heard that it had changed.
   *
   * Button -> Count -> Total worked. Total -> anything did not. Found by
   * driving it in a browser and reading the number that did not move.
   */
  const BTN = 'buttonBlock__ch000000001';
  const COUNT = 'numberDisplayBlock__ch10000001';
  const TOTAL = 'formulaDisplayBlock__ch20000001';
  const FLAG = 'numberDisplayBlock__ch30000001';
  const base = { visible: true, disabled: false, loading: false, error: null };

  const build = () => {
    const store = createStore();
    store.set(allBlockIdsAtom, [BTN, COUNT, TOTAL, FLAG]);
    for (const [id, v] of [[BTN, 0], [COUNT, 0], [TOTAL, 0], [FLAG, 0]] as [string, number][]) {
      store.set(blockRuntimeAtom(id), { ...base, value: v });
    }
    store.set(formulasAtom, [
      { id: 'f', targetBlockId: TOTAL, targetProperty: 'value', formula: `${COUNT} * 2`, pageId: 'p' },
    ] as any);
    store.set(workflowsAtom, [
      { id: 'w1', sourceId: BTN, sourceEvent: 'onClick', steps: [{ targetId: COUNT, action: 'set', value: 10 }] },
      { id: 'w2', sourceId: TOTAL, sourceEvent: 'onChange', steps: [{ targetId: FLAG, action: 'set', value: 99 }] },
    ] as any);
    return store;
  };

  const store = build();
  executeWorkflow(BTN, 'onClick', store);
  check('the step still sets its own target', store.get(blockRuntimeAtom(COUNT)).value, 10);
  check('the formula still recalculates', store.get(blockRuntimeAtom(TOTAL)).value, 20);
  check('and now a block wired OUT of the formula hears about it', store.get(blockRuntimeAtom(FLAG)).value, 99);

  /**
   * The other half, and the reason propagation is off by default: a page
   * settling on load is not an event. If it were, every visitor opening a page
   * would fire whatever is wired to a formula -- including a row write.
   */
  const quiet = build();
  /**
   * Count starts at 5 with Total stored as 0, so loading the page genuinely
   * CHANGES Total from 0 to 10. That matters: the first version of this check
   * left Count at 0, so the formula settled on the value it already had, and
   * the check passed whether propagation was guarded or not. The negative
   * control caught it -- turning the guard off changed nothing, which looks
   * exactly like a control that failed to apply. A check that cannot fail is
   * decoration, and this one could not.
   */
  quiet.set(blockRuntimeAtom(COUNT), { ...base, value: 5 });
  recalculateAllFormulas(quiet);
  check('loading a page does recalculate the formula', quiet.get(blockRuntimeAtom(TOTAL)).value, 10);
  check('and that is a real change from what was stored', quiet.get(blockRuntimeAtom(TOTAL)).value !== 0, true);
  check('but it fires nothing, because settling is not an event', quiet.get(blockRuntimeAtom(FLAG)).value, 0);

  // A formula whose answer did not move must not fire either, or a page with a
  // stable formula would run its workflow on every single click anywhere.
  const stable = build();
  stable.set(workflowsAtom, [
    { id: 'w1', sourceId: BTN, sourceEvent: 'onClick', steps: [{ targetId: COUNT, action: 'set', value: 0 }] },
    { id: 'w2', sourceId: TOTAL, sourceEvent: 'onChange', steps: [{ targetId: FLAG, action: 'set', value: 99 }] },
  ] as any);
  executeWorkflow(BTN, 'onClick', stable);
  check('an answer that did not change fires nothing', stable.get(blockRuntimeAtom(FLAG)).value, 0);

  /**
   * A formula that feeds a block that feeds the formula is a loop. It has to
   * stop, and it has to say it stopped -- a chain that quietly gives up looks
   * exactly like a broken wire.
   */
  const loop = createStore();
  const A = 'numberDisplayBlock__lp00000001';
  const F = 'formulaDisplayBlock__lp10000001';
  loop.set(allBlockIdsAtom, [BTN, A, F]);
  for (const id of [BTN, A, F]) loop.set(blockRuntimeAtom(id), { ...base, value: 0 });
  loop.set(formulasAtom, [{ id: 'fl', targetBlockId: F, targetProperty: 'value', formula: `${A} + 1`, pageId: 'p' }] as any);
  loop.set(workflowsAtom, [
    { id: 'l1', sourceId: BTN, sourceEvent: 'onClick', steps: [{ targetId: A, action: 'increment', amount: 1 }] },
    { id: 'l2', sourceId: F, sourceEvent: 'onChange', steps: [{ targetId: A, action: 'increment', amount: 1 }] },
  ] as any);
  executeWorkflow(BTN, 'onClick', loop);
  const runs = loop.get(workflowRunsAtom) as any[];
  check('a loop terminates instead of hanging', typeof loop.get(blockRuntimeAtom(A)).value, 'number');
  check('and says so rather than stopping quietly',
    runs.some(r => (r.steps || []).some((st: any) => st.action === '(chain stopped)')), true);
}

group('a page can do something when it opens');
{
  /**
   * The last of the four primitives the record named as missing. It was
   * recorded as closed by the Live Data block, which was an overclaim: that
   * block refreshes ITSELF on open and on a timer, and nothing else on the page
   * could run when the page opened. So a page could not set itself up, clear
   * last session's numbers, or decide what to show before being touched.
   */
  const ANCHOR = 'numberDisplayBlock__ld00000001';
  const OUT = 'numberDisplayBlock__ld10000001';
  const BTN = 'buttonBlock__ld20000001';
  const base = { visible: true, disabled: false, loading: false, error: null };

  const build = (workflows: any[]) => {
    const store = createStore();
    store.set(allBlockIdsAtom, [ANCHOR, OUT, BTN]);
    for (const id of [ANCHOR, OUT, BTN]) store.set(blockRuntimeAtom(id), { ...base, value: 0 });
    store.set(formulasAtom, []);
    store.set(workflowsAtom, workflows as any);
    return store;
  };

  const store = build([{ id: 'p1', sourceId: ANCHOR, sourceEvent: 'onLoad', steps: [{ targetId: OUT, action: 'set', value: 42 }] }]);
  check('nothing has happened before the page opens', store.get(blockRuntimeAtom(OUT)).value, 0);
  check('one page-load workflow is found', runPageLoadWorkflows(store), 1);
  check('and it ran', store.get(blockRuntimeAtom(OUT)).value, 42);

  // Only onLoad. A click workflow must not fire just because a page opened --
  // that would press every button on the page for every visitor.
  const mixed = build([
    { id: 'p2', sourceId: ANCHOR, sourceEvent: 'onLoad', steps: [{ targetId: OUT, action: 'set', value: 7 }] },
    { id: 'p3', sourceId: BTN, sourceEvent: 'onClick', steps: [{ targetId: OUT, action: 'set', value: 999 }] },
  ]);
  runPageLoadWorkflows(mixed);
  check('a click workflow does not fire when the page opens', mixed.get(blockRuntimeAtom(OUT)).value, 7);

  const none = build([{ id: 'p4', sourceId: BTN, sourceEvent: 'onClick', steps: [{ targetId: OUT, action: 'set', value: 1 }] }]);
  check('a page with none of them runs nothing', runPageLoadWorkflows(none), 0);
  check('and changes nothing', none.get(blockRuntimeAtom(OUT)).value, 0);
  /**
   * And says nothing.
   *
   * The negative control taught this one. Removing the onLoad filter turned
   * only the count check red, because executeWorkflow filters by event again
   * anyway -- so "a click workflow does not fire" was testing ITS filter, not
   * this one. What this filter actually owns is not calling executeWorkflow for
   * blocks that have nothing wired to the page opening: each of those calls
   * records an amber "nothing wired to this" line, so an unfiltered version
   * would fill the Runs panel with one per block on every single page load,
   * burying the entries a builder is looking for.
   */
  check('and does not fill the run log with a line per block', (none.get(workflowRunsAtom) as any[]).length, 0);

  /**
   * Running twice is the caller's problem, not this function's, and that is
   * deliberate: a module-level "already ran" flag would be shared between the
   * editor and a published page in the same tab, and the second page to open
   * would silently do nothing. So the function is honestly repeatable, and both
   * call sites guard with a ref keyed on the page.
   */
  const twice = build([{ id: 'p5', sourceId: ANCHOR, sourceEvent: 'onLoad', steps: [{ targetId: OUT, action: 'increment', amount: 1 }] }]);
  runPageLoadWorkflows(twice);
  runPageLoadWorkflows(twice);
  check('calling it twice really does run it twice, so the caller must guard', twice.get(blockRuntimeAtom(OUT)).value, 2);

  // It is a trigger like any other, so conditions work on it.
  const gated = build([{
    id: 'p6', sourceId: ANCHOR, sourceEvent: 'onLoad',
    steps: [{
      targetId: OUT, action: 'set', value: 5,
      condition: { fieldId: '', operator: 'equals', expression: '1 > 2' },
      elseAction: 'set', elseTargetId: OUT, elseValue: 3,
    }],
  }]);
  runPageLoadWorkflows(gated);
  check('a page-load workflow obeys its conditions', gated.get(blockRuntimeAtom(OUT)).value, 3);
}

group('the wire sentence says what a page-load wire does');
{
  // "When Submit the page opens" is nonsense, and the source block genuinely
  // does not matter for onLoad -- it only anchors the workflow.
  check('a normal wire names its source',
    wireSentence({ sourceName: 'Submit', targetName: 'Submissions', event: 'onClick', action: 'addRow' }),
    'When Submit is pressed → add a row to Submissions');
  check('a page-load wire drops it',
    wireSentence({ sourceName: 'Submit', targetName: 'Total', event: 'onLoad', action: 'set' }),
    'When the page opens → set Total');
  // The popup builds its sentence before the workflow exists, from a checkbox.
  check('the popup spelling agrees with the saved spelling',
    wireSentence({ sourceName: 'Submit', targetName: 'Total', event: 'onClick', action: 'set', pageLoad: true }),
    wireSentence({ sourceName: 'Submit', targetName: 'Total', event: 'onLoad', action: 'set' }));
  check('and it still admits to being conditional',
    wireSentence({ sourceName: 'x', targetName: 'Total', event: 'onLoad', action: 'set', conditional: true }),
    'When the page opens → set Total, but only sometimes');
}

group('one click does not cost one query per link of the chain');
{
  /**
   * The List refresh runs at the end of every executeWorkflow. Chains propagate
   * -- a step fires its target's onChange, and as of today a formula fires its
   * own -- so ONE press can execute several workflows in a row, and each one
   * ended by firing a query per List block. Two List blocks on a three-link
   * chain was six queries for one press, all fetching the same rows
   * milliseconds apart. That is the 5 GB egress the free tier runs out of.
   *
   * It was extracted from inline precisely so this number could be counted
   * without a network -- the browser turned out to be an unreliable instrument
   * for it, and "I watched the network tab" is not a check that runs tomorrow.
   */
  const BTN = 'buttonBlock__q1000000001';
  const A = 'numberDisplayBlock__q2000000001';
  const F = 'formulaDisplayBlock__q3000000001';
  const B = 'numberDisplayBlock__q4000000001';
  const L1 = 'listBlock__q5000000001';
  const L2 = 'listBlock__q6000000001';
  const DB = 'databaseBlock__q7000000001';
  const base = { visible: true, disabled: false, loading: false, error: null };

  let queries = 0;
  const countingFetch = async () => { queries += 1; return { data: [] }; };

  const store = createStore();
  store.set(allBlockIdsAtom, [BTN, A, F, B, L1, L2, DB]);
  for (const id of [BTN, A, F, B, DB]) store.set(blockRuntimeAtom(id), { ...base, value: 0 });
  for (const id of [L1, L2]) store.set(blockRuntimeAtom(id), { ...base, value: '', trackedBlockId: DB, rows: [] });

  // Two List blocks, both tracking the same Database.
  check('both List blocks are asked for rows', fetchListBlockRows(store.get(allBlockIdsAtom), store, countingFetch), 2);
  check('and that is all that is asked', queries, 2);

  // A block that is not a List is not asked, however its id reads.
  queries = 0;
  const notLists = createStore();
  const decoy = 'buttonBlock__listy0000a1';
  notLists.set(allBlockIdsAtom, [decoy]);
  notLists.set(blockRuntimeAtom(decoy), { ...base, value: 0, trackedBlockId: DB });
  check('a Button whose id happens to contain "list" is not fetched for', fetchListBlockRows(notLists.get(allBlockIdsAtom), notLists, countingFetch), 0);

  // A List with nothing tracked has nothing to fetch.
  queries = 0;
  const untracked = createStore();
  untracked.set(allBlockIdsAtom, [L1]);
  untracked.set(blockRuntimeAtom(L1), { ...base, value: '', rows: [] });
  check('a List tracking nothing costs no query', fetchListBlockRows(untracked.get(allBlockIdsAtom), untracked, countingFetch), 0);

  /**
   * And the whole point: running a three-link chain must not multiply it.
   * Counted through executeWorkflow, because the multiplication happened there
   * and not in the function being counted.
   */
  queries = 0;
  const chained = createStore();
  chained.set(allBlockIdsAtom, [BTN, A, F, B, L1, L2, DB]);
  for (const id of [BTN, A, F, B, DB]) chained.set(blockRuntimeAtom(id), { ...base, value: 0 });
  for (const id of [L1, L2]) chained.set(blockRuntimeAtom(id), { ...base, value: '', trackedBlockId: DB, rows: [] });
  chained.set(formulasAtom, [{ id: 'f', targetBlockId: F, targetProperty: 'value', formula: `${A} * 2`, pageId: 'p' }] as any);
  chained.set(workflowsAtom, [
    { id: 'w1', sourceId: BTN, sourceEvent: 'onClick', steps: [{ targetId: A, action: 'set', value: 5 }] },
    { id: 'w2', sourceId: F, sourceEvent: 'onChange', steps: [{ targetId: B, action: 'set', value: 1 }] },
  ] as any);
  executeWorkflow(BTN, 'onClick', chained);
  check('the three-link chain still ran end to end', chained.get(blockRuntimeAtom(B)).value, 1);
  check('and the formula still moved', chained.get(blockRuntimeAtom(F)).value, 10);

  /**
   * The policy itself, asked directly.
   *
   * The first version of this group checked only that the chain still worked,
   * and deleting the depth guard turned nothing red -- chainDepth is
   * module-private, so nothing could reach it. An unprovable guard is
   * decoration. It is a named function now, and the call site is checked too,
   * so sabotaging either end shows up.
   */
  check('the outermost recalculation fetches', shouldFetchListRows(0), true);
  check('an inner link of a chain does not', shouldFetchListRows(1), false);
  check('nor a deeper one', shouldFetchListRows(7), false);
  const engineSource = readFileSync('src/lib/bindingEngine.ts', 'utf8');
  check('and the call site actually asks the policy',
    /shouldFetchListRows\(chainDepth\)/.test(engineSource), true);
}

group('a row action can act on every matching row');
{
  /**
   * updateRow and deleteRow both found ONE row with findIndex and stopped, so
   * "delete all completed", "clear the cart" and "mark everything as read" were
   * not sayable. Pressing the button repeatedly was the workaround, and it only
   * worked if you knew to.
   */
  const columns = [{ name: 'Name', type: 'text' }, { name: 'Done', type: 'boolean' }, { name: 'Score', type: 'number' }];
  const rows = [
    { id: 'r1', Name: 'Ada', Done: true, Score: 10 },
    { id: 'r2', Name: 'Grace', Done: false, Score: 20 },
    { id: 'r3', Name: 'Katherine', Done: true, Score: 30 },
  ];

  check('the first match only, by default', rowIndexesForStep(rows, columns, 'Done', true), [0]);
  check('every match when asked', rowIndexesForStep(rows, columns, 'Done', true, true), [0, 2]);
  check('in the table`s own order', rowIndexesForStep(rows, columns, 'Done', true, true)[0] < rowIndexesForStep(rows, columns, 'Done', true, true)[1], true);
  check('no match is no rows, not row zero', rowIndexesForStep(rows, columns, 'Name', 'Nobody', true), []);
  check('and nothing at all without a match column', rowIndexesForStep(rows, columns, '', 'x', true), []);

  /**
   * The coercion is the half that must not drift, and it is why this is one
   * function rather than the two identical copies it used to be. A fixed value
   * typed into a text field arrives as the STRING "true"; a number column
   * compares numerically so "20" finds 20.
   */
  check('a boolean column matches the string "true"', rowIndexesForStep(rows, columns, 'Done', 'true', true), [0, 2]);
  check('a number column matches numeric text', rowIndexesForStep(rows, columns, 'Score', '20', true), [1]);
  check('a text column compares as text', rowIndexesForStep(rows, columns, 'Name', 'Ada', true), [0]);
  check('an unknown column matches nothing rather than everything', rowIndexesForStep(rows, columns, 'Nope', '', true), []);
  check('coercion for a column nobody declared leaves the value alone', coerceForColumn('7', undefined), '7');

  /**
   * THE TRAP THIS NEARLY SHIPPED WITH.
   *
   * The mapped changes used to be built as `{ ...matchedRow }` and then merged,
   * which is harmless while exactly one row can change. Applied to several rows
   * it copies the FIRST match's untouched columns over all the others -- so
   * "mark everything as read" would also have overwritten every name with the
   * first person's name. The changes have to be separable from the row they
   * were computed against, and this checks the shape that guarantees it.
   */
  const changes = { Done: true };
  const applied = rows.map((r, i) => (rowIndexesForStep(rows, columns, 'Done', false, true).includes(i) ? { ...r, ...changes } : r));
  check('updating by mapping keeps each row`s own other columns', applied.map(r => r.Name), ['Ada', 'Grace', 'Katherine']);
  check('and changes only the mapped column', applied.map(r => r.Done), [true, true, true]);
  check('and leaves unmapped values alone', applied.map(r => r.Score), [10, 20, 30]);

  // Deleting several has to walk a defined order, or removing one shifts the next.
  const doomed = new Set(rowIndexesForStep(rows, columns, 'Done', true, true));
  const survivors = rows.filter((_, i) => !doomed.has(i));
  check('deleting every match removes exactly those', survivors.map(r => r.id), ['r2']);
  const oneOnly = new Set(rowIndexesForStep(rows, columns, 'Done', true));
  check('and the default still removes exactly one', rows.filter((_, i) => !oneOnly.has(i)).map(r => r.id), ['r2', 'r3']);
}

group('the Health panel can see a broken formula condition');
{
  /**
   * The panel exists to find what "silently does less than it used to". A step
   * guarded by `Qty * Price > 500` with Price deleted is skipped every time,
   * forever, and nothing errors -- which is exactly its job.
   *
   * It could not see them. The singular condition was included only when it had
   * a `fieldId`, and a formula condition has none: the SAME guard that made
   * executeWorkflow drop expression conditions and run guarded steps
   * unconditionally. Two places, one wrong assumption, found only because the
   * first one had just been fixed.
   */
  const BTN = 'buttonBlock__hp00000001';
  const QTY = 'numberDisplayBlock__hp10000001';
  const GONE = 'numberDisplayBlock__hpdeleted1';
  const OUT = 'numberDisplayBlock__hp20000001';

  const st = (blockName: string) => ({ blockName, value: 0, visible: true, disabled: false, loading: false, error: null });
  const facts = (steps: any[]) => ({
    blockIds: [BTN, QTY, OUT],
    states: { [BTN]: st('Submit'), [QTY]: st('Qty'), [OUT]: st('Total') },
    workflows: [{ id: 'w', sourceId: BTN, sourceEvent: 'onClick', steps }] as any,
    formulas: [] as any,
    connections: [] as any,
    pages: [{ id: 'page-1', name: 'Home' }],
  });

  const broken = diagnosePage(facts([
    { targetId: OUT, action: 'set', value: 1, condition: { fieldId: '', operator: 'equals', expression: `${QTY} * ${GONE} > 500` } },
  ]) as any);
  check('a formula condition naming a deleted block is reported',
    broken.filter(p => p.title.includes('checks a block that is gone')).length, 1);
  check('and it is called broken, not a warning',
    broken.find(p => p.title.includes('checks a block that is gone'))?.severity, 'broken');

  const fine = diagnosePage(facts([
    { targetId: OUT, action: 'set', value: 1, condition: { fieldId: '', operator: 'equals', expression: `${QTY} > 5` } },
  ]) as any);
  check('a formula condition naming only live blocks is not reported',
    fine.filter(p => p.title.includes('checks a block that is gone')).length, 0);

  // Numbers and quoted text inside an expression are not blocks.
  const literals = diagnosePage(facts([
    { targetId: OUT, action: 'set', value: 1, condition: { fieldId: '', operator: 'equals', expression: `${QTY} > 500` } },
  ]) as any);
  check('a bare number in an expression is not mistaken for a block',
    literals.filter(p => p.title.includes('checks a block that is gone')).length, 0);

  // The old field-shaped condition must keep working exactly as before.
  const fieldGone = diagnosePage(facts([
    { targetId: OUT, action: 'set', value: 1, condition: { fieldId: GONE, operator: 'equals', value: 1 } },
  ]) as any);
  check('a plain field condition on a deleted block is still reported',
    fieldGone.filter(p => p.title.includes('checks a block that is gone')).length, 1);

  // And an empty condition row is not a condition, so it is not a problem.
  const empty = diagnosePage(facts([
    { targetId: OUT, action: 'set', value: 1, condition: { fieldId: '', operator: 'equals', expression: '' } },
  ]) as any);
  check('an empty condition row is not reported as broken',
    empty.filter(p => p.title.includes('checks a block that is gone')).length, 0);

  // The many-conditions shape too.
  const many = diagnosePage(facts([
    { targetId: OUT, action: 'set', value: 1, conditions: [
      { fieldId: QTY, operator: 'greaterThan', value: 1 },
      { fieldId: '', operator: 'equals', expression: `${GONE} > 1` },
    ] },
  ]) as any);
  check('and a formula among several conditions is caught',
    many.filter(p => p.title.includes('checks a block that is gone')).length, 1);
}

group('the Health panel does not cry wolf about every formula');
{
  /**
   * referencedIds used to over-collect on purpose, and said so: a false "this
   * refers to X" was checked against the block list and disappeared if X
   * existed. That reasoning was sound while a formula could only be block ids,
   * numbers and `+ - * /`. It stopped being sound the morning formulas got
   * functions and text -- the same day, hours earlier.
   *
   *   if(Stock > 0, "In stock", "Sold out")  ->  if, Stock, In, stock, Sold, out
   *
   * Five of six are not blocks, so one good formula produced five "uses a block
   * that is gone" problems. A guard that cries wolf gets ignored and then
   * deleted, which costs more than the bug it was watching for.
   */
  check('a function name is not a block', referencedIds('round(Price * 0.18, 2)'), ['Price']);
  check('nor words inside quoted text', referencedIds('if(Stock > 0, "In stock", "Sold out")'), ['Stock']);
  check('nor a nested function', referencedIds('and(Agreed, not(isBlank(Email)))'), ['Agreed', 'Email']);
  check('a quoted separator is not a reference', referencedIds('join(" ", First, Last)'), ['First', 'Last']);
  check('true and blank are values, not blocks', referencedIds('if(true, Price, blank)'), ['Price']);
  check('single quotes count as text too', referencedIds("if(S == 'paid', A, B)"), ['S', 'A', 'B']);

  // The thing it is actually for still works.
  check('a real block id is still found', referencedIds('numberDisplayBlock__abc123 + 1'), ['numberDisplayBlock__abc123']);
  check('two of them', referencedIds('a1 + b2'), ['a1', 'b2']);
  check('numbers are not references', referencedIds('1 + 2 * 3'), []);
  check('nothing is nothing', referencedIds(''), []);
  check('and null does not throw', referencedIds(null), []);

  /**
   * Callee names are excluded by SHAPE -- `name(` -- rather than by a list of
   * the known functions. A list would need updating every time a function is
   * added, and a list of seventeen that silently missed the eighteenth is the
   * exact failure already paid for twice today. This checks a function that
   * does not exist is still treated as a call.
   */
  check('an unknown function is still recognised as a call, not a block',
    referencedIds('sparkline(Price)'), ['Price']);
  check('and spacing before the bracket does not fool it',
    referencedIds('round (Price)'), ['Price']);
}

group('a step can go somewhere');
{
  /**
   * Cut in cycle 8 with a condition written into BACKLOG.md: "worth doing only
   * when something genuinely needs CONDITIONAL navigation". onLoad and formula
   * conditions both landed today, so gating a page on who is looking at it, and
   * redirecting after a form is submitted, became ordinary things to want and
   * impossible to say. Built because the recorded condition was met, not
   * because it came up.
   */
  const BTN = 'buttonBlock__nav00000001';
  const OUT = 'numberDisplayBlock__nav1000001';
  const VIS = 'visitorBlock__nav2000001';
  const base = { visible: true, disabled: false, loading: false, error: null };

  const build = (steps: any[], signedIn = false) => {
    const store = createStore();
    const went: string[] = [];
    store.set(allBlockIdsAtom, [BTN, OUT, VIS]);
    for (const id of [BTN, OUT]) store.set(blockRuntimeAtom(id), { ...base, value: 0 });
    store.set(blockRuntimeAtom(VIS), { ...base, value: signedIn });
    store.set(formulasAtom, []);
    // `() => fn`, or jotai calls it as an updater and stores the result.
    store.set(switchPageFnAtom, () => async (to: string) => { went.push(to); });
    store.set(workflowsAtom, [{ id: 'w', sourceId: BTN, sourceEvent: 'onClick', steps }] as any);
    return { store, went };
  };

  const simple = build([{ targetId: OUT, action: 'goToPage', value: 'page-two' }]);
  executeWorkflow(BTN, 'onClick', simple.store);
  check('it goes where it was told', simple.went, ['page-two']);

  const nowhere = build([{ targetId: OUT, action: 'goToPage', value: '' }]);
  executeWorkflow(BTN, 'onClick', nowhere.store);
  check('with no destination it goes nowhere rather than somewhere odd', nowhere.went, []);

  /**
   * The ordering that was the point. A Button's own target page navigates while
   * its workflow is still running -- recorded on 11 Aug as "it navigates so fast
   * the counter's increment doesn't get a chance to save". A STEP runs in order.
   */
  const ordered = build([
    { targetId: OUT, action: 'set', value: 42 },
    { targetId: OUT, action: 'goToPage', value: 'thank-you' },
  ]);
  executeWorkflow(BTN, 'onClick', ordered.store);
  check('the row is written before the redirect', ordered.store.get(blockRuntimeAtom(OUT)).value, 42);
  check('and then it navigates', ordered.went, ['thank-you']);

  // Gating: the thing onLoad made worth building.
  const gate = (signedIn: boolean) => {
    const b = build([{
      targetId: OUT, action: 'goToPage', value: 'members',
      condition: { fieldId: '', operator: 'equals', expression: `${VIS} == true` },
      elseAction: 'set', elseTargetId: OUT, elseValue: 0,
    }], signedIn);
    executeWorkflow(BTN, 'onClick', b.store);
    return b.went;
  };
  check('a signed-in visitor is let through', gate(true), ['members']);
  check('and a stranger is not', gate(false), []);

  /**
   * When nothing knows how to change page it SAYS so. A navigation that
   * silently does nothing is indistinguishable from a wire never connected,
   * which is the class of thing the run log exists for.
   */
  const noNav = createStore();
  noNav.set(allBlockIdsAtom, [BTN, OUT]);
  for (const id of [BTN, OUT]) noNav.set(blockRuntimeAtom(id), { ...base, value: 0 });
  noNav.set(formulasAtom, []);
  noNav.set(switchPageFnAtom, null);
  noNav.set(workflowsAtom, [{ id: 'w', sourceId: BTN, sourceEvent: 'onClick',
    steps: [{ targetId: OUT, action: 'goToPage', value: 'somewhere' }] }] as any);
  executeWorkflow(BTN, 'onClick', noNav);
  const runs = noNav.get(workflowRunsAtom) as any[];
  check('it records that it could not', runs[0]?.steps?.[0]?.reason, 'nothing here knows how to change page');
}

group('opening an address is not a way to run code');
{
  /**
   * A builder's address ends up on a published page, so `javascript:` here
   * would run in a visitor's browser on Creora's own domain -- the XSS that was
   * live on 13 Aug, wearing a different hat. Same guard as images and links.
   */
  check('a normal address survives', safeUrl('https://example.com'), 'https://example.com');
  check('javascript is refused', safeUrl('javascript:alert(1)'), null);
  check('and the split-scheme trick', safeUrl('java\nscript:alert(1)'), null);
  check('vbscript too', safeUrl('vbscript:msgbox(1)'), null);
  check('a data html payload', safeUrl('data:text/html,<script>alert(1)</script>'), null);
  /**
   * Through the ACTION, not beside it.
   *
   * The first version of this group only called safeUrl directly, so removing
   * safeUrl from the openUrl case turned nothing red -- the fifth time today a
   * check sat next to the code instead of running through it. The run log is
   * the observable behaviour in node: a refused address records a skipped step
   * with a reason, and that is also what a builder sees in the Runs panel.
   */
  {
    const B = 'buttonBlock__url00000001';
    const T = 'numberDisplayBlock__url1000001';
    const base = { visible: true, disabled: false, loading: false, error: null };
    const tryOpen = (value: string) => {
      const store = createStore();
      store.set(allBlockIdsAtom, [B, T]);
      for (const id of [B, T]) store.set(blockRuntimeAtom(id), { ...base, value: 0 });
      store.set(formulasAtom, []);
      store.set(workflowsAtom, [{ id: 'w', sourceId: B, sourceEvent: 'onClick',
        steps: [{ targetId: T, action: 'openUrl', value }] }] as any);
      executeWorkflow(B, 'onClick', store);
      const steps = (store.get(workflowRunsAtom)[0] as any)?.steps || [];
      return steps[0]?.reason ?? 'allowed';
    };
    const refused = 'that address is not one a page is allowed to open';
    check('the action refuses javascript:', tryOpen('javascript:alert(1)'), refused);
    check('the action refuses the split-scheme trick', tryOpen('java\nscript:alert(1)'), refused);
    check('the action refuses a data html payload', tryOpen('data:text/html,<script>x</script>'), refused);
    check('the action refuses an empty address', tryOpen('   '), refused);
    check('and lets a real address through', tryOpen('https://example.com'), 'allowed');
  }

  // The words say what the sentence will read like on a wire.
  /**
   * The sentence has to name where it GOES, not what the wire was dragged to.
   * Seen on screen: dragging Button 1 to a Submissions table and choosing
   * "Go to another page" read "When Button 1 is pressed -> go to Submissions",
   * naming a table it will never open, with total confidence. No check could
   * have caught it -- every one of them passed the destination as targetName.
   */
  check('the wire names the page it goes to, not the block it was dragged to',
    wireSentence({ sourceName: 'Submit', targetName: 'Submissions', event: 'onClick', action: 'goToPage', destinationName: 'Thank You' }),
    'When Submit is pressed → go to Thank You');
  check('and says so plainly before one is chosen',
    wireSentence({ sourceName: 'Submit', targetName: 'Submissions', event: 'onClick', action: 'goToPage' }),
    'When Submit is pressed → go to no page yet');
  check('an address is named too',
    wireSentence({ sourceName: 'Submit', targetName: 'Submissions', event: 'onClick', action: 'openUrl', destinationName: 'https://example.com' }),
    'When Submit is pressed → open https://example.com');
  check('and before there is one',
    wireSentence({ sourceName: 'Submit', targetName: 'Submissions', event: 'onClick', action: 'openUrl' }),
    'When Submit is pressed → open no address yet');
  // Every other action still names its target, which is correct for them.
  check('an ordinary action still names its target',
    wireSentence({ sourceName: 'Submit', targetName: 'Submissions', event: 'onClick', action: 'addRow', destinationName: 'ignored' }),
    'When Submit is pressed → add a row to Submissions');
}

group('a step that goes nowhere cannot be connected');
{
  // The Connect button exists to stop a step that looks fine and does nothing.
  check('no page chosen', whyItCannotWork({ action: 'goToPage', value: '' } as any),
    'No page is chosen, so this would go nowhere.');
  check('a page chosen is fine', whyItCannotWork({ action: 'goToPage', value: 'p2' } as any), null);
  check('no address', whyItCannotWork({ action: 'openUrl', value: '  ' } as any),
    'There is no address to open.');
  check('an address is fine', whyItCannotWork({ action: 'openUrl', value: 'https://x.com' } as any), null);
}

group('the Health panel can see a wire to a page that is gone');
{
  /**
   * Deleting a page does not touch the wires pointing at it. The step runs,
   * finds nothing, and the visitor stays exactly where they were -- nothing
   * throws, nothing is logged. That is the whole category this panel exists
   * for, and it could not see it, because it had no list of pages at all.
   *
   * Found by asking what else needed to know about goToPage right after
   * building it. The Button half of this predates goToPage by weeks.
   */
  const wire = (step: any) => facts({
    workflows: [{ id: 'w', sourceId: 'buttonBlock__a', sourceEvent: 'onClick', steps: [step] }],
  });

  const gone = diagnosePage(wire({ targetId: 'numberDisplayBlock__b', action: 'goToPage', value: 'page-deleted' }));
  check('a step going to a deleted page is reported',
    gone.filter(p => p.title.includes('goes to a page that is gone')).length, 1);
  check('and it is broken, not a warning',
    gone.find(p => p.title.includes('goes to a page that is gone'))?.severity, 'broken');

  const fine = diagnosePage(wire({ targetId: 'numberDisplayBlock__b', action: 'goToPage', value: 'page-2' }));
  check('a step going to a page that exists is not reported',
    fine.filter(p => p.title.includes('page that is gone')).length, 0);

  const nowhere = diagnosePage(wire({ targetId: 'numberDisplayBlock__b', action: 'goToPage', value: '' }));
  check('a step going nowhere at all is reported separately',
    nowhere.filter(p => p.title.includes('goes to no page at all')).length, 1);

  // Other actions are not accused of anything just for having a value.
  const other = diagnosePage(wire({ targetId: 'numberDisplayBlock__b', action: 'set', value: 'page-deleted' }));
  check('a `set` whose value looks like a page id is left alone',
    other.filter(p => p.title.includes('page')).length, 0);

  /**
   * And the half that predates goToPage: a Button or a Link-role Shape whose
   * own target page was deleted. It looks like a link and does nothing. The
   * panel already READ targetPageId -- only to decide whether the block counted
   * as wired to something -- and never asked whether the page still existed.
   */
  const deadLink = diagnosePage(facts({
    blockIds: ['buttonBlock__a'],
    states: { 'buttonBlock__a': { blockName: 'Open shop', targetPageId: 'page-deleted' } },
  }));
  check('a button pointing at a deleted page is reported',
    deadLink.filter(p => p.title.includes('points at a page that is gone')).length, 1);

  const liveLink = diagnosePage(facts({
    blockIds: ['buttonBlock__a'],
    states: { 'buttonBlock__a': { blockName: 'Open shop', targetPageId: 'page-2' } },
  }));
  check('and one pointing at a real page is not',
    liveLink.filter(p => p.title.includes('points at a page')).length, 0);

  // A block with no target page at all is not a dead link.
  const noTarget = diagnosePage(facts({
    blockIds: ['numberDisplayBlock__b'],
    states: { 'numberDisplayBlock__b': { blockName: 'Total' } },
  }));
  check('a block with no target page is not accused', 
    noTarget.filter(p => p.title.includes('points at a page')).length, 0);
}

group('an existing wire can be read back into the popup');
{
  /**
   * A wire could only be DELETED -- one option on its menu -- so changing
   * "add a row" into "add a row, but only if the email is filled in" meant
   * removing it and retyping the action, every column mapping, the match
   * column and every condition from memory.
   *
   * The dangerous failure is not a crash: it is one field quietly not coming
   * back, so a builder opens a wire, changes the action, presses Connect, and
   * last week's three conditions are gone with no warning. So this feeds it a
   * step carrying EVERY field the popup can produce and asserts each one
   * returns. A field added to the popup without a line in draftFromWorkflow
   * fails here.
   */
  const everything = {
    id: 'wf_conn_1',
    sourceId: 'buttonBlock__src0000001',
    sourceEvent: 'onLoad',
    steps: [{
      targetId: 'databaseBlock__tgt0000001',
      action: 'updateRow',
      amount: 7,
      value: 'hello',
      requireValid: false,
      webhookUrl: 'https://hooks.example.com/x',
      mappings: { Name: { source: 'block', value: 'inputBlock__n000000001' } },
      matchColumn: 'Email',
      matchValue: { source: 'block', value: 'inputBlock__e000000001' },
      applyToAll: true,
      match: 'any',
      conditions: [
        { fieldId: 'inputBlock__n000000001', operator: 'isNotEmpty', value: '' },
        { fieldId: '', operator: 'equals', expression: 'numberDisplayBlock__q1 * 2 > 10' },
      ],
      elseAction: 'increment',
      elseTargetId: 'numberDisplayBlock__else00001',
      elseValue: 'nope',
      elseAmount: 3,
    }],
  };
  const d = draftFromWorkflow(everything);

  check('the action comes back', d.action, 'updateRow');
  check('the amount', d.amount, 7);
  check('the value', d.value, 'hello');
  check('requireValid, including a deliberate false', d.requireValid, false);
  check('the webhook address', d.webhookUrl, 'https://hooks.example.com/x');
  check('the column mappings', d.mappings, { Name: { source: 'block', value: 'inputBlock__n000000001' } });
  check('the match column', d.matchColumn, 'Email');
  check('where the match value comes from', d.matchValueSource, 'block');
  check('and which block', d.matchValueVal, 'inputBlock__e000000001');
  check('every matching row', d.applyToAll, true);
  check('that it is conditional at all', d.isConditional, true);
  check('all/any', d.matchMode, 'any');
  check('both conditions', d.conds.length, 2);
  check('the field one', d.conds[0], { fieldId: 'inputBlock__n000000001', operator: 'isNotEmpty', value: '', expression: '' });
  /**
   * The formula condition is the one most likely to be dropped: reading only
   * `fieldId` loses it, which is exactly what executeWorkflow and the Health
   * panel each did before today.
   */
  check('and the formula one, as a formula row', d.conds[1],
    { fieldId: '__expression__', operator: 'equals', value: '', expression: 'numberDisplayBlock__q1 * 2 > 10' });
  check('the otherwise branch is on', d.elseEnabled, true);
  check('its action', d.elseAction, 'increment');
  check('its target', d.elseTargetId, 'numberDisplayBlock__else00001');
  check('its value', d.elseValue, 'nope');
  check('its amount', d.elseAmount, 3);
  check('that it runs when the page opens', d.onPageLoad, true);

  // requireValid genuinely absent must stay undefined, not become a default --
  // pre-filling it would freeze today's default onto the step for ever.
  const bare = draftFromWorkflow({ id: 'w', sourceId: 'b', sourceEvent: 'onClick', steps: [{ targetId: 't', action: 'set' }] });
  check('an unset requireValid stays unset', bare.requireValid, undefined);
  check('an empty wire still offers one blank condition row', bare.conds.length, 1);
  check('and is not marked conditional', bare.isConditional, false);
  check('a timer wire remembers which tick', draftFromWorkflow({ sourceEvent: 'onComplete', steps: [{ action: 'set' }] }).timerEvent, 'onComplete');

  // Navigation keeps its destination in `value`; it must land in the right box
  // and not also show up in the "set to" field.
  const nav = draftFromWorkflow({ sourceEvent: 'onClick', steps: [{ action: 'goToPage', value: 'page-7' }] });
  check('a page destination lands in the page picker', nav.goToPageId, 'page-7');
  check('and not in the value box', nav.value, '');
  const url = draftFromWorkflow({ sourceEvent: 'onClick', steps: [{ action: 'openUrl', value: 'https://x.com' }] });
  check('an address lands in the address box', url.openUrlValue, 'https://x.com');
  check('and not in the value box either', url.value, '');

  // The older single-condition shape still loads.
  const single = draftFromWorkflow({ sourceEvent: 'onClick', steps: [{ action: 'set', condition: { fieldId: 'inputBlock__x', operator: 'equals', value: 5 } }] });
  check('a page saved with one condition still loads it', single.conds[0].fieldId, 'inputBlock__x');
  check('and is marked conditional', single.isConditional, true);

  // A workflow with nothing in it must not throw.
  check('an empty workflow does not throw', draftFromWorkflow({}).action, 'increment');
  check('nor a null one', draftFromWorkflow(null as any).isConditional, false);
}

group('deleting a page says what it costs first');
{
  /**
   * There was no way to delete a page at all -- the database had no such
   * function. Reported by the builder. Deleting one also deletes the rows
   * collected on it, and there is no undo, so the warning IS the feature: the
   * count is the thing a person decides on.
   *
   * A count that quietly said 0 when it could not tell would be the worst
   * failure available here -- somebody reads "no data will be lost" and presses
   * the button. So an unknown is an unknown, never a zero.
   */
  const state: Record<string, any> = {
    'databaseBlock__d1': { blockName: 'Orders', columns: [{ name: 'Name' }, { name: 'Total' }], rows: [{ Name: 'Ada', Total: 10 }, { Name: 'Grace', Total: 20 }] },
    'databaseBlock__d2': { blockName: 'Signups', columns: [{ name: 'Email' }], rows: [{ Email: 'a@b.c' }] },
    'buttonBlock__b1': { blockName: 'Submit' },
    'databaseBlock__d3': { blockName: 'Never loaded', columns: [{ name: 'X' }] },
  };
  const stateOf = (id: string) => state[id];
  const isDb = (id: string) => id.startsWith('databaseBlock');

  const full = summarisePageData(['databaseBlock__d1', 'databaseBlock__d2', 'buttonBlock__b1'], stateOf, isDb);
  check('only tables are counted', full.tableCount, 2);
  check('and every row in them', full.rowCount, 3);
  check('a button is not a table', full.tables.some(t => t.name === 'Submit'), false);
  check('the count is complete', full.countIsComplete, true);

  /**
   * A table whose rows were never fetched must not contribute a confident zero.
   * This is the check that stops "no data will be lost" being a lie.
   */
  const partial = summarisePageData(['databaseBlock__d1', 'databaseBlock__d3'], stateOf, isDb);
  check('an unloaded table makes the count a floor, not a total', partial.countIsComplete, false);
  check('and what IS known is still counted', partial.rowCount, 2);
  check('the wording admits it', describeWhatWillBeLost('Shop', partial).includes('at least'), true);
  check('a complete count does not say "at least"', describeWhatWillBeLost('Shop', full).includes('at least'), false);

  check('the sentence names the page', describeWhatWillBeLost('Shop', full).includes('"Shop"'), true);
  check('and the number of rows', describeWhatWillBeLost('Shop', full).includes('3 rows'), true);
  check('and says it cannot be undone', describeWhatWillBeLost('Shop', full).toLowerCase().includes('cannot be undone'), true);

  const empty = summarisePageData(['buttonBlock__b1'], stateOf, isDb);
  check('a page with no tables says there is nothing to lose',
    describeWhatWillBeLost('Blank', empty).includes('no tables'), true);
  check('but still warns it cannot be undone',
    describeWhatWillBeLost('Blank', empty).toLowerCase().includes('cannot be undone'), true);

  const noRows = summarisePageData(['databaseBlock__d2'], (id: string) => ({ ...state[id], rows: [] }), isDb);
  check('a table with no rows yet is said plainly',
    describeWhatWillBeLost('Fresh', noRows).includes('no rows in them yet'), true);

  // Singular and plural, because "1 rows" reads as a bug in the product.
  const one = summarisePageData(['databaseBlock__d2'], stateOf, isDb);
  check('one row is not "1 rows"', describeWhatWillBeLost('X', one).includes('1 row across 1 table'), true);
}

group('the data can be saved before it goes');
{
  // Same writer the exportCsv action uses. It was inline in that action until
  // this second caller appeared -- copying it is how two code paths drift.
  check('a header and rows', toCsv([{ name: 'Name' }, { name: 'Age' }], [{ Name: 'Ada', Age: 36 }]),
    '\ufeffName,Age\r\nAda,36');
  check('a comma in a field does not shift a column',
    toCsv([{ name: 'Name' }], [{ Name: 'Lovelace, Ada' }]), '\ufeffName\r\n"Lovelace, Ada"');
  check('a quote is doubled', csvCell('He said "hi"'), '"He said ""hi"""');
  check('a newline keeps the row intact', csvCell('one\ntwo'), '"one\ntwo"');
  check('an empty cell is empty, not the word undefined', csvCell(undefined), '');
  check('a missing column reads as empty', toCsv([{ name: 'Nope' }], [{ Name: 'Ada' }]), '\ufeffNope\r\n');
  // Excel needs both of these or it mangles accents / puts every row in one cell.
  check('the BOM is there', toCsv([{ name: 'A' }], []).startsWith('\ufeff'), true);
  check('and the line ending is CRLF', toCsv([{ name: 'A' }], [{ A: 1 }]).includes('\r\n'), true);
  check('a filename is made safe', csvFileName('Orders / 2026!'), 'Orders  2026.csv');
  check('and never empty', csvFileName('***'), 'data.csv');
}

group('a delete that cannot happen yet says why');
{
  // The migration has not been run, so the function does not exist. PostgREST
  // answers PGRST202 with a message about schema cache, which tells a builder
  // nothing about what to do -- the same shape collections.ts already handles.
  check('the missing migration is named',
    describeDeleteError({ code: 'PGRST202', message: 'Could not find the function' }).includes('0005_delete_page.sql'), true);
  check('somebody else\'s page', describeDeleteError({ code: '42501', message: 'not your page' }),
    'Only the person who owns this page can delete it.');
  check('a network failure says nothing was deleted',
    describeDeleteError({ message: 'Failed to fetch' }).includes('nothing was deleted'), true);
  check('and an unknown failure does not pretend to know',
    describeDeleteError({}).includes('did not say why'), true);
}

group('the popup shows the wire it is open on, and nothing from the last one');
{
  /**
   * The popup returns null when nothing is pending, and returning null does not
   * unmount a component -- every useState survives. That was untidy while a
   * popup could only ever be NEW. It became wrong the moment an existing wire
   * could be loaded: change a wire with three conditions, cancel, draw a fresh
   * wire between two other blocks, and it opened already holding them.
   *
   * Found by asking what else needed to know about wire editing, one cycle
   * after building it.
   */
  const fresh = defaultWireDraft();
  check('a new wire starts on the default action', fresh.action, 'increment');
  check('with no conditions', fresh.isConditional, false);
  check('one blank condition row, ready to fill', fresh.conds, [{ fieldId: '', operator: 'equals', value: '', expression: '' }]);
  check('no otherwise branch', fresh.elseEnabled, false);
  check('no column mappings', fresh.mappings, {});
  check('not every-matching-row', fresh.applyToAll, false);
  check('not on page load', fresh.onPageLoad, false);
  check('no page chosen', fresh.goToPageId, '');
  check('no address', fresh.openUrlValue, '');
  // undefined is a real third state -- "whatever this action defaults to".
  // Flattening it to false would freeze today's default onto every new step.
  check('requireValid is unset, not false', fresh.requireValid, undefined);

  /**
   * THE STRUCTURAL GUARANTEE.
   *
   * Both openings go through the same WireDraft -- an existing wire through
   * draftFromWorkflow, a new one through defaultWireDraft -- so a field can
   * never be hydrated-but-not-reset, which is the shape that leaks one wire's
   * settings onto the next. This is what keeps that true when somebody adds a
   * field later: add it to one and not the other and this fails.
   */
  const loaded = draftFromWorkflow({
    id: 'wf_x', sourceId: 'buttonBlock__s', sourceEvent: 'onClick',
    steps: [{ targetId: 'databaseBlock__t', action: 'addRow' }],
  });
  check('both sources describe exactly the same fields',
    Object.keys(fresh).sort(), Object.keys(loaded).sort());
  check('and there are no extras on either side',
    Object.keys(fresh).length, Object.keys(loaded).length);

  /**
   * A saved column mapping must survive being opened.
   *
   * The mapping guess used to run unconditionally, which was harmless while
   * every popup was new and became data loss when an existing wire could be
   * loaded: opening a wire that writes to a Database replaced the builder's
   * saved mappings with fresh guesses, silently, before they touched anything.
   * The rule is now "guess only into an empty set", so this asserts a saved one
   * is not empty and therefore not guessed over.
   */
  const withMappings = draftFromWorkflow({
    id: 'wf_y', sourceId: 'buttonBlock__s', sourceEvent: 'onClick',
    steps: [{ targetId: 'databaseBlock__t', action: 'addRow',
      mappings: { Message: { source: 'block', value: 'inputBlock__m' } } }],
  });
  check('a saved mapping comes back', withMappings.mappings, { Message: { source: 'block', value: 'inputBlock__m' } });
  check('and is not an empty set, so the guess leaves it alone',
    Object.keys(withMappings.mappings).length > 0, true);
  check('while a wire with none is empty, so the guess fills it',
    Object.keys(loaded.mappings).length, 0);
}

group('a repeater can filter rows with a formula');
{
  /**
   * A repeater could filter on ONE column against ONE value, so "orders worth
   * more than 500" -- price times quantity -- was not expressible, and neither
   * was "unfinished AND belonging to this person". Adding more single
   * comparisons cannot multiply. Same wall step conditions hit before they
   * learned to take a formula.
   *
   * The spelling is {{Column}} because the repeater's row markup already
   * addresses columns that way, and because it is the only spelling that
   * survives a column called "Your name" -- half the columns anybody actually
   * creates have a space in them.
   */
  const rows = [
    { id: 'r1', Name: 'Ada', 'Your name': 'Ada L', Price: 200, Qty: 3, Done: false },
    { id: 'r2', Name: 'Grace', 'Your name': 'Grace H', Price: 100, Qty: 2, Done: true },
    { id: 'r3', Name: 'Katherine', 'Your name': 'Kath J', Price: 50, Qty: 1, Done: false },
  ];
  const keep = (formula: string) =>
    visibleRows(rows, { filterFormula: formula }).rows.map((r: any) => r.id);

  check('two columns multiplied', keep('{{Price}} * {{Qty}} > 500'), ['r1']);
  check('and the ones under it', keep('{{Price}} * {{Qty}} <= 200'), ['r2', 'r3']);
  check('several things at once', keep('{{Done}} == false and {{Price}} > 100'), ['r1']);
  check('a function over a column', keep('contains({{Name}}, "a")'), ['r1', 'r2', 'r3']);
  check('a stricter one', keep('startsWith({{Name}}, "K")'), ['r3']);
  check('a boolean column reads as a boolean', keep('{{Done}} == true'), ['r2']);
  check('a column with a space in its name', keep('contains({{Your name}}, "Grace")'), ['r2']);
  check('the row id is addressable', keep('{{Row id}} == "r2"'), ['r2']);
  check('an empty formula filters nothing', keep(''), ['r1', 'r2', 'r3']);
  check('and neither does whitespace', keep('   '), ['r1', 'r2', 'r3']);

  /**
   * A formula that cannot be worked out KEEPS the row.
   *
   * The deliberate direction. A broken filter that hides everything looks
   * exactly like a table with no data, and a builder stares at an empty list
   * with nothing to tell them why. Showing too much is visibly wrong and leads
   * them to the filter; showing nothing is invisibly wrong and leads them to
   * think their data is gone.
   */
  check('a formula that cannot run keeps everything', keep('sparkline({{Price}})'), ['r1', 'r2', 'r3']);
  check('and so does a half-typed one', keep('{{Price}} >'), ['r1', 'r2', 'r3']);

  /**
   * "Referenced block Price does not exist" would send somebody looking for a
   * block. The message has to name the thing they can act on.
   */
  const bare = rowMatchesFormula(rows[0], 'Price > 100');
  check('a bare column name is explained, not just refused', bare.error?.includes('Use {{Price}} to mean a column'), true);
  check('and the row is kept while it is wrong', bare.pass, true);

  check('which columns a formula uses', columnsUsedByFormula('{{Price}} * {{Qty}} > {{Price}}'), ['Price', 'Qty']);
  check('none when there are none', columnsUsedByFormula('1 > 2'), []);
  check('and it survives being handed nothing', columnsUsedByFormula(null), []);

  // The formula wins over the old row when both are set: it says the more
  // specific thing, and silently ANDing them would be a rule nobody wrote down.
  const both = visibleRows(rows, { filterFormula: '{{Price}} > 100', filterColumn: 'Name', filterOperator: 'equals', filterValue: 'Grace' });
  check('a formula wins over a column filter', both.rows.map((r: any) => r.id), ['r1']);

  // And the old single-column filter still behaves exactly as it did.
  check('the column filter still works on its own',
    visibleRows(rows, { filterColumn: 'Done', filterOperator: 'is ON' }).rows.map((r: any) => r.id), ['r2']);

  // Filtering happens before paging, or "the three cheapest red ones" becomes
  // "the red ones out of the three cheapest" -- checked already for the column
  // filter, and it has to hold for the formula too.
  const paged = visibleRows(rows, { filterFormula: '{{Done}} == false', pageSize: 1, page: 2 });
  check('a formula filter is applied before the page is cut', paged.rows.map((r: any) => r.id), ['r3']);
  check('and the count of what matched is what matched, not what was drawn', paged.matched, 2);
}

group('the words `and` and `or` are not blocks');
{
  /**
   * They became infix operators the same day referencedIds was rewritten, so
   * `Stock > 0 and Total > 5` reported `and` as a block that is gone -- every
   * formula written the readable way would have produced a false problem.
   * Caught by sweeping for what the new spelling broke, twenty minutes after
   * adding it.
   */
  check('and is an operator, not a block', referencedIds('Stock > 0 and Total > 5'), ['Stock', 'Total']);
  check('so is or', referencedIds('A or B'), ['A', 'B']);
  check('and the symbol forms were always fine', referencedIds('A && B || C'), ['A', 'B', 'C']);
  // A block genuinely called "and" is not something to design around, but a
  // column or block whose name merely CONTAINS them must still be found.
  check('a name containing "and" is still a block', referencedIds('Brand > 1'), ['Brand']);
  check('and one containing "or"', referencedIds('Orders > 1'), ['Orders']);
}

group('a row formula naming a column that is not there is reported');
{
  /**
   * This one hides rather than shouts. A missing column reads as blank, a blank
   * fails every comparison, and every row is filtered out -- so `{{Prcie}} > 5`
   * empties the list and looks exactly like a table with no data in it.
   *
   * The formula is deliberately forgiving of ERRORS, keeping rows when it
   * cannot run. A name that simply is not there is not an error, so it needs
   * saying here instead. The two halves together are what stop a filter failing
   * invisibly in either direction.
   */
  const REPEAT = 'repeatBlock__rf00000001';
  const DB = 'databaseBlock__rf10000001';
  const base = { value: '', visible: true, disabled: false, loading: false, error: null };
  const mk = (formula: string) => ({
    blockIds: [REPEAT, DB],
    states: {
      [REPEAT]: { ...base, blockName: 'Orders list', filterFormula: formula, trackedBlockId: DB },
      [DB]: { ...base, blockName: 'Orders', columns: [{ name: 'Price' }, { name: 'Qty' }] },
    },
    workflows: [], formulas: [], connections: [],
    pages: [{ id: 'page-1', name: 'Home' }],
  } as any);

  const typo = diagnosePage(mk('{{Prcie}} * {{Qty}} > 500'));
  check('a misspelled column is reported', typo.filter(p => p.title.includes('"Prcie"')).length, 1);
  check('and it is broken, not a warning', typo.find(p => p.title.includes('"Prcie"'))?.severity, 'broken');
  check('the message explains why the list looks empty',
    typo.find(p => p.title.includes('"Prcie"'))?.detail.includes('every row is hidden'), true);

  const fine = diagnosePage(mk('{{Price}} * {{Qty}} > 500'));
  check('real columns are not accused', fine.filter(p => p.title.includes('filters on a column')).length, 0);
  check('Row id counts as a real column', diagnosePage(mk('{{Row id}} == "r1"')).filter(p => p.title.includes('filters on a column')).length, 0);
  check('no formula, nothing to say', diagnosePage(mk('')).filter(p => p.title.includes('filters on a column')).length, 0);

  /**
   * With no table tracked there is nothing to compare against, and guessing
   * would mean accusing a formula that is probably correct.
   */
  const untracked = {
    blockIds: [REPEAT],
    states: { [REPEAT]: { ...base, blockName: 'Orders list', filterFormula: '{{Price}} > 1' } },
    workflows: [], formulas: [], connections: [], pages: [{ id: 'page-1' }],
  } as any;
  check('a repeater tracking nothing is not accused',
    diagnosePage(untracked).filter((p: any) => p.title.includes('filters on a column')).length, 0);
}


// ------------------------------------------------------------ computed slots
/**
 * `{{calc: Price * Qty}}` -- markup that can show what its values COME TO.
 *
 * The gap: row markup could print `{{Price}}` and `{{Qty}}` and had no way to
 * print £600. Writing `{{Price}} * {{Qty}}` renders "200 * 3", because slots
 * fill and the asterisk is just a character sitting between them.
 *
 * Two of the checks below are the interesting ones, and both are for mistakes
 * made writing this feature rather than hypotheticals:
 *
 *  - the first version returned its answer directly, walking past the URL check
 *    at the bottom of fillSlots, so a calculation could build a javascript:
 *    scheme and put it in an href;
 *  - findSlots reported the slot as "calc: Total * 2", so the layer that
 *    fetches values fetched nothing, and every computed slot outside a repeater
 *    rendered empty. A repeater supplies all its columns regardless, which is
 *    why it worked in the only place it was first tried.
 */
group('computed slots: {{calc: ...}}');
{
  const row = { Price: 200, Qty: 3, Name: 'Ada', Note: '' };

  check('a slot can do arithmetic', fillSlots('<p>{{calc: Price * Qty}}</p>', row), '<p>600</p>');
  check(
    'and it still goes through the filters, so it can be money',
    fillSlots('<p>{{calc: Price * Qty | money: £}}</p>', row),
    '<p>£600.00</p>'
  );
  check(
    'functions and text work, because it is the same evaluator as everywhere else',
    fillSlots('<p>{{calc: if(Price > 100, "yes", "no")}}</p>', row),
    '<p>yes</p>'
  );
  check('`or` reads as a word, since parseSlot would eat ||',
    fillSlots('<p>{{calc: if(isBlank(Note) or Qty > 99, "flag", "fine")}}</p>', row), '<p>flag</p>');

  check(
    'A BROKEN CALCULATION SHOWS NOTHING, NOT AN ERROR: a visitor is not the person who can fix it',
    fillSlots('<p>[{{calc: Prcie * Qty}}]</p>', row),
    '<p>[]</p>'
  );
  check('a division by zero is still a number, not a crash',
    fillSlots('<p>{{calc: Price / 0}}</p>', row), '<p>0</p>');

  check(
    'the answer is escaped like any other value',
    fillSlots('<p>{{calc: concat("<b>", Name, "</b>")}}</p>', row),
    '<p>&lt;b&gt;Ada&lt;/b&gt;</p>'
  );

  /**
   * The hole this was written for. `href="{{...}}"` records the slot in
   * urlSlots by its whole name, and the check that consults that list is the
   * LAST thing fillSlots does -- so an early return skipped it entirely.
   */
  check(
    'A CALCULATION CANNOT BUILD A SCHEME AND SLIP IT INTO AN HREF',
    fillSlots(
      '<a href="{{calc: concat(\'javascri\', \'pt:alert(1)\')}}">x</a>',
      row,
      ['calc: concat(\'javascri\', \'pt:alert(1)\')']
    ),
    '<a href="">x</a>'
  );
  check(
    'a harmless calculated link still works',
    fillSlots('<a href="{{calc: concat(\'/order/\', Qty)}}">x</a>', row, ['calc: concat(\'/order/\', Qty)']),
    '<a href="/order/3">x</a>'
  );
  check(
    'the URL guard can key on a calc slot at all',
    leadingSlotName('{{calc: Price * Qty}}'),
    'calc: Price * Qty'
  );

  /**
   * The other hole. Whatever findSlots returns is what gets fetched, so a calc
   * has to name its ingredients or it is handed an empty scope.
   */
  check(
    'A CALC SLOT ASKS FOR THE NAMES INSIDE IT, NOT FOR ITSELF',
    findSlotsForCheck('<p>{{calc: Price * Qty}}</p>'),
    ['Price', 'Qty']
  );
  check('function names are not asked for as if they were blocks',
    findSlotsForCheck('<p>{{calc: round(Total) + max(A, 2)}}</p>'), ['Total', 'A']);
  check('a name inside quotes is prose, not a block',
    findSlotsForCheck('<p>{{calc: if(Paid, "Total due", Total)}}</p>'), ['Paid', 'Total']);
  check('and neither are the words the language owns',
    findSlotsForCheck('<p>{{calc: if(Paid and true, blank, Total)}}</p>'), ['Paid', 'Total']);
  check('an unreadable calc asks for nothing rather than throwing while fetching',
    findSlotsForCheck('<p>{{calc: Price * * }}</p>'), []);
  check('a filter on a calc does not become a name',
    findSlotsForCheck('<p>{{calc: Price * Qty | money: £}}</p>'), ['Price', 'Qty']);
  check('ordinary slots are untouched',
    findSlotsForCheck('<p>{{Name}} {{Created | date: D MMM}}</p>'), ['Name', 'Created']);

  // `calc` only means a calculation when it is followed by a colon, so a column
  // that happens to be called "calc" keeps working.
  check('a column actually called calc still resolves',
    fillSlots('<p>{{calc}}</p>', { calc: 'mine' }), '<p>mine</p>');
  check('and it is looked up rather than parsed',
    findSlotsForCheck('<p>{{calc}}</p>'), ['calc']);
  check('spelling is forgiving about case and spaces',
    fillSlots('<p>{{ CALC :  Price*Qty }}</p>', row), '<p>600</p>');
}


// ------------------------------------------- built-in slots, in real markup
/**
 * `{{now}}` and `{{today}}` rendered EMPTY on every page.
 *
 * They were checked through renderTemplate, which a workflow's text step uses.
 * Markup goes a different way: something resolves the names FIRST and hands
 * fillSlots a set of values, and it copied every name it was asked about --
 * including the ones no block owned, as a key holding undefined. fillSlots
 * reads a present key as "a block answered this", so the fallback that knows
 * about `now` was never reached.
 *
 * A check that exercises the path a builder does not use is not a check of the
 * feature. This group goes through the resolving layer, the way a page does.
 */
group('built-in slots survive the layer that resolves names');
{
  const NOW_B = new Date(2026, 7, 17, 9, 30);
  // What the page has on it: nothing called `now`.
  const onPage = { Title: 'Orders', Empty: '' };

  // sanitizeHtml needs a DOM and is not part of what is being checked here, so
  // the markup is already clean. Everything after it is the real path: find the
  // names, resolve them, fill.
  const resolve = (markup: string, byName: Record<string, any>) =>
    fillSlots(markup, slotValuesFrom(byName, findSlotsForCheck(markup)), [], { now: NOW_B });

  check(
    'THE BUG: a date in markup, resolved the way a page resolves it',
    resolve('<p>{{now | date: D MMM YYYY}}</p>', onPage),
    '<p>17 Aug 2026</p>'
  );
  check('today too', resolve('<p>{{today | date: D MMM YYYY}}</p>', onPage), '<p>17 Aug 2026</p>');
  check('a name a block does owns still comes from the block',
    resolve('<p>{{Title}}</p>', onPage), '<p>Orders</p>');
  check('a name nothing owns is still nothing',
    resolve('<p>[{{Nobody}}]</p>', onPage), '<p>[]</p>');

  check(
    'a block called now BEATS the built-in, which is the documented rule',
    resolve('<p>{{now}}</p>', { ...onPage, now: 'mine' }),
    '<p>mine</p>'
  );
  check(
    'and it beats it even when the block is empty -- owning the name is the test, not having a value',
    resolve('<p>[{{now}}]</p>', { ...onPage, now: '' }),
    '<p>[]</p>'
  );

  // The resolving rule on its own, since it decides whether a fallback exists.
  check('a name no block owns is left out, not set to undefined',
    Object.keys(slotValuesFrom({ A: 1 }, ['A', 'B'])), ['A']);
  check('a block whose value is undefined still owns its name',
    'B' in slotValuesFrom({ A: 1, B: undefined }, ['A', 'B']), true);
  check('asking for nothing gets nothing', Object.keys(slotValuesFrom({ A: 1 }, [])), []);

  // And the same, inside a calculation -- the reason this was found at all.
  /**
   * A calculation gets the built-ins too. Without this `{{today}}` works and
   * `{{calc: today}}` does not, which is the sort of split nobody can guess at.
   */
  check('a built-in reaches a calculation',
    resolve('<p>{{calc: if(isBlank(today), "missing", "there")}}</p>', onPage), '<p>there</p>');
  check('a block still beats a built-in inside a calculation',
    resolve('<p>{{calc: upper(now)}}</p>', { ...onPage, now: 'mine' }), '<p>MINE</p>');
}


// ------------------------------ markup naming something that is not there
group('markup naming something the page does not have is reported');
{
  /**
   * A slot nothing answers renders as NOTHING -- not the braces, not a
   * warning, just a gap in the middle of a card that otherwise looks finished.
   * The usual cause is a column renamed long after the markup was written.
   *
   * The set of names a repeater can legitimately use is the interesting part:
   * its own columns, `Row id` and `Row number`, every block on the page, and
   * the built-in clock. Too narrow and this accuses working pages, which is how
   * a panel gets ignored.
   */
  const REPEAT = 'repeatBlock__mk00000001';
  const DB = 'databaseBlock__mk10000001';
  const TEXT = 'textLabelBlock__mk20000001';
  const HTML = 'customHtmlBlock__mk30000001';
  const base = { value: '', visible: true, disabled: false, loading: false, error: null };
  const mk = (rowHtml: string, html = '') => ({
    blockIds: [REPEAT, DB, TEXT, HTML],
    states: {
      [REPEAT]: { ...base, blockName: 'Orders list', rowHtml, trackedBlockId: DB },
      [DB]: { ...base, blockName: 'Orders', columns: [{ name: 'Price' }, { name: 'Qty' }] },
      [TEXT]: { ...base, blockName: 'Heading' },
      [HTML]: { ...base, blockName: 'Panel', html },
    },
    workflows: [], formulas: [], connections: [],
    pages: [{ id: 'page-1', name: 'Home' }],
  } as any);
  const named = (ps: any[], word: string) => ps.filter(p => p.title.includes('nothing on the page has that name') && p.title.includes(word));
  const any = (ps: any[]) => ps.filter(p => p.title.includes('nothing on the page has that name'));

  check('a misspelled column in row markup is reported',
    named(diagnosePage(mk('<p>{{Prcie}}</p>')), '"Prcie"').length, 1);
  check('and it is broken, not a warning',
    diagnosePage(mk('<p>{{Prcie}}</p>')).find((p: any) => p.title.includes('"Prcie"'))?.severity, 'broken');
  check('the message says what a builder actually sees',
    diagnosePage(mk('<p>{{Prcie}}</p>')).find((p: any) => p.title.includes('"Prcie"'))?.detail.includes('gap where the value should be'), true);

  check('a real column is not accused', any(diagnosePage(mk('<p>{{Price}} x {{Qty}}</p>'))).length, 0);
  check('Row id and Row number are supplied to every row',
    any(diagnosePage(mk('<p>{{Row number}}. {{Row id}}</p>'))).length, 0);
  check('a block on the page can be named from row markup',
    any(diagnosePage(mk('<p>{{Heading}}</p>'))).length, 0);
  check('and so can the clock', any(diagnosePage(mk('<p>{{today | date: D MMM}}</p>'))).length, 0);
  check('a filter is not mistaken for a name',
    any(diagnosePage(mk('<p>{{Price | money: £}}</p>'))).length, 0);

  check('INSIDE A CALCULATION TOO, since that is where a name is easiest to get wrong',
    named(diagnosePage(mk('<p>{{calc: Prcie * Qty}}</p>')), '"Prcie"').length, 1);
  check('a correct calculation is left alone',
    any(diagnosePage(mk('<p>{{calc: Price * Qty | money: £}}</p>'))).length, 0);
  check('a function name is not mistaken for a column',
    any(diagnosePage(mk('<p>{{calc: round(Price)}}</p>'))).length, 0);

  check('custom HTML is checked against the blocks on the page',
    named(diagnosePage(mk('', '<p>{{Headnig}}</p>')), '"Headnig"').length, 1);
  check('a real block name in custom HTML is fine',
    any(diagnosePage(mk('', '<p>{{Heading}}</p>'))).length, 0);
  // A custom HTML block has no table behind it, so a column name is genuinely
  // nothing there -- and saying so is the point.
  check('a column name in custom HTML is reported, because it resolves to nothing there',
    named(diagnosePage(mk('', '<p>{{Price}}</p>')), '"Price"').length, 1);

  /**
   * The safety valve. Without a tracked table there is no list of columns, so
   * every slot would be accused -- and a repeater is usually pointed at its
   * table AFTER its markup is written.
   */
  const untracked = {
    blockIds: [REPEAT],
    states: { [REPEAT]: { ...base, blockName: 'Orders list', rowHtml: '<p>{{Price}}</p>' } },
    workflows: [], formulas: [], connections: [], pages: [{ id: 'page-1' }],
  } as any;
  check('a repeater with no table yet is not accused', any(diagnosePage(untracked)).length, 0);
  check('empty markup says nothing', any(diagnosePage(mk(''))).length, 0);

  /**
   * The false positive that would have made this useless: a block nobody
   * renamed answers to its type name, and half the blocks on a real page are
   * exactly that.
   */
  const unnamed = {
    blockIds: [HTML, 'textLabelBlock__mk40000001'],
    states: {
      [HTML]: { ...base, blockName: 'Panel', html: '<p>{{Text Label}}</p>' },
      'textLabelBlock__mk40000001': { ...base, blockName: '' },
    },
    workflows: [], formulas: [], connections: [], pages: [{ id: 'page-1' }],
  } as any;
  check('A BLOCK NOBODY RENAMED STILL ANSWERS TO ITS TYPE NAME', any(diagnosePage(unnamed)).length, 0);
}


// ------------------------------------------- the two spellings, told apart
group('a formula written in the wrong spelling says which one');
{
  /**
   * `{{Price}}` in a repeater's filter. `Price` in a step condition. Both
   * right, in their own place, and a builder moving between the two panels
   * used to get "That formula could not be read. Check the brackets and
   * quotes." -- true, useless, and pointing at brackets that are fine.
   *
   * `{{Price | money: $}}` is the sharpest case: it is copied out of the row
   * markup on the same panel, where it works. It has to be refused rather than
   * accommodated, because "£600.00" is text and comparing text to 100 asks
   * whether "£" sorts after "1".
   */
  const withFilter = rowMatchesFormula({ Price: 600 }, '{{Price | money: £}} > 100');
  check('a display filter in a row filter is kept, not silently answered', withFilter.pass, true);
  check('and it says to drop the filter', (withFilter.error || '').includes('{{Price}}'), true);
  check('and why: the comparison would be against text',
    (withFilter.error || '').includes('comparing text to a number'), true);

  check('a plain {{column}} still works, so the message only appears when it is wanted',
    rowMatchesFormula({ Price: 600 }, '{{Price}} > 100'), { pass: true, error: null });
  check('and a real comparison can still be false',
    rowMatchesFormula({ Price: 6 }, '{{Price}} > 100').pass, false);

  // A bare name in a row filter already had its own message and keeps it.
  const bare = rowMatchesFormula({ Price: 600 }, 'Price > 100');
  check('a bare name in a row filter still says to use braces',
    (bare.error || '').includes('{{Price}}'), true);

  // The rule on its own, both directions.
  check('braces with a filter, in a place that takes braces',
    (explainUnreadableFormula('{{Price | money: £}} > 100', 'slots') || '').includes('{{Price}}'), true);
  check('braces, in a place that takes bare names',
    (explainUnreadableFormula('{{Price}} > 100', 'names') || '').includes('Write Price without the braces'), true);
  check('a column with a space cannot be un-braced, so it is not suggested',
    (explainUnreadableFormula('{{Total price}} > 100', 'names') || '').includes('Remove the braces'), true);
  check('a formula with nothing recognisably wrong gets no invented advice',
    explainUnreadableFormula('Price >> 100', 'names'), null);
  check('and neither does an empty one', explainUnreadableFormula('', 'slots'), null);
  check('a correct row filter is not second-guessed',
    explainUnreadableFormula('{{Price}} > 100', 'slots'), null);
}


// ------------------------------------- one rule for what a block answers to
group('the name a block answers to is decided in one place');
{
  /**
   * This rule was written out five times: the inspector header, the wire
   * sentence, the block picker, the value resolver, and now the Health panel.
   * They agreed by luck. The panel is the one that cannot afford to be wrong,
   * because a disagreement there means accusing a page that works.
   */
  const named = { blockName: 'Total price' };
  const unnamed = { blockName: '' };
  const placeholder = { blockName: 'Button · a3f2' };

  check('a name somebody chose is used as written', slotNameOf('buttonBlock__nm00000001', named), 'Total price');
  check('a block nobody renamed answers to its type',
    slotNameOf('buttonBlock__nm00000001', unnamed), 'Button');
  check('and so does one still holding a generated placeholder',
    slotNameOf('buttonBlock__nm00000001', placeholder), 'Button');
  check('no state at all is still a type name, not a crash',
    slotNameOf('buttonBlock__nm00000001', undefined), 'Button');

  check('the id form and the type form agree, which is the whole point',
    slotNameOf('repeatBlock__nm00000002', unnamed),
    slotNameForNodeType('repeatBlock', unnamed));
  check('a type the registry does not know falls back rather than throwing',
    slotNameForNodeType(null, unnamed), 'Block');
}


// -------------------------------- the example the panel prints has to work
group('the calculated-slot example is one that actually renders');
{
  /**
   * The repeater's panel prints a worked example in the builder's own column
   * names, and somebody copies it into the box above expecting it to work. So
   * the example is built out here rather than in the component, and checked by
   * being RUN -- an example that does not render is worse than no example,
   * because it teaches that the syntax is broken.
   */
  const example = calcExampleFor(['Price', 'Qty']);
  check('two columns make a product', example, '{{calc: Price * Qty}}');
  check('AND IT RENDERS', fillSlots(`<p>${example}</p>`, { Price: 200, Qty: 3 }), '<p>600</p>');

  const withFilter = calcExampleWithFilter(example);
  check('the formatted version too', withFilter, '{{calc: Price * Qty | money: £}}');
  check('AND SO DOES THAT', fillSlots(`<p>${withFilter}</p>`, { Price: 200, Qty: 3 }), '<p>£600.00</p>');

  const one = calcExampleFor(['Total']);
  check('one column doubles itself rather than naming a column that is not there', one, '{{calc: Total * 2}}');
  check('and renders', fillSlots(`<p>${one}</p>`, { Total: 7 }), '<p>14</p>');

  check('no columns, no example -- one naming nothing teaches nothing', calcExampleFor([]), null);
  check('and neither does undefined', calcExampleFor(undefined), null);

  /**
   * A column with a space cannot go in a calculation at all: filters are split
   * off the slot first, so a nested {{ }} would not survive being parsed twice.
   * Offering it and letting it fail would be the worst of the options.
   */
  const spaced = calcExampleFor(['Your name', 'Total price', 'Qty']);
  check('A COLUMN WITH A SPACE IS NOT OFFERED, BECAUSE IT WOULD NOT WORK', spaced, '{{calc: Qty * 2}}');
  check('and the offered one renders', fillSlots(`<p>${spaced}</p>`, { Qty: 4 }), '<p>8</p>');
  check('all of them spaced means no example at all', calcExampleFor(['Your name', 'Total price']), null);
}


// -------------------------------------- saving without overwriting a save
group('a save cannot silently replace somebody else’s');
{
  /**
   * `save_page` is an unconditional UPDATE. Two tabs on the same page -- the
   * normal way anybody works -- and the second to autosave replaces everything
   * the first did. No error, no warning, no copy kept. Autosave here runs
   * 500ms after a keystroke, so the losing tab overwrites the winning one the
   * moment it is touched.
   *
   * Every decision below is one where the wrong answer is worse than the bug:
   * refuse too eagerly and the editor cannot save at all.
   */
  const ok = interpretSave(null, '2026-08-17T10:00:00Z');
  check('a save that lands reports where the page now stands', ok.stamp, '2026-08-17T10:00:00Z');
  check('and it is fine', [ok.ok, ok.stale, ok.needsFallback], [true, false, false]);
  check('autosave carries on', shouldKeepAutosaving(ok), true);

  const noStamp = interpretSave(null, null);
  check('a save with no stamp back is still a save', noStamp.ok, true);
  check('but it admits it does not know the version, rather than inventing one',
    noStamp.stamp, null);

  const stale = interpretSave({ message: 'page changed elsewhere at 2026-08-17 10:00:00+00', code: 'P0001' }, null);
  check('a conflict is recognised', stale.stale, true);
  check('AND IT STOPS AUTOSAVE, because retrying would overwrite or spam',
    shouldKeepAutosaving(stale), false);
  check('the message says nothing here was saved', (stale.message || '').includes('Nothing here has been saved'), true);
  check('and offers both ways out', (stale.message || '').includes('Reload') && (stale.message || '').includes('Save anyway'), true);

  const gone = interpretSave({ message: 'page no longer exists', code: 'P0002' }, null);
  check('a deleted page is not the same as a conflict', [gone.missing, gone.stale], [true, false]);
  check('and reloading is not offered, because it would not help',
    (gone.message || '').includes('reloading will not bring it back'), true);
  check('autosave stops for that too', shouldKeepAutosaving(gone), false);

  /**
   * The one that decides whether anybody can save at all. Until the migration
   * is run the guarded function does not exist, and the editor must fall back
   * rather than show a builder an error about SQL.
   */
  const notRun = interpretSave({ message: 'Could not find the function public.save_page_if_unchanged', code: 'PGRST202' }, null);
  check('A MISSING MIGRATION FALLS BACK, IT DOES NOT BREAK SAVING', notRun.needsFallback, true);
  check('and says nothing to the builder about it', notRun.message, null);
  check('and it is not mistaken for a conflict', notRun.stale, false);
  check('the same error from a schema cache is the same thing',
    interpretSave({ message: 'schema cache' }, null).needsFallback, true);

  const denied = interpretSave({ message: 'not your page', code: '42501' }, null);
  check('somebody else’s page says so plainly', (denied.message || '').includes('owns this page'), true);
  check('but that is not a conflict either', denied.stale, false);

  const offline = interpretSave({ message: 'Failed to fetch' }, null);
  check('a network failure keeps trying, because the work is only in this tab',
    shouldKeepAutosaving(offline), true);
  check('and says the changes are still here', (offline.message || '').includes('still here'), true);

  const odd = interpretSave({ message: 'deadlock detected' }, null);
  check('an unrecognised failure is passed on rather than swallowed',
    (odd.message || '').includes('deadlock detected'), true);
  check('and does not stop autosave, since nothing says the page moved',
    shouldKeepAutosaving(odd), true);

  /**
   * Stamps are per page, because switching pages saves the OUTGOING one. One
   * stamp would be compared against the wrong page the first time anybody used
   * the page tabs -- which is how this editor saves.
   */
  const stamps = new PageStamps();
  stamps.record('page-a', '2026-08-17T10:00:00Z');
  stamps.record('page-b', '2026-08-17T11:00:00Z');
  check('each page remembers its own version', stamps.expected('page-a'), '2026-08-17T10:00:00Z');
  check('and does not answer for another', stamps.expected('page-b'), '2026-08-17T11:00:00Z');
  check('a page never seen is unknown, which SAVES rather than refuses',
    stamps.expected('page-c'), undefined);

  stamps.record('page-a', null);
  check('A NULL STAMP CLEARS RATHER THAN KEEPING THE OLD ONE: stale refuses, unknown saves',
    stamps.expected('page-a'), undefined);

  stamps.record('page-b', '2026-08-17T12:00:00Z');
  check('a newer stamp replaces the older', stamps.expected('page-b'), '2026-08-17T12:00:00Z');
  stamps.forget('page-b');
  check('after a conflict this tab admits it no longer knows', stamps.expected('page-b'), undefined);
  check('forgetting one page leaves the others alone', stamps.expected('page-c'), undefined);

  /**
   * BOTH save sites, not one.
   *
   * This codebase's signature bug is a fix applied to one copy of something and
   * not the other -- five renderer drifts, and counting. There are two places
   * that write a page: the autosave, and the save that happens when you switch
   * page. A guard on only the first would leave the page switcher overwriting
   * exactly as before, and nothing would look wrong.
   */
  // Comments stripped first: this file's own prose names both functions, and a
  // check that counts its own documentation counts the wrong thing.
  const stripped = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const appSrc = stripped(readFileSync('src/App.tsx', 'utf8'));
  const guarded = (appSrc.match(/save_page_if_unchanged/g) || []).length;
  const plain = (appSrc.match(/rpc\('save_page'/g) || []).length;
  check('BOTH PLACES THAT SAVE A PAGE GO THROUGH THE GUARD', guarded, 2);
  check('and the unguarded call survives only as the fallback for each', plain, 2);
  check('every guarded call sends a version stamp',
    (appSrc.match(/p_expected/g) || []).length, 2);
  check('every load path records where the page stood',
    (appSrc.match(/stampsRef\.current\.record/g) || []).length >= 2, true);
  check('autosave is actually stopped somewhere, not just flagged',
    /if \(autosavePausedRef\.current\) return/.test(appSrc), true);
}


// --------------------------------------------- formulas that read a table
group('a page can get more than one number out of a table');
{
  /**
   * A Database block publishes ONE number: `outputMode` is a single setting, so
   * a page could show the order count OR the revenue OR the average order, and
   * never two of them. A second Database block is not a second view of the same
   * data, it is a second table with its own rows. So "revenue, orders, and
   * average order value" -- the first three numbers anybody puts on a dashboard
   * -- was not expressible at all, however many blocks were added.
   */
  const ORDERS = [
    { id: 'r1', Total: 200, Qty: 2, Status: 'paid', Who: 'Ada' },
    { id: 'r2', Total: 50, Qty: 1, Status: 'pending', Who: 'Bo' },
    { id: 'r3', Total: 350, Qty: 3, Status: 'paid', Who: 'Cy' },
    { id: 'r4', Total: '', Qty: 0, Status: 'paid', Who: '' },
  ];
  // Columns travel with the rows now, so a misspelled column can be refused
  // instead of quietly totalling nothing.
  const asTable = { rows: ORDERS, columns: ['Total', 'Qty', 'Status', 'Who'] };
  const tables = { Orders: asTable, 'databaseBlock__tb00000001': asTable };
  const ask = (f: string) => evaluateExpression(f, { Threshold: 100 }, tables);

  check('how many rows', ask('countOf("Orders")'), 4);
  check('a total', ask('sumOf("Orders", "Total")'), 600);
  check('an average, to two decimals like the block’s own', ask('avgOf("Orders", "Total")'), 200);
  check('the smallest', ask('minOf("Orders", "Total")'), 50);
  check('the largest', ask('maxOf("Orders", "Total")'), 350);
  check('names, read out', ask('joinOf("Orders", "Who")'), 'Ada, Bo, Cy');

  check('THREE NUMBERS FROM ONE TABLE, WHICH IS THE WHOLE POINT',
    [ask('countOf("Orders")'), ask('sumOf("Orders", "Total")'), ask('avgOf("Orders", "Total")')],
    [4, 600, 200]);

  // Blanks are skipped rather than counted as zero -- an average dragged down
  // by rows that never had a number is a wrong answer that looks right.
  check('a blank is not a zero in an average', ask('avgOf("Orders", "Total")'), 200);
  check('and not a zero in the smallest either', ask('minOf("Orders", "Total")'), 50);

  // The filter is the repeater's row-formula spelling, because it is the same
  // question asked in the same language.
  check('only the paid ones', ask('sumOf("Orders", "Total", \'{{Status}} == "paid"\')'), 550);
  check('counted the same way', ask('countOf("Orders", \'{{Status}} == "paid"\')'), 3);
  check('a filter can do arithmetic, like any formula',
    ask('countOf("Orders", \'{{Total}} * {{Qty}} > 300\')'), 2);
  check('and can read a block on the page',
    ask('sumOf("Orders", "Total", \'{{Total}} >= 100\')'), 550);
  check('joined with a filter', ask('joinOf("Orders", "Who", \'{{Status}} == "paid"\')'), 'Ada, Cy');
  check('Row id works in a filter, as it does everywhere else',
    ask('countOf("Orders", \'{{Row id}} == "r1"\')'), 1);
  check('a filter matching nothing totals zero, not an error',
    ask('sumOf("Orders", "Total", \'{{Status}} == "refunded"\')'), 0);

  // Composes with everything else, because it is the same evaluator.
  check('a table function inside if()',
    ask('if(countOf("Orders") > 3, "busy", "quiet")'), 'busy');
  check('and inside arithmetic', ask('sumOf("Orders", "Total") / countOf("Orders")'), 150);
  check('two tables functions compared', ask('sumOf("Orders", "Total") > Threshold'), true);

  /**
   * The refusals. Each one is a message somebody has to act on.
   */
  const fails = (f: string) => { try { evaluateExpression(f, {}, tables); return null; } catch (e: any) { return String(e.message); } };
  check('AN UNQUOTED TABLE SAYS SO, rather than reading the block’s single number',
    (fails('countOf(Orders)') || '').includes('in quotes'), true);
  check('a table that is not there names the ones that are',
    (fails('countOf("Ordres")') || '').includes('Tables on this page: Orders'), true);
  check('and does not list the internal ids alongside them',
    (fails('countOf("Ordres")') || '').includes('databaseBlock__'), false);
  check('a filter that is not quoted says so',
    (fails('countOf("Orders", {{Status}})') || '').length > 0, true);

  /**
   * A filter that cannot be worked out THROWS here, unlike a repeater's, which
   * keeps the row. A repeater showing too many rows is visibly wrong and leads
   * somebody to the filter; a TOTAL that is quietly too big just looks like a
   * number. There is nothing to notice, so it has to refuse.
   */
  check('A BROKEN FILTER REFUSES RATHER THAN QUIETLY OVER-COUNTING',
    (fails('sumOf("Orders", "Total", \'{{Status}} === \')') || '').length > 0, true);

  check('a table function where no tables exist says where it does work',
    (() => { try { evaluateExpression('countOf("Orders")', {}); return null; } catch (e: any) { return String(e.message); } })()?.includes('not in page markup'), true);
  check('the id spelling works too, since that is what the editor inserts',
    evaluateExpression('countOf("databaseBlock__tb00000001")', {}, tables), 4);
  check('a page with no tables at all says that instead of listing nothing',
    (() => { try { evaluateExpression('countOf("Orders")', {}, {}); return null; } catch (e: any) { return String(e.message); } })()?.includes('no tables on it'), true);

  /**
   * A MISSPELLED COLUMN. sumOf("Orders", "Totl") used to add up nothing and
   * answer 0 -- not an error, not looking like an error, sitting on a dashboard
   * being wrong. A total that refuses is annoying for a minute; a total that is
   * quietly wrong is trusted.
   */
  check('A MISSPELLED COLUMN REFUSES RATHER THAN TOTALLING NOTHING',
    (fails('sumOf("Orders", "Totl")') || '').includes('no column called "Totl"'), true);
  check('and lists the columns that are there',
    (fails('sumOf("Orders", "Totl")') || '').includes('Total, Qty, Status, Who'), true);
  check('an average of a column that is not there refuses too',
    (fails('avgOf("Orders", "Totl")') || '').length > 0, true);
  check('and so does joining one', (fails('joinOf("Orders", "Nmae")') || '').length > 0, true);
  check('a real column is still fine', evaluateExpression('sumOf("Orders", "Total")', {}, tables), 600);
  /**
   * `Row id` reads the row's id, spelled the way a repeater's slots and a row
   * filter spell it. It was accepted as a column name and then resolved to
   * nothing -- the exact silent-blank the column check above exists to stop,
   * introduced by writing the column check.
   */
  check('ROW ID IS THE SAME IDEA WITH THE SAME SPELLING EVERYWHERE',
    evaluateExpression('joinOf("Orders", "Row id", \'{{Row id}} == "r1"\')', {}, tables), 'r1');
  check('and all of them when nothing filters',
    evaluateExpression('joinOf("Orders", "Row id")', {}, tables), 'r1, r2, r3, r4');

  /**
   * Where it deliberately says nothing. A table with no declared columns and no
   * rows cannot tell a typo from an empty table -- which is every page for its
   * first half-second, before the rows arrive.
   */
  /**
   * ONE MISTYPED CELL USED TO MAKE THE WHOLE TOTAL READ 0.
   *
   * num() answers NaN for a value it cannot read, NaN poisons a sum, and a NaN
   * result becomes 0. So "12o" for "120" -- or "£200" typed into a text column
   * -- turned an entire revenue figure into a confident zero on a dashboard,
   * from one character, with nothing to notice.
   */
  const dirty = {
    Orders: {
      rows: [{ id: 'a', Total: 200 }, { id: 'b', Total: '12o' }, { id: 'c', Total: 100 }],
      columns: ['Total'],
    },
  };
  const dirtyFail = (f: string) => { try { evaluateExpression(f, {}, dirty); return null; } catch (e: any) { return String(e.message); } };
  check('A CELL THAT IS NOT A NUMBER REFUSES INSTEAD OF ANSWERING ZERO',
    (dirtyFail('sumOf("Orders", "Total")') || '').includes('not a number'), true);
  check('and it names the value, which is what makes it fixable',
    (dirtyFail('sumOf("Orders", "Total")') || '').includes('12o'), true);
  check('an average refuses on the same cell', (dirtyFail('avgOf("Orders", "Total")') || '').length > 0, true);
  check('so does the largest', (dirtyFail('maxOf("Orders", "Total")') || '').length > 0, true);
  check('counting is unaffected, since it does not read the values',
    evaluateExpression('countOf("Orders")', {}, dirty), 3);
  check('and joining is unaffected too, since text is the point of it',
    evaluateExpression('joinOf("Orders", "Total")', {}, dirty), '200, 12o, 100');

  /**
   * A blank is still skipped rather than refused. An empty cell is a row nobody
   * has filled in yet, which is ordinary; a cell holding "twelve" is a mistake.
   */
  const withBlanks = { Orders: { rows: [{ id: 'a', Total: 200 }, { id: 'b', Total: '' }], columns: ['Total'] } };
  check('a blank cell is ordinary and is skipped',
    evaluateExpression('sumOf("Orders", "Total")', {}, withBlanks), 200);
  check('and does not drag an average down',
    evaluateExpression('avgOf("Orders", "Total")', {}, withBlanks), 200);

  // A long value is trimmed so one runaway cell cannot fill the panel.
  const long = { Orders: { rows: [{ id: 'a', Total: 'x'.repeat(120) }], columns: ['Total'] } };
  // And the same thing in this runner, where it is only the shape being checked.
  check('a date column exports as a plain day',
    toCsv([{ name: 'Due', type: 'date' }], [{ Due: '2026-08-20T00:00:00.000Z' }]).split('\r\n')[1],
    '2026-08-20');
  check('a column with no type is written as it is stored',
    toCsv([{ name: 'Due' }], [{ Due: '2026-08-20T00:00:00.000Z' }]).split('\r\n')[1],
    '2026-08-20T00:00:00.000Z');
  check('an empty date cell exports as empty, not as a fallback day',
    toCsv([{ name: 'Due', type: 'date' }], [{ Due: '' }]).split('\r\n')[1], '');
  check('AND AN UNREADABLE ONE IS EXPORTED AS STORED, so nothing is invented',
    toCsv([{ name: 'Due', type: 'date' }], [{ Due: 'whenever' }]).split('\r\n')[1], 'whenever');
  // Both call sites hand over the types, or the fix is only half applied.
  check('the export action passes column types',
    /columns \|\| \[\]\) as \{ name: string; type\?: string \}/.test(readFileSync('src/lib/bindingEngine.ts', 'utf8')), true);
  check('and so does the page-delete download',
    /name: string; type\?: string/.test(readFileSync('src/lib/pageDelete.ts', 'utf8')), true);

  check('a very long value is trimmed in the message',
    (() => { try { evaluateExpression('sumOf("Orders", "Total")', {}, long); return ''; } catch (e: any) { return String(e.message); } })().length < 120, true);

  const empty = { Fresh: { rows: [], columns: [] } };
  /**
   * Wrapped, because a check that THROWS kills the whole run rather than
   * recording one failure -- which is how a negative control on this line came
   * back looking green: the run never reached the tally.
   */
  const tries = (f: string, t: any) => { try { return evaluateExpression(f, {}, t); } catch (e: any) { return `threw: ${e.message}`; } };
  check('an empty, undeclared table does not accuse anybody',
    tries('sumOf("Fresh", "Total")', empty), 0);
  const undeclared = { Loose: { rows: [{ id: 'x', Total: 5 }], columns: [] } };
  check('rows alone are enough to catch a typo once they exist',
    (() => { try { evaluateExpression('sumOf("Loose", "Totl")', {}, undeclared); return null; } catch (e: any) { return String(e.message); } })()?.includes('Totl'), true);
  check('and the real column still works without a declaration',
    evaluateExpression('sumOf("Loose", "Total")', {}, undeclared), 5);

  check('the new names are offered when a function is misspelled',
    (fails('sumOff("Orders", "Total")') || '').includes('sumOf'), true);

  /**
   * The sweep. A new kind of name in a formula is exactly the shape that has
   * made the Health panel accuse working pages twice before -- once for every
   * function name, once for `and` and `or`.
   */
  const src = readFileSync('src/blocks/FormulaDisplayBlock.inspector.tsx', 'utf8');
  check('the formula panel lists the table functions, or nobody can find them',
    src.includes('TABLE_FUNCTION_NAMES'), true);
  check('and shows the quotes, which is the part nobody would guess',
    src.includes('sumOf("Orders", "Total")'), true);
}


group('a table function is not reported as a missing block');
{
  /**
   * Twice now the Health panel has accused a formula that works: once treating
   * every function name as a block, once `and` and `or`. A quoted table name is
   * the third shape of the same mistake, so it is checked before it happens
   * rather than after somebody reports it.
   */
  const TARGET = 'numberDisplayBlock__tf00000001';
  const DB = 'databaseBlock__tf10000001';
  const base = { value: 0, visible: true, disabled: false, loading: false, error: null };
  const facts = (formula: string) => ({
    blockIds: [TARGET, DB],
    states: {
      [TARGET]: { ...base, blockName: 'Revenue' },
      [DB]: { ...base, blockName: 'Orders', rows: [], columns: [{ name: 'Total' }] },
    },
    workflows: [],
    formulas: [{ targetBlockId: TARGET, formula }],
    connections: [], pages: [{ id: 'page-1', name: 'Home' }],
  } as any);
  const missing = (f: string) =>
    diagnosePage(facts(f)).filter((p: any) => p.title.toLowerCase().includes('gone') || p.title.toLowerCase().includes('does not exist'));

  check('a quoted table name is not a block', missing('sumOf("Orders", "Total")').length, 0);
  check('nor is the function itself', missing('countOf("Orders")').length, 0);
  check('nor anything inside a quoted condition',
    missing('countOf("Orders", \'{{Status}} == "paid"\')').length, 0);
  check('a real missing block is still caught, so this is not just switched off',
    missing('sumOf("Orders", "Total") + numberDisplayBlock__gone0000001').length, 1);
}


// ------------------------ table functions, through the engine rather than beside it
/**
 * THE CONTROL THAT CAME BACK GREEN.
 *
 * Every table-function check above calls evaluateExpression directly, with a
 * table map handed to it. So removing `tables` from the engine's own call --
 * the line that decides whether a real page can use any of this -- turned
 * NOTHING red. The functions worked perfectly in a place no builder ever
 * reaches.
 *
 * This group goes the way a page goes: a Database block holding rows, a Formula
 * binding, and recalculateAllFormulas. It is also the only thing that proves
 * the two ways of naming a table (by name, by id) survive the trip.
 */
group('a formula on a real page can read a real table');
{
  const TOTAL = 'formulaDisplayBlock__tt00000001';
  const COUNT = 'formulaDisplayBlock__tt00000002';
  const AVERAGE = 'formulaDisplayBlock__tt00000003';
  const DB = 'databaseBlock__tt10000001';
  const base = { visible: true, disabled: false, loading: false, error: null };

  const mk = () => {
    const store = createStore();
    store.set(allBlockIdsAtom, [TOTAL, COUNT, AVERAGE, DB]);
    store.set(blockRuntimeAtom(TOTAL), { ...base, value: 0, blockName: 'Revenue' });
    store.set(blockRuntimeAtom(COUNT), { ...base, value: 0, blockName: 'How many' });
    store.set(blockRuntimeAtom(AVERAGE), { ...base, value: 0, blockName: 'Average order' });
    store.set(blockRuntimeAtom(DB), {
      ...base, value: 2, blockName: 'Orders',
      columns: [{ name: 'Total' }, { name: 'Status' }],
      rows: [
        { id: 'r1', Total: 200, Status: 'paid' },
        { id: 'r2', Total: 50, Status: 'pending' },
      ],
    });
    store.set(formulasAtom, [
      { targetBlockId: TOTAL, formula: 'sumOf("Orders", "Total")' },
      { targetBlockId: COUNT, formula: 'countOf("Orders")' },
      { targetBlockId: AVERAGE, formula: 'avgOf("Orders", "Total")' },
    ] as any);
    store.set(workflowsAtom, []);
    return store;
  };

  const store = mk();
  recalculateAllFormulas(store);
  const valueOf = (id: string) => store.get(blockRuntimeAtom(id)).value;
  const errorOf = (id: string) => store.get(blockRuntimeAtom(id)).error;

  check('THE TOTAL LANDS IN THE BLOCK, which no check above could tell you', valueOf(TOTAL), 250);
  check('and the count', valueOf(COUNT), 2);
  check('and the average', valueOf(AVERAGE), 125);
  check('none of them errored', [errorOf(TOTAL), errorOf(COUNT), errorOf(AVERAGE)], [null, null, null]);

  check('THREE DIFFERENT NUMBERS OUT OF ONE TABLE, on one page, at once',
    [valueOf(COUNT), valueOf(TOTAL), valueOf(AVERAGE)], [2, 250, 125]);

  /**
   * The reactive half. A total that does not move when a row arrives is worse
   * than no total: it is a number somebody trusts.
   */
  const withRow = store.get(blockRuntimeAtom(DB));
  store.set(blockRuntimeAtom(DB), {
    ...withRow,
    rows: [...(withRow as any).rows, { id: 'r3', Total: 100, Status: 'paid' }],
  });
  recalculateAllFormulas(store);
  check('A NEW ROW MOVES THE TOTAL', valueOf(TOTAL), 350);
  check('and the count', valueOf(COUNT), 3);
  check('and the average follows both', valueOf(AVERAGE), 116.67);

  // A row removed has to move it back, which is the half that gets forgotten.
  const fewer = store.get(blockRuntimeAtom(DB));
  store.set(blockRuntimeAtom(DB), { ...fewer, rows: (fewer as any).rows.slice(0, 1) });
  recalculateAllFormulas(store);
  check('and a row removed moves it back', [valueOf(TOTAL), valueOf(COUNT)], [200, 1]);

  // Filters, through the engine.
  const filtered = createStore();
  filtered.set(allBlockIdsAtom, [TOTAL, DB]);
  filtered.set(blockRuntimeAtom(TOTAL), { ...base, value: 0, blockName: 'Paid revenue' });
  filtered.set(blockRuntimeAtom(DB), {
    ...base, value: 0, blockName: 'Orders',
    columns: [{ name: 'Total' }, { name: 'Status' }],
    rows: [
      { id: 'r1', Total: 200, Status: 'paid' },
      { id: 'r2', Total: 50, Status: 'pending' },
      { id: 'r3', Total: 100, Status: 'paid' },
    ],
  });
  filtered.set(formulasAtom, [
    { targetBlockId: TOTAL, formula: 'sumOf("Orders", "Total", \'{{Status}} == "paid"\')' },
  ] as any);
  filtered.set(workflowsAtom, []);
  recalculateAllFormulas(filtered);
  check('a filtered total, on a real page', filtered.get(blockRuntimeAtom(TOTAL)).value, 300);

  /**
   * The id spelling has to survive the trip too -- it is what the editor's own
   * block picker inserts, so a formula built by clicking rather than typing
   * goes through this path and no other.
   */
  const byId = createStore();
  byId.set(allBlockIdsAtom, [TOTAL, DB]);
  byId.set(blockRuntimeAtom(TOTAL), { ...base, value: 0, blockName: 'Revenue' });
  byId.set(blockRuntimeAtom(DB), {
    ...base, value: 0, blockName: 'Orders',
    columns: [{ name: 'Total' }],
    rows: [{ id: 'r1', Total: 200 }, { id: 'r2', Total: 50 }],
  });
  byId.set(formulasAtom, [{ targetBlockId: TOTAL, formula: `sumOf("${DB}", "Total")` }] as any);
  byId.set(workflowsAtom, []);
  recalculateAllFormulas(byId);
  check('THE ID SPELLING WORKS ON A REAL PAGE, which is what the picker inserts',
    byId.get(blockRuntimeAtom(TOTAL)).value, 250);

  /**
   * A block nobody renamed is addressable by its type name here as everywhere
   * else -- and "Database" is what half of them are called.
   */
  const unnamed = createStore();
  unnamed.set(allBlockIdsAtom, [TOTAL, DB]);
  unnamed.set(blockRuntimeAtom(TOTAL), { ...base, value: 0, blockName: 'Revenue' });
  unnamed.set(blockRuntimeAtom(DB), {
    ...base, value: 0, blockName: '', columns: [{ name: 'Total' }],
    rows: [{ id: 'r1', Total: 7 }],
  });
  unnamed.set(formulasAtom, [{ targetBlockId: TOTAL, formula: 'sumOf("Database", "Total")' }] as any);
  unnamed.set(workflowsAtom, []);
  recalculateAllFormulas(unnamed);
  check('a table nobody renamed answers to its type name', unnamed.get(blockRuntimeAtom(TOTAL)).value, 7);

  /**
   * And the failure, on a real page: a misspelled table has to reach the block
   * as an error rather than settling on a stale number that looks like an
   * answer. This is the one that would hurt most silently.
   */
  const typo = createStore();
  typo.set(allBlockIdsAtom, [TOTAL, DB]);
  typo.set(blockRuntimeAtom(TOTAL), { ...base, value: 999, blockName: 'Revenue' });
  typo.set(blockRuntimeAtom(DB), {
    ...base, value: 0, blockName: 'Orders', columns: [{ name: 'Total' }],
    rows: [{ id: 'r1', Total: 7 }],
  });
  typo.set(formulasAtom, [{ targetBlockId: TOTAL, formula: 'sumOf("Ordres", "Total")' }] as any);
  typo.set(workflowsAtom, []);
  recalculateAllFormulas(typo);
  /**
   * A misspelled COLUMN, on a real page. This is the one that proves the
   * table's columns travel with its rows through tableScope -- without them
   * `sumOf("Orders", "Totl")` totals nothing and lands 0 on the block, which is
   * not an error and does not look like one.
   */
  const badCol = createStore();
  badCol.set(allBlockIdsAtom, [TOTAL, DB]);
  badCol.set(blockRuntimeAtom(TOTAL), { ...base, value: 0, blockName: 'Revenue' });
  badCol.set(blockRuntimeAtom(DB), {
    ...base, value: 0, blockName: 'Orders',
    columns: [{ name: 'Total' }, { name: 'Status' }],
    rows: [],
  });
  badCol.set(formulasAtom, [{ targetBlockId: TOTAL, formula: 'sumOf("Orders", "Totl")' }] as any);
  badCol.set(workflowsAtom, []);
  recalculateAllFormulas(badCol);
  check('A MISSPELLED COLUMN IS CAUGHT ON A REAL PAGE, EVEN WITH NO ROWS YET',
    (badCol.get(blockRuntimeAtom(TOTAL)).error || '').includes('Totl'), true);
  check('and the message names the columns the table does have',
    (badCol.get(blockRuntimeAtom(TOTAL)).error || '').includes('Total, Status'), true);

  check('A MISSPELLED TABLE SHOWS AN ERROR, not the last number that worked',
    (typo.get(blockRuntimeAtom(TOTAL)).error || '').includes('Ordres'), true);
  check('and it names the table that does exist', 
    (typo.get(blockRuntimeAtom(TOTAL)).error || '').includes('Orders'), true);

  /**
   * A CONDITION can read a table too, and that was unchecked as well -- the
   * same control, run twice, came back green for the same reason both times.
   *
   * It is the more useful half, if anything: "stop taking bookings once there
   * are twenty" and "only charge postage under fifty pounds" are conditions,
   * not displays, and neither was sayable before.
   */
  const gate = createStore();
  gate.set(allBlockIdsAtom, [DB]);
  gate.set(blockRuntimeAtom(DB), {
    ...base, value: 0, blockName: 'Bookings',
    columns: [{ name: 'Seats' }, { name: 'Paid' }],
    rows: [
      { id: 'r1', Seats: 2, Paid: 'yes' },
      { id: 'r2', Seats: 3, Paid: 'no' },
    ],
  });
  gate.set(workflowsAtom, []);
  gate.set(formulasAtom, []);
  const asks = (expression: string) =>
    stepConditionResult({ fieldId: '', operator: 'equals', expression } as any, gate);

  check('A CONDITION CAN COUNT A TABLE, which is what stops a form once it is full',
    asks('countOf("Bookings") < 20').pass, true);
  check('and refuse when it is', asks('countOf("Bookings") >= 2').pass, true);
  check('a total in a condition', asks('sumOf("Bookings", "Seats") > 4').pass, true);
  check('and under it', asks('sumOf("Bookings", "Seats") > 50').pass, false);
  check('a filtered count in a condition',
    asks('countOf("Bookings", \'{{Paid}} == "yes"\') == 1').pass, true);
  check('the run log shows the answer it actually got, not just pass or fail',
    asks('countOf("Bookings") < 20').describe.includes('2'), true);

  /**
   * Fail closed, as every other unworkable condition does. A step guarded by a
   * table that is not there must NOT run -- a condition nobody can answer is
   * not a condition that passed.
   */
  const broken = asks('countOf("Bookngs") < 20');
  check('a misspelled table in a condition FAILS CLOSED', broken.pass, false);
  check('and says which name failed', broken.describe.includes('Bookngs'), true);
}


group('a table named inside a formula survives being copied');
{
  /**
   * The sweep after table functions. A formula built by the picker names its
   * table by id -- inside a STRING, which is a shape no formula had before.
   * Copying a page regenerates every block id, so a `sumOf("<old id>", ...)`
   * that is not remapped points at a block on the ORIGINAL page: the copy shows
   * the original's totals, silently, and moves when the original does.
   */
  const map = {
    'databaseBlock__old0000001': 'databaseBlock__new0000001',
    'numberDisplayBlock__old002': 'numberDisplayBlock__new002',
  };
  check('an id inside quotes is remapped like any other',
    remapFormulaExpression('sumOf("databaseBlock__old0000001", "Total")', map),
    'sumOf("databaseBlock__new0000001", "Total")');
  check('and so is a bare one alongside it',
    remapFormulaExpression('sumOf("databaseBlock__old0000001", "Total") + numberDisplayBlock__old002', map),
    'sumOf("databaseBlock__new0000001", "Total") + numberDisplayBlock__new002');

  /**
   * And a table named by its NAME must not be touched. Names are not ids, they
   * are not regenerated, and rewriting one would break the copy in the opposite
   * direction.
   */
  check('A HUMAN NAME IS LEFT ALONE, because it is not an id and is not regenerated',
    remapFormulaExpression('sumOf("Orders", "Total")', map),
    'sumOf("Orders", "Total")');
  check('a column name is left alone too',
    remapFormulaExpression('sumOf("Orders", "databaseBlock__old0000001x")', map),
    'sumOf("Orders", "databaseBlock__old0000001x")');
  check('a filter inside the formula is left as written',
    remapFormulaExpression('countOf("Orders", \'{{Status}} == "paid"\')', map),
    'countOf("Orders", \'{{Status}} == "paid"\')');
}


group('markup can calculate over a whole table');
{
  /**
   * A row could read a value but never a whole table, so "this row's share of
   * the total" -- which is most of what anybody wants a percentage for -- was
   * not sayable in markup at all.
   */
  const ORDERS = {
    rows: [{ id: 'r1', Total: 200 }, { id: 'r2', Total: 50 }, { id: 'r3', Total: 250 }],
    columns: ['Total'],
  };
  const opts = { tables: { Orders: ORDERS } };

  check('a total in markup',
    fillSlots('<p>{{calc: sumOf("Orders", "Total")}}</p>', {}, [], opts), '<p>500</p>');
  check("A ROW'S SHARE OF THE WHOLE, which is the reason for this",
    fillSlots('<p>{{calc: Total / sumOf("Orders", "Total") * 100}}%</p>', { Total: 200 }, [], opts),
    '<p>40%</p>');
  check('and it still formats like any other slot',
    fillSlots('<p>{{calc: sumOf("Orders", "Total") | money: £}}</p>', {}, [], opts),
    '<p>£500.00</p>');
  check('a count reads the same way',
    fillSlots('<p>{{calc: countOf("Orders")}} orders</p>', {}, [], opts), '<p>3 orders</p>');

  /**
   * A caller that cannot supply tables renders NOTHING rather than a number.
   *
   * What this does and does not prove, since a control caught the difference:
   * it shows the page stays blank, not WHY. Both "tables are unavailable here"
   * and "there is no table called Orders" end the same way on screen, because a
   * visitor is never told either. The distinction between those two messages is
   * checked where it is visible -- in the error a builder reads -- not here.
   *
   * What matters on the page is the negative: it never becomes a confident 0,
   * which a share of the whole would then divide by.
   */
  check('a calculation that cannot reach the tables shows nothing',
    fillSlots('<p>[{{calc: sumOf("Orders", "Total")}}]</p>', {}), '<p>[]</p>');
  check('AND NEVER A CONFIDENT ZERO, which a share of the whole would divide by',
    fillSlots('<p>[{{calc: Total / sumOf("Orders", "Total")}}]</p>', { Total: 200 }), '<p>[]</p>');

  // A visitor is never shown the reason; the Health panel is where a builder is told.
  check('a misspelled table is silent on the page, as every other calc failure is',
    fillSlots('<p>[{{calc: sumOf("Ordres", "Total")}}]</p>', {}, [], opts), '<p>[]</p>');

  // And the guard still holds for anything a table function could build.
  check('a calculated table value cannot become a scheme in an href',
    fillSlots(
      '<a href="{{calc: concat(\'javascri\', \'pt:\', text(countOf("Orders")))}}">x</a>',
      {}, ['calc: concat(\'javascri\', \'pt:\', text(countOf("Orders")))'], opts),
    '<a href="">x</a>');

  /**
   * The wiring. Both blocks that render markup have to read the tables through
   * an ATOM -- building the map inline computes the right answer once and never
   * again, because nothing in a repeater subscribes to another block's rows.
   * The page would show the total as it stood when it last happened to render,
   * and a stale number looks exactly like an answer.
   */
  const repeatSrc = readFileSync('src/blocks/RepeatBlock.tsx', 'utf8');
  const htmlSrc = readFileSync('src/blocks/CustomHtmlBlock.tsx', 'utf8');
  check('the repeater reads tables through the atom', repeatSrc.includes('useTableScope()'), true);
  check('and hands them to fillSlots', /fillSlots\([\s\S]{0,200}\{ tables \}/.test(repeatSrc), true);
  check('custom HTML does both too',
    htmlSrc.includes('useTableScope()') && htmlSrc.includes('{ tables }'), true);
  check('NEITHER BUILDS THE MAP INLINE, which would freeze the total',
    repeatSrc.includes('tableScope(') || htmlSrc.includes('tableScope('), false);

  /**
   * The panel prints this one too, so it is checked by being run. It earns its
   * own example because the table and the column go in QUOTES while everything
   * else in the same slot does not, and nobody guesses that.
   */
  const share = shareExampleFor('Orders', ['Total', 'Status']);
  check('the share example is built from the builder’s own names',
    share, '{{calc: Total / sumOf("Orders", "Total") * 100 | round: 1}}%');
  // 40.0, not 40: `round: 1` keeps the decimal place, which is what makes a
  // column of percentages line up. Worth pinning, since the obvious guess is 40.
  check('AND IT RENDERS, which is the only thing that makes printing it honest',
    fillSlots(`<p>${share}</p>`, { Total: 200 }, [], opts), '<p>40.0%</p>');
  check('a column with a space is skipped, because it cannot go in a calculation',
    shareExampleFor('Orders', ['Order total', 'Qty']),
    '{{calc: Qty / sumOf("Orders", "Qty") * 100 | round: 1}}%');
  check('no table, no example', shareExampleFor('', ['Total']), null);
  check('no usable column, no example', shareExampleFor('Orders', ['Order total']), null);
  check('and the panel actually prints it', repeatSrc.includes('shareExample'), false);
  check('the inspector prints it', readFileSync('src/blocks/RepeatBlock.inspector.tsx', 'utf8').includes('shareExample'), true);
}


group('a number column with something that is not a number in it');
{
  /**
   * One character causes two different quiet wrongnesses at once, which is why
   * this is a check of its own: a Database block's own sum SKIPS the bad cell,
   * so the total is short by that row and looks plausible, while sumOf in a
   * formula refuses outright and the builder cannot place the error.
   *
   * Only MIXED columns are reported. A column of words is a text column and is
   * nobody's business; numbers plus one thing that is not a number is a typo,
   * near enough always.
   */
  const DB = 'databaseBlock__nc00000001';
  const base = { value: 0, visible: true, disabled: false, loading: false, error: null };
  const mk = (rows: any[], columns = ['Total', 'Who']) => ({
    blockIds: [DB],
    states: {
      [DB]: { ...base, blockName: 'Orders', rows, columns: columns.map(name => ({ name })) },
    },
    workflows: [], formulas: [], connections: [], pages: [{ id: 'page-1' }],
  } as any);
  const found = (facts: any) =>
    diagnosePage(facts).filter((p: any) => p.title.includes('which is not a number'));

  const typo = found(mk([
    { id: 'a', Total: 200, Who: 'Ada' },
    { id: 'b', Total: '12o', Who: 'Bo' },
    { id: 'c', Total: 100, Who: 'Cy' },
  ]));
  check('THE MISTYPED CELL IS FOUND', typo.length, 1);
  check('and it is quoted, so it can be searched for', typo[0]?.title.includes('"12o"'), true);
  check('and the column is named', typo[0]?.title.includes('Total column'), true);
  check('a warning, not broken — the page still works, it is just wrong',
    typo[0]?.severity, 'warning');
  check('the message explains BOTH ways it goes wrong',
    typo[0]?.detail.includes('comes out short') && typo[0]?.detail.includes('sumOf'), true);

  check('a clean number column is not accused',
    found(mk([{ id: 'a', Total: 200, Who: 'Ada' }, { id: 'b', Total: 100, Who: 'Bo' }])).length, 0);
  check('A COLUMN OF WORDS IS A TEXT COLUMN AND IS LEFT ALONE',
    found(mk([{ id: 'a', Total: 'high', Who: 'Ada' }, { id: 'b', Total: 'low', Who: 'Bo' }])).length, 0);
  check('and the names beside it are never accused',
    found(mk([{ id: 'a', Total: 200, Who: 'Ada' }, { id: 'b', Total: '12o', Who: 'Bo' }]))
      .filter((p: any) => p.title.includes('Who')).length, 0);
  check('a blank is a row nobody filled in, not a mistake',
    found(mk([{ id: 'a', Total: 200 }, { id: 'b', Total: '' }, { id: 'c', Total: null }])).length, 0);
  check('an empty table says nothing', found(mk([])).length, 0);
  check('a currency symbol typed into the cell is caught, because it is the same mistake',
    found(mk([{ id: 'a', Total: 200 }, { id: 'b', Total: '£200' }])).length, 1);

  // Only the first is reported per column: twenty rows of the same paste error
  // would otherwise bury every other finding on the page.
  const many = found(mk([
    { id: 'a', Total: 1 }, { id: 'b', Total: 'x' }, { id: 'c', Total: 'y' }, { id: 'd', Total: 'z' },
  ]));
  check('ONE FINDING PER COLUMN, not one per row', many.length, 1);

  // A runaway cell cannot fill the panel.
  const long = found(mk([{ id: 'a', Total: 1 }, { id: 'b', Total: 'q'.repeat(200) }]));
  check('a very long value is trimmed', long[0]?.title.length < 120, true);

  /**
   * A DATE column is checked more strictly, and can afford to be: the builder
   * has already said what the column is, so one unreadable value is enough.
   * No "a mixed column is a text column" escape applies.
   */
  const dated = (rows: any[]) => ({
    blockIds: [DB],
    states: { [DB]: { ...base, blockName: 'Bookings', rows, columns: [{ name: 'Due', type: 'date' }] } },
    workflows: [], formulas: [], connections: [], pages: [{ id: 'page-1' }],
  } as any);
  const dateFound = (rows: any[]) =>
    diagnosePage(dated(rows)).filter((p: any) => p.title.includes('which is not a date'));

  check('A DATE COLUMN HOLDING SOMETHING ELSE IS REPORTED',
    dateFound([{ id: 'a', Due: '2026-08-17T00:00:00.000Z' }, { id: 'b', Due: 'next tuesday' }]).length, 1);
  check('and the value is quoted so it can be found',
    dateFound([{ id: 'a', Due: 'next tuesday' }])[0]?.title.includes('"next tuesday"'), true);
  check('the message says both ways it goes wrong',
    dateFound([{ id: 'a', Due: 'soon' }])[0]?.detail.includes('sorts in the wrong place'), true);
  check('a clean date column is not accused',
    dateFound([{ id: 'a', Due: '2026-08-17T00:00:00.000Z' }, { id: 'b', Due: '2026-09-01T00:00:00.000Z' }]).length, 0);
  check('a blank is a row nobody filled in',
    dateFound([{ id: 'a', Due: '' }, { id: 'b', Due: null }]).length, 0);
  check('ONE FINDING PER COLUMN here too', 
    dateFound([{ id: 'a', Due: 'x' }, { id: 'b', Due: 'y' }, { id: 'c', Due: 'z' }]).length, 1);
  check('and a text column full of the same words is never touched',
    diagnosePage(mk([{ id: 'a', Total: 'next tuesday' }, { id: 'b', Total: 'soon' }]))
      .filter((p: any) => p.title.includes('not a date')).length, 0);
}


// -------------------------------------------------- dates, as arithmetic
group('a formula can ask a question about a date');
{
  /**
   * A date could be SHOWN and shifted for showing, and that was all. Nothing
   * could ask a question about one. "Three days left", "overdue", "this
   * month", "only if it has not passed" -- every one unsayable, on a product
   * whose two worked examples are a booking form and a task list.
   *
   * The clock is pinned here for the obvious reason: `today` is one of exactly
   * two things in this language whose answer changes on its own.
   */
  const NOW_D = new Date(2026, 7, 17, 14, 30); // Mon 17 Aug 2026, afternoon
  const at = (f: string, scope: any = {}) => evaluateExpression(f, scope, undefined, { now: NOW_D });

  check('days until something', at('daysUntil("2026-08-20")'), 3);
  check('and it is negative once it has passed, which is what overdue means',
    at('daysUntil("2026-08-14")'), -3);
  check('today is zero', at('daysUntil("2026-08-17")'), 0);
  check('days since', at('daysSince("2026-08-10")'), 7);
  check('between two dates', at('daysBetween("2026-08-17", "2026-08-24")'), 7);
  check('and backwards', at('daysBetween("2026-08-24", "2026-08-17")'), -7);

  /**
   * WHOLE DAYS, from midnight. The clock here says 14:30, so counting in
   * 24-hour steps would answer 2 in the afternoon and 3 in the morning for the
   * same question -- and somebody would file that as a bug, correctly.
   */
  check('THE ANSWER DOES NOT DEPEND ON THE TIME OF DAY',
    evaluateExpression('daysUntil("2026-08-20")', {}, undefined, { now: new Date(2026, 7, 17, 23, 59) }),
    3);
  check('nor in the small hours',
    evaluateExpression('daysUntil("2026-08-20")', {}, undefined, { now: new Date(2026, 7, 17, 0, 1) }),
    3);

  check('is it before', at('isBefore("2026-08-10", "2026-08-17")'), true);
  check('is it after', at('isAfter("2026-08-20", "2026-08-17")'), true);
  check('the same day whatever the time',
    at('isSameDay("2026-08-17T01:00:00", "2026-08-17T23:00:00")'), true);
  check('parts of a date', [at('year("2026-08-17")'), at('month("2026-08-17")'), at('day("2026-08-17")')], [2026, 8, 17]);
  check('MONTH IS 1-12, because a formula is read by a person', at('month("2026-01-05")'), 1);
  check('and Monday is 1, because that is how a week is spoken about', at('weekday("2026-08-17")'), 1);
  check('with Sunday at 7 rather than 0', at('weekday("2026-08-16")'), 7);

  /**
   * `today` and `now` as words. A formula's scope is keyed by block id, so
   * there was no `today` in it and never could have been.
   */
  check('today is a word a formula can use', at('daysUntil(today)'), 0);
  check('and it composes', at('daysBetween(today, "2026-08-24")'), 7);
  check('A BLOCK CALLED today STILL WINS, the same precedence markup documents',
    at('today', { today: 'mine' }), 'mine');

  /**
   * dateAdd hands back TEXT, so the answer survives being stored, compared and
   * formatted. A Date object survives none of those reliably.
   */
  check('a shifted date can be compared', at('isAfter(dateAdd(today, 7), "2026-08-20")'), true);
  check('and read back by the same functions', at('daysUntil(dateAdd(today, 5))'), 5);
  check('and formatted like any other date',
    fillSlots('<p>{{calc: dateAdd(today, 7) | date: D MMM YYYY}}</p>', {}, [], { now: NOW_D }),
    '<p>24 Aug 2026</p>');
  check('backwards too', at('daysUntil(dateAdd(today, -2))'), -2);

  // The everyday sentence, in the shape somebody actually writes it.
  check('THE SENTENCE THIS EXISTS FOR',
    at('if(daysUntil(Due) < 0, "Overdue", concat(text(daysUntil(Due)), " days left"))', { Due: '2026-08-20' }),
    '3 days left');
  check('and the other half of it',
    at('if(daysUntil(Due) < 0, "Overdue", "fine")', { Due: '2026-08-01' }), 'Overdue');

  // Refusals.
  const bad = (f: string) => { try { at(f); return null; } catch (e: any) { return String(e.message); } };
  check('something that is not a date says so, and says which',
    (bad('daysUntil("next tuesday-ish")') || '').includes('next tuesday-ish'), true);
  check('an empty date is named as empty rather than as unreadable',
    (bad('daysUntil("")') || '').includes('empty'), true);
  check('the date functions are offered when one is misspelled',
    (bad('daysUnti("2026-08-20")') || '').includes('daysUntil'), true);

  /**
   * The reader is shared with the display filters. Two ways of deciding what
   * counts as a date would eventually disagree about a real page's data.
   */
  check('a timestamp reads as a date here as it does in a filter',
    at('year(1755388800)') > 2020, true);

  /**
   * THE SWEEP, and the fourth time this exact assumption has broken.
   *
   * The Health panel scans a formula for identifiers and reports the ones that
   * are not blocks. Every new WORD in the language -- `and` and `or` last
   * cycle, `today` and `now` this one -- looks exactly like a block that has
   * been deleted, so every date formula would arrive with a false "block is
   * gone" beside it.
   */
  // The formula has to actually SAY today, or the check is named for something
  // it never touches -- which is how this one first went in.
  check('TODAY IS NOT REPORTED AS A DELETED BLOCK', referencedIds('daysUntil(today) < 0'), []);
  check('and neither is the column beside it', referencedIds('daysUntil(Due) > 0'), ['Due']);
  check('nor when both appear together',
    referencedIds('daysBetween(today, Due) > 3'), ['Due']);
  check('nor is now', referencedIds('daysBetween(now, Due)'), ['Due']);
  check('nor are the date functions themselves',
    referencedIds('if(isBefore(today, Due), dateAdd(Due, 7), Due)'), ['Due']);
  check('and a real deleted block is still reported, so this is not switched off',
    referencedIds('daysUntil(Gone)'), ['Gone']);

  const helpSrc = readFileSync('src/blocks/FormulaDisplayBlock.inspector.tsx', 'utf8');
  check('the panel lists the date functions, or nobody finds them',
    helpSrc.includes('DATE_FUNCTION_NAMES'), true);
  check('and shows the one sentence anybody actually wants',
    helpSrc.includes('daysUntil(Due)'), true);
}


// ------------------------------------------------------ a date column
group('a column can hold a date');
{
  /**
   * The sweep after date arithmetic, and the finding it produced: the functions
   * were shipped against data the product could not store. A booking's date was
   * a TEXT column, so it sorted alphabetically -- "17 Aug" before "2 Sep" --
   * and every formula reading it depended on whoever typed it happening to
   * choose a shape the parser understood.
   */
  check('a date is stored as ISO, whatever was typed',
    isoDate('17 Aug 2026').startsWith('2026-08-1'), true);
  check('and an ISO string survives the trip unchanged in meaning',
    isoDate('2026-08-17T00:00:00.000Z'), '2026-08-17T00:00:00.000Z');
  check('a blank stays blank', isoDate(''), '');
  check('and so does nothing at all', [isoDate(null), isoDate(undefined)], ['', '']);
  check('SOMETHING UNREADABLE BECOMES EMPTY, NOT TODAY',
    isoDate('sometime next week'), '');

  check('coerceForColumn routes a date column through it',
    coerceForColumn('17 Aug 2026', { name: 'Due', type: 'date' }).startsWith('2026-08-1'), true);
  check('and leaves the other types alone',
    [coerceForColumn('5', { name: 'n', type: 'number' }),
     coerceForColumn('true', { name: 'b', type: 'boolean' }),
     coerceForColumn(5, { name: 't', type: 'text' })],
    [5, true, '5']);

  /**
   * ISO SORTS CORRECTLY AS PLAIN TEXT, which is the whole reason for choosing
   * it: a date column sorts right with no special case anywhere in the sorting.
   */
  const dates = ['2026-09-02T00:00:00.000Z', '2026-08-17T00:00:00.000Z', '2026-08-09T00:00:00.000Z'];
  check('A DATE COLUMN SORTS CHRONOLOGICALLY WITH NO SPECIAL CASE',
    [...dates].sort(compareCells),
    ['2026-08-09T00:00:00.000Z', '2026-08-17T00:00:00.000Z', '2026-09-02T00:00:00.000Z']);
  /**
   * And the same dates as TEXT, which is what a booking date was until now.
   * The sort is numeric-aware, so it reads the leading number and puts 2 Sep
   * before 17 Aug -- September before August. The guess when writing this check
   * was that it would sort "17" first alphabetically; it does something else
   * wrong. Either way it is not chronological, and pinning the ACTUAL wrong
   * order is the point: it is what a builder saw.
   */
  check('WHICH IS WHAT A TEXT COLUMN GOT WRONG: September sorted before August',
    ['2 Sep 2026', '17 Aug 2026'].sort(compareCells), ['2 Sep 2026', '17 Aug 2026']);

  /**
   * The date input speaks one dialect -- YYYY-MM-DD, LOCAL, no time -- and
   * shows an empty box for anything else, silently. Both halves of the
   * translation are checked together because written apart they disagreed
   * about the timezone, and a date typed near midnight came back a day early.
   */
  const iso = dateInputToIso('2026-08-17');
  check('what the picker gives is stored as ISO', iso.length > 0, true);
  check('and comes back as the same day', isoToDateInput(iso), '2026-08-17');

  /**
   * THE TIMEZONE HALF CANNOT BE CHECKED BY BEHAVIOUR HERE, and pretending
   * otherwise would be worse than saying so.
   *
   * This runner's clock is UTC, so local time and UTC are the same number and
   * a wrong implementation gives identical answers. A control proved it:
   * swapping the reader to `toISOString().slice(0, 10)` -- which loses a day
   * for everyone east of Greenwich, including this project's own author --
   * broke nothing at all.
   *
   * So the DECISION is checked instead of the behaviour, at the source, and
   * this comment is the honest label on it. A behavioural check would need the
   * suite re-run under a forced TZ, which is worth doing the day anything else
   * needs it too.
   */
  /**
   * RUN IN A DIFFERENT TIMEZONE, in a separate process, because this one cannot
   * see the bug.
   *
   * Node reads TZ once at start, and this suite runs in UTC -- where local time
   * and UTC are the same number, so every timezone mistake gives an identical
   * answer. That is not a guess: a control swapped the date-picker reader to
   * `toISOString().slice(0, 10)`, which loses a day for everyone east of
   * Greenwich, and NOTHING went red. A source check was tried instead and was
   * no better, because shape-matching text survives the break that matters.
   *
   * Asia/Kolkata is +05:30 -- a half-hour offset, which also catches anything
   * assuming whole-hour zones.
   */
  const tz = JSON.parse(
    execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--import', './scripts/register.mjs', 'scripts/tz-probe.ts'],
      { env: { ...process.env, TZ: 'Asia/Kolkata' }, encoding: 'utf8' },
    ).trim().split('\n').pop() as string,
  );

  check('THE PROBE REALLY IS IN ANOTHER TIMEZONE, or it proves nothing',
    tz.offsetMinutes !== 0, true);
  check('A PICKED DATE COMES BACK AS THE SAME DAY IN +05:30', tz.roundTrip, '2026-08-20');
  check('AND SO DOES ONE THAT ARRIVED THROUGH A DATE COLUMN', tz.viaColumn, '2026-08-20');
  check('THE TWO WRITE PATHS AGREE TO THE MILLISECOND', tz.storedByCell, tz.storedByColumn);
  check('and they store local midnight, which is what the picker means',
    tz.storedByCell, '2026-08-19T18:30:00.000Z');
  // A day lost at a year boundary is a year lost.
  check('new year does not slip into the old one', tz.newYear, '2026-01-01');
  check('nor new year’s eve into the next', tz.newYearEve, '2026-12-31');

  /**
   * The formula language and the form rules have the same exposure, and the
   * clock in these two is late in the local evening -- the window where a UTC
   * reading and a local one fall on different days.
   */
  check('"THREE DAYS LEFT" IS STILL THREE AT HALF PAST ELEVEN IN +05:30', tz.daysUntil, 3);
  check('and the same first thing in the morning', tz.daysUntilEarly, 3);
  check('today is still zero days away late at night', tz.todayIsZero, 0);
  check('A BOOKING MADE LATE AT NIGHT FOR TOMORROW IS NOT REFUSED', tz.tomorrowIsAllowed, null);
  /**
   * The discriminating one, and it took a failed control to find: "tomorrow is
   * allowed" passes under either reading, because a UTC midnight is only ever
   * more permissive. Asking whether TODAY is refused is the question where they
   * differ -- and getting that wrong lets somebody book a slot that has already
   * started.
   */
  check('AND ONE FOR TODAY IS STILL REFUSED, which is where the two readings differ',
    tz.todayIsRefused, true);

  /**
   * The export, which is where being right to the millisecond is most clearly
   * wrong to the person: a builder downloads their bookings and reads a day
   * that is not the day they picked.
   */
  check('A DATE EXPORTS AS THE DAY THAT WAS PICKED, NOT THE INSTANT IT STORES AS',
    tz.csv, '2026-08-20,Ada');

  /**
   * The last link, and the only one a stranger sees: picked, stored, exported,
   * shown. Reading UTC parts here shows a visitor the 19th for a booking on the
   * 20th, on the published page itself.
   */
  check('A VISITOR IS SHOWN THE DAY THAT WAS PICKED', tz.shown, '<p>20 Aug 2026</p>');
  check('and a countdown in markup agrees with it', tz.shownInCalc, '<p>3</p>');
  check('A TABLE CELL AND A LIST ROW SHOW THE PICKED DAY TOO', tz.cell, '20 Aug 2026');

  /**
   * ONE PATH, NOT TWO. A Database cell built the date locally; a visitor's form
   * field went through toDate and got UTC midnight. The same date picked in the
   * two places was stored as two different instants, and in some timezones as
   * two different days. Neither was wrong alone; having both was.
   */
  check('A FORM FIELD AND A TABLE CELL STORE THE SAME DATE IDENTICALLY',
    coerceForColumn('2026-08-20', { name: 'Due', type: 'date' }),
    dateInputToIso('2026-08-20'));
  check('and a picker value round-trips through the column path too',
    isoToDateInput(coerceForColumn('2026-08-20', { name: 'Due', type: 'date' })), '2026-08-20');
  check('a value that already carries a time is left as the instant it says',
    isoDate('2026-08-20T15:00:00.000Z'), '2026-08-20T15:00:00.000Z');
  check('only the exact bare shape takes the local reading',
    isoDate('20 Aug 2026').length > 0, true);
  // The source check that used to stand here is gone: shape-matching text
  // survived the break that mattered, so it was reassurance rather than
  // evidence. The probe above is the evidence.
  check('a stored date with a time on it still fills the picker',
    isoToDateInput('2026-08-17T23:30:00'), '2026-08-17');
  check('an empty picker stores nothing', dateInputToIso(''), '');
  check('and an empty store shows an empty picker', isoToDateInput(''), '');
  check('a round trip is stable, however many times it goes round',
    isoToDateInput(dateInputToIso(isoToDateInput(dateInputToIso('2026-01-01')))), '2026-01-01');
  check('the last day of a year does not roll over', isoToDateInput(dateInputToIso('2026-12-31')), '2026-12-31');
  check('nor the first', isoToDateInput(dateInputToIso('2026-01-01')), '2026-01-01');

  /**
   * And the point of the whole exercise: the date functions read a stored date
   * without anybody having to think about its shape.
   */
  const stored = dateInputToIso('2026-08-20');
  check('THE FORMULA LANGUAGE READS A STORED DATE DIRECTLY',
    evaluateExpression('daysUntil(Due)', { Due: stored }, undefined, { now: new Date(2026, 7, 17, 14, 0) }),
    3);
  check('and a repeater can filter on one',
    rowMatchesFormula({ Due: stored }, '{{Due}} != ""').pass, true);

  const dbSrc = readFileSync('src/blocks/DatabaseBlock.tsx', 'utf8');
  check('the table gives a real date picker, not a text box',
    dbSrc.includes('type="date"'), true);
  const inspSrc = readFileSync('src/blocks/DatabaseBlock.inspector.tsx', 'utf8');
  check('and the column type can actually be chosen',
    inspSrc.includes('COLUMN_TYPE_LABELS'), true);
  check('every type has a name a person can read',
    Object.keys(COLUMN_TYPE_LABELS).sort(), ['boolean', 'date', 'number', 'text']);

  /**
   * SIXTH DRIFT. The published table decided for itself how to show a cell, and
   * the only branch it knew about was boolean -- so a date column showed a
   * visitor "2026-08-17T00:00:00.000Z". Both renderers now ask the same
   * function.
   */
  check('A DATE IS READABLE TO A VISITOR, NOT AN ISO TIMESTAMP',
    displayCell('2026-08-17T00:00:00.000Z', 'date'), '17 Aug 2026');
  check('a boolean still reads as a word', [displayCell(true, 'boolean'), displayCell(false, 'boolean')], ['Yes', 'No']);
  check('an empty cell is empty, not "No"', displayCell('', 'text'), '');
  check('and an empty date column is empty too', displayCell('', 'date'), '');
  check('a number is itself', displayCell(42, 'number'), '42');
  check('AN UNREADABLE DATE IS SHOWN AS STORED, so a visitor can report what they see',
    displayCell('not a date', 'date'), 'not a date');
  check('a column with no declared type is text', displayCell('hello', undefined), 'hello');

  const pubSrc = readFileSync('src/components/PublishedRenderer.tsx', 'utf8');
  check('THE PUBLISHED TABLE NO LONGER HAS ITS OWN OPINION',
    pubSrc.includes('displayCell(cellVal, col.type)'), true);
  check('and does not still carry the old branch beside it',
    /col\.type === 'boolean'\s*\)?\s*display/.test(pubSrc), false);
}


group('a form can insist on a real date');
{
  /**
   * THE HOLE THE DATE COLUMN OPENED. A column stores what it can read and
   * blanks anything else, so a visitor typing "tomorrow" into a booking form
   * had their answer silently dropped: the row saved, the field was empty, and
   * nobody was told. Adding the column without adding this is what created
   * that, so the two belong together.
   */
  const NOW_V = new Date(2026, 7, 17, 12, 0);
  const say = (value: any, rules: any[]) =>
    validateValue(value, rules, { fieldName: 'Booking date', now: NOW_V });

  check('a real date passes', say('2026-08-20', [{ type: 'date' }]), null);
  check('and one typed the way people type dates', say('20 Aug 2026', [{ type: 'date' }]), null);
  check('SOMETHING THAT IS NOT A DATE IS CAUGHT INSTEAD OF SILENTLY DROPPED',
    say('tomorrow', [{ type: 'date' }]), 'Booking date must be a date');
  check('a blank is left to the required rule, as every other rule does',
    say('', [{ type: 'date' }]), null);
  check('and required still catches it when it should',
    say('', [{ type: 'required' }, { type: 'date' }]), 'Booking date is required');

  /**
   * `today` as the limit, because "must be in the future" is what a booking
   * form is actually for -- and writing it as a date would mean the builder
   * editing the form every morning.
   */
  const future = [{ type: 'dateAfter', value: 'today' }];
  check('a date in the future passes', say('2026-08-20', future), null);
  check('one in the past does not', say('2026-08-10', future), 'Booking date must be in the future');
  check('THE MESSAGE SAYS WHAT A PERSON WOULD SAY, not "after today"',
    say('2026-08-10', future), 'Booking date must be in the future');
  check('today itself is not in the future, which is the answer somebody wants for a booking',
    say('2026-08-17', future) !== null, true);

  const past = [{ type: 'dateBefore', value: 'today' }];
  check('and the other way round', say('2026-08-10', past), null);
  check('with its own wording', say('2026-08-20', past), 'Booking date must be in the past');

  const window_ = [{ type: 'dateAfter', value: '2026-09-01' }, { type: 'dateBefore', value: '2026-09-30' }];
  check('two rules make a window', say('2026-09-15', window_), null);
  check('and the near edge is named', say('2026-08-20', window_), 'Booking date must be after 2026-09-01');
  check('as is the far one', say('2026-10-05', window_), 'Booking date must be before 2026-09-30');

  /**
   * A rule whose OWN value cannot be read PASSES, the same direction `pattern`
   * already goes: refusing every visitor because the builder typed "nextt week"
   * is a far worse bug than accepting a date that is slightly too early.
   */
  check('A BUILDER TYPO IN THE RULE DOES NOT LOCK EVERYBODY OUT',
    say('2026-08-20', [{ type: 'dateAfter', value: 'nextt week' }]), null);
  check('nor an empty limit', say('2026-08-20', [{ type: 'dateAfter', value: '' }]), null);
  // But a visitor's unreadable answer against a good rule is still refused.
  check('while a visitor answer that is not a date still fails the comparison',
    say('whenever', [{ type: 'dateAfter', value: 'today' }]) !== null, true);

  check('the builder’s own wording still wins',
    say('2026-08-10', [{ type: 'dateAfter', value: 'today', message: 'Pick a day from tomorrow onwards' }]),
    'Pick a day from tomorrow onwards');

  /**
   * The rule list is what the inspector draws from, so a rule missing there is
   * a rule nobody can add -- shipped and unreachable.
   */
  const listed = RULE_TYPES.map((r: any) => r.type);
  check('ALL THREE CAN ACTUALLY BE PICKED IN THE INSPECTOR',
    ['date', 'dateAfter', 'dateBefore'].every(t => listed.includes(t)), true);
  check('and the two that need a limit say so',
    RULE_TYPES.filter((r: any) => r.type === 'dateAfter' || r.type === 'dateBefore')
      .every((r: any) => r.needsValue), true);
  check('while the plain one does not ask for a value',
    RULE_TYPES.find((r: any) => r.type === 'date')?.needsValue, false);
  check('and the hint tells a builder that today is allowed there',
    (RULE_TYPES.find((r: any) => r.type === 'dateAfter')?.hint || '').includes('today'), true);
}


group('a row that was not saved does not stay on the page');
{
  /**
   * A visitor pressed Submit, watched their row appear, and nothing had been
   * stored. The insert was fired into the background and a failure logged a
   * warning: the count went up, the table filled in, the data was not there,
   * and neither they nor the builder had any way to know.
   *
   * Row limits (migration 0007) make that reachable on purpose rather than only
   * when the network fails, so it had to stop being silent first.
   */
  const rows = [{ id: 'r1', Name: 'Ada' }, { id: 'r2', Name: 'Bo' }, { id: 'r3', Name: 'Cy' }];
  check('the row that failed is taken back', withoutRow(rows, 'r2').map(r => r.id), ['r1', 'r3']);
  check('BY ID, NOT BY POSITION — other rows arrive while an answer is in flight',
    withoutRow(rows, 'r1').map(r => r.id), ['r2', 'r3']);
  check('taking back one that is already gone changes nothing',
    withoutRow(rows, 'nope').length, 3);
  check('and no rows at all is not a crash', withoutRow(undefined, 'r1'), []);

  /**
   * The messages a VISITOR reads. They are on somebody else's page, have done
   * nothing wrong, and can fix nothing — so the wording says what to do, not
   * what went wrong.
   */
  const tooFast = describeRowWriteError({ message: 'too many submissions in a short time', code: 'P0003' });
  check('a rate limit says to wait, not that they are blocked',
    tooFast.message.includes('Wait a moment'), true);
  check('and it is worth trying again', tooFast.retryable, true);

  const full = describeRowWriteError({ message: 'this page has reached its limit of collected rows', code: 'P0004' });
  check('A FULL FORM SAYS NOTHING WAS SAVED, which is the part that matters',
    full.message.includes('nothing was saved'), true);
  check('and gives the visitor something useful to do about it',
    full.message.includes('site owner'), true);
  check('trying again would not help, so it does not say to',
    full.retryable, false);

  const offline = describeRowWriteError({ message: 'Failed to fetch' });
  check('a network failure is retryable', offline.retryable, true);
  check('and admits nothing was saved', offline.message.includes('not saved'), true);

  const denied = describeRowWriteError({ message: 'not allowed', code: '42501' });
  check('a refusal does not invite a retry that will fail the same way', denied.retryable, false);
  check('an unknown failure is passed on rather than swallowed',
    describeRowWriteError({ message: 'deadlock detected' }).message.includes('deadlock detected'), true);

  /**
   * The engine has to actually do it, not just be able to.
   */
  const engineSrc = readFileSync('src/lib/bindingEngine.ts', 'utf8');
  /**
   * A SOURCE COUNT, and the reason is worth stating: the engine imports
   * supabase directly, so this path cannot be driven headless — there is no
   * seam to hand it a failing client. What can be checked is that BOTH failure
   * branches (the rejected promise and the thrown call) take the row back, in
   * both the rows list and the recomputed output. Four call sites.
   *
   * The first version of this check used `includes` and a control proved it
   * hollow: removing one of the four left the others matching, and it stayed
   * green.
   */
  check('THE ADD-ROW PATH TAKES THE ROW BACK ON FAILURE, IN BOTH BRANCHES',
    (engineSrc.match(/withoutRow\(now\?\.rows, rowId\)/g) || []).length, 4);
  check('and puts the reason where a person can see it',
    /error: failure\.message/.test(engineSrc), true);
  check('and no longer just logs and carries on',
    engineSrc.includes('falling back to local state'), false);

  /**
   * And the duplicate that caused a separate bug: this coercion was a copy of
   * coerceForColumn written before it existed, so when a `date` column type was
   * added the shared function learned about it and the copy did not.
   */
  /**
   * ALL THREE COPIES. The check that used to stand here named one and caught
   * three: addRow's, updateRow's, and the one updateRow uses for what it sends
   * to the SERVER -- which could disagree with what it had already shown on the
   * page. Counting them is the point; naming one would have let the other two
   * stay.
   */
  check('EVERY ROW-WRITING ACTION USES THE SHARED COERCION',
    (engineSrc.match(/coerceForColumn\(evaluatedValue, col\)/g) || []).length, 3);
  check('and no copy of it is left anywhere in the engine',
    /evaluatedValue = evaluatedValue === 'true' \|\| evaluatedValue === true;/.test(engineSrc), false);
  check('nor the number half of it',
    /const num = Number\(evaluatedValue\)/.test(engineSrc), false);

  /**
   * And the same sweep for silence. A delete that would not land used to leave
   * the row gone from the page: the builder watched it disappear, the row was
   * still in the database, and it came back on the next reload with no
   * explanation.
   */
  check('A DELETE THAT DID NOT LAND PUTS THE ROW BACK',
    engineSrc.includes('restoreRow(row, describeRowWriteError(error).message)'), true);
  check('an update that did not land at least says so',
    /error: describeRowWriteError\(updateError\)\.message/.test(engineSrc), true);
  /**
   * Counting rather than naming, again. This found a THIRD silence the first
   * two checks missed, and the quietest of them: updateRow reads the rows in
   * order to merge onto them, so a failure there meant the update never reached
   * the server at all. The page showed the change and the database never heard
   * about it.
   */
  check('NOTHING IN THE ENGINE STILL JUST WARNS AND CARRIES ON ABOUT A ROW',
    (engineSrc.match(/console\.warn\('\[Supabase execute info\]/g) || []).length, 0);
  check('and the read that updateRow depends on reports its own failure',
    /describeRowWriteError\(selectError\)/.test(engineSrc), true);

  /**
   * THE EDITOR'S OWN TABLE HAD THE SAME THREE. A cell edit, a new row and a
   * delete each warned to the console and carried on: the builder saw the table
   * change, the database did not, and the next reload put it back with no
   * explanation. A console message is not telling somebody; it is telling
   * nobody.
   *
   * Counting again rather than naming, because naming one is how the other two
   * survived the first pass through the engine.
   */
  const blockSrc = readFileSync('src/blocks/DatabaseBlock.tsx', 'utf8');
  check('NO WRITE IN THE EDITOR TABLE STILL JUST WARNS AND CARRIES ON',
    (blockSrc.match(/console\.warn\('\[Supabase save info\]/g) || []).length, 0);
  check('and none of them swallows a thrown one either',
    (blockSrc.match(/console\.error\('Error (inserting|deleting|saving)/g) || []).length, 0);
  check('all three say what happened, where a person can see it',
    (blockSrc.match(/describeRowWriteError/g) || []).length >= 5, true);
  /**
   * COUNTED, not matched. Each of these has two failure branches -- the
   * rejected call and the thrown one -- and a control proved that `includes`
   * stays green when one of them is removed, because the other still matches.
   * Third time that exact hollow check has been written in this file.
   */
  check('a row that would not be stored comes off the table, in both branches',
    (blockSrc.match(/withoutRow\(current\?\.rows \|\| \[\], rowId\)/g) || []).length, 2);
  check('and one that would not delete comes back, in both branches',
    (blockSrc.match(/restoreDeletedRow\(doomedRow/g) || []).length, 2);
  /**
   * Except a cell edit, deliberately: by the time a debounced save answers, the
   * builder has typed on, and yanking the cell back under their cursor would
   * lose what they wrote since.
   */
  check('A CELL EDIT IS NOT ROLLED BACK, WHICH IS THE ONE EXCEPTION',
    /debouncedSaveRef[\s\S]{0,900}reportWriteFailure\(error\)/.test(blockSrc), true);
  check('and the reason for that exception is written down',
    blockSrc.includes('would lose'), true);
  // Loading is still allowed to fall back quietly: nothing was written, so
  // nothing is being misreported.
  check('reading rows may still fall back quietly, since nothing was written',
    blockSrc.includes('[Supabase load info]'), true);

  /**
   * AND SOMETHING HAS TO RENDER IT.
   *
   * Every branch above sets `error` on the block — and nothing displayed it.
   * That is the shipped-and-unreachable failure this file checks for
   * everywhere else, committed by the same hand that was checking for it, and
   * it took asking "does anything read this?" rather than reading the diff.
   *
   * Both renderers, because the visitor is the one whose submission was
   * refused and the only one who can try again.
   */
  check('THE EDITOR SHOWS WHAT DID NOT SAVE', /runtimeState\?\.error && \(/.test(blockSrc), true);
  check('AND SO DOES THE PUBLISHED PAGE',
    /runtimeState\?\.error && \(/.test(readFileSync('src/components/PublishedRenderer.tsx', 'utf8')), true);
  check('and a write that works clears a stale message',
    (blockSrc.match(/if \(ok\?\.error\) store\.set\(atomInstance, \{ \.\.\.ok, error: null \}\)/g) || []).length, 2);
  check('so a workflow writing a date stores what a table cell would',
    coerceForColumn('2026-08-20', { name: 'Due', type: 'date' }),
    dateInputToIso('2026-08-20'));
}


group('a moment’s error is not saved into the page');
{
  /**
   * `error` holds "this did not save" and "that formula could not be worked
   * out" -- true for a moment, on one person's screen. Saved into the page it
   * becomes permanent: a network blip while the builder was working gets
   * written into the blob and served to every visitor afterwards, with nothing
   * to clear it because nothing re-runs the thing that set it.
   *
   * The same shape as the bug that published `dsad` and `321dsa` on a live
   * feedback form for months. Missed until row-writes started using the field.
   */
  const transient = {
    value: 5,
    blockName: 'Orders',
    error: 'Could not reach the server, so this was not saved.',
    validationError: 'Name is required',
    touched: true,
    loading: true,
    fetchError: 'nope',
    uploadError: 'nope',
    rows: [{ id: 'r1' }],
  };
  const saved = withoutVisitorState(transient as any, 'databaseBlock');

  check('A FAILURE MESSAGE IS NOT WRITTEN INTO THE PAGE', 'error' in saved, false);
  check('and neither are the others that were already stripped',
    ['validationError', 'touched', 'fetchError', 'uploadError'].some(k => k in saved), false);
  check('loading is reset rather than removed, as it always was', saved.loading, false);
  check('and the things that ARE the page survive',
    [saved.value, saved.blockName], [5, 'Orders']);

  /**
   * COLLECTED ROWS ARE NOT PART OF THE PAGE EITHER.
   *
   * They live in `database_rows`, which is where every renderer reads them
   * from. The copy inside the page was a second store of the same data, and the
   * page blob is written WHOLE by autosave 500ms after every keystroke -- so a
   * table with 500 rows was stored twice and re-uploaded on every pause for
   * thought. On free infrastructure, which is the condition this project runs
   * under, that is the largest avoidable cost in the product.
   */
  check('A TABLE’S ROWS ARE NOT WRITTEN INTO THE PAGE', 'rows' in saved, false);
  check('and a block that has none is unaffected',
    'rows' in withoutVisitorState({ value: 1, blockName: 'Count' } as any, 'numberDisplayBlock'), false);
}


group('the List block is drawn once, not twice');
{
  /**
   * SEVENTH DRIFT, and this one was in BOTH copies at the same time.
   *
   * The List block's rows were duplicated character for character between the
   * editor and the published renderer, down to the `String(colVal)` -- so a
   * date column read "2026-08-19T18:30:00.000Z" and a boolean read "true", to
   * a builder and a visitor alike. Fixing one copy would have fixed it for one
   * of them, which is how a divergence starts.
   *
   * The copies are gone. Both call the editor's component, and it uses the same
   * displayCell rule the two database tables use.
   */
  const listSrc = readFileSync('src/blocks/ListBlock.tsx', 'utf8');
  const pubSrc = readFileSync('src/components/PublishedRenderer.tsx', 'utf8');

  check('the editor draws its rows through the shared component',
    listSrc.includes('<ListRowsView'), true);
  check('AND SO DOES THE PUBLISHED PAGE', pubSrc.includes('<ListRowsView'), true);
  check('THE COPY IS GONE, not kept in step by hand',
    pubSrc.includes("filter(([key]) => key !== 'id')"), false);
  check('and the raw stringify with it',
    /<span style=\{\{ color: '#0f172a' \}\}>\{String\(colVal\)\}/.test(listSrc + pubSrc), false);
  check('and the component decides nothing about a value itself',
    /displayCell\(/.test(listSrc), false);
  check('the shared component asks rows.ts what a line reads as',
    listSrc.includes('listRowLines(row, columns)'), true);

  /**
   * AND NOW THE BEHAVIOUR, not the shape.
   *
   * Three controls proved the source checks above were nearly worthless on
   * their own: breaking the component's rendering left every behavioural check
   * green, because they all called `displayCell` directly rather than going
   * through anything the component uses. A component cannot be imported here at
   * all -- Node's type-stripping does not read `.tsx` -- so the DECISIONS moved
   * out to rows.ts where they can actually be run.
   */
  const line = listRowLines(
    { id: 'r1', Due: '2026-08-20T12:00:00.000Z', Paid: true, Who: 'Ada' },
    [{ name: 'Due', type: 'date' }, { name: 'Paid', type: 'boolean' }, { name: 'Who', type: 'text' }],
  );
  check('a row becomes one line per field', line.map(l => l.name), ['Due', 'Paid', 'Who']);
  check('THE ROW ID IS NOT A FIELD SOMEBODY TYPED, so it is not shown',
    line.some(l => l.name === 'id'), false);
  check('A DATE READS LIKE A DATE', line[0].text, '20 Aug 2026');
  check('a boolean reads like a word', line[1].text, 'Yes');
  check('and text is itself', line[2].text, 'Ada');

  check('a column the tracked table does not declare reads as text',
    listRowLines({ id: 'r1', Extra: 'x' }, [{ name: 'Due', type: 'date' }])[0].text, 'x');
  check('no columns at all is still readable',
    listRowLines({ id: 'r1', Who: 'Ada' }, undefined).map(l => l.text), ['Ada']);
  check('a row with nothing but an id has no lines',
    listRowLines({ id: 'r1' }, []), []);
  check('and no row at all is not a crash', listRowLines(null, []), []);

  check('tracking nothing is empty', listIsEmpty([{ id: 'r1' }], ''), true);
  check('holding nothing is empty too', listIsEmpty([], 'databaseBlock__x'), true);
  check('and holding something is not', listIsEmpty([{ id: 'r1' }], 'databaseBlock__x'), false);
  check('nor is a missing rows array a crash', listIsEmpty(undefined, 'databaseBlock__x'), true);

  /**
   * Which means a List now shows what a table shows. That is the property that
   * matters, and it is the one that was false in both places at once.
   */
  /**
   * Deliberately a value that reads the same in every timezone. The first
   * version of this used the instant a +05:30 picker actually stores
   * (2026-08-19T18:30Z, which is the 20th there) and failed here, in a runner
   * whose clock is UTC -- the exact trap this file documents two groups above.
   * The timezone-dependent half lives in tz-probe.ts, where it can be true.
   */
  check('A DATE IN A LIST READS LIKE A DATE, not an ISO timestamp',
    displayCell('2026-08-20T12:00:00.000Z', 'date'), '20 Aug 2026');
  check('and a boolean reads like a word', displayCell(true, 'boolean'), 'Yes');
  check('a column the tracked table does not declare still reads as text',
    displayCell('anything', undefined), 'anything');
}


group('the history chart is measured once, and measured honestly');
{
  /**
   * EIGHTH DRIFT. Forty lines of arithmetic written out twice, once in the
   * editor's block and once in the published renderer -- and arithmetic is the
   * worst thing to keep in two places. A rendering difference is visible; a
   * geometry difference is a chart that is subtly wrong in one of them, which
   * nobody notices, because a bar an eighth too tall still reads as data.
   *
   * It was also entirely unchecked in both.
   */
  const box = { width: 100, height: 50, padding: 4 };

  check('no history, no bars', chartBars([], box), []);
  check('and nothing at all is not a crash', chartBars(undefined, box), []);
  check('one value fills the width', chartBars([5], box)[0].width, 100);
  check('bars share the width, with a gap between them',
    chartBars([1, 2, 3], box).map(b => Math.round(b.width * 100) / 100),
    [32, 32, 32]);
  check('and they are laid out left to right',
    chartBars([1, 2, 3], box).map(b => Math.round(b.x)), [0, 34, 68]);

  /**
   * ZERO IS ALWAYS IN RANGE. Without it a chart of 100, 101, 102 draws as a
   * full-height cliff and reads as a tripling -- the classic way to make a
   * chart lie without writing a single wrong number.
   */
  const flat = chartBars([100, 101, 102], box);
  check('A NEARLY FLAT SERIES DRAWS AS NEARLY FLAT, not as a cliff',
    Math.max(...flat.map(b => b.height)) - Math.min(...flat.map(b => b.height)) < 2,
    true);
  check('and the tallest bar is close to full height, since 102 is near the top',
    flat[2].height > 35, true);

  /**
   * A bar is never thinner than 2px, so a zero is a visible line. "No bar" and
   * "a bar of zero" mean different things.
   */
  check('A ZERO IS STILL A LINE, not nothing at all', chartBars([0, 10], box)[0].height, MIN_BAR_HEIGHT);
  check('and it sits on the baseline', chartBars([0, 10], box)[0].y <= box.height, true);

  /**
   * Negatives hang BELOW the baseline. Flipping them up would draw a fall as a
   * rise, which is worse than not drawing it at all.
   */
  const mixed = chartBars([10, -10], box);
  check('a fall is marked as a fall', mixed.map(b => b.negative), [false, true]);
  check('AND IT HANGS BELOW WHERE THE RISE STARTS, rather than being flipped up',
    mixed[1].y > mixed[0].y, true);
  check('every bar stays inside the box',
    chartBars([10, -10, 3], box).every(b => b.y >= -1 && b.y + b.height <= box.height + 1), true);

  check('a value that is not a number is left out rather than drawn as NaN',
    chartBars([1, NaN as any, Infinity as any, 2], box).length, 2);

  /**
   * And both renderers ask for it rather than working it out.
   */
  const chartSrc = readFileSync('src/blocks/HistoryChartBlock.tsx', 'utf8');
  const pubChartSrc = readFileSync('src/components/PublishedRenderer.tsx', 'utf8');
  check('the editor asks for the geometry', chartSrc.includes('chartBars(history'), true);
  check('AND SO DOES THE PUBLISHED PAGE', pubChartSrc.includes('chartBars(history'), true);
  check('NEITHER STILL WORKS IT OUT ITSELF',
    /const baselineY = /.test(chartSrc + pubChartSrc), false);
  check('nor keeps half of it', /const barPadding = /.test(chartSrc + pubChartSrc), false);
}


group('a timer behaves the same while building and once published');
{
  /**
   * NINTH DRIFT, and the one that mattered most. A Timer's whole behaviour --
   * auto-start, ticking, countdown versus interval, when onTick and onComplete
   * fire, when it stops itself -- was written out twice.
   *
   * It is the only block that acts ON ITS OWN, so a divergence here is not
   * cosmetic: it means a workflow that fires on a published page and not while
   * building it, or the other way round, with nothing on screen to say so. The
   * builder tests it, it works, and it does something else for a visitor.
   */
  const countdown = (from: number) => timerStep(from, 'countdown');

  check('a countdown counts down', countdown(10).next, 9);
  check('and ticks on the way', countdown(10).tick, true);
  check('without finishing early', [countdown(10).complete, countdown(10).stop], [false, false]);

  const last = countdown(1);
  check('THE LAST SECOND FIRES BOTH onTick AND onComplete',
    [last.tick, last.complete], [true, true]);
  check('and stops the timer itself', last.stop, true);
  /**
   * `countdown(1)` proves nothing about the floor: 1 - 1 is 0 whether or not
   * anything clamps it. A control found that -- it broke the clamp and this
   * check stayed green while the one below went red. The discriminating case is
   * a timer that is somehow already at or below zero, which is what a paused
   * and re-run countdown can be.
   */
  check('the last second lands on zero', last.next, 0);
  check('AND SO DOES ONE ALREADY AT ZERO, which is the case that needs the clamp',
    [countdown(0).next, countdown(0).stop], [0, true]);
  check('and one somehow below it', countdown(-3).next, 0);

  const interval = timerStep(7, 'interval');
  check('an interval counts up', interval.next, 8);
  check('and ticks', interval.tick, true);
  check('AND NEVER COMPLETES, because it is not counting towards anything',
    [interval.complete, interval.stop], [false, false]);

  check('a stopped countdown shows its full duration', timerResetValue('countdown', 30), 30);
  check('and a stopped interval shows nothing yet', timerResetValue('interval', 30), 0);

  /**
   * Both renderers ask for the behaviour rather than having their own.
   */
  const timerSrc = readFileSync('src/blocks/TimerBlock.tsx', 'utf8');
  /**
   * Only the timer's own component, not the whole file. The first version of
   * this scanned all of PublishedRenderer and went red on the DATA SOURCE
   * block's refresh interval -- a setInterval that is entirely correct and has
   * nothing to do with timers. A check that reads too widely reports a fault
   * that is not there, which costs the same trust as missing one that is.
   */
  const wholePub = readFileSync('src/components/PublishedRenderer.tsx', 'utf8');
  const timerStart = wholePub.indexOf('function PublishedTimerBlock');
  const pubTimerSrc = wholePub.slice(timerStart, wholePub.indexOf('\nfunction ', timerStart + 10));
  check('the timer component was actually found, or the rest of this proves nothing',
    timerStart > 0 && pubTimerSrc.length > 200, true);
  check('the editor uses the shared timer', timerSrc.includes('useTimer({'), true);
  check('AND SO DOES THE PUBLISHED PAGE', pubTimerSrc.includes('useTimer({'), true);
  check('NEITHER STILL RUNS ITS OWN CLOCK',
    /setInterval\(/.test(timerSrc + pubTimerSrc), false);
  check('nor fires its own events',
    (timerSrc + pubTimerSrc).includes("executeWorkflow(block.id, 'onTick'"), false);

  /**
   * The one difference that is meant to be there: the editor asks for a save
   * when the running state changes, and the published page does not, because a
   * visitor pressing play must not write to somebody else's page.
   */
  /**
   * THE HOOK SUBSCRIBES, rather than reading the value once.
   *
   * A source check, and the reason is the same as everywhere else here: a hook
   * cannot be run by this suite. But the decision is worth pinning, because the
   * first version read `store.get(...)` and WORKED -- only because both callers
   * happened to subscribe to the same atom themselves for their styling, so the
   * component re-rendered and the hook re-read on the way past.
   *
   * That is a trap rather than a bug. It works today and stops working the
   * moment somebody uses the hook in a component that does not separately
   * subscribe: the timer would never notice it had been started, and nothing on
   * screen would say why.
   */
  const hookSrc = readFileSync('src/lib/useTimer.ts', 'utf8');
  check('THE TIMER HOOK SUBSCRIBES TO ITS BLOCK, IT DOES NOT READ IT ONCE',
    /useAtomValue\(blockRuntimeAtom\(blockId\), \{ store \}\)/.test(hookSrc), true);
  check('and does not fall back to a bare read for the state it watches',
    /const runtimeState = store\.get\(/.test(hookSrc), false);

  check('THE EDITOR SAVES WHEN THE TIMER CHANGES', timerSrc.includes('onStateChanged'), true);
  check('AND THE PUBLISHED PAGE DELIBERATELY DOES NOT',
    /useTimer\(\{ blockId: block\.id, store \}\)/.test(pubTimerSrc), true);
  check('and the data source block keeps its own refresh, which is not a timer',
    /setInterval\(run, secs \* 1000\)/.test(wholePub), true);
}


group('the editor and the published page are not drifting apart again');
{
  /**
   * NINE SEPARATE BUGS IN THIS PROJECT HAVE BEEN THE SAME BUG: a decision made
   * in two places that stopped agreeing. Each was found by hand, months apart,
   * and each was invisible until somebody happened to look at both copies at
   * once -- a chart drawn to different arithmetic, a timer firing different
   * events, a cell shown raw on one side and formatted on the other.
   *
   * Finding the tenth by hand is not a plan. This measures the surface, so a
   * new copy has to be argued for rather than merely not noticed.
   *
   * A BUDGET, NOT A TARGET OF ZERO. Two boxes with the same rounded corners are
   * the same on purpose, and pulling every matching style into a shared
   * component would make both harder to read for no gain. What is left is
   * presentation; the arithmetic, the events, the formatting and the row
   * selection have all been pulled out.
   *
   * IT MAY SHRINK. IT MAY NOT GROW without somebody deciding it should — and
   * changing this number is that decision, made where it can be seen in a diff.
   */
  const BUDGET = 131;

  const runs = duplicatedRuns();
  const total = duplicatedLineCount();

  check('THE EDITOR IS NOT BEING COPIED INTO THE PUBLISHED RENDERER AGAIN',
    total <= BUDGET, true);
  // Reported, not silent: a budget nobody can see the shape of is a number
  // that drifts upward one line at a time.
  if (total !== BUDGET) {
    say(`        (duplication now ${total} lines across ${runs.length} runs; budget ${BUDGET})`);
  }

  check('and the scan is actually finding things, or the budget proves nothing',
    runs.length > 0, true);
  check('the biggest remaining copy is presentation, not a decision',
    runs[0].lines <= 24, true);

  /**
   * The four that were pulled out, named so a future reader can tell what the
   * remaining lines are NOT. Each of these was a real bug, in both copies or
   * about to be.
   */
  const stillCopied = runs.map(r => r.file);
  check('the timer’s behaviour is no longer among them',
    stillCopied.filter(f => f === 'TimerBlock.tsx').length <= 1, true);
  check('nor the chart’s arithmetic',
    runs.some(r => r.starts.includes('baselineY') || r.starts.includes('maxVal')), false);
  check('nor the list’s rows', runs.some(r => r.starts.includes("key !== 'id'")), false);
  check('nor how a cell is displayed', runs.some(r => r.starts.includes('String(colVal)')), false);
}


group('this audit still describes the product');
{
  /**
   * CAPABILITIES.md counts what exists. It was written on 13 Aug and by 19 Aug
   * it named three things as missing that had all shipped -- page parameters,
   * more input types, a date picker -- so for six days the project's own
   * planning document pointed at work that was already done. Its opening
   * paragraph warns about exactly that, which is the whole problem with a
   * document that can only be checked by reading it.
   *
   * So the numbers are asserted here. Adding a block type or an action without
   * updating the file turns this red, and updating the file is then a line in a
   * diff rather than something somebody has to remember.
   *
   * ONLY THE COUNTS. Whether "a blog is possible now" is true is a judgement
   * about a walk through a real site, and no check can hold that up -- Part 5 of
   * the file says so in its own words.
   */
  const audit = readFileSync('docs/CAPABILITIES.md', 'utf8');
  const claims = (label: string): number | null => {
    const m = new RegExp(`\\*\\*([\\d,]+) ${label}`).exec(audit);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  };

  check('THE AUDIT COUNTS THE BLOCK TYPES THAT EXIST',
    claims('block types'), Object.keys(BLOCK_DISPLAY_NAMES).length);
  check('and the validation rules', claims('validation rules'), AUDIT_RULES.length);
  check('and the formula functions',
    claims('formula functions'),
    FORMULA_FUNCTION_NAMES.length + TABLE_FUNCTION_NAMES.length + DATE_FUNCTION_NAMES.length);
  check('and the column types', claims('column types'), Object.keys(COLUMN_TYPE_LABELS).length);
  check('and the migrations',
    claims('migrations'), readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).length);

  // The workflow actions come from a type union, so they are read from source.
  const creoraTypes = readFileSync('src/types/creora.ts', 'utf8');
  const actionSlice = creoraTypes.slice(
    creoraTypes.indexOf('  action:'),
    creoraTypes.indexOf("| 'setEnabled';") + 20,
  );
  const actionCount = new Set(Array.from(actionSlice.matchAll(/'([a-zA-Z]+)'/g)).map(m => m[1])).size;
  check('the action slice was actually found, or the count below proves nothing',
    actionCount > 10, true);
  check('and the audit counts the workflow actions', claims('workflow actions'), actionCount);

  /**
   * The checks figure too, because "held up by N checks and by nothing on the
   * real domain" is the sentence that keeps this honest -- and a stale N is the
   * first sign nobody re-ran it.
   */
  const claimedChecks = claims('runnable checks');
  check('the audit knows roughly how many checks hold it up',
    claimedChecks !== null && Math.abs(claimedChecks - passed) < 60, true);

  /**
   * And the three things the last audit got wrong by going stale. Naming them
   * means the same rot is visible rather than merely absent.
   */
  check('it no longer calls page parameters missing',
    /rank 1[\s\S]{0,200}[Pp]age parameters/.test(audit), false);
  check('nor the input types', audit.includes('More input types'), false);
  check('nor a date picker', /\| 10 \| \*\*Date and time picker/.test(audit), false);
}


group('two people cannot take the same slot');
{
  /**
   * THE HOLE THE THIRD AUDIT'S WALK FOUND. Booking gained dates, a picker and
   * "must be in the future" -- and nothing anywhere enforced that a value is
   * used once. Not a column, not a condition, not the database. A slot could be
   * booked twice, a ticket sold twice, a username claimed twice, and the page
   * showed both as successful because both were.
   *
   * A workflow cannot answer this. It can only check the rows the visitor's
   * BROWSER happens to hold, which is the wrong question asked of the wrong
   * copy.
   */
  const taken = describeRowWriteError({ message: 'that Slot is already taken', code: 'P0005' });
  check('a taken value is recognised', taken.message.includes('already taken'), true);
  check('AND THE COLUMN IS NAMED, or a visitor is guessing which of five fields to change',
    taken.message.includes('That Slot'), true);
  check('and it says nothing was saved', taken.message.includes('nothing was saved'), true);
  check('RETRYING THE SAME VALUE WOULD FAIL THE SAME WAY, so it does not invite one',
    taken.retryable, false);
  check('a message with no column name still reads',
    describeRowWriteError({ code: 'P0005', message: 'duplicate' }).message.includes('already taken'), true);

  /**
   * The migration is the enforcement, and the two things in it that make it a
   * guarantee rather than a hope.
   */
  const sql = readFileSync('supabase/migrations/0008_unique_columns.sql', 'utf8');
  check('THE RULE IS ENFORCED WHERE THE WRITE HAPPENS',
    /before insert on public\.database_rows/.test(sql), true);
  check('and on an update too, since changing a value into a taken one is the same collision',
    /before update of row_data on public\.database_rows/.test(sql), true);
  check('IT TAKES A LOCK, because check-then-insert is not a guarantee',
    sql.includes('pg_advisory_xact_lock'), true);
  check('keyed on the block, the column and the value, not on the whole table',
    /hashtext\(new\.database_block_id \|\| ':' \|\| v_name\)/.test(sql), true);
  check('a blank never collides, or an optional field could not be left empty twice',
    sql.includes("length(v_value #>> '{}') = 0"), true);
  check('and the lookup is indexed, or the guarantee slows down as a table fills',
    sql.includes('database_rows_block_idx'), true);

  /**
   * The row cap, and the arithmetic behind it -- because a number with no
   * reasoning attached gets raised by whoever hits it first.
   *
   * The free database is 500 MB. A row with a long message is about 2 KB, so a
   * cap of 10,000 bounds one abused page at roughly 4% of everything. The first
   * draft said 50,000, which is 100 MB -- a FIFTH of the allowance from a single
   * page -- and that number was chosen before anybody had looked the allowance
   * up.
   */
  const limits = readFileSync('supabase/migrations/0007_row_limits.sql', 'utf8');
  check('THE ROW CAP BOUNDS ONE PAGE TO A SMALL SHARE OF THE FREE DATABASE',
    /v_total constant integer := 10000;/.test(limits), true);
  check('and the arithmetic is written where somebody would change it',
    limits.includes('10000 x 2 KB'), true);
  check('with the allowance it was derived from, and the date it was checked',
    /500 MB \(supabase\.com\/pricing, checked/.test(limits), true);
  check('the per-minute cap still lets a room full of people submit at once',
    /v_per_minute constant integer := 60;/.test(limits), true);

  /**
   * And the builder can actually turn it on -- a rule nobody can reach is the
   * same as no rule.
   */
  const inspector = readFileSync('src/blocks/DatabaseBlock.inspector.tsx', 'utf8');
  check('THE CHECKBOX EXISTS, or the rule is unreachable',
    inspector.includes('handleToggleColumnUnique'), true);
  check('and it writes the flag the database reads',
    /\{ \.\.\.c, unique: used \}/.test(inspector), true);
  check('the column type carries it',
    readFileSync('src/types/creora.ts', 'utf8').includes('unique?: boolean'), true);
  check('and the panel says where it is enforced, not just what it does',
    inspector.includes('enforced in the DATABASE'), true);
}


group('a page that would cost money says so');
{
  /**
   * CREORA HAS TO RUN ON FREE INFRASTRUCTURE. That is the condition the project
   * is built under, and nothing in the code was measuring it.
   *
   * The page blob is written WHOLE by autosave, 500ms after every keystroke. Its
   * size is therefore not a storage question but a BANDWIDTH question multiplied
   * by how fast somebody types: a 3MB page is 3MB uploaded per pause for
   * thought, for the whole session, and nothing said so.
   */
  const small = { documentContent: { type: 'doc' }, runtimeStates: { a: { value: 1 } } };
  check('an ordinary page says nothing', verdictForPage(measurePage(small)).message, null);
  check('and saves', verdictForPage(measurePage(small)).save, true);

  const photo = 'data:image/png;base64,' + 'A'.repeat(700 * 1024);
  const withPhoto = {
    documentContent: { type: 'doc' },
    runtimeStates: {
      imageBlock__x: { blockName: 'Hero photo', value: photo },
      buttonBlock__y: { blockName: 'Submit', value: false },
    },
  };
  const heavy = measurePage(withPhoto);
  check('the biggest part is found', heavy.biggest?.name, 'imageBlock__x');
  check('AND WHY IT IS BIG, which is the only part anybody can act on',
    heavy.biggest?.reason, 'a picture pasted into the page instead of linked');

  const warn = verdictForPage(heavy, () => 'Hero photo');
  check('a heavy page still saves', warn.save, true);
  check('but it names the block', (warn.message || '').includes('Hero photo'), true);
  check('and says the cost is per keystroke, not per page',
    (warn.message || '').includes('every time you pause typing'), true);

  const huge = { runtimeStates: { imageBlock__x: { blockName: 'Hero', value: 'data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024) } } };
  const refuse = verdictForPage(measurePage(huge), () => 'Hero');
  check('A PAGE WITH A PHOTO INLINED IN IT IS REFUSED', refuse.save, false);
  check('and it says nothing was lost, because that is the fear',
    (refuse.message || '').includes('Nothing has been lost'), true);
  check('and that fixing it brings the save back',
    (refuse.message || '').includes('save again'), true);

  /**
   * The other thing that makes a page big, and the one nobody would guess:
   * collected rows were held in the block's state and saved with it.
   */
  const rows = Array.from({ length: 400 }, (_, i) => ({ id: `r${i}`, Name: 'Somebody', Note: 'x'.repeat(200) }));
  const withRows = measurePage({ runtimeStates: { databaseBlock__d: { blockName: 'Signups', rows } } });
  check('rows are named as the reason when they are the reason',
    withRows.biggest?.reason, '400 collected rows held inside the page');

  check('bytes are counted as UTF-8, which is what actually travels',
    byteLength('£'), 2);
  check('and an empty page is not a crash', measurePage({}).biggest, null);
  check('nor is nothing at all', measurePage(null).bytes >= 0, true);

  check('sizes read as sizes', [describeBytes(900), describeBytes(2048), describeBytes(3 * 1024 * 1024)],
    ['900 bytes', '2 KB', '3.0 MB']);

  /**
   * And the editor has to actually do it, and actually show it.
   */
  const appSrc = readFileSync('src/App.tsx', 'utf8');
  check('THE SAVE PATH MEASURES BEFORE IT WRITES', appSrc.includes('measurePage(blocksPayload)'), true);
  check('and stops when the verdict says stop', /if \(!verdict\.save\)/.test(appSrc), true);
  check('and a heavy-but-saving page is shown, not just logged',
    appSrc.includes('{pageWeight}'), true);
}


group('a builder can see what their page costs');
{
  /**
   * Creora runs on free infrastructure and a builder had NO WAY AT ALL to see
   * how close they were. The failure is not a bill -- it is a project that
   * pauses, or a page that stops loading, weeks after the decision that caused
   * it, with nothing connecting the two.
   */
  const photo = 'data:image/png;base64,' + 'A'.repeat(400 * 1024);
  const states: Record<string, any> = {
    imageBlock__hero: { blockName: 'Hero photo', value: photo },
    imageBlock__linked: { blockName: 'Logo', value: 'https://example.com/logo.png' },
    buttonBlock__go: { blockName: 'Submit', value: false },
  };
  const found = inlinedImages(Object.keys(states), id => states[id]);

  check('A PASTED PICTURE IS FOUND', found.map(f => f.blockId), ['imageBlock__hero']);
  check('and a linked one is not, which is the whole distinction',
    found.some(f => f.blockId === 'imageBlock__linked'), false);
  check('its size is measured, not guessed', found[0].bytes > 400 * 1024, true);
  check('nothing pasted, nothing reported', inlinedImages(['buttonBlock__go'], id => states[id]), []);
  check('and a missing block is not a crash', inlinedImages(['nope'], () => undefined), []);

  const lines = costLines({
    pageBytes: 900 * 1024,
    rowsOnThisPage: 42,
    pageCount: 3,
    inlined: found,
    nameOf: id => states[id]?.blockName || id,
  });
  const by = (label: string) => lines.find(l => l.label.startsWith(label));

  check('the page weight is shown as a size', by('This page weighs')?.value, '900 KB');
  check('AND WHAT MAKES IT EXPENSIVE, which is the part nobody would guess',
    by('This page weighs')?.advice?.includes('every time you pause typing'), true);
  check('and that visitors pay for it too', by('This page weighs')?.advice?.includes('every visitor'), true);
  check('a heavy page is marked as heavy', by('This page weighs')?.heavy, true);

  check('rows are counted', by('Rows on this page')?.value, '42');
  check('and pages', by('Pages in this project')?.value, '3');
  check('neither is treated as alarming on its own',
    [by('Rows on this page')?.heavy, by('Pages in this project')?.heavy], [false, false]);

  check('THE PASTED PICTURE NAMES ITS BLOCK, or somebody opens every block to find it',
    by('Picture pasted in')?.advice?.includes('"Hero photo"'), true);
  check('and says what to do instead', by('Picture pasted in')?.advice?.includes('Upload it instead'), true);

  const light = costLines({ pageBytes: 20 * 1024, rowsOnThisPage: 0, pageCount: 1, inlined: [], nameOf: id => id });
  check('a small page is not nagged about', light.find(l => l.label.startsWith('This page'))?.advice, null);
  check('and nothing is marked heavy', light.some(l => l.heavy), false);
  check('with no picture line at all', light.some(l => l.label.includes('Picture')), false);

  /**
   * THE LIMITS ARE DELIBERATELY NOT IN THE PRODUCT. They belong to somebody
   * else and they change -- and a number typed into a product goes stale
   * silently and then lies with confidence, which is exactly what this
   * project's own capability audit did for six days.
   */
  const costSrc = readFileSync('src/lib/pageCost.ts', 'utf8');
  const panelSrc = readFileSync('src/components/HealthPanel.tsx', 'utf8');
  check('NO FREE-TIER FIGURE IS HARD-CODED, because it would go stale and lie',
    /500\s*MB|5\s*GB|50,?000 monthly/i.test(costSrc + panelSrc), false);
  check('and the panel points at the dashboard that knows them',
    panelSrc.includes('Supabase dashboard'), true);
  check('the panel actually shows the lines', panelSrc.includes('cost.map'), true);
  check('and it measures the same shape the save writes, without the rows',
    /delete copy\.rows/.test(panelSrc), true);
}


group('a page left open does not spend the month');
{
  /**
   * THE BIGGEST REMAINING EGRESS LEAK. A Database block re-reads ALL its rows
   * every four seconds while the tab is visible -- `list_database_rows` has no
   * "only what changed", it returns everything. A table with a thousand rows is
   * about half a megabyte per poll, so a visitor sitting on the page for five
   * minutes costs roughly 37 MB against a free plan that includes 5 GB a month.
   * A hundred and thirty page-sits, from one block, with nobody doing anything
   * wrong.
   *
   * Most of those polls change nothing: a page open on a desk all afternoon
   * asks nine hundred times and gets the same answer nine hundred times.
   */
  let pace = startingPace();
  check('it starts fast, because something might be happening', pace.intervalMs, POLL_FAST_MS);

  /**
   * A few unchanged answers are tolerated before slowing -- a form being filled
   * in has gaps in it, and backing off on the first quiet second would make the
   * common case feel broken.
   *
   * COUNTED IN LITERALS, not in POLL_PATIENCE. The first version looped
   * `POLL_PATIENCE - 1` times, so lowering the constant to 1 changed the check
   * along with the code and it stayed green -- a check written in terms of the
   * thing it is checking cannot fail. A control found that; reading it would
   * not have.
   */
  pace = nextPace(pace, false);
  check('one quiet answer does not slow it down', pace.intervalMs, POLL_FAST_MS);
  pace = nextPace(pace, false);
  check('nor two, because a form being filled in has gaps in it',
    pace.intervalMs, POLL_FAST_MS);

  pace = nextPace(pace, false);
  check('AND THEN IT SLOWS, on the third', pace.intervalMs, POLL_FAST_MS * 2);
  pace = nextPace(pace, false);
  check('and keeps slowing, because ten seconds still and ten minutes still are not the same',
    pace.intervalMs, POLL_FAST_MS * 4);

  for (let i = 0; i < 20; i++) pace = nextPace(pace, false);
  check('IT NEVER STOPS, only slows — a table that gave up is worse than a slow one',
    pace.intervalMs, POLL_SLOW_MS);
  check('and the ceiling is still fast enough to catch up', POLL_SLOW_MS <= 60000, true);

  check('A CHANGE PUTS IT STRAIGHT BACK TO FAST', nextPace(pace, true).intervalMs, POLL_FAST_MS);
  check('and forgets how quiet it had been', nextPace(pace, true).quietRounds, 0);

  /**
   * The saving, stated plainly: an idle page goes from 900 requests an hour to
   * about 60.
   */
  const perHourFast = 3600000 / POLL_FAST_MS;
  const perHourSlow = 3600000 / POLL_SLOW_MS;
  check('an idle page asks far less often than it used to', perHourFast / perHourSlow >= 10, true);

  check('ids and count catch an arrival',
    rowsFingerprint([{ id: 'a' }]) !== rowsFingerprint([{ id: 'a' }, { id: 'b' }]), true);
  check('and a removal',
    rowsFingerprint([{ id: 'a' }, { id: 'b' }]) !== rowsFingerprint([{ id: 'a' }]), true);
  check('the same rows read the same', rowsFingerprint([{ id: 'a' }]), rowsFingerprint([{ id: 'a' }]));
  check('and nothing at all is not a crash', rowsFingerprint(undefined), '0:');

  /**
   * Both readers report whether the answer differed, and both treat a FAILURE
   * as "something changed" -- backing off from an unreachable server is backing
   * off from the one thing that needs retrying.
   */
  const dbSrc = readFileSync('src/blocks/DatabaseBlock.tsx', 'utf8');
  const pubSrc = readFileSync('src/components/PublishedRenderer.tsx', 'utf8');
  check('the editor’s table says whether anything changed', /return changed;/.test(dbSrc), true);
  check('AND SO DOES THE PUBLISHED ONE', /return changed;/.test(pubSrc), true);
  check('a failure does not slow the poll down in either',
    (dbSrc.match(/return true;/g) || []).length >= 2 && (pubSrc.match(/return true;/g) || []).length >= 2, true);

  const hookSrc = readFileSync('src/hooks/usePollWhileVisible.ts', 'utf8');
  check('the hook follows the pace rather than a fixed interval',
    hookSrc.includes('pace.current.intervalMs'), true);
  check('and still pauses when the tab is hidden',
    hookSrc.includes("document.visibilityState !== 'visible'"), true);
  check('COMING BACK TO THE TAB STARTS FAST AGAIN, since somebody just chose to look',
    /pace\.current = startingPace\(\);\s*\n\s*if \(timer\) clearTimeout\(timer\);/.test(hookSrc), true);
  check('a caller that reports nothing keeps the fast pace rather than going quiet behind its back',
    hookSrc.includes('changed !== false'), true);
}


group('every migration in one paste, and that paste stays true');
{
  /**
   * FIVE MIGRATIONS SAT UNRUN FOR DAYS -- the row-ownership one since 13
   * August. Each fixes something silently broken until it is applied: two tabs
   * overwriting each other, a form anyone can fill, a slot bookable twice.
   *
   * The work was done and the friction was the whole obstacle. Five pastes is
   * not five times the effort of one, it is five times the chance of stopping
   * after the first. So there is one file.
   */
  const bundlePath = 'supabase/RUN_ALL_MIGRATIONS.sql';
  check('the bundle exists at all', existsSync(bundlePath), true);

  /**
   * A BUNDLE THAT HAS DRIFTED IS WORSE THAN NO BUNDLE: somebody pastes it and
   * believes they are up to date. Rebuilt in memory and compared, so an edited
   * migration with a stale bundle turns this red.
   */
  check('THE BUNDLE STILL MATCHES THE MIGRATIONS IT WAS BUILT FROM',
    readFileSync(bundlePath, 'utf8') === buildBundle(), true);
  check('and it contains every one of them',
    migrationFiles().every(f => readFileSync(bundlePath, 'utf8').includes(f)), true);
  check('in order, so 0004 cannot land after 0008',
    migrationFiles(), [...migrationFiles()].sort());

  /**
   * THE HEADER PROMISES IT IS SAFE TO RUN WHOLE, EVERY TIME. That promise is
   * only true while every migration is idempotent, and the next one somebody
   * writes is the one that breaks it -- silently, because the failure is a
   * duplicate-object error halfway through a paste that has already applied
   * half of itself.
   *
   * So the shape is checked rather than trusted.
   */
  for (const file of migrationFiles()) {
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
    const lines = sql.split('\n');

    const bareTable = lines.some(l => /^\s*create table\s/i.test(l) && !/if not exists/i.test(l));
    check(`${file}: no table is created without "if not exists"`, bareTable, false);

    const bareIndex = lines.some(l => /^\s*create index\s/i.test(l) && !/if not exists/i.test(l));
    check(`${file}: nor an index`, bareIndex, false);

    // A trigger cannot say "if not exists", so each has to be dropped first.
    const triggers = lines.filter(l => /^\s*create trigger\s/i.test(l)).length;
    const drops = lines.filter(l => /^\s*drop trigger if exists\s/i.test(l)).length;
    check(`${file}: every trigger is dropped before it is created`, drops >= triggers, true);

    // Functions must be replaceable, or a second run collides.
    const bareFunction = lines.some(l => /^\s*create function\s/i.test(l));
    check(`${file}: functions are created "or replace"`, bareFunction, false);

    /**
     * A top-level INSERT would write a row every time the bundle is pasted.
     * Inserts inside a function body are the function's own work and are fine,
     * so this counts brace depth rather than matching the word.
     */
    let depth = 0;
    let topLevelInsert = false;
    for (const line of lines) {
      const low = line.trim().toLowerCase();
      if (low.includes('as $function$')) depth++;
      else if (low.startsWith('$function$')) depth--;
      else if (low.startsWith('insert into') && depth === 0) topLevelInsert = true;
    }
    check(`${file}: nothing is inserted at the top level`, topLevelInsert, false);
  }

  /**
   * And the promise is written down where somebody pasting it will read it.
   */
  const bundle = readFileSync(bundlePath, 'utf8');
  check('the bundle says it is generated, so nobody edits it by hand',
    bundle.includes('GENERATED FILE'), true);
  check('and says why running it twice is fine',
    bundle.includes('SAFE TO RUN WHOLE'), true);
  check('and where to paste it', bundle.includes('SQL Editor'), true);
}


group('the whole journey: click a row, arrive, see that row');
{
  /**
   * THE CLAIM THE AUDIT STAKES TWO SITE TYPES ON.
   *
   * "A blog is possible now. A directory is possible now." Both moved from
   * blocked to possible on one sentence -- a page can be opened WITH a row --
   * and every piece of that was checked on its own while the journey was
   * checked nowhere. Four correct functions in a row can still fail to be a
   * road: the value that leaves the repeater has to be the value the detail
   * page filters on, spelled the same way, surviving encoding on the way.
   *
   * So this walks it: click, link, arrive, read, filter. The way a visitor
   * would, using the real functions in the real order.
   */
  const ROWS = [
    { id: 'r1', Title: 'First post', Body: 'Hello' },
    { id: 'r7', Title: 'Tea & Coffee', Body: 'The one with an ampersand' },
    { id: 'r9', Title: 'Last post', Body: 'Bye' },
  ];

  // 1. A row is clicked. The repeater builds the link from its template.
  const clicked = ROWS[1];
  const query = buildParamsFromTemplate('id={{Row id}}&title={{Title}}', {
    'Row id': clicked.id,
    Title: clicked.Title,
  });
  check('the link carries the row', query.includes('id=r7'), true);
  check('AND AN AMPERSAND IN THE TITLE DOES NOT BECOME A SECOND PARAMETER',
    query.includes('Tea%20%26%20Coffee') || query.includes('Tea+%26+Coffee'), true);

  // 2. The visitor arrives. The address is read.
  const params = parseParams(query);
  check('the id survives the trip', params.id, 'r7');
  check('AND SO DOES THE AMPERSAND, whole', params.title, 'Tea & Coffee');

  // 3. A Page value block on the detail page reads it.
  const pageValue = resolvePageValue(params, { paramName: 'id', previewValue: 'r1', fallbackValue: '' });
  check('the Page value block holds the row that was clicked', pageValue, 'r7');

  // 4. The detail page's repeater filters on it. `Row id` is the spelling used
  //    everywhere else, and cellFor knows it.
  const shown = visibleRows(ROWS, { filterColumn: 'Row id', filterValue: pageValue });
  check('THE DETAIL PAGE SHOWS EXACTLY ONE ROW', shown.rows.length, 1);
  check('and it is the one that was clicked', shown.rows[0].Title, 'Tea & Coffee');

  /**
   * The two ways this journey ends badly, which are the reason it is walked
   * rather than assumed.
   */
  const noParam = resolvePageValue({}, { paramName: 'id', previewValue: 'r1', fallbackValue: '' });
  check('ARRIVING WITH NO ROW DOES NOT SHOW THE PREVIEW ROW TO EVERYBODY', noParam, '');
  const empty = visibleRows(ROWS, { filterColumn: 'Row id', filterValue: noParam });
  /**
   * And a blank filter shows EVERYTHING, which is the honest failure: a bare
   * link to the detail page is a list, not somebody else's row. Hiding all of
   * them would read as "this post was deleted".
   */
  check('a bare link shows the list rather than a wrong row', empty.rows.length, 3);

  const gone = visibleRows(ROWS, { filterColumn: 'Row id', filterValue: 'r404' });
  check('a link to a row that has been deleted shows nothing, not something else',
    gone.rows.length, 0);

  // The other direction: the journey has to work for a row whose id needs
  // escaping, because ids are not always tidy.
  const awkward = { id: 'a b/c?d#e', Title: 'Awkward' };
  const trip = parseParams(buildParamsFromTemplate('id={{Row id}}', { 'Row id': awkward.id }));
  check('AN ID WITH A SLASH, A QUESTION MARK AND A HASH IN IT SURVIVES', trip.id, 'a b/c?d#e');
  check('and still finds its row',
    visibleRows([awkward, ...ROWS], { filterColumn: 'Row id', filterValue: trip.id }).rows.length, 1);

  // And the value is still untrusted at the far end -- it was typed by whoever
  // sent the link, not by the builder.
  const nasty = parseParams(buildParamsFromTemplate('t={{Title}}', { Title: '<img src=x onerror=alert(1)>' }));
  check('a link can carry markup, and it is still text when shown',
    fillSlots('<p>{{T}}</p>', { T: nasty.t }).includes('&lt;img'), true);
}



group('a webhook address on a published page is said out loud');
{
  /**
   * THE AUDIT'S ONE SECURITY HOLE, and the one thing on its list that cannot be
   * closed from here.
   *
   * `get_page` returns a page's workflows WHOLE, and it has to: the wire is
   * fired by the visitor's browser, so the address has to reach the browser.
   * No arrangement of client-side code keeps it private -- it needs somewhere
   * server-side to send from, which this project does not have yet.
   *
   * So this does not fix it. It says it out loud. A builder who pasted a Zapier
   * or Discord hook in there has no way to find out from anywhere else, and
   * naming a trade-off nobody can close is the honest half of having made it.
   */
  const BUTTON = 'buttonBlock__wh00000001';
  const base = { value: '', visible: true, disabled: false, loading: false, error: null };
  const facts = (isPublished: boolean, url = 'https://hooks.zapier.com/hooks/catch/123456/abcdefghijklmnop/') => ({
    blockIds: [BUTTON],
    states: { [BUTTON]: { ...base, blockName: 'Submit' } },
    workflows: [{ id: 'w1', sourceId: BUTTON, sourceEvent: 'onClick', steps: [
      { targetId: BUTTON, action: 'sendWebhook', webhookUrl: url },
    ] }],
    formulas: [], connections: [], pages: [{ id: 'page-1' }], isPublished,
  } as any);
  const leaks = (f: any) => diagnosePage(f).filter((p: any) => p.title.includes('this page is published'));

  check('A PUBLISHED PAGE WITH A WEBHOOK ON IT IS REPORTED', leaks(facts(true)).length, 1);
  check('and it names the block that sends', leaks(facts(true))[0].title.includes('"Submit"'), true);
  check('a warning, not broken — it works exactly as intended',
    leaks(facts(true))[0].severity, 'warning');
  check('the message says what somebody could actually do with it',
    leaks(facts(true))[0].detail.includes('use it themselves'), true);
  check('and why it is there rather than hidden',
    leaks(facts(true))[0].detail.includes('the browser is what calls it'), true);

  /**
   * A LIVE DATA BLOCK'S ADDRESS, for exactly the same reason: it is fetched by
   * the visitor's browser, which is the whole reason Live Data works without a
   * server. A builder who pasted an endpoint with a key in the query string has
   * published the key, and this is the only place that would ever say so.
   */
  const SOURCE = 'dataSourceBlock__wh10000001';
  const withSource = (isPublished: boolean, url: string) => ({
    blockIds: [SOURCE],
    states: { [SOURCE]: { ...base, blockName: 'Prices feed', url } },
    workflows: [], formulas: [], connections: [], pages: [{ id: 'page-1' }], isPublished,
  } as any);

  check('A LIVE DATA ADDRESS ON A PUBLISHED PAGE IS REPORTED TOO',
    leaks(withSource(true, 'https://api.example.com/rates?key=sk_live_9f2a8c7b1d')).length, 1);
  check('and it names the block',
    leaks(withSource(true, 'https://api.example.com/rates?key=sk_live_9f2a8c7b1d'))[0].title.includes('"Prices feed"'), true);
  check('THE KEY IN THE QUERY STRING IS NOT PRINTED WHOLE',
    leaks(withSource(true, 'https://api.example.com/rates?key=sk_live_9f2a8c7b1d'))[0].title.includes('sk_live_9f2a8c7b1d'), false);
  check('a private page with a feed on it is not accused',
    leaks(withSource(false, 'https://api.example.com/rates?key=x')).length, 0);
  check('and a feed with no address yet is not either',
    leaks(withSource(true, '')).length, 0);
  check('the wording covers reading as well as sending',
    leaks(withSource(true, 'https://api.example.com/rates'))[0].title.includes('reads from'), true);

  /**
   * The address is SHORTENED. They are long and often carry a token in the
   * middle, and printing the whole thing puts the secret on screen for whoever
   * is standing behind them.
   */
  const shown = leaks(facts(true))[0].title;
  check('THE ADDRESS IS TRUNCATED, not printed whole into the panel',
    shown.includes('abcdefghijklmnop'), false);
  check('but enough of it shows to recognise which one', shown.includes('hooks.zapier.com'), true);
  check('a short address is shown whole, since there is nothing to hide in it',
    leaks(facts(true, 'https://x.dev/h')).length === 1 && leaks(facts(true, 'https://x.dev/h'))[0].title.includes('https://x.dev/h'), true);

  /**
   * A PRIVATE PAGE IS NOT ACCUSED. Telling somebody their unpublished page is
   * leaking would train them to ignore the panel, which costs more than this
   * finding is worth.
   */
  check('A PAGE NOBODY CAN OPEN IS NOT LEAKING ANYTHING', leaks(facts(false)).length, 0);
  const unknown = { ...facts(true) };
  delete (unknown as any).isPublished;
  check('and a caller that did not say gets no finding rather than a wrong one',
    leaks(unknown).length, 0);

  check('a wire with no address is not reported',
    leaks(facts(true, '')).length, 0);
  check('nor is a page with no webhook wires at all',
    diagnosePage({ blockIds: [BUTTON], states: { [BUTTON]: { ...base, blockName: 'Submit' } },
      workflows: [{ id: 'w1', sourceId: BUTTON, sourceEvent: 'onClick', steps: [{ targetId: BUTTON, action: 'increment' }] }],
      formulas: [], connections: [], pages: [{ id: 'page-1' }], isPublished: true } as any)
      .filter((p: any) => p.title.includes('this page is published')).length, 0);

  /**
   * One finding per ADDRESS, not per wire: five buttons pointed at the same
   * hook is one thing to know, and five copies of it buries everything else.
   */
  const twice = {
    ...facts(true),
    workflows: [
      { id: 'w1', sourceId: BUTTON, sourceEvent: 'onClick', steps: [{ targetId: BUTTON, action: 'sendWebhook', webhookUrl: 'https://x.dev/h' }] },
      { id: 'w2', sourceId: BUTTON, sourceEvent: 'onChange', steps: [{ targetId: BUTTON, action: 'sendWebhook', webhookUrl: 'https://x.dev/h' }] },
    ],
  } as any;
  check('ONE FINDING PER ADDRESS, not per wire', leaks(twice).length, 1);
  const two = {
    ...facts(true),
    workflows: [
      { id: 'w1', sourceId: BUTTON, sourceEvent: 'onClick', steps: [{ targetId: BUTTON, action: 'sendWebhook', webhookUrl: 'https://x.dev/a' }] },
      { id: 'w2', sourceId: BUTTON, sourceEvent: 'onChange', steps: [{ targetId: BUTTON, action: 'sendWebhook', webhookUrl: 'https://x.dev/b' }] },
    ],
  } as any;
  check('but two different addresses are two things to know', leaks(two).length, 2);

  // And the panel has to actually pass the fact through, or none of this runs.
  check('the panel tells the diagnosis whether the page is live',
    readFileSync('src/components/HealthPanel.tsx', 'utf8').includes('isPublished }'), true);
}


group('the server checks WHAT is written, not only who writes it');
{
  /**
   * THE BACKEND'S REAL WEAKNESS. `add_database_row` takes `row_data jsonb` and
   * inserts it. It checks WHO is writing and never WHAT. Every rule in the
   * product -- required, must be a number, must be a date, must be an email --
   * lives in the browser, so it is advice to whoever uses the form and nothing
   * at all to whoever calls the RPC directly. The anon key is in the published
   * page; calling it is one line of fetch.
   *
   * A stranger could put a column that does not exist into your table, a
   * paragraph into your number column, and a megabyte into a field meant for a
   * name -- and the editor would show all of it as though a person had typed it.
   */
  const shape = readFileSync('supabase/migrations/0009_row_shape.sql', 'utf8');

  check('it runs before the row is written', /before insert on public\.database_rows/.test(shape), true);
  check('and on updates too, since a row can be edited into the same mess',
    /before update of row_data on public\.database_rows/.test(shape), true);
  check('A KEY THAT IS NOT A COLUMN IS DROPPED', shape.includes('new.row_data := v_clean;'), true);
  check('a number column refuses a paragraph', /has to be a number/.test(shape), true);
  check('a date column refuses something that is not a date', /has to be a date/.test(shape), true);
  check('AND A ROW HAS A CEILING', /v_max_bytes constant integer := 16384;/.test(shape), true);
  check('with the arithmetic written where somebody would change it',
    shape.includes('10000 x 16 KB is 160 MB'), true);
  check('and the allowance it came from, dated',
    /500 MB \(supabase\.com\/pricing, checked/.test(shape), true);

  /**
   * COERCED, NOT REFUSED, wherever the browser would have accepted it.
   * Refusing anything the browser accepts turns a working form into a broken
   * one -- and the browser sends "5" for a number column in some paths and 5 in
   * others. This is the same drift problem the two renderers have had nine
   * times, here across a network instead of between two files.
   */
  check('a blank number stays blank rather than becoming zero',
    shape.includes('a number field left blank is blank, not zero'), true);
  check('a table whose page has not finished saving is left alone',
    shape.includes('No declared columns means nothing can be judged'), true);
  check('and a date is stored as the client stored it, not re-derived',
    shape.includes('re-deriving here would move the day'), true);

  /**
   * WHAT IT DELIBERATELY DOES NOT ENFORCE, which matters as much: `required`
   * and `email` live on the BLOCK that feeds a column, not on the column, and
   * the server cannot see which input fed which field. Guessing would refuse
   * honest submissions.
   */
  check('it says what it cannot know, rather than guessing at it',
    shape.includes('the server cannot see which input fed which field'), true);

  /**
   * THE TRIGGER ORDER IS LOAD-BEARING AND IS DECIDED BY NAMES. Postgres runs
   * BEFORE triggers alphabetically, which happens to give limits, then shape,
   * then unique. Shape before unique is the one that matters: uniqueness
   * compares the stored value, so " 10am" and "10am" would be two different
   * bookings if they were compared before being tidied.
   *
   * Three names chosen separately in three migrations. Renaming one would
   * reorder the pipeline silently, and the symptom would be a double booking
   * nobody could reproduce.
   */
  const triggerNames: string[] = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
    for (const m of sql.matchAll(/^create trigger\s+(\S+)/gm)) triggerNames.push(m[1]);
  }
  const inserts = triggerNames.filter(n => !n.includes('update')).sort();
  check('there are triggers to order at all', inserts.length >= 3, true);
  check('LIMITS RUN FIRST, refusing the cheapest case before any work',
    inserts[0].includes('limits'), true);
  check('THEN SHAPE, so a value is tidied before anything compares it',
    inserts[1].includes('shape'), true);
  check('THEN UNIQUE, comparing what will actually be stored',
    inserts[2].includes('unique'), true);
  check('and the coupling is written down where a rename would be considered',
    shape.includes('THE ORDER THESE TRIGGERS FIRE IN IS LOAD-BEARING'), true);

  /**
   * And the messages, which reach a visitor who has done nothing wrong.
   */
  const badNumber = describeRowWriteError({ message: 'Price has to be a number', code: 'P0006' });
  check('a refused value names the column', badNumber.message.includes('Price'), true);
  check('and says nothing was saved', badNumber.message.includes('Nothing was saved'), true);
  check('retrying the same value would fail the same way', badNumber.retryable, false);
  const tooLong = describeRowWriteError({ message: 'that entry is too long (99999 characters)', code: 'P0007' });
  check('an oversized entry says to shorten it', tooLong.message.includes('Shorten it'), true);
  check('rather than printing the byte count at somebody', tooLong.message.includes('99999'), false);
}


group('a row can ask about another table, about itself');
{
  /**
   * FOUND BY BUILDING A REAL SITE AND TRYING TO TRANSLATE IT.
   * See docs/BUILT_ONE_TO_FIND_OUT.md.
   *
   * A pottery studio's booking site needed fifteen things. Three worked. NINE
   * OF THE REMAINING TWELVE WERE THE SAME MISSING SENTENCE wearing different
   * clothes: a formula could not refer to the row it was standing in when it
   * asked about another table.
   *
   *     {{calc: Capacity - countOf("Bookings", '{{ClassId}} == ???') }}
   *
   * `{{ClassId}}` is the booking being tested, which is right. There was no way
   * to say "…equals the id of the class I am rendering". The condition is a
   * string and the row was outside it.
   *
   * The fix is one line: give the condition the CALLING scope underneath, with
   * `{{...}}` slots still winning. No new syntax, no new block.
   */
  const CLASSES = {
    rows: [
      { id: 'c1', Title: 'Wheel throwing', InstructorId: 'i1', Capacity: 8, Price: 34 },
      { id: 'c3', Title: 'Glazing', InstructorId: 'i2', Capacity: 6, Price: 40 },
    ],
    columns: ['Title', 'InstructorId', 'Capacity', 'Price'],
  };
  const INSTRUCTORS = {
    rows: [{ id: 'i1', Name: 'Maya Okonkwo' }, { id: 'i2', Name: 'Tomas Reid' }],
    columns: ['Name'],
  };
  const BOOKINGS = {
    rows: [
      { id: 'b1', ClassId: 'c1', Status: 'confirmed' },
      { id: 'b2', ClassId: 'c1', Status: 'confirmed' },
      { id: 'b3', ClassId: 'c3', Status: 'confirmed' },
      { id: 'b4', ClassId: 'c3', Status: 'waitlist' },
    ],
    columns: ['ClassId', 'Status'],
  };
  const REVIEWS = {
    rows: [
      { id: 'v1', ClassId: 'c1', Rating: 5 },
      { id: 'v2', ClassId: 'c1', Rating: 4 },
      { id: 'v3', ClassId: 'c3', Rating: 5 },
    ],
    columns: ['ClassId', 'Rating'],
  };
  const tables = { Classes: CLASSES, Instructors: INSTRUCTORS, Bookings: BOOKINGS, Reviews: REVIEWS };

  // What a repeater's row markup can see: the row's own columns, by bare name.
  // Through ran(), so breaking the feature makes these go RED rather than
  // taking the whole suite down with them -- see ran() at the top of the file.
  const card = (row: any, f: string) => ran(() => evaluateExpression(f, { ...row, RowId: row.id }, tables));
  const asks = (f: string, scope: Record<string, any>) => ran(() => evaluateExpression(f, scope, tables));
  const c1 = CLASSES.rows[0];
  const c3 = CLASSES.rows[1];

  check('PLACES LEFT: capacity minus a count of rows in another table',
    card(c1, `Capacity - countOf("Bookings", '{{ClassId}} == RowId and {{Status}} == "confirmed"')`), 6);
  check('and the other card gets its own answer, not the first one’s',
    card(c3, `Capacity - countOf("Bookings", '{{ClassId}} == RowId and {{Status}} == "confirmed"')`), 5);

  check('WHO TEACHES IT: a lookup into another table, which is a relation',
    card(c1, `joinOf("Instructors", "Name", '{{Row id}} == InstructorId')`), 'Maya Okonkwo');
  check('and the second class has the other teacher',
    card(c3, `joinOf("Instructors", "Name", '{{Row id}} == InstructorId')`), 'Tomas Reid');

  check('AVERAGE RATING of the rows that point at this one',
    card(c1, `avgOf("Reviews", "Rating", '{{ClassId}} == RowId')`), 4.5);
  check('a class nobody reviewed averages nothing rather than erroring',
    card({ id: 'c9', Capacity: 4 }, `avgOf("Reviews", "Rating", '{{ClassId}} == RowId')`), 0);

  check('IS IT FULL: the whole sentence, as a card would ask it',
    card(c3, `if(Capacity - countOf("Bookings", '{{ClassId}} == RowId and {{Status}} == "confirmed"') <= 0, "Full", "Book")`),
    'Book');
  check('and a truly full one says so',
    card({ id: 'c3', Capacity: 1 }, `if(Capacity - countOf("Bookings", '{{ClassId}} == RowId and {{Status}} == "confirmed"') <= 0, "Full", "Book")`),
    'Full');

  check('HOW MANY ARE WAITING, which is a different condition on the same table',
    card(c3, `countOf("Bookings", '{{ClassId}} == RowId and {{Status}} == "waitlist"')`), 1);

  /**
   * The dashboard's revenue: for every booking, the price of the class it
   * points at. An aggregate across a relation, from the other side.
   */
  const booking = BOOKINGS.rows[0];
  check('WHAT ONE BOOKING IS WORTH: the price of the row it points at',
    asks(`sumOf("Classes", "Price", '{{Row id}} == ClassId')`, { ...booking, RowId: booking.id }),
    34);

  /**
   * WHICH SCOPE A NAME MEANS -- and this is where I had written a check that
   * could not fail.
   *
   * It said "the tested row WINS over the caller where both have the name" and
   * it passed. It also passed when I inverted the precedence on purpose, which
   * is the only reason I found out that the sentence describes a contest that
   * never happens: a `{{Column}}` slot is rewritten to an invented name before
   * anything is resolved, so the caller has nothing to shadow it WITH.
   *
   * The guarantee is therefore stronger than precedence and worth saying
   * properly: a card can have its own `Status` and still ask a table about the
   * table's `Status`, and neither one moves.
   */
  const bothHaveStatus = { Status: 'waitlist' };
  check('A CALLER WITH THE SAME COLUMN NAME CANNOT CHANGE WHAT A SLOT MEANS',
    asks(`countOf("Bookings", '{{Status}} == "confirmed"')`, bothHaveStatus), 3);
  check('and the caller’s own value is still there for a bare name to reach',
    asks(`if(Status == "waitlist", countOf("Bookings", '{{Status}} == "waitlist"'), -1)`, bothHaveStatus), 1);
  check('so the two spellings in ONE condition mean two different rows',
    asks(`countOf("Bookings", '{{Status}} == Status')`, { Status: 'waitlist' }), 1);

  /**
   * THE INVENTED NAME HAS TO BE ONE THE CONDITION IS NOT USING. It used to be
   * a fixed `__w0`, so a caller value of that name was overwritten by the
   * tested row and `{{Status}} == __w0` quietly became `Status == Status`:
   * every row matched, and the answer was a number, which is the shape of
   * wrongness this file exists to refuse.
   */
  check('AN INTERNAL NAME LEAKING INTO A CONDITION DOES NOT SILENTLY MATCH EVERYTHING',
    asks(`countOf("Bookings", '{{Status}} == __w0')`, { __w0: 'waitlist' }), 1);
  check('and it answers the same as the identical question spelled differently',
    asks(`countOf("Bookings", '{{Status}} == Want')`, { Want: 'waitlist' }), 1);

  check('and a bare name still reaches the caller when the tested row has no such column',
    card(c1, `countOf("Bookings", '{{ClassId}} == RowId')`), 2);

  /**
   * Nothing that worked before stops working. A condition that mentions only
   * the tested row is unchanged, and a name in neither scope still says so.
   */
  check('a condition using only the tested row is unaffected',
    asks(`countOf("Bookings", '{{Status}} == "confirmed"')`, {}), 3);

  /**
   * THROUGH THE PATH A BUILDER ACTUALLY USES, which is where this nearly went
   * wrong. Every check above builds the row's scope by hand and puts `RowId`
   * in it. A real repeater builds that scope with `rowSlots`, which spelled the
   * id `Row id` -- with a space, so it cannot be a bare name in an expression.
   *
   * The whole feature would have looked correct in the checks and said
   * "Referenced block RowId does not exist" on a page. rowSlots now offers both
   * spellings: `{{Row id}}` because it reads, `RowId` because it parses.
   */
  const realScope = rowSlots(c1 as any, 0);
  check('THE ROW’S ID IS SPELLED BOTH WAYS, or a formula cannot name it',
    [realScope['Row id'], realScope['RowId']], ['c1', 'c1']);
  check('and the row number too', [realScope['Row number'], realScope['RowNumber']], [1, 1]);

  check('PLACES LEFT, RENDERED THE WAY A CARD RENDERS IT',
    fillSlots(
      `<p>{{calc: Capacity - countOf("Bookings", '{{ClassId}} == RowId and {{Status}} == "confirmed"')}} left</p>`,
      rowSlots(c1 as any, 0), [], { tables }),
    '<p>6 left</p>');
  check('WHO TEACHES IT, RENDERED THE SAME WAY',
    fillSlots(
      `<p>with {{calc: joinOf("Instructors", "Name", '{{Row id}} == InstructorId')}}</p>`,
      rowSlots(c1 as any, 0), [], { tables }),
    '<p>with Maya Okonkwo</p>');
  check('and the second card gets its own teacher, not the first one’s',
    fillSlots(
      `<p>{{calc: joinOf("Instructors", "Name", '{{Row id}} == InstructorId')}}</p>`,
      rowSlots(c3 as any, 1), [], { tables }),
    '<p>Tomas Reid</p>');
  check('a star rating, per card',
    fillSlots(`<p>{{calc: avgOf("Reviews", "Rating", '{{ClassId}} == RowId')}}</p>`,
      rowSlots(c1 as any, 0), [], { tables }),
    '<p>4.5</p>');
  /**
   * AND THE NAMES INSIDE A CONDITION ARE FETCHED. A table function's condition
   * is an expression wearing a string's clothes: `RowId` in it is a real
   * reference, and to the parser it is three characters inside a literal.
   *
   * A repeater hides this -- its rows supply every column whether anybody asked
   * or not -- so it works there and fails in a Custom HTML block, which fetches
   * exactly what it is told to and nothing else.
   */
  check('a name used only inside a condition is still asked for',
    findSlotsForCheck(`<p>{{calc: countOf("Bookings", '{{ClassId}} == RowId')}}</p>`), ['RowId']);
  check('alongside the ones outside it',
    findSlotsForCheck(`<p>{{calc: Capacity - countOf("Bookings", '{{ClassId}} == RowId')}}</p>`), ['Capacity', 'RowId']);
  check('THE TABLE NAME IS NOT MISTAKEN FOR A BLOCK, since it is a name not an expression',
    findSlotsForCheck(`<p>{{calc: countOf("Bookings")}}</p>`), []);
  check('nor the column name',
    findSlotsForCheck(`<p>{{calc: sumOf("Orders", "Total")}}</p>`), []);
  check('and the slots inside the condition belong to the table, not to the caller',
    findSlotsForCheck(`<p>{{calc: countOf("Bookings", '{{ClassId}} == "x"')}}</p>`), []);

  check('and a name in neither scope is still an error a person can act on',
    (() => { try { evaluateExpression(`countOf("Bookings", '{{ClassId}} == Nonsense')`, {}, tables); return null; } catch (e: any) { return String(e.message); } })()?.includes('Nonsense'),
    true);
}


group('a slot can contain a slot');
{
  /**
   * The scan used to be `/\{\{\s*([^}]+?)\s*\}\}/`, which stops at the FIRST
   * `}}`. That was fine until a slot could contain another one -- and the very
   * first thing a real card wants to write does:
   *
   *     {{calc: Capacity - countOf("Bookings", '{{ClassId}} == RowId')}}
   *
   * The old scan matched as far as `{{ClassId}}` and left the rest of the line
   * on the page as text. The feature worked perfectly in a Formula block and
   * was broken in the one place a card would use it.
   *
   * It was found by rendering it the way a repeater renders it. Every check
   * written before that handed a scope straight to the engine, and all of them
   * passed.
   */
  const vals = { A: 1, B: 2 };
  check('an ordinary slot is unchanged', fillSlots('<p>{{A}}</p>', vals), '<p>1</p>');
  check('two in a row are still two', fillSlots('<p>{{A}}{{B}}</p>', vals), '<p>12</p>');
  check('with text between them', fillSlots('<p>{{A}} and {{B}}</p>', vals), '<p>1 and 2</p>');
  check('A NESTED SLOT IS PART OF THE OUTER ONE, not the end of it',
    findSlotsForCheck(`<p>{{calc: countOf("T", '{{X}} == A')}}</p>`), ['A']);
  check('and the whole thing is replaced, leaving no tail behind',
    fillSlots(`<p>[{{calc: 1 + 1}}]</p>`, {}), '<p>[2]</p>');

  /**
   * An unclosed `{{` is left exactly as typed. Somebody writing an example, or
   * mid-edit, should see what they wrote rather than have the rest of their
   * page swallowed.
   */
  check('AN UNFINISHED SLOT DOES NOT EAT THE REST OF THE PAGE',
    fillSlots('<p>{{A}} then {{oops</p>', vals), '<p>1 then {{oops</p>');
  check('nor does a lone opening brace pair', fillSlots('<p>{{</p>', vals), '<p>{{</p>');
  check('a stray closing pair is ordinary text', fillSlots('<p>}} {{A}}</p>', vals), '<p>}} 1</p>');
  check('and markup with no slots at all comes back whole',
    fillSlots('<p>nothing here</p>', vals), '<p>nothing here</p>');
  check('empty markup is not a crash', fillSlots('', vals), '');

  /**
   * What it cannot do, said plainly rather than discovered later: a `}}` inside
   * a quoted string inside a slot closes the slot early, because the scan
   * counts braces and does not read quotes. `'}}'` in a condition is not
   * something anybody writes, and a scanner that understood quotes would have
   * to understand escaping too.
   */
  check('a }} inside a quoted condition ends the slot early — a known limit',
    fillSlots(`<p>{{calc: text("}}")}}</p>`, {}).includes('}}'), true);
}

reachedTheEnd = true;
say(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
