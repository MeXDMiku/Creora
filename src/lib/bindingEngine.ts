import { getDefaultStore } from 'jotai';
import type { TriggerEvent, StepCondition } from '../types/creora';
import { blockRuntimeAtom, workflowsAtom, formulasAtom, allBlockIdsAtom, getBlockDefaultValue , recordRun, blockValuesByName, type RunStep } from '../state/atoms';
import { sendWebhook } from './webhook';
import { computeDatabaseOutput } from './databaseOutput';
import { validateValue } from './validation';
// Re-exported so every existing import of evaluateCondition from this file
// keeps working. The definition now lives in conditions.ts.
import { nodeTypeFromBlockId } from './blockRegistry';
import { evaluateCondition } from './conditions';
import { evaluateExpression, truthy, type FormulaValue } from './formula';
export { evaluateCondition };
import { renderTemplate } from './format';
import { supabase } from './supabase';


/**
 * The one place that asks "is this field's value acceptable?".
 *
 * Everything else -- the field itself, the submit guard, the isValid condition,
 * the published page -- calls this, so the editor and the live site can never
 * disagree about what counts as valid. That divergence is exactly how the
 * editor and PublishedRenderer drifted apart before.
 */
export function validationErrorFor(
  blockId: string,
  store: ReturnType<typeof getDefaultStore>
): string | null {
  const state = store.get(blockRuntimeAtom(blockId));
  if (!state || !state.rules || state.rules.length === 0) return null;
  const name =
    state.blockName && state.blockName.trim() !== '' ? state.blockName.trim() : 'This field';
  return validateValue(state.value, state.rules, {
    fieldName: name,
    resolve: (id) => store.get(blockRuntimeAtom(id))?.value,
  });
}

/**
 * Recheck a field and, optionally, admit that it has been visited.
 *
 * `touched` is the difference between a form that helps and a form that shouts:
 * an empty required field is invalid the instant the page loads, and showing
 * that immediately is how you tell someone off for not having typed yet.
 */
export function markValidated(
  blockId: string,
  store: ReturnType<typeof getDefaultStore>,
  touch: boolean
): string | null {
  const message = validationErrorFor(blockId, store);
  const state = store.get(blockRuntimeAtom(blockId));
  if (!state) return message;
  const nextTouched = touch ? true : state.touched;
  if (state.validationError === message && state.touched === nextTouched) return message;
  store.set(blockRuntimeAtom(blockId), {
    ...state,
    validationError: message,
    touched: nextTouched,
  });
  return message;
}

/** Every block on the page that has been given rules. */
function blocksWithRules(store: ReturnType<typeof getDefaultStore>): string[] {
  const ids: string[] = store.get(allBlockIdsAtom) || [];
  return ids.filter((id) => {
    const st = store.get(blockRuntimeAtom(id));
    return !!(st && st.rules && st.rules.length);
  });
}

/**
 * Which fields a step actually reads.
 *
 * A step that names its inputs (addRow, updateRow) is checked against exactly
 * those. A step that names none -- "send this form to Zapier" -- is checked
 * against every field on the page that has rules, because that is what a person
 * ticking "only if valid" on such a step means.
 */
function fieldsReadByStep(
  step: { mappings?: Record<string, { source: string; value: string }>; matchValue?: { source: string; value: string } },
  store: ReturnType<typeof getDefaultStore>
): string[] {
  const ids: string[] = [];
  if (step.mappings) {
    for (const m of Object.values(step.mappings)) {
      if (m && m.source === 'block' && m.value) ids.push(m.value);
    }
  }
  if (step.matchValue && step.matchValue.source === 'block' && step.matchValue.value) {
    ids.push(step.matchValue.value);
  }
  const named = Array.from(new Set(ids));
  return named.length ? named : blocksWithRules(store);
}

/**
 * A condition, evaluated against a real block rather than a bare value.
 *
 * isValid / isInvalid cannot be answered by looking at a value alone -- they
 * need the block's rules -- so they are resolved here and everything else falls
 * through to the pure comparison below.
 */
export function conditionHolds(
  fieldId: string,
  operator: string,
  expected: any,
  store: ReturnType<typeof getDefaultStore>
): boolean {
  if (operator === 'isValid') return validationErrorFor(fieldId, store) === null;
  if (operator === 'isInvalid') return validationErrorFor(fieldId, store) !== null;
  const state = store.get(blockRuntimeAtom(fieldId));
  return evaluateCondition(state?.value, operator, expected);
}

/**
 * Run everything wired to "when the page opens", once.
 *
 * WHY IT IS A SEPARATE ENTRY POINT
 * Every other trigger is caused by a block: a press, a value moving, a tick.
 * This one is caused by the page existing, so nothing would ever call
 * executeWorkflow for it. Without this a page could not set itself up, greet a
 * visitor, clear last session's numbers, or decide what to show before somebody
 * touched it -- which is most of what "dynamic" means to whoever opens a link.
 *
 * ONCE, AND NOT ON EVERY RENDER
 * The caller owns that. React mounts run more than once in development, a
 * published page re-renders whenever a poll returns, and a page-load workflow
 * that writes a row must not write one per render. Both call sites guard with a
 * ref, and there is a check that this function is safe to call twice by making
 * the guard the caller's job rather than hiding a module-level flag in here --
 * a hidden flag would be shared between the editor and a published page in the
 * same tab, and the second page to open would silently do nothing.
 */
export function runPageLoadWorkflows(store: ReturnType<typeof getDefaultStore>): number {
  const workflows = store.get(workflowsAtom) || [];
  const onLoad = workflows.filter((w: any) => w.sourceEvent === 'onLoad');
  for (const workflow of onLoad) {
    executeWorkflow(workflow.sourceId, 'onLoad', store);
  }
  return onLoad.length;
}

/**
 * Every block's current value, keyed by its id, ready for a formula.
 *
 * Extracted from recalculateAllFormulas the moment a second caller appeared.
 * A formula and a condition asking the same question of the same page have to
 * be looking at the same values -- two scope builders would drift, and the one
 * that drifted would be whichever was edited second.
 *
 * Values are RAW. Coercing to number here is what made text comparisons
 * impossible; arithmetic coerces inside the operator instead.
 */
export function formulaScope(store: any): Record<string, any> {
  const scope: Record<string, any> = {};
  for (const blockId of store.get(allBlockIdsAtom)) {
    scope[blockId] = store.get(blockRuntimeAtom(blockId))?.value ?? 0;
  }
  return scope;
}

/**
 * One condition, answered, with the sentence explaining what happened.
 *
 * The sentence is returned rather than rebuilt by the caller because the run
 * log used to print raw block ids and a JSON value, which told a builder
 * nothing they could act on -- and an expression condition has no fieldId or
 * operator to print at all.
 *
 * A formula that throws makes the condition FALSE and says why. Failing closed
 * is the safe direction: a broken condition guarding a row write should stop
 * the write, not wave it through.
 */
export function stepConditionResult(
  condition: StepCondition,
  store: ReturnType<typeof getDefaultStore>
): { pass: boolean; describe: string } {
  const expression = (condition.expression || '').trim();
  if (expression) {
    try {
      const answer = evaluateExpression(expression, formulaScope(store));
      const pass = truthy(answer);
      return {
        pass,
        describe: `${expression} -> ${pass ? 'pass' : 'FAIL'} (answered ${JSON.stringify(answer)})`,
      };
    } catch (err: any) {
      return {
        pass: false,
        describe: `${expression} -> FAIL (${err?.message || 'the formula could not be worked out'})`,
      };
    }
  }

  const pass = conditionHolds(condition.fieldId, condition.operator, condition.value, store);
  const actual = store.get(blockRuntimeAtom(condition.fieldId))?.value;
  return {
    pass,
    describe: `${condition.fieldId} ${condition.operator} ${JSON.stringify(condition.value)} -> ${pass ? 'pass' : 'FAIL'} (actual ${JSON.stringify(actual)})`,
  };
}

/**
 * Runs the "otherwise" branch of a step.
 *
 * Deliberately handles only the simple value actions, and the Otherwise dropdown
 * offers exactly these and nothing more -- so the interface cannot create a
 * branch this cannot run. That matters more than it looks: silent divergence
 * between two code paths is how the editor and the published renderer drifted
 * apart, and this keeps the two in lockstep by construction.
 *
 * Row actions are excluded on purpose. They need mappings and match columns,
 * which belong to the main switch, and an "otherwise, add a row" is not a thing
 * anyone has asked for.
 */
export const ELSE_ACTIONS = ['increment', 'decrement', 'set', 'toggle', 'reset', 'setVisible', 'setHidden', 'setDisabled', 'setEnabled'] as const;

function runElseAction(
  action: string,
  targetId: string,
  store: ReturnType<typeof getDefaultStore>,
  value: any,
  amount: number | undefined
): { before: any; after: any } {
  const atom = blockRuntimeAtom(targetId);
  const state = store.get(atom);
  const before = state?.value;

  switch (action) {
    case 'increment':
    case 'decrement': {
      const step = amount ?? 1;
      const num = typeof before === 'number' ? before : 0;
      let next = action === 'increment' ? num + step : num - step;
      if (state?.min !== undefined) next = Math.max(state.min, next);
      if (state?.max !== undefined) next = Math.min(state.max, next);
      store.set(atom, { ...state, value: next });
      break;
    }
    case 'set': {
      const num = Number(value);
      const parsed = value === '' || value === null || value === undefined || isNaN(num) ? value : num;
      store.set(atom, { ...state, value: parsed });
      break;
    }
    case 'toggle':
      store.set(atom, { ...state, value: !before });
      break;
    case 'reset':
      store.set(atom, { ...state, value: getBlockDefaultValue(targetId) });
      break;
    case 'setVisible':
      store.set(atom, { ...state, visible: true });
      break;
    case 'setHidden':
      store.set(atom, { ...state, visible: false });
      break;
    case 'setDisabled':
      store.set(atom, { ...state, disabled: true });
      break;
    case 'setEnabled':
      store.set(atom, { ...state, disabled: false });
      break;
    default:
      break;
  }

  return { before, after: store.get(atom)?.value };
}

/**
 * How many links a chain of workflows may have.
 *
 * A step that changes a block fires that block's own onChange, which is what
 * makes Button -> Database -> Total work. It also makes a wire that points back
 * at itself a loop, so it is bounded rather than trusted. Eight is far past any
 * chain a person builds on purpose and far short of freezing a tab.
 */
const MAX_CHAIN_DEPTH = 8;
let chainDepth = 0;

export function executeWorkflow(
  sourceId: string,
  event: TriggerEvent,
  store: ReturnType<typeof getDefaultStore>
) {
  /**
   * Disable while sending, enforced here rather than in each renderer.
   *
   * A second press while the first is still in flight is how you get two rows,
   * two charges and two emails. Greying the button out is the visible half; this
   * is the half that actually prevents it, and it holds even if a builder wires
   * their own markup straight to this function.
   */
  const sourceState = store.get(blockRuntimeAtom(sourceId));
  if ((event === 'onClick' || event === 'onChange') && (sourceState?.loading || sourceState?.disabled)) {
    recordRun(store, {
      sourceId,
      event,
      workflowId: null,
      matched: 0,
      steps: [
        {
          targetId: sourceId,
          action: '(ignored)',
          status: 'skipped',
          reason: sourceState?.loading
            ? 'it was still busy from the last time it ran'
            : 'it is switched off',
        },
      ],
    });
    return;
  }

  const workflows = store.get(workflowsAtom);
  /**
   * These used to be console.log, on every click, on every page.
   *
   * A visitor to somebody's published page got the entire workflow structure of
   * that page dumped into their console -- 84 messages from two clicks, while I
   * was looking. It is noise, it is a small amount of information nobody asked
   * to publish, and it has been redundant since the run log was built: the run
   * log records the same thing, in the product, where a builder can read it.
   */
  const matchingWorkflows = workflows.filter(
    (w) => w.sourceId === sourceId && w.sourceEvent === event
  );

  // The most useful entry in the whole log is this one: the trigger fired and
  // nothing was listening. "I clicked it and nothing happened" was previously
  // indistinguishable from a broken action.
  if (matchingWorkflows.length === 0) {
    recordRun(store, { sourceId, event, workflowId: null, matched: 0, steps: [] });
  }

  for (const workflow of matchingWorkflows) {
    const runSteps: RunStep[] = [];
    for (const step of workflow.steps) {
      const targetAtom = blockRuntimeAtom(step.targetId);
      const currentTargetState = store.get(targetAtom);

      // A step can carry many conditions now. `conditions` wins when present;
      // `condition` (singular) is still read so every page saved before this
      // keeps behaving identically.
      /**
       * `fieldId` used to be the test for "is this a real condition", which was
       * fine while every condition named a field. An expression condition names
       * none -- so this guard silently dropped it and the step ran with NO
       * condition at all, which is the worst possible direction to fail in: a
       * step guarded by "only when the order is over 500" ran on every order.
       *
       * Found by running a workflow in the browser, not by the 784 checks, all
       * of which called stepConditionResult directly and never came through
       * here. A gate is exactly what the author of a condition does not think
       * to test.
       */
      const isRealCondition = (c: StepCondition | null | undefined) =>
        !!c && (!!c.fieldId || (c.expression || '').trim() !== '');

      const stepConditions =
        step.conditions && step.conditions.filter(isRealCondition).length
          ? step.conditions.filter(isRealCondition)
          : isRealCondition(step.condition)
            ? [step.condition as StepCondition]
            : [];

      if (stepConditions.length) {
        const outcomes = stepConditions.map((c) => stepConditionResult(c, store));
        const results = outcomes.map((o) => o.pass);
        const matchMode = step.match === 'any' ? 'any' : 'all';
        const conditionPassed =
          matchMode === 'any' ? results.some(Boolean) : results.every(Boolean);

        if (!conditionPassed) {
          const detail = outcomes.map((o) => o.describe).join('; ');
          if (step.elseAction) {
            const elseTarget = step.elseTargetId || step.targetId;
            const { before, after } = runElseAction(
              step.elseAction,
              elseTarget,
              store,
              step.elseValue,
              step.elseAmount
            );
            runSteps.push({
              targetId: elseTarget,
              action: `otherwise: ${step.elseAction}`,
              status: 'ran',
              before,
              after,
              reason: `conditions did not pass, so the otherwise branch ran — ${detail}`,
            });
          } else {
            runSteps.push({
              targetId: step.targetId,
              action: step.action,
              status: 'skipped',
              reason: `${matchMode === 'any' ? 'none of' : 'not all'} the conditions met — ${detail}`,
            });
          }
          continue; // Either way this step is done; move to the next
        }
      }

      /**
       * The submit guard.
       *
       * On by default for the actions that write a row, because a form that
       * writes rubbish into the database is the failure this whole feature
       * exists to prevent. Off is one checkbox away in the action popup, so the
       * default is a starting point rather than a ceiling.
       *
       * Every field involved is marked touched even when only one of them is
       * wrong: pressing submit should reveal the whole form's complaints at
       * once, not make someone fix them one press at a time.
       */
      const guardOn =
        step.requireValid ?? (step.action === 'addRow' || step.action === 'updateRow');
      if (guardOn) {
        const fields = fieldsReadByStep(step, store);
        const problems: string[] = [];
        for (const fieldId of fields) {
          const message = markValidated(fieldId, store, true);
          if (message) {
            const fieldState = store.get(blockRuntimeAtom(fieldId));
            const label = fieldState?.blockName || fieldId;
            problems.push(`${label}: ${message}`);
          }
        }
        if (problems.length) {
          runSteps.push({
            targetId: step.targetId,
            action: step.action,
            status: 'skipped',
            reason: `a field it uses is not valid — ${problems.join('; ')}`,
          });
          continue;
        }
      }

      // Execute the step's action
      const currentValue = currentTargetState.value;
      const valueBefore = currentValue;

      switch (step.action) {
        case 'increment': {
          const amount = step.amount ?? 1;
          const num = typeof currentValue === 'number' ? currentValue : 0;
          let newVal = num + amount;
          if (currentTargetState.min !== undefined) {
            newVal = Math.max(currentTargetState.min, newVal);
          }
          if (currentTargetState.max !== undefined) {
            newVal = Math.min(currentTargetState.max, newVal);
          }
          store.set(targetAtom, {
            ...currentTargetState,
            value: newVal,
          });
          break;
        }
        case 'decrement': {
          const amount = step.amount ?? 1;
          const num = typeof currentValue === 'number' ? currentValue : 0;
          let newVal = num - amount;
          if (currentTargetState.min !== undefined) {
            newVal = Math.max(currentTargetState.min, newVal);
          }
          if (currentTargetState.max !== undefined) {
            newVal = Math.min(currentTargetState.max, newVal);
          }
          store.set(targetAtom, {
            ...currentTargetState,
            value: newVal,
          });
          break;
        }
        case 'set': {
          let targetValue = step.value;
          if (step.value === '__sourceValue__') {
            const sourceAtom = blockRuntimeAtom(sourceId);
            const sourceState = store.get(sourceAtom);
            targetValue = sourceState?.value;
          }
          store.set(targetAtom, {
            ...currentTargetState,
            value: targetValue,
          });
          break;
        }
        case 'addRow': {
          const targetState = store.get(targetAtom);
          const columns = targetState?.columns || [];
          const currentRows = targetState?.rows || [];

          const rowId = `row_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const defaultData: Record<string, any> = {};

          columns.forEach((col: any) => {
            const mapping = step.mappings?.[col.name] || { source: 'fixed', value: '' };
            let evaluatedValue: any = '';

            if (mapping.source === 'fixed') {
              evaluatedValue = mapping.value;
            } else {
              const refAtom = blockRuntimeAtom(mapping.value);
              const refState = store.get(refAtom);
              evaluatedValue = refState?.value;
            }

            if (col.type === 'number') {
              const num = Number(evaluatedValue);
              evaluatedValue = isNaN(num) ? 0 : num;
            } else if (col.type === 'boolean') {
              evaluatedValue = evaluatedValue === 'true' || evaluatedValue === true;
            } else {
              evaluatedValue = String(evaluatedValue === undefined || evaluatedValue === null ? '' : evaluatedValue);
            }

            defaultData[col.name] = evaluatedValue;
          });

          const updatedRows = [...currentRows, { id: rowId, ...defaultData }];

          let nextValue = 0;
          nextValue = computeDatabaseOutput(updatedRows, targetState);

          store.set(targetAtom, {
            ...targetState,
            rows: updatedRows,
            value: nextValue
          });

          // Insert into Supabase
          try {
            supabase
              .rpc('add_database_row', {
                p_id: rowId,
                p_block_id: step.targetId,
                p_row_data: defaultData
              })
              .then(({ error }: any) => {
                if (error) {
                  console.warn('[Supabase execute info]: Could not insert row via workflow action, falling back to local state.', error.message);
                }
              });
          } catch (err) {
            console.error('Error inserting row in Supabase via workflow:', err);
          }
          break;
        }
        case 'updateRow': {
          const targetState = store.get(targetAtom);
          const columns = targetState?.columns || [];
          const currentRows = targetState?.rows || [];

          const matchCol = step.matchColumn;
          if (!matchCol) break;

          let matchVal: any = '';
          if (step.matchValue) {
            if (step.matchValue.source === 'fixed') {
              matchVal = step.matchValue.value;
            } else {
              const refAtom = blockRuntimeAtom(step.matchValue.value);
              const refState = store.get(refAtom);
              matchVal = refState?.value;
            }
          }

          const colDef = columns.find((c: any) => c.name === matchCol);
          let parsedMatchVal = matchVal;
          if (colDef) {
            if (colDef.type === 'number') {
              parsedMatchVal = Number(matchVal);
            } else if (colDef.type === 'boolean') {
              parsedMatchVal = matchVal === 'true' || matchVal === true;
            } else {
              parsedMatchVal = String(matchVal === undefined || matchVal === null ? '' : matchVal);
            }
          }

          const matchedRowIndex = currentRows.findIndex((row: any) => {
            let rowVal = row[matchCol];
            if (colDef?.type === 'number') {
              rowVal = Number(rowVal);
            } else if (colDef?.type === 'boolean') {
              rowVal = rowVal === 'true' || rowVal === true;
            } else {
              rowVal = String(rowVal === undefined || rowVal === null ? '' : rowVal);
            }
            return rowVal === parsedMatchVal;
          });

          if (matchedRowIndex === -1) break;

          // Found row, let's construct updated row data
          const matchedRow = currentRows[matchedRowIndex];
          const updatedRowData = { ...matchedRow };

          columns.forEach((col: any) => {
            const mapping = step.mappings?.[col.name];
            if (!mapping) return; // Keep old value if not mapped

            // Skip empty column mapping values (fixed or block reference)
            if (mapping.source === 'fixed') {
              if (mapping.value === undefined || mapping.value === null || String(mapping.value).trim() === '') {
                return;
              }
            } else if (mapping.source === 'block') {
              if (!mapping.value) {
                return;
              }
            }

            let evaluatedValue: any = '';
            if (mapping.source === 'fixed') {
              evaluatedValue = mapping.value;
            } else {
              const refAtom = blockRuntimeAtom(mapping.value);
              const refState = store.get(refAtom);
              evaluatedValue = refState?.value;
            }

            if (col.type === 'number') {
              const num = Number(evaluatedValue);
              evaluatedValue = isNaN(num) ? 0 : num;
            } else if (col.type === 'boolean') {
              evaluatedValue = evaluatedValue === 'true' || evaluatedValue === true;
            } else {
              evaluatedValue = String(evaluatedValue === undefined || evaluatedValue === null ? '' : evaluatedValue);
            }

            updatedRowData[col.name] = evaluatedValue;
          });

          const updatedRows = [...currentRows];
          updatedRows[matchedRowIndex] = updatedRowData;

          let nextValue = 0;
          nextValue = computeDatabaseOutput(updatedRows, targetState);

          store.set(targetAtom, {
            ...targetState,
            rows: updatedRows,
            value: nextValue
          });

          // Sync to Supabase: Fetch current data object first, merge overrides, and save back
          try {
            supabase
              .rpc('list_database_rows', { p_block_id: step.targetId })
              .then(({ data: dbRows, error: selectError }: any) => {
                if (selectError) {
                  console.warn('[Supabase execute info]: Could not fetch current row from Supabase.', selectError.message);
                  return;
                }

                const matchedDbRow = dbRows?.find((r: any) => r.id === matchedRow.id);
                const currentData = matchedDbRow?.row_data || {};
                const mergedData = { ...currentData };

                columns.forEach((col: any) => {
                  const mapping = step.mappings?.[col.name];
                  if (!mapping) return; // Keep old value if not mapped

                  // Skip empty column mapping values (fixed or block reference)
                  if (mapping.source === 'fixed') {
                    if (mapping.value === undefined || mapping.value === null || String(mapping.value).trim() === '') {
                      return;
                    }
                  } else if (mapping.source === 'block') {
                    if (!mapping.value) {
                      return;
                    }
                  }

                  let evaluatedValue: any = '';
                  if (mapping.source === 'fixed') {
                    evaluatedValue = mapping.value;
                  } else {
                    const refAtom = blockRuntimeAtom(mapping.value);
                    const refState = store.get(refAtom);
                    evaluatedValue = refState?.value;
                  }

                  if (col.type === 'number') {
                    const num = Number(evaluatedValue);
                    evaluatedValue = isNaN(num) ? 0 : num;
                  } else if (col.type === 'boolean') {
                    evaluatedValue = evaluatedValue === 'true' || evaluatedValue === true;
                  } else {
                    evaluatedValue = String(evaluatedValue === undefined || evaluatedValue === null ? '' : evaluatedValue);
                  }

                  mergedData[col.name] = evaluatedValue;
                });

                // Write merged object back to Supabase using row ID
                supabase
                  .rpc('update_database_row', {
                    p_id: matchedRow.id,
                    p_row_data: mergedData
                  })
                  .then(({ error: updateError }: any) => {
                    if (updateError) {
                      console.warn('[Supabase execute info]: Could not update row via workflow action.', updateError.message);
                    }
                  });
              });
          } catch (err) {
            console.error('Error updating row in Supabase via workflow:', err);
          }
          break;
        }
        case 'deleteRow': {
          const targetState = store.get(targetAtom);
          const columns = targetState?.columns || [];
          const currentRows = targetState?.rows || [];

          const matchCol = step.matchColumn;
          if (!matchCol) break;

          let matchVal: any = '';
          if (step.matchValue) {
            if (step.matchValue.source === 'fixed') {
              matchVal = step.matchValue.value;
            } else {
              const refAtom = blockRuntimeAtom(step.matchValue.value);
              const refState = store.get(refAtom);
              matchVal = refState?.value;
            }
          }

          const colDef = columns.find((c: any) => c.name === matchCol);
          let parsedMatchVal = matchVal;
          if (colDef) {
            if (colDef.type === 'number') {
              parsedMatchVal = Number(matchVal);
            } else if (colDef.type === 'boolean') {
              parsedMatchVal = matchVal === 'true' || matchVal === true;
            } else {
              parsedMatchVal = String(matchVal === undefined || matchVal === null ? '' : matchVal);
            }
          }

          const matchedRowIndex = currentRows.findIndex((row: any) => {
            let rowVal = row[matchCol];
            if (colDef?.type === 'number') {
              rowVal = Number(rowVal);
            } else if (colDef?.type === 'boolean') {
              rowVal = rowVal === 'true' || rowVal === true;
            } else {
              rowVal = String(rowVal === undefined || rowVal === null ? '' : rowVal);
            }
            return rowVal === parsedMatchVal;
          });

          if (matchedRowIndex === -1) break;

          const targetRow = currentRows[matchedRowIndex];
          const updatedRows = currentRows.filter((_, idx) => idx !== matchedRowIndex);

          let nextValue = 0;
          nextValue = computeDatabaseOutput(updatedRows, targetState);

          store.set(targetAtom, {
            ...targetState,
            rows: updatedRows,
            value: nextValue
          });

          // Delete from Supabase
          try {
            supabase
              .rpc('delete_database_row', { p_id: targetRow.id })
              .then(({ error }: any) => {
                if (error) {
                  console.warn('[Supabase execute info]: Could not delete row via workflow action, falling back to local state.', error.message);
                }
              });
          } catch (err) {
            console.error('Error deleting row in Supabase via workflow:', err);
          }
          break;
        }
        case 'toggle': {
          store.set(targetAtom, {
            ...currentTargetState,
            value: !currentValue,
          });
          break;
        }
        case 'sendWebhook': {
          // Whatever the target block holds, flattened so the receiving tool can
          // map it onto columns without anyone writing a transform.
          const hookUrl = (step.webhookUrl || '').trim();
          if (hookUrl) {
            let payloadData: Record<string, any>;
            const hookRows = (currentTargetState?.rows || []) as Record<string, any>[];
            if (hookRows.length) {
              // A Database sends its NEWEST row -- that is the submission that
              // just happened, which is what anyone wiring this actually means.
              const newest = { ...hookRows[hookRows.length - 1] };
              delete newest.id;
              payloadData = newest;
            } else {
              payloadData = { value: currentTargetState?.value };
            }
            let activePage: string | null = null;
            try { activePage = localStorage.getItem('creora_active_page_id'); } catch { activePage = null; }
            /**
             * The one action that genuinely takes time, so it is the one that
             * owns the busy state. Set on the thing that was pressed, cleared
             * when the request settles either way -- a button stuck on "Sending"
             * forever is worse than one that reports a failure.
             *
             * Both writes re-read the state at write time. Spreading the
             * render-time copy is the stale-closure bug that made a Database
             * show a count from two edits ago.
             */
            const busyId = sourceId;
            const setBusy = (busy: boolean) => {
              const fresh = store.get(blockRuntimeAtom(busyId));
              if (fresh) store.set(blockRuntimeAtom(busyId), { ...fresh, loading: busy });
            };
            setBusy(true);
            sendWebhook(hookUrl, {
              source: 'creora',
              pageId: activePage,
              block: currentTargetState?.blockName || step.targetId,
              sentAt: new Date().toISOString(),
              data: payloadData,
            })
              .catch((e) => {
                const detail = e && e.message ? e.message : String(e);
                console.warn('[creora] webhook failed:', detail);
                recordRun(store, {
                  sourceId,
                  event,
                  workflowId: workflow.id,
                  matched: 1,
                  steps: [
                    {
                      targetId: step.targetId,
                      action: 'sendWebhook',
                      status: 'skipped',
                      reason: `the send failed — ${detail}`,
                    },
                  ],
                });
              })
              .finally(() => setBusy(false));
          }
          break;
        }
        case 'exportCsv': {
          // "I want the data in my website to go into Excel, in the order I want."
          // Column order is the Database block's own column order, so the order
          // is something the builder controls rather than something we guess.
          const cols = (currentTargetState?.columns || []) as { name: string }[];
          const rows = (currentTargetState?.rows || []) as Record<string, any>[];
          const esc = (v: any) => {
            const str = v === null || v === undefined ? '' : String(v);
            // Excel needs quotes doubled, and any field holding a comma, quote or
            // newline wrapped — otherwise one comma in a message shifts a column.
            return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
          };
          const header = cols.map((c) => esc(c.name)).join(',');
          const body = rows.map((r) => cols.map((c) => esc(r[c.name])).join(',')).join('\r\n');
          // \r\n and a BOM: Excel needs both to open a UTF-8 CSV without mangling
          // accents and without putting every row in one cell.
          const csv = '\ufeff' + header + '\r\n' + body;

          if (typeof document !== 'undefined') {
            const name = (currentTargetState?.blockName || 'data')
              .replace(/[^a-z0-9\-_ ]/gi, '')
              .trim() || 'data';
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
          break;
        }
        case 'setText': {
          /**
           * Set a value from a sentence rather than a single number.
           *
           * "Hello {{First}}, you have {{Cart | number}} items" is the shape of
           * every confirmation message, every label, every row a form writes.
           * It resolves names through the same function templates use, so a
           * workflow and a piece of markup can never disagree about what
           * {{First}} means.
           *
           * Not escaped, because this produces a value rather than markup. A
           * name with an ampersand in it should stay a name.
           */
          const text = renderTemplate(String(step.value ?? ''), blockValuesByName(store));
          store.set(targetAtom, { ...currentTargetState, value: text });
          break;
        }
        case 'validate': {
          // Checks the target and, unlike typing in it, admits it has been seen.
          // This is what a submit button wires to when it should light up the
          // form's problems without writing anything.
          markValidated(step.targetId, store, true);
          break;
        }
        case 'setLoading': {
          store.set(targetAtom, { ...currentTargetState, loading: true });
          break;
        }
        case 'clearLoading': {
          store.set(targetAtom, { ...currentTargetState, loading: false });
          break;
        }
        case 'setDisabled': {
          store.set(targetAtom, { ...currentTargetState, disabled: true });
          break;
        }
        case 'setEnabled': {
          store.set(targetAtom, { ...currentTargetState, disabled: false });
          break;
        }
        case 'setVisible': {
          store.set(targetAtom, {
            ...currentTargetState,
            visible: true,
          });
          break;
        }
        case 'setHidden': {
          store.set(targetAtom, {
            ...currentTargetState,
            visible: false,
          });
          break;
        }
        case 'reset': {
          let newVal = getBlockDefaultValue(step.targetId);
          if (currentTargetState.min !== undefined && typeof newVal === 'number') {
            newVal = currentTargetState.min;
          }
          store.set(targetAtom, {
            ...currentTargetState,
            value: newVal,
            // A reset form is a fresh form. Leaving the red behind after
            // "clear" is the small thing that makes a page feel broken.
            validationError: null,
            touched: false,
          });
          break;
        }
        default:
          // Other actions are ignored or handled as no-ops in this step
          break;
      }

      // Any action that changes a value can change whether that value is valid.
      // Rechecked without touching, so a change the page made itself never
      // reveals a complaint the visitor has not had the chance to cause.
      if (currentTargetState.rules && currentTargetState.rules.length && step.action !== 'validate') {
        markValidated(step.targetId, store, false);
      }

      /**
       * THE LINK THAT WAS MISSING.
       *
       * A step changed this block's value; anything wired out of THIS block
       * has to hear about it, exactly as it would if a person had typed the
       * value in. Without this the chain is one link long: pressing a button
       * added a row and the Database's own count updated, and the Number
       * Display wired to that Database never moved. It looked like a counter
       * bug. It was every two-step chain in the product.
       *
       * Guarded three ways: only when the value actually changed, never for a
       * step pointing at its own source, and never deeper than MAX_CHAIN_DEPTH.
       */
      const valueAfter = store.get(targetAtom)?.value;
      const valueChanged = JSON.stringify(valueBefore) !== JSON.stringify(valueAfter);

      if (valueChanged && step.targetId !== sourceId) {
        if (chainDepth < MAX_CHAIN_DEPTH) {
          chainDepth += 1;
          try {
            executeWorkflow(step.targetId, 'onChange', store);
          } finally {
            chainDepth -= 1;
          }
        } else {
          // Said out loud rather than silently stopping. A chain that quietly
          // gives up looks exactly like a broken wire.
          recordRun(store, {
            sourceId: step.targetId,
            event: 'onChange',
            workflowId: null,
            matched: 0,
            steps: [{
              targetId: step.targetId,
              action: '(chain stopped)',
              status: 'skipped',
              reason: `more than ${MAX_CHAIN_DEPTH} blocks changed one after another — check for a wire that leads back to where it started`,
            }],
          });
        }
      }

      runSteps.push({
        targetId: step.targetId,
        action: step.action,
        status: 'ran',
        before: valueBefore,
        after: store.get(targetAtom)?.value,
      });
    }

    recordRun(store, {
      sourceId,
      event,
      workflowId: workflow.id,
      matched: matchingWorkflows.length,
      steps: runSteps,
    });
  }

  // Live recalculate all formulas. The one call site that propagates: a
  // recalculation here is the consequence of something that just happened,
  // rather than a page settling on load.
  recalculateAllFormulas(store, { propagate: true });
}

/**
 * Kept as the name every call site already uses; the language itself now lives
 * in lib/formula.ts.
 *
 * It used to be `+ - * / %` and a `default: return 0` that swallowed everything
 * else -- so `if(...)` and `Price > 100` both quietly answered 0. Arithmetic is
 * unchanged, and there is a check asserting that formulas saved before today
 * still produce the same numbers.
 */
export function evaluateFormula(formula: string, scope: Record<string, any>): FormulaValue {
  return evaluateExpression(formula, scope);
}

/**
 * @param propagate  Whether a formula whose answer CHANGED should fire its own
 *   onChange, so anything wired out of it hears about it.
 *
 *   Off by default, and that default is the whole safety of it. This runs on
 *   page load, on import, and on every keystroke in the formula box, and a
 *   formula settling to its first value on load is not an event -- firing
 *   workflows there would write a row every time a visitor opened a page.
 *   Only executeWorkflow turns it on, because only there is the recalculation
 *   the CONSEQUENCE of something a person or a poll just did.
 */
export function recalculateAllFormulas(store: any, options?: { propagate?: boolean }) {
  const allBlockIds = store.get(allBlockIdsAtom);
  const formulas = store.get(formulasAtom);

  /**
   * THE SECOND HALF OF THE LINK THAT WAS MISSING.
   *
   * Cycle 12 made a workflow step that changes a block fire that block's own
   * onChange, which turned every two-step chain from broken into working.
   * Formulas were not part of that fix, and they write their answers through
   * store.set directly -- so a Formula block was a dead end in the reactive
   * graph. Button -> Count -> Total worked; anything wired OUT of Total never
   * heard a thing.
   *
   * Measured in a browser before a line of this was written: Count went to 10,
   * Total recalculated to 20, and the block wired to Total stayed at 0.
   */
  const valuesBefore: Record<string, any> = {};
  if (options?.propagate) {
    for (const binding of formulas) {
      valuesBefore[binding.targetBlockId] = store.get(blockRuntimeAtom(binding.targetBlockId))?.value;
    }
  }

  let scope: Record<string, any> = {};

  // Execute formula evaluation in 2 successive passes to resolve chained formula dependencies
  for (let pass = 1; pass <= 2; pass++) {
    // 1. Build variables scope
    scope = formulaScope(store);


    // 2. Evaluate all formula bindings
    for (const binding of formulas) {
      // Only calculate if the target block exists
      if (allBlockIds.includes(binding.targetBlockId)) {
        const targetAtom = blockRuntimeAtom(binding.targetBlockId);
        const currentTargetState = store.get(targetAtom);

        try {
          const calculatedValue = evaluateFormula(binding.formula, scope);
          if (currentTargetState.value !== calculatedValue || currentTargetState.error !== null) {
            store.set(targetAtom, {
              ...currentTargetState,
              value: calculatedValue,
              error: null,
            });
          }
        } catch (err: any) {
          console.error('Error evaluating formula for block:', binding.targetBlockId, err);
          const errMsg = err?.message || 'Error';
          if (currentTargetState.value !== 'Error' || currentTargetState.error !== errMsg) {
            store.set(targetAtom, {
              ...currentTargetState,
              value: 'Error',
              error: errMsg,
            });
          }
        }
      }
    }
  }

  // 3. Update all History Chart blocks
  for (const blockId of allBlockIds) {
    /**
     * Through the registry, not by substring-matching the id.
     *
     * This is the bug the registry was created to kill, still living here:
     * "block type was inferred by substring-matching the ID (id.includes('db')),
     * so an ID was secretly carrying type information". A random suffix can
     * contain letters -- the fallback id generator is base36 -- so a Button
     * born as `buttonBlock__ch4rtx1a2b` was one unlucky draw away from having
     * its history quietly rewritten by the chart code.
     */
    if (nodeTypeFromBlockId(blockId) === 'historyChartBlock') {
      const chartAtom = blockRuntimeAtom(blockId);
      const chartState = store.get(chartAtom);
      const trackedId = chartState?.trackedBlockId;
      if (trackedId && allBlockIds.includes(trackedId)) {
        const trackedVal = scope[trackedId] ?? 0;
        const currentHistory = chartState?.history || [];
        const lastVal = currentHistory[currentHistory.length - 1];
        if (currentHistory.length === 0 || lastVal !== trackedVal) {
          // Append new value and enforce the 20-entry maximum cap
          let newHistory = [...currentHistory, trackedVal];
          if (newHistory.length > 20) {
            newHistory = newHistory.slice(newHistory.length - 20);
          }
          store.set(chartAtom, {
            ...chartState,
            history: newHistory,
          });
        }
      }
    }
  }

  /**
   * Guarded the same three ways as the step version: only when the answer
   * actually changed, only when asked to propagate, and never deeper than
   * MAX_CHAIN_DEPTH -- a formula feeding a block that feeds the formula is a
   * loop, and it is bounded rather than trusted.
   */
  if (options?.propagate) {
    for (const binding of formulas) {
      const id = binding.targetBlockId;
      if (!allBlockIds.includes(id)) continue;
      const after = store.get(blockRuntimeAtom(id))?.value;
      if (JSON.stringify(valuesBefore[id]) === JSON.stringify(after)) continue;

      if (chainDepth < MAX_CHAIN_DEPTH) {
        chainDepth += 1;
        try {
          executeWorkflow(id, 'onChange', store);
        } finally {
          chainDepth -= 1;
        }
      } else {
        // Said out loud. A chain that quietly gives up looks like a broken wire.
        recordRun(store, {
          sourceId: id,
          event: 'onChange',
          workflowId: null,
          matched: 0,
          steps: [{
            targetId: id,
            action: '(chain stopped)',
            status: 'skipped',
            reason: `more than ${MAX_CHAIN_DEPTH} blocks changed one after another — check for a formula that leads back to where it started`,
          }],
        });
      }
    }
  }

  /**
   * 4. Update all List blocks from Supabase.
   *
   * HOW MANY QUERIES ONE CLICK COSTS
   * This runs at the end of every executeWorkflow, and since chains propagate
   * (a step firing its target's onChange, and as of today a formula firing its
   * own), ONE click can execute several workflows one after another -- up to
   * MAX_CHAIN_DEPTH. Each of those ended here and fired one query per List
   * block. Two List blocks on a three-link chain was six queries for one press,
   * and today's formula propagation made those chains longer.
   *
   * That is the 5 GB egress the free tier actually runs out of, spent on
   * refetching rows nobody asked for.
   *
   * Only the OUTERMOST recalculation fetches now. Every inner link would fetch
   * the same rows for the same blocks a few milliseconds apart, so the ones
   * being skipped are duplicates by construction, not data that goes missing.
   */
  if (shouldFetchListRows(chainDepth)) fetchListBlockRows(allBlockIds, store);
}

/**
 * Only the outermost recalculation fetches.
 *
 * A named function rather than `chainDepth === 0` written inline, because
 * chainDepth is module-private and a guard nothing can reach is a guard nothing
 * can prove. Removing the inline version turned zero checks red -- which is the
 * definition of decoration -- so the policy is stated here where a check can
 * ask it directly, and a second check asserts the call site still calls it.
 *
 * Inner links would fetch the same rows for the same blocks milliseconds apart,
 * so what is skipped is duplicates by construction, not data going missing.
 */
export function shouldFetchListRows(depth: number): boolean {
  return depth === 0;
}

/**
 * Split out so the count is checkable.
 *
 * Living inline meant "how many queries does a click cost" could only be
 * answered by watching a network tab, and the browser was not a reliable
 * instrument. `fetchRows` is injectable for exactly that: a check can count
 * calls without a network, which is the difference between knowing and
 * assuming.
 */
export function fetchListBlockRows(
  allBlockIds: string[],
  store: any,
  // Supabase's builder is thenable rather than a real Promise, so it is awaited
  // into one here. Typing the parameter as the builder would tie every future
  // caller -- and every check -- to Supabase's shape.
  fetchRows: (trackedId: string) => Promise<{ data?: any; error?: any }> =
    async (trackedId) => await supabase.rpc('list_database_rows', { p_block_id: trackedId }),
): number {
  let issued = 0;
  for (const blockId of allBlockIds) {
    // Through the registry, not by substring-matching the id. `list` is also
    // the shortest of the words the old check matched on, so it was the
    // likeliest to be hit by accident.
    if (nodeTypeFromBlockId(blockId) === 'listBlock') {
      const listAtom = blockRuntimeAtom(blockId);
      const listState = store.get(listAtom);
      const trackedId = listState?.trackedBlockId;
      if (trackedId) {
        issued += 1;
        fetchRows(trackedId)
          .then(({ data, error }: any) => {
            if (error) {
              console.warn('[ListBlock recalculate] Supabase fetch error:', error.message);
              return;
            }
            if (data) {
              const parsedRows = data.map((item: any) => ({
                id: item.id,
                ...item.row_data
              }));
              const currentListState = store.get(listAtom);
              const currentListRows = currentListState?.rows || [];
              if (parsedRows.length > 0 || currentListRows.length === 0) {
                store.set(listAtom, {
                  ...currentListState,
                  rows: parsedRows
                });
              }
            }
          })
          .catch(() => { /* a refresh that fails must not take the page with it */ });
      }
    }
  }
  return issued;
}

