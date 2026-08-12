import { useAtom, useSetAtom, useStore } from 'jotai'
import { useState } from 'react'
import { blockRuntimeAtom, triggerSaveAtom, getBlockTypeDisplayName } from '../state/atoms'
import { flattenJson, valueAtPath, suggestOutputName } from '../lib/jsonPaths'
import { fetchDataSource } from '../lib/dataSource'

const field: React.CSSProperties = {
  display: 'block', marginTop: '4px', width: '100%', padding: '6px', borderRadius: '4px',
  border: '1px solid #ccc', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a',
  outline: 'none', fontSize: '13px',
}

export default function DataSourceBlockInspector({ blockId }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)
  const store = useStore()
  const [busy, setBusy] = useState(false)

  const leaves = runtimeState.lastResponse ? flattenJson(runtimeState.lastResponse) : []

  const testFetch = async () => {
    setBusy(true)
    await fetchDataSource(blockId, store)
    setBusy(false)
    triggerSave(prev => prev + 1)
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '12px', fontSize: '13px' }}>
        Block Name
        <input
          type="text"
          value={runtimeState.blockName || ''}
          onChange={(e) => { setRuntimeState(p => ({ ...p, blockName: e.target.value })); triggerSave(p => p + 1) }}
          placeholder={getBlockTypeDisplayName('dataSourceBlock')}
          style={field}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px' }}>
        Address
        <input
          type="text"
          value={runtimeState.url || ''}
          onChange={(e) => { setRuntimeState(p => ({ ...p, url: e.target.value })); triggerSave(p => p + 1) }}
          placeholder="https://api.example.com/data"
          style={field}
        />
      </label>

      <button
        onClick={testFetch}
        disabled={busy || !(runtimeState.url || '').trim()}
        style={{ width: '100%', padding: '7px', borderRadius: '4px', border: 'none', background: busy ? '#94a3b8' : '#4f46e5', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: busy ? 'default' : 'pointer', marginBottom: '10px' }}
      >
        {busy ? 'Fetching…' : 'Fetch it once, so I can pick a field'}
      </button>

      {runtimeState.fetchError && (
        <div style={{ fontSize: '11px', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '8px', marginBottom: '10px', lineHeight: 1.4 }}>
          {runtimeState.fetchError}
        </div>
      )}

      <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px' }}>
        Refresh
        <select
          value={runtimeState.refreshMode || 'load'}
          onChange={(e) => { setRuntimeState(p => ({ ...p, refreshMode: e.target.value as any })); triggerSave(p => p + 1) }}
          style={{ ...field, background: '#fff' }}
        >
          <option value="load">When the page opens</option>
          <option value="interval">Every few seconds</option>
          <option value="trigger">Only when something triggers it</option>
        </select>
      </label>

      {runtimeState.refreshMode === 'interval' && (
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px' }}>
          Every … seconds
          <input
            type="number"
            min={5}
            value={runtimeState.refreshSeconds ?? 60}
            onChange={(e) => { setRuntimeState(p => ({ ...p, refreshSeconds: Math.max(5, Number(e.target.value) || 60) })); triggerSave(p => p + 1) }}
            style={field}
          />
          <span style={{ fontSize: '11px', color: '#6b7280' }}>
            Every visitor fetches on their own. Keep this slow unless the data really moves.
          </span>
        </label>
      )}

      {/* The point of the whole block: pick a value out of the real response,
          rather than typing a path nobody should have to know. */}
      {leaves.length > 0 && (
        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '12px', paddingTop: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
            Show which value?
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
            This is what the address actually answered. Click the value you want.
          </div>

          <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
            {leaves.map((leaf) => {
              const picked = runtimeState.outputPath === leaf.path
              const selectable = leaf.type !== 'list'
              return (
                <div
                  key={leaf.path}
                  onClick={() => {
                    if (!selectable) return
                    setRuntimeState(p => ({
                      ...p,
                      outputPath: leaf.path,
                      blockName: p.blockName && p.blockName !== 'Live data' ? p.blockName : suggestOutputName(leaf.path),
                      value: valueAtPath(p.lastResponse, leaf.path),
                    }))
                    triggerSave(p => p + 1)
                  }}
                  title={leaf.path}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: '6px',
                    padding: '4px 6px', paddingLeft: `${6 + leaf.depth * 10}px`,
                    fontSize: '11px', cursor: selectable ? 'pointer' : 'default',
                    background: picked ? '#eef2ff' : 'transparent',
                    borderLeft: picked ? '2px solid #4f46e5' : '2px solid transparent',
                    opacity: selectable ? 1 : 0.55,
                  }}
                >
                  <span style={{ color: '#0f172a', fontWeight: picked ? 600 : 400 }}>{leaf.label}</span>
                  <span style={{ marginLeft: 'auto', color: '#64748b', whiteSpace: 'nowrap', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {leaf.preview}
                  </span>
                  <span style={{ color: '#cbd5e1', fontSize: '9px' }}>{leaf.type}</span>
                </div>
              )
            })}
          </div>

          {runtimeState.outputPath && (
            <div style={{ fontSize: '11px', color: '#475569', marginTop: '8px' }}>
              Showing <strong>{runtimeState.outputPath}</strong>
              <button
                onClick={() => { setRuntimeState(p => ({ ...p, outputPath: '' })); triggerSave(p => p + 1) }}
                style={{ marginLeft: '6px', border: 'none', background: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '11px' }}
              >clear</button>
            </div>
          )}
        </div>
      )}

      {runtimeState.lastFetchedAt && (
        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '10px' }}>
          Last checked {new Date(runtimeState.lastFetchedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
