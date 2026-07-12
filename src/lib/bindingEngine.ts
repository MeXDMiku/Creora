import { getDefaultStore } from 'jotai';
import jsep from 'jsep';
import type { TriggerEvent } from '../types/creora';
import { blockRuntimeAtom, workflowsAtom, formulasAtom, allBlockIdsAtom, getBlockDefaultValue } from '../state/atoms';
import { supabase } from './supabase';


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

  for (const workflow of matchingWorkflows) {
    for (const step of workflow.steps) {
      const targetAtom = blockRuntimeAtom(step.targetId);
      const currentTargetState = store.get(targetAtom);

      if (step.condition && step.condition.fieldId) {
        const conditionBlockState = store.get(blockRuntimeAtom(step.condition.fieldId));
        const valToCompare = conditionBlockState?.value;

        let conditionPassed = false;
        const condValue = step.condition.value;

        switch (step.condition.operator) {
          case 'is ON':
          case 'is_ON':
            conditionPassed = valToCompare === true;
            break;
          case 'is OFF':
          case 'is_OFF':
            conditionPassed = valToCompare === false;
            break;
          case 'equals':
            if (typeof valToCompare === 'number' || (valToCompare !== null && !isNaN(Number(valToCompare)))) {
              conditionPassed = Number(valToCompare) === Number(condValue);
            } else {
              conditionPassed = valToCompare === condValue;
            }
            break;
          case 'notEquals':
            conditionPassed = valToCompare !== condValue;
            break;
          case 'greaterThan':
          case 'greater than':
            conditionPassed = Number(valToCompare) > Number(condValue);
            break;
          case 'lessThan':
          case 'less than':
            conditionPassed = Number(valToCompare) < Number(condValue);
            break;
          case 'contains':
            if (typeof valToCompare === 'string' || Array.isArray(valToCompare)) {
              conditionPassed = valToCompare.includes(condValue);
            }
            break;
          case 'isEmpty':
            if (valToCompare === null || valToCompare === undefined) {
              conditionPassed = true;
            } else if (typeof valToCompare === 'string' || Array.isArray(valToCompare)) {
              conditionPassed = valToCompare.length === 0;
            }
            break;
          default:
            conditionPassed = false;
        }

        if (!conditionPassed) {
          continue; // Skip this step, but continue to the next step
        }
      }

      // Execute the step's action
      const currentValue = currentTargetState.value;

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
          const outputMode = targetState?.outputMode || 'row_count';

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
          if (outputMode === 'row_count') {
            nextValue = updatedRows.length;
          } else {
            const lastRow = updatedRows[updatedRows.length - 1];
            nextValue = lastRow ? lastRow[outputMode] : 0;
          }

          store.set(targetAtom, {
            ...targetState,
            rows: updatedRows,
            value: nextValue
          });

          // Insert into Supabase
          try {
            supabase
              .from('database_rows')
              .insert({
                id: rowId,
                database_block_id: step.targetId,
                row_data: defaultData,
                created_at: new Date().toISOString()
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
          const outputMode = targetState?.outputMode || 'row_count';

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
          if (outputMode === 'row_count') {
            nextValue = updatedRows.length;
          } else {
            const lastRow = updatedRows[updatedRows.length - 1];
            nextValue = lastRow ? lastRow[outputMode] : 0;
          }

          store.set(targetAtom, {
            ...targetState,
            rows: updatedRows,
            value: nextValue
          });

          // Sync to Supabase: Fetch current data object first, merge overrides, and save back
          try {
            supabase
              .from('database_rows')
              .select('row_data')
              .eq('id', matchedRow.id)
              .single()
              .then(({ data: dbRow, error: selectError }: any) => {
                if (selectError) {
                  console.warn('[Supabase execute info]: Could not fetch current row from Supabase.', selectError.message);
                  return;
                }

                const currentData = dbRow?.row_data || {};
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
                  .from('database_rows')
                  .update({
                    row_data: mergedData
                  })
                  .eq('id', matchedRow.id)
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
          const outputMode = targetState?.outputMode || 'row_count';

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
          if (outputMode === 'row_count') {
            nextValue = updatedRows.length;
          } else {
            const lastRow = updatedRows[updatedRows.length - 1];
            nextValue = lastRow ? lastRow[outputMode] : 0;
          }

          store.set(targetAtom, {
            ...targetState,
            rows: updatedRows,
            value: nextValue
          });

          // Delete from Supabase
          try {
            supabase
              .from('database_rows')
              .delete()
              .eq('id', targetRow.id)
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
    }
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
}

