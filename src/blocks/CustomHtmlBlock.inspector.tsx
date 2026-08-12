import { useAtom, useSetAtom } from 'jotai'
import { useMemo } from 'react'
import { blockRuntimeAtom, triggerSaveAtom, getBlockTypeDisplayName } from '../state/atoms'
import { sanitizeHtml, findSlots } from '../lib/sanitizeHtml'
import { useSlotValues } from '../lib/useSlotValues'

const field: React.CSSProperties = {
  display: 'block', marginTop: '4px', width: '100%', padding: '6px', borderRadius: '4px',
  border: '1px solid #ccc', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a',
  outline: 'none', fontSize: '13px',
}

export default function CustomHtmlBlockInspector({ blockId }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)

  const raw = runtimeState.html || ''
  const cleaned = useMemo(() => sanitizeHtml(raw), [raw])
  const slots = useMemo(() => findSlots(cleaned.html), [cleaned.html])
  const values = useSlotValues(slots)

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '12px', fontSize: '13px' }}>
        Block Name
        <input
          type="text"
          value={runtimeState.blockName || ''}
          onChange={(e) => { setRuntimeState(p => ({ ...p, blockName: e.target.value })); triggerSave(p => p + 1) }}
          placeholder={getBlockTypeDisplayName('customHtmlBlock')}
          style={field}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>
        Your HTML and CSS
        <textarea
          value={raw}
          onChange={(e) => { setRuntimeState(p => ({ ...p, html: e.target.value })); triggerSave(p => p + 1) }}
          spellCheck={false}
          rows={12}
          style={{
            ...field, background: '#0f172a', color: '#e2e8f0',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '12px', lineHeight: 1.5, resize: 'vertical',
          }}
        />
      </label>

      <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: 1.5, marginBottom: '10px' }}>
        Paste anything &mdash; a design from Figma, a card an AI made, your own
        stopwatch. Then write a block&rsquo;s name in double braces where you want
        its live value, and Creora fills it in.
      </div>

      {slots.length > 0 && (
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '10px', marginBottom: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Slots in your design
          </div>
          {slots.map((slot) => {
            const found = values[slot] !== undefined
            return (
              <div key={slot} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', fontSize: '11px', padding: '3px 0' }}>
                <code style={{ color: '#4f46e5' }}>{slot}</code>
                <span style={{ marginLeft: 'auto', color: found ? '#0f172a' : '#b45309' }}>
                  {found ? String(values[slot]) : 'no block has this name'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {cleaned.removed.length > 0 && (
        <div style={{ fontSize: '11px', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', padding: '8px', lineHeight: 1.5 }}>
          <strong>Removed for safety:</strong> {cleaned.removed.join(', ')}.
          <br />
          Every Creora page shares one address, so anything that can <em>run</em> is
          stripped &mdash; otherwise one person&rsquo;s page could read another
          person&rsquo;s account. Your layout and styling are untouched; behaviour
          comes from nodes.
        </div>
      )}
    </div>
  )
}
