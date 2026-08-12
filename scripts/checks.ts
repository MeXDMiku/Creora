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
import { blockRuntimeAtom, workflowsAtom, allBlockIdsAtom } from '../src/state/atoms';
import { executeWorkflow, validationErrorFor, markValidated } from '../src/lib/bindingEngine';
import { withoutVisitorState, isBlockNodeType, BLOCK_NODE_TYPES } from '../src/lib/blockRegistry';
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
  };
  const clean = withoutVisitorState(dirty);
  check('touched is dropped', 'touched' in clean, false);
  check('the error is dropped', 'validationError' in clean, false);
  check('a stale fetch error is dropped', 'fetchError' in clean, false);
  check('busy is forced off', clean.loading, false);
  check('the rules survive, because they are the page', clean.rules!.length, 1);
  check('the name survives', clean.blockName, 'Email');
  check('the value survives', clean.value, 'sam@example.com');
  check('the original is untouched', dirty.touched, true);
}

group('every block type is a block type');
{
  const missed = BLOCK_NODE_TYPES.filter((t) => !isBlockNodeType(t));
  check('all 14 recognised', missed, []);
  check('count is 14', BLOCK_NODE_TYPES.length, 14);
  check('the newest three are included', ['dataSourceBlock', 'customHtmlBlock', 'visitorBlock'].every(isBlockNodeType), true);
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
  const CHAIN = /===\s*'[A-Za-z]+Block'\s*\|\|/;
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
}

say(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
