import { useAtom, useSetAtom, useStore } from 'jotai'
import { blockRuntimeAtom, triggerSaveAtom, getBlockTypeDisplayName, getCanvasBlocks } from '../state/atoms'
import { useMemo } from 'react'

export default function HistoryChartBlockInspector({ blockId, editor }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)
  const store = useStore()

  // Use the shared getCanvasBlocks helper to list all other blocks on the canvas
  const canvasBlocks = useMemo(() => {
    return getCanvasBlocks(editor, store, blockId)
  }, [editor, blockId, store])

  const selectStyle = {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    background: '#ffffff',
    color: '#0f172a',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    marginTop: '4px',
    cursor: 'pointer'
  }

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
          placeholder={getBlockTypeDisplayName('historyChartBlock')}
          style={{ display: 'block', marginTop: '4px', width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', outline: 'none', fontSize: '13px' }}
        />
      </label>

      {/* Tracked Block Dropdown */}
      <label style={{ display: 'block', marginBottom: '12px' }}>
        Track this block
        <select
          value={runtimeState.trackedBlockId || ''}
          onChange={(e) => {
            setRuntimeState(prev => ({
              ...prev,
              trackedBlockId: e.target.value,
              history: [] // Reset history when switching target blocks
            }))
            triggerSave(prev => prev + 1)
          }}
          style={selectStyle}
        >
          <option value="">-- Select block to track --</option>
          {canvasBlocks.map((block) => (
            <option key={block.id} value={block.id}>
              {block.label}
            </option>
          ))}
        </select>
      </label>

      <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '12px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#1e293b' }}>Visual Styles</h4>

        <label style={{ display: 'block', marginBottom: '8px' }}>
          Background Color
          <input
            type="color"
            value={runtimeState.backgroundColor || '#1e293b'}
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
                borderRadius: Number((e.target as HTMLInputElement).value)
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
            min="10"
            max="100"
            step="10"
            value={runtimeState.opacity ?? 100}
            onInput={(e) => {
              setRuntimeState(prev => ({
                ...prev,
                opacity: Number((e.target as HTMLInputElement).value)
              }))
              triggerSave(prev => prev + 1)
            }}
            style={{ display: 'block', marginTop: '4px', width: '100%' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: '8px' }}>
          Width (px)
          <input
            type="text"
            value={runtimeState.width || ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10)
              setRuntimeState(prev => ({
                ...prev,
                width: isNaN(val as any) ? undefined : val
              }))
              triggerSave(prev => prev + 1)
            }}
            placeholder="default (180)"
            style={{ display: 'block', marginTop: '4px', width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', outline: 'none', fontSize: '13px' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: '8px' }}>
          Text Color
          <input
            type="color"
            value={runtimeState.textColor || '#ffffff'}
            onChange={(e) => {
              setRuntimeState(prev => ({ ...prev, textColor: e.target.value }))
              triggerSave(prev => prev + 1)
            }}
            style={{ display: 'block', marginTop: '4px', width: '100%' }}
          />
        </label>
      </div>
    </div>
  )
}
