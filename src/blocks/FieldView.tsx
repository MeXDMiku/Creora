import { useAtomValue, useStore } from 'jotai';
import { useMemo } from 'react';
import { blockRuntimeAtom } from '../state/atoms';
import { markValidated, executeWorkflow, recalculateAllFormulas } from '../lib/bindingEngine';
import {
  fieldMeta,
  needsOptions,
  parseOptions,
  parseChosen,
  toggleChosen,
  type FieldType,
} from '../lib/fields';

/**
 * The field itself, drawn once and used in both the editor and on a published
 * page.
 *
 * Extracted the moment a second field type existed. Ten field types drawn twice
 * is twenty places for a date picker to behave differently once published, and
 * "the editor and the published renderer disagree" is the failure this project
 * has paid for more than any other.
 */

export interface FieldViewProps {
  blockId: string;
  /** The style computed for this block, applied to whatever gets drawn. */
  style: React.CSSProperties;
  /** True in the editor, where a click means "select me", not "type in me". */
  stopPointerDown?: boolean;
}

export function FieldView({ blockId, style, stopPointerDown }: FieldViewProps) {
  const store = useStore();
  const state = useAtomValue(blockRuntimeAtom(blockId));

  const type = (state?.fieldType || 'text') as FieldType;
  const meta = fieldMeta(type);
  const options = useMemo(() => parseOptions(state?.options), [state?.options]);
  const value = state?.value === null || state?.value === undefined ? '' : String(state.value);
  const disabled = !!state?.disabled;

  const showError = !!(state?.touched && state?.validationError);
  const errorColor = state?.errorColor || '#dc2626';

  const errorStyle: React.CSSProperties = showError
    ? { borderColor: errorColor, borderWidth: 2, borderStyle: 'solid', outlineColor: errorColor }
    : {};
  const offStyle: React.CSSProperties = disabled ? { opacity: 0.55, cursor: 'not-allowed' } : {};
  const applied = { ...style, ...errorStyle, ...offStyle };

  /**
   * One write path for every field type. Reads the state fresh at write time --
   * spreading a copy captured during render is the stale-closure bug that made
   * a Database show a count from two edits ago.
   */
  const commit = (next: string) => {
    const current = store.get(blockRuntimeAtom(blockId));
    store.set(blockRuntimeAtom(blockId), { ...current, value: next });
    if (current?.validateOn === 'change') {
      markValidated(blockId, store, true);
    } else if (current?.touched) {
      markValidated(blockId, store, false);
    }
    executeWorkflow(blockId, 'onChange', store);
    recalculateAllFormulas(store);
  };

  const onBlur = () => {
    if (store.get(blockRuntimeAtom(blockId))?.validateOn === 'submit') return;
    markValidated(blockId, store, true);
  };

  const guard = stopPointerDown ? (e: React.PointerEvent) => e.stopPropagation() : undefined;

  // --- pick one, or pick several ---
  if (needsOptions(type)) {
    if (options.length === 0) {
      return (
        <div style={{ ...applied, fontSize: '12px', color: '#94a3b8' }}>
          Add some choices in the panel
        </div>
      );
    }

    if (type === 'dropdown') {
      return (
        <select
          value={value}
          disabled={disabled}
          onPointerDown={guard}
          onChange={(e) => commit(e.target.value)}
          onBlur={onBlur}
          style={applied}
        >
          {/* An empty first choice, so "not answered yet" is a real state and
              required actually means something on a dropdown. */}
          <option value="">{state?.placeholder || 'Choose…'}</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }

    const chosen = parseChosen(value);
    return (
      <div
        style={{ ...applied, display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px' }}
        onPointerDown={guard}
      >
        {options.map((o) => (
          <label key={o} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: disabled ? 'not-allowed' : 'pointer' }}>
            <input
              type={type === 'radio' ? 'radio' : 'checkbox'}
              name={blockId}
              disabled={disabled}
              checked={type === 'radio' ? value === o : chosen.includes(o)}
              onChange={(e) =>
                commit(
                  type === 'radio'
                    ? o
                    : toggleChosen(value, o, e.target.checked, options)
                )
              }
              onBlur={onBlur}
            />
            <span>{o}</span>
          </label>
        ))}
      </div>
    );
  }

  // --- several lines ---
  if (type === 'longText') {
    return (
      <textarea
        value={value}
        disabled={disabled}
        rows={state?.lines ?? 4}
        placeholder={state?.placeholder ?? ''}
        onPointerDown={guard}
        onChange={(e) => commit(e.target.value)}
        onBlur={onBlur}
        style={{ ...applied, resize: 'vertical' }}
      />
    );
  }

  // --- one line of something ---
  return (
    <input
      type={meta.inputType || 'text'}
      value={value}
      disabled={disabled}
      placeholder={state?.placeholder ?? (type === 'text' ? 'Type something...' : '')}
      aria-invalid={showError}
      onPointerDown={guard}
      onChange={(e) => commit(e.target.value)}
      onBlur={onBlur}
      style={applied}
    />
  );
}

/** The complaint under a field, in one place for the same reason. */
export function FieldError({ blockId, width }: { blockId: string; width?: number }) {
  const state = useAtomValue(blockRuntimeAtom(blockId));
  const showError = !!(state?.touched && state?.validationError);
  if (!showError || state?.showErrorText === false) return null;
  return (
    <div
      role="alert"
      style={{
        marginTop: '4px',
        fontSize: '12px',
        lineHeight: 1.3,
        color: state?.errorColor || '#dc2626',
        width: width ? width + 'px' : undefined,
      }}
    >
      {state?.validationError}
    </div>
  );
}
