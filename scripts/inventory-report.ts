import { BLOCK_DISPLAY_NAMES } from '../src/lib/blockRegistry';
import { RULE_TYPES } from '../src/lib/validation';
import { FORMULA_FUNCTION_NAMES, TABLE_FUNCTION_NAMES, DATE_FUNCTION_NAMES } from '../src/lib/formula';
import { readFileSync, readdirSync } from 'node:fs';

const types = readFileSync('src/types/creora.ts', 'utf8');
const actionBlock = types.slice(types.indexOf('  action:'), types.indexOf("| 'setEnabled';") + 20);
const actions = Array.from(actionBlock.matchAll(/'([a-zA-Z]+)'/g)).map(m => m[1]);

const conditions = readFileSync('src/lib/conditions.ts', 'utf8');
const operators = Array.from(conditions.matchAll(/case '([a-zA-Z]+)':/g)).map(m => m[1]);

const filters = readFileSync('src/lib/format.ts', 'utf8');
const filterNames = Array.from(filters.matchAll(/^\s+case '([a-zA-Z]+)':/gm)).map(m => m[1]);

console.log('blocks     ', Object.keys(BLOCK_DISPLAY_NAMES).length, Object.values(BLOCK_DISPLAY_NAMES).join(' · '));
console.log('actions    ', actions.length, actions.join(' · '));
console.log('rules      ', RULE_TYPES.length, RULE_TYPES.map(r => r.type).join(' · '));
console.log('operators  ', new Set(operators).size);
console.log('filters    ', new Set(filterNames).size, Array.from(new Set(filterNames)).join(' · '));
console.log('formula fns', FORMULA_FUNCTION_NAMES.length + TABLE_FUNCTION_NAMES.length + DATE_FUNCTION_NAMES.length);
console.log('migrations ', readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).length);
