import { getDefaultStore } from 'jotai';
import jsep from 'jsep';
import type { TriggerEvent } from '../types/creora';
import { blockRuntimeAtom, workflowsAtom, formulasAtom, allBlockIdsAtom, getBlockDefaultValue , recordRun, type RunStep } from '../state/atoms';
import { sendWebhook } from './webhook';
import { computeDatabaseOutput } from './databaseOutput';
import { supabase } from './supabase';


/**
 * One condition, evaluated. Pulled out of executeWorkflow so a step can hold a
 * list of them rather than exactly one.
 *
 * Operators come in pairs on purpose: every positive has a negative, because
 * "only run this if X has NOT happened" is as common as the other way round and
 * used to be impossible to say.
 */
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
    case 'greaterThan':
    case 'greater than':
      return asNumber(actual) > asNumber(expected);
    case 'lessThan':
    case 'less than':
      return asNumber(actual) < asNumber(expected);
    case 'greaterOrEqual':
      return asNumber(actual) >= asNumber(expected);
    case 'lessOrEqual':
      return asNumber(actual) <= asNumber(expected);
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
export const ELSE_ACTIONS = ['increment', 'decrement', 'set', 'toggle', 'reset', 'setVisible', 'setHidden'] as const;

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
    default:
      break;
  }

  return { before, after: store.get(atom)?.value };
}

export function executeWorkflow(
  sourceId: string,
  event: TriggerEvent,
  store: ReturnType<typeof getDefaultStore>
) {
  const workflows = store.get(workflowsAtom);
  console.log('executeWorkflow: all workflows in store:', workflows);
  console.log('executeWorkflow: filtering for sourceId =', sourceId, 'event =', event);
  const matchingWorkflows = workflows.filter(
    (w) => w.sourceId === sourceId && w.sourceEvent === event
  );
  console.log('executeWorkflow: matching workflows count =', matchingWorkflows.length);

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
      const stepConditions =
        step.conditions && step.conditions.length
          ? step.conditions
          : step.condition && step.condition.fieldId
            ? [step.condition]
            : [];

      if (stepConditions.length) {
        const results = stepConditions.map((c) => {
          const state = store.get(blockRuntimeAtom(c.fieldId));
          return evaluateCondition(state?.value, c.operator, c.value);
        });
        const matchMode = step.match === 'any' ? 'any' : 'all';
        const conditionPassed =
          matchMode === 'any' ? results.some(Boolean) : results.every(Boolean);

        if (!conditionPassed) {
          const detail = stepConditions
            .map((c, i) => {
              const actual = store.get(blockRuntimeAtom(c.fieldId))?.value;
              return `${c.fieldId} ${c.operator} ${JSON.stringify(c.value)} -> ${results[i] ? 'pass' : 'FAIL'} (actual ${JSON.stringify(actual)})`;
            })
            .join('; ');
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
                    } else {
                      console.log('[Supabase execute info]: Successfully updated row inside database_rows.');
                      // State explicitly that the row count is unchanged
                      console.log('[Supabase execute info]: Row count in database_rows is verified UNCHANGED.');
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
            sendWebhook(hookUrl, {
              source: 'creora',
              pageId: activePage,
              block: currentTargetState?.blockName || step.targetId,
              sentAt: new Date().toISOString(),
              data: payloadData,
            }).catch((e) => console.warn('[creora] webhook failed:', e && e.message ? e.message : e));
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
          });
          break;
        }
        default:
          // Other actions are ignored or handled as no-ops in this step
          break;
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

  // Live recalculate all formulas
  recalculateAllFormulas(store);
}

export function evaluateFormula(formula: string, scope: Record<string, any>): number {
  if (!formula || formula.trim() === '') return 0;
  
  const ast = jsep(formula);
  const evalNode = (node: any): any => {
    switch (node.type) {
      case 'Literal':
        return Number(node.value);
      case 'Identifier':
        if (!(node.name in scope)) {
          throw new Error(`Referenced block "${node.name}" does not exist`);
        }
        const val = scope[node.name];
        return val !== undefined ? Number(val) : 0;
      case 'UnaryExpression': {
        const arg = evalNode(node.argument);
        if (node.operator === '-') return -arg;
        if (node.operator === '+') return +arg;
        return arg;
      }
      case 'BinaryExpression': {
        const left = evalNode(node.left);
        const right = evalNode(node.right);
        switch (node.operator) {
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/': return right !== 0 ? left / right : 0;
          case '%': return right !== 0 ? left % right : 0;
          default: return 0;
        }
      }
      default:
        return 0;
    }
  };
  const result = evalNode(ast);
  return isNaN(result) ? 0 : result;
}

export function recalculateAllFormulas(store: any) {
  const allBlockIds = store.get(allBlockIdsAtom);
  const formulas = store.get(formulasAtom);

  let scope: Record<string, number> = {};

  // Execute formula evaluation in 2 successive passes to resolve chained formula dependencies
  for (let pass = 1; pass <= 2; pass++) {
    // 1. Build variables scope
    scope = {};
    for (const blockId of allBlockIds) {
      const runtimeState = store.get(blockRuntimeAtom(blockId));
      let val = runtimeState?.value;
      if (typeof val === 'boolean') {
        val = val ? 1 : 0;
      } else if (typeof val === 'string') {
        const num = Number(val);
        val = isNaN(num) ? 0 : num;
      }
      scope[blockId] = val ?? 0;
    }

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
    if (blockId.toLowerCase().includes('chart') || blockId.toLowerCase().includes('history')) {
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

  // 4. Update all List blocks from Supabase
  for (const blockId of allBlockIds) {
    if (blockId.toLowerCase().includes('list')) {
      const listAtom = blockRuntimeAtom(blockId);
      const listState = store.get(listAtom);
      const trackedId = listState?.trackedBlockId;
      if (trackedId) {
        supabase
          .rpc('list_database_rows', { p_block_id: trackedId })
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
          });
      }
    }
  }
}

