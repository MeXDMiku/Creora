import { useAtom, useSetAtom, useStore } from 'jotai'
import { useMemo } from 'react'
import { blockRuntimeAtom, triggerSaveAtom, getBlockTypeDisplayName, getCanvasBlocks } from '../state/atoms'
import { RULE_TYPES, ruleMeta, isValidPattern, validateValue } from '../lib/validation'
import { FIELD_TYPES, fieldMeta, needsOptions, parseOptions } from '../lib/fields'
import type { ValidationRule, ValidationRuleType } from '../lib/validation'

const fieldStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '4px',
  width: '100%',
  padding: '6px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  boxSizing: 'border-box',
  background: '#f8fafc',
  color: '#0f172a',
  outline: 'none',
  fontSize: '13px',
}

const hintStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  color: '#64748b',
  marginTop: '4px',
  lineHeight: 1.4,
}

const smallBtn: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#475569',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '11px',
  lineHeight: 1,
  padding: '4px 6px',
}

export default function InputBlockInspector({ blockId, editor }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)
  const store = useStore()

  const otherBlocks = useMemo(
    () => getCanvasBlocks(editor, store, blockId),
    [editor, store, blockId, runtimeState]
  )

  const rules: ValidationRule[] = runtimeState.rules || []
  const parsedOptions = parseOptions(runtimeState.options)

  const writeRules = (next: ValidationRule[]) => {
    setRuntimeState(prev => ({ ...prev, rules: next }))
    triggerSave(prev => prev + 1)
  }

  const patchRule = (index: number, patch: Partial<ValidationRule>) => {
    writeRules(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const moveRule = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= rules.length) return
    const next = [...rules]
    const [taken] = next.splice(index, 1)
    next.splice(target, 0, taken)
    writeRules(next)
  }

  /**
   * The field checked against its own rules, right now, with whatever is
   * actually in it. Written because "I set a rule and I think it works" is the
   * assertion this project has lost the most time to -- the inspector should
   * show the answer rather than make someone go and press things to find out.
   */
  const liveError = validateValue(runtimeState.value, rules, {
    fieldName: runtimeState.blockName || 'This field',
    resolve: (id) => store.get(blockRuntimeAtom(id))?.value,
  })

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '12px' }}>
        Block Name
        <input
          type="text"
          value={runtimeState.blockName || ''}
          onChange={(e) => {
            setRuntimeState(prev => ({ ...prev, blockName: e.target.value }))
            triggerSave(prev => prev + 1)
          }}
          placeholder={getBlockTypeDisplayName('inputBlock')}
          style={fieldStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        Kind of field
        <select
          value={runtimeState.fieldType || 'text'}
          onChange={(e) => {
            const next = e.target.value
            setRuntimeState(prev => ({
              ...prev,
              fieldType: next,
              // A value from the old kind almost never fits the new one -- a
              // date left in a dropdown is a choice nobody can re-pick. Cleared
              // on purpose rather than left to look like data.
              value: '',
              validationError: null,
              touched: false,
            }))
            triggerSave(prev => prev + 1)
          }}
          style={fieldStyle}
        >
          {FIELD_TYPES.map(f => (
            <option key={f.type} value={f.type}>{f.label}</option>
          ))}
        </select>
        {fieldMeta(runtimeState.fieldType as any).hint && (
          <span style={hintStyle}>{fieldMeta(runtimeState.fieldType as any).hint}</span>
        )}
      </label>

      {needsOptions(runtimeState.fieldType as any) && (
        <label style={{ display: 'block', marginBottom: '12px' }}>
          The choices
          <textarea
            value={runtimeState.options ?? ''}
            onChange={(e) => {
              setRuntimeState(prev => ({ ...prev, options: e.target.value }))
              triggerSave(prev => prev + 1)
            }}
            rows={5}
            placeholder={'Small\nMedium\nLarge'}
            spellCheck={false}
            style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <span style={hintStyle}>
            One per line, not comma-separated — somebody will want
            "Bristol, Avon" as a single choice. Blank lines and repeats are
            dropped. {parsedOptions.length} choice{parsedOptions.length === 1 ? '' : 's'}.
          </span>
        </label>
      )}

      {runtimeState.fieldType === 'longText' && (
        <label style={{ display: 'block', marginBottom: '12px' }}>
          How tall, in lines
          <input
            type="number"
            min="2"
            max="30"
            value={runtimeState.lines ?? 4}
            onChange={(e) => {
              setRuntimeState(prev => ({ ...prev, lines: Number(e.target.value) }))
              triggerSave(prev => prev + 1)
            }}
            style={fieldStyle}
          />
        </label>
      )}

      <label style={{ display: 'block', marginBottom: '12px' }}>
        Hint inside the field
        <input
          type="text"
          value={runtimeState.placeholder ?? ''}
          onChange={(e) => {
            setRuntimeState(prev => ({ ...prev, placeholder: e.target.value }))
            triggerSave(prev => prev + 1)
          }}
          placeholder="Type something..."
          style={fieldStyle}
        />
      </label>

      {/* ---------------- Rules ---------------- */}
      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          padding: '10px',
          marginBottom: '12px',
          background: '#f8fafc',
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: '#334155',
            marginBottom: '2px',
          }}
        >
          Rules
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4, marginBottom: '8px' }}>
          Checked in order. The first one that fails is the message shown, so put
          the complaint you most want heard at the top.
        </div>

        {rules.length === 0 && (
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>
            No rules. Anything at all is accepted.
          </div>
        )}

        {rules.map((rule, i) => {
          const meta = ruleMeta(rule.type)
          const badPattern =
            rule.type === 'pattern' && !!rule.value && !isValidPattern(String(rule.value))
          return (
            <div
              key={i}
              style={{
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                borderRadius: '5px',
                padding: '8px',
                marginBottom: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <select
                  value={rule.type}
                  onChange={(e) =>
                    patchRule(i, { type: e.target.value as ValidationRuleType, value: '' })
                  }
                  style={{ ...fieldStyle, marginTop: 0, flex: 1, padding: '4px' }}
                >
                  {RULE_TYPES.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  title="Move up"
                  onClick={() => moveRule(i, -1)}
                  style={{ ...smallBtn, opacity: i === 0 ? 0.4 : 1 }}
                >
                  &#9650;
                </button>
                <button
                  type="button"
                  title="Move down"
                  onClick={() => moveRule(i, 1)}
                  style={{ ...smallBtn, opacity: i === rules.length - 1 ? 0.4 : 1 }}
                >
                  &#9660;
                </button>
                <button
                  type="button"
                  title="Remove this rule"
                  onClick={() => writeRules(rules.filter((_, idx) => idx !== i))}
                  style={{ ...smallBtn, color: '#b91c1c', borderColor: '#fecaca' }}
                >
                  &#10005;
                </button>
              </div>

              {meta?.needsValue && meta.valueKind === 'block' && (
                <select
                  value={String(rule.value ?? '')}
                  onChange={(e) => patchRule(i, { value: e.target.value })}
                  style={{ ...fieldStyle, marginTop: 0, padding: '4px' }}
                >
                  <option value="">Pick the field it must match</option>
                  {otherBlocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              )}

              {meta?.needsValue && meta.valueKind !== 'block' && (
                <input
                  type={meta.valueKind === 'number' ? 'number' : 'text'}
                  value={rule.value === undefined ? '' : String(rule.value)}
                  onChange={(e) => patchRule(i, { value: e.target.value })}
                  placeholder={meta.placeholder}
                  style={{
                    ...fieldStyle,
                    marginTop: 0,
                    padding: '4px',
                    borderColor: badPattern ? '#dc2626' : '#ccc',
                  }}
                />
              )}

              {badPattern && (
                <div style={{ fontSize: '11px', color: '#dc2626' }}>
                  That pattern is not something a browser can read, so this rule is
                  being skipped rather than blocking everyone.
                </div>
              )}

              {meta?.hint && (
                <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>
                  {meta.hint}
                </div>
              )}

              <input
                type="text"
                value={rule.message ?? ''}
                onChange={(e) => patchRule(i, { message: e.target.value })}
                placeholder="Your own message (leave blank for ours)"
                style={{ ...fieldStyle, marginTop: 0, padding: '4px' }}
              />
            </div>
          )
        })}

        <button
          type="button"
          onClick={() => writeRules([...rules, { type: 'required' }])}
          style={{
            ...smallBtn,
            width: '100%',
            padding: '6px',
            fontSize: '12px',
            background: '#eef2ff',
            borderColor: '#c7d2fe',
            color: '#4338ca',
            fontWeight: 600,
          }}
        >
          + Add a rule
        </button>

        <div
          style={{
            marginTop: '10px',
            paddingTop: '8px',
            borderTop: '1px solid #e2e8f0',
            fontSize: '11px',
            lineHeight: 1.4,
            color: liveError ? '#b91c1c' : '#15803d',
          }}
        >
          <strong>Right now:</strong>{' '}
          {rules.length === 0
            ? 'no rules to check'
            : liveError
              ? liveError
              : 'what is in this field passes'}
        </div>
      </div>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        Check when
        <select
          value={runtimeState.validateOn || 'blur'}
          onChange={(e) => {
            setRuntimeState(prev => ({ ...prev, validateOn: e.target.value as any }))
            triggerSave(prev => prev + 1)
          }}
          style={fieldStyle}
        >
          <option value="blur">They leave the field</option>
          <option value="change">Every keystroke</option>
          <option value="submit">Only when they press submit</option>
        </select>
        <span style={{ display: 'block', fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>
          Leaving the field is the kind one. Every keystroke tells someone their
          email is wrong before they have finished typing it.
        </span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '13px' }}>
        <input
          type="checkbox"
          checked={runtimeState.showErrorText !== false}
          onChange={(e) => {
            setRuntimeState(prev => ({ ...prev, showErrorText: e.target.checked }))
            triggerSave(prev => prev + 1)
          }}
        />
        Show the message under the field
      </label>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        Message colour
        <input
          type="color"
          value={runtimeState.errorColor || '#dc2626'}
          onChange={(e) => {
            setRuntimeState(prev => ({ ...prev, errorColor: e.target.value }))
            triggerSave(prev => prev + 1)
          }}
          style={{ display: 'block', marginTop: '4px', width: '100%' }}
        />
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px' }}>
        <input
          type="checkbox"
          checked={!!runtimeState.disabled}
          onChange={(e) => {
            setRuntimeState(prev => ({ ...prev, disabled: e.target.checked }))
            triggerSave(prev => prev + 1)
          }}
        />
        Switched off (nobody can type in it)
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Background Color
        <input
          type="color"
          value={runtimeState.backgroundColor || '#6366f1'}
          onChange={(e) => {
            setRuntimeState(prev => ({ ...prev, backgroundColor: e.target.value }))
            triggerSave(prev => prev + 1)
          }}
          style={{ display: 'block', marginTop: '4px', width: '100%' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Border Radius: {runtimeState.borderRadius ?? 8}px
        <input
          type="range"
          min="0"
          max="24"
          value={runtimeState.borderRadius ?? 8}
          onInput={(e) => {
            setRuntimeState(prev => ({
              ...prev,
              borderRadius: Number((e.target as HTMLInputElement).value),
            }))
            triggerSave(prev => prev + 1)
          }}
          style={{ display: 'block', marginTop: '4px', width: '100%' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Opacity: {runtimeState.opacity ?? 100}%
        <input
          type="range"
          min="0"
          max="100"
          value={runtimeState.opacity ?? 100}
          onInput={(e) => {
            setRuntimeState(prev => ({
              ...prev,
              opacity: Number((e.target as HTMLInputElement).value),
            }))
            triggerSave(prev => prev + 1)
          }}
          style={{ display: 'block', marginTop: '4px', width: '100%' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Width (px)
        <input
          type="number"
          placeholder="max-content"
          value={runtimeState.width !== undefined ? runtimeState.width : ''}
          onChange={(e) => {
            const val = e.target.value === '' ? undefined : Number(e.target.value)
            setRuntimeState(prev => ({ ...prev, width: val }))
            triggerSave(prev => prev + 1)
          }}
          style={fieldStyle}
        />
      </label>
    </div>
  )
}
