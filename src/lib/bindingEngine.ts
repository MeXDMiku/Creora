import { getDefaultStore } from 'jotai';
import type { TriggerEvent } from '../types/creora';
import { blockRuntimeAtom, workflowsAtom } from '../state/atoms';

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
        default:
          // Other actions are ignored or handled as no-ops in this step
          break;
      }
    }
  }
}
