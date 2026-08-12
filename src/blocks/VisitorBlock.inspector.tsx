import { useAtom, useSetAtom } from 'jotai'
import { blockRuntimeAtom, triggerSaveAtom, getBlockTypeDisplayName } from '../state/atoms'
import { VISITOR_FIELDS } from '../lib/visitor'

const field: React.CSSProperties = {
  display: 'block', marginTop: '4px', width: '100%', padding: '6px', borderRadius: '4px',
  border: '1px solid #ccc', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a',
  outline: 'none', fontSize: '13px',
}

export default function VisitorBlockInspector({ blockId }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)
  const current = runtimeState.visitorField || 'signedIn'

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '12px', fontSize: '13px' }}>
        Block Name
        <input
          type="text"
          value={runtimeState.blockName || ''}
          onChange={(e) => { setRuntimeState(p => ({ ...p, blockName: e.target.value })); triggerSave(p => p + 1) }}
          placeholder={getBlockTypeDisplayName('visitorBlock')}
          style={field}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>
        What about them
        <select
          value={current}
          onChange={(e) => { setRuntimeState(p => ({ ...p, visitorField: e.target.value })); triggerSave(p => p + 1) }}
          style={{ ...field, background: '#fff' }}
        >
          {VISITOR_FIELDS.map(f => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </label>

      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '10px' }}>
        {VISITOR_FIELDS.find(f => f.id === current)?.hint}
      </div>

      <div style={{ fontSize: '11px', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px', lineHeight: 1.5 }}>
        <strong>Members-only content:</strong> wire this to a block, pick
        <em> Is signed in</em>, set the condition to <em>is ON</em> and the action
        to <em>Show it</em> &mdash; then use <em>Otherwise &rarr; Hide it</em>. That is
        a members area, built from pieces that already exist.
      </div>
    </div>
  )
}
