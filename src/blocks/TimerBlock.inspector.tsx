import { useAtom, useSetAtom } from 'jotai'
import { blockRuntimeAtom, triggerSaveAtom } from '../state/atoms'

export default function TimerBlockInspector({ blockId }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)

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

  const inputStyle = {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    background: '#ffffff',
    color: '#0f172a',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    marginTop: '4px'
  }

  return (
    <div>
      <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '12px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#1e293b' }}>Timer Settings</h4>
        
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#475569' }}>
          Mode
          <select
            value={runtimeState.mode || 'countdown'}
            onChange={(e) => {
              setRuntimeState(prev => ({ ...prev, mode: e.target.value as any }))
              triggerSave(prev => prev + 1)
            }}
            style={selectStyle}
          >
            <option value="countdown">Countdown</option>
            <option value="interval">Interval</option>
          </select>
        </label>

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#475569' }}>
          Duration (seconds)
          <input
            type="number"
            min="1"
            value={runtimeState.duration ?? 10}
            onChange={(e) => {
              const val = Math.max(1, Number(e.target.value))
              setRuntimeState(prev => ({ ...prev, duration: val }))
              triggerSave(prev => prev + 1)
            }}
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!runtimeState.autoStart}
            onChange={(e) => {
              setRuntimeState(prev => ({ ...prev, autoStart: e.target.checked }))
              triggerSave(prev => prev + 1)
            }}
            style={{ cursor: 'pointer' }}
          />
          Auto Start
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#1e293b' }}>Appearance</h4>

        <label style={{ display: 'block', fontSize: '13px', color: '#475569' }}>
          Background Color
          <input
            type="color"
            value={runtimeState.backgroundColor || '#10b981'}
            onChange={(e) => {
              setRuntimeState(prev => ({ ...prev, backgroundColor: e.target.value }))
              triggerSave(prev => prev + 1)
            }}
            style={{ display: 'block', marginTop: '4px', width: '100%' }}
          />
        </label>
        
        <label style={{ display: 'block', fontSize: '13px', color: '#475569' }}>
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

        <label style={{ display: 'block', fontSize: '13px', color: '#475569' }}>
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

        <label style={{ display: 'block', fontSize: '13px', color: '#475569' }}>
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
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'block', fontSize: '13px', color: '#475569' }}>
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
        
        <label style={{ display: 'block', fontSize: '13px', color: '#475569' }}>
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
            style={inputStyle}
          />
        </label>
      </div>
    </div>
  )
}
