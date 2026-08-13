import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai'
import { useEffect } from 'react'
import { blockRuntimeAtom, triggerSaveAtom, pageParamsAtom, getBlockTypeDisplayName } from '../state/atoms'
import { refreshPageValue } from '../lib/pageValue'

const fieldStyle: React.CSSProperties = {
  display: 'block', marginTop: '4px', width: '100%', padding: '6px',
  borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box',
  background: '#f8fafc', color: '#0f172a', outline: 'none', fontSize: '13px',
}

const hintStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: 1.4,
}

export default function PageValueBlockInspector({ blockId }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)
  const params = useAtomValue(pageParamsAtom)
  const store = useStore()

  const set = (patch: Record<string, unknown>) => {
    setRuntimeState(prev => ({ ...prev, ...patch }))
    triggerSave(prev => prev + 1)
  }

  useEffect(() => {
    refreshPageValue(blockId, store)
  }, [blockId, store, runtimeState.paramName, runtimeState.previewValue, runtimeState.fallbackValue])

  const name = (runtimeState.paramName || 'id').trim()

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '12px' }}>
        Block Name
        <input
          type="text"
          value={runtimeState.blockName || ''}
          onChange={(e) => set({ blockName: e.target.value })}
          placeholder={getBlockTypeDisplayName('pageValueBlock')}
          style={fieldStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        Which value in the address
        <input
          type="text"
          value={runtimeState.paramName ?? ''}
          onChange={(e) => set({ paramName: e.target.value })}
          placeholder="id"
          style={fieldStyle}
        />
        <span style={hintStyle}>
          A published page opened at <code>/view/…?{name}=abc</code> gives this
          block the value <code>abc</code>. That is all a detail page needs:
          point a repeater's filter at this block and it shows that one row.
        </span>
      </label>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        Stand-in while designing
        <input
          type="text"
          value={runtimeState.previewValue ?? ''}
          onChange={(e) => set({ previewValue: e.target.value })}
          placeholder="paste a real row id here"
          style={fieldStyle}
        />
        <span style={hintStyle}>
          There is no address in the editor, so without this a detail page is
          blank while you lay it out. Only used here — a published page ignores
          it entirely.
        </span>
      </label>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        When the address does not carry it
        <input
          type="text"
          value={runtimeState.fallbackValue ?? ''}
          onChange={(e) => set({ fallbackValue: e.target.value })}
          placeholder="(nothing)"
          style={fieldStyle}
        />
        <span style={hintStyle}>
          Someone will reach this page without the value — a shared link with the
          bit after the question mark trimmed off. This is what they see.
        </span>
      </label>

      <div style={{
        border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px',
        marginBottom: '12px', background: '#f8fafc', fontSize: '12px', color: '#334155',
      }}>
        <strong>Right now:</strong>{' '}
        {params === null
          ? <>the editor has no address, so this is the stand-in — <code>{String(runtimeState.value ?? '') || '(nothing)'}</code></>
          : <>opened with <code>{String(runtimeState.value ?? '') || '(nothing)'}</code></>}
      </div>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Background Color
        <input
          type="color"
          value={runtimeState.backgroundColor || '#0f172a'}
          onChange={(e) => set({ backgroundColor: e.target.value })}
          style={{ display: 'block', marginTop: '4px', width: '100%' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Width (px)
        <input
          type="number"
          value={runtimeState.width ?? ''}
          onChange={(e) => set({ width: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="200"
          style={fieldStyle}
        />
      </label>
    </div>
  )
}
