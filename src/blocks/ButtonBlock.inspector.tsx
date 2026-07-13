import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { blockRuntimeAtom, triggerSaveAtom, getBlockTypeDisplayName, pagesListAtom, switchPageFnAtom } from '../state/atoms'

export default function ButtonBlockInspector({ blockId }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)
  const pagesList = useAtomValue(pagesListAtom)
  const switchPageFn = useAtomValue(switchPageFnAtom)

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
          placeholder={getBlockTypeDisplayName('buttonBlock')}
          style={{ display: 'block', marginTop: '4px', width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', outline: 'none', fontSize: '13px' }}
        />
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

      <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '16px', paddingTop: '16px' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#334155' }}>Navigation</h4>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px' }}>
          On click, go to page
          <select
            value={runtimeState.targetPageId || ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : e.target.value
              setRuntimeState(prev => ({ ...prev, targetPageId: val }))
              triggerSave(prev => prev + 1)
            }}
            style={{ display: 'block', marginTop: '4px', width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', background: '#fff', color: '#0f172a', fontSize: '13px', outline: 'none' }}
          >
            <option value="">None</option>
            {pagesList.map(page => (
              <option key={page.id} value={page.id}>{page.name}</option>
            ))}
          </select>
        </label>
        {runtimeState.targetPageId && (
          <button
            onClick={() => {
              if (switchPageFn && runtimeState.targetPageId) {
                switchPageFn(runtimeState.targetPageId);
              }
            }}
            style={{
              marginTop: '8px',
              width: '100%',
              padding: '6px 12px',
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = '#4338ca')}
            onMouseOut={(e) => (e.currentTarget.style.background = '#4f46e5')}
          >
            Test navigation →
          </button>
        )}
      </div>
    </div>
  )
}
