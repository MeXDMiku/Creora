import { useAtom, useSetAtom } from 'jotai'
import { blockRuntimeAtom, triggerSaveAtom } from '../state/atoms'

export default function ButtonBlockInspector({ blockId }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)

  return (
    <div>
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
          style={{ display: 'block', marginTop: '4px', width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
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
      
      <label style={{ display: 'block', marginBottom: '8px' }}>
        Font Size (px)
        <input
          type="number"
          placeholder="default"
          value={runtimeState.fontSize !== undefined ? runtimeState.fontSize : ''}
          onChange={(e) => {
            const val = e.target.value === '' ? undefined : Number(e.target.value)
            setRuntimeState(prev => ({ ...prev, fontSize: val }))
            triggerSave(prev => prev + 1)
          }}
          style={{ display: 'block', marginTop: '4px', width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
        />
      </label>
    </div>
  )
}
