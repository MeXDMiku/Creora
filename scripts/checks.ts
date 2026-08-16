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
import { createStore } from 'jotai';
import { validateValue, isValidPattern } from '../src/lib/validation';
import type { ValidationRule } from '../src/lib/validation';
import { blockRuntimeAtom, workflowsAtom, allBlockIdsAtom, workflowRunsAtom, formulasAtom } from '../src/state/atoms';
import { executeWorkflow, validationErrorFor, markValidated } from '../src/lib/bindingEngine';
import { evaluateCondition } from '../src/lib/conditions';
import { describeCollectionError, MIGRATION_DOC } from '../src/lib/collections';
import { parseParams, readParam, buildQuery, parseParamTemplate } from '../src/lib/pageParams';
import { resolvePageValue, buildParamsFromTemplate } from '../src/lib/pageValue';
import { diagnosePage, sortProblems, referencedIds } from '../src/lib/diagnose';
import { guessMappings, matchScore, normaliseName, whyItCannotWork } from '../src/lib/connectionDraft';
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
import { remapBlockIds, shouldRemapOnImport, remapFormulaExpression } from '../src/lib/remapBlockIds';
import { evaluateExpression, FORMULA_FUNCTION_NAMES } from '../src/lib/formula';
import { stepConditionResult, formulaScope } from '../src/lib/bindingEngine';
import { safeUrl, isSafeUrlValue, schemeOf, stripIgnorable } from '../src/lib/urls';
import { fillSlots, leadingSlotName, findSlots as findSlotsForCheck } from '../src/lib/sanitizeHtml';
import { visibleRows, rowSlots, compareCells, slotNamesFor, rowMatchesSearch, MAX_RENDERED_ROWS } from '../src/lib/rows';
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

say(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
