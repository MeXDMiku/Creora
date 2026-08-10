import { useAtom, useSetAtom } from 'jotai';
import { blockRuntimeAtom, triggerSaveAtom, getBlockTypeDisplayName } from '../state/atoms';

export default function ShapeBlockInspector({ blockId }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId));
  const triggerSave = useSetAtom(triggerSaveAtom);

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '12px' }}>
        Block Name
        <input
          type="text"
          value={runtimeState.blockName || ''}
          onChange={(e) => {
            setRuntimeState(prev => ({ ...prev, blockName: e.target.value }));
            triggerSave(prev => prev + 1);
          }}
          placeholder={getBlockTypeDisplayName('shapeBlock')}
          style={{ display: 'block', marginTop: '4px', width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', outline: 'none', fontSize: '13px' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        Role
        <select
          value={runtimeState.role || ''}
          onChange={(e) => {
            const roleVal = e.target.value || null;
            setRuntimeState(prev => ({ ...prev, role: roleVal }));
            triggerSave(prev => prev + 1);
          }}
          style={{
            display: 'block',
            marginTop: '4px',
            width: '100%',
            padding: '6px 12px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            boxSizing: 'border-box',
            background: '#ffffff',
            color: '#0f172a',
            outline: 'none',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          <option value="">None</option>
          <option value="trigger">Trigger (Button)</option>
        </select>
      </label>

      <div style={{ borderTop: '1px solid #e2e8f0', margin: '16px 0 12px 0' }} />
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '12px' }}>
        Visual Styles
      </div>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Text / Label Content
        <input
          type="text"
          value={runtimeState.text ?? ''}
          onChange={(e) => {
            setRuntimeState(prev => ({ ...prev, text: e.target.value, value: e.target.value }));
            triggerSave(prev => prev + 1);
          }}
          placeholder="Enter text..."
          style={{ display: 'block', marginTop: '4px', width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', outline: 'none', fontSize: '13px' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Background Color
        <input
          type="color"
          value={runtimeState.backgroundColor || '#3b82f6'}
          onChange={(e) => {
            setRuntimeState(prev => ({ ...prev, backgroundColor: e.target.value }));
            triggerSave(prev => prev + 1);
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
            }));
            triggerSave(prev => prev + 1);
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
            }));
            triggerSave(prev => prev + 1);
          }}
          style={{ display: 'block', marginTop: '4px', width: '100%' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Width (px)
        <input
          type="number"
          placeholder="auto"
          value={runtimeState.width !== undefined ? runtimeState.width : ''}
          onChange={(e) => {
            const val = e.target.value === '' ? undefined : Number(e.target.value);
            setRuntimeState(prev => ({ ...prev, width: val }));
            triggerSave(prev => prev + 1);
          }}
          style={{ display: 'block', marginTop: '4px', width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Height (px)
        <input
          type="number"
          placeholder="auto"
          value={runtimeState.height !== undefined ? runtimeState.height : ''}
          onChange={(e) => {
            const val = e.target.value === '' ? undefined : Number(e.target.value);
            setRuntimeState(prev => ({ ...prev, height: val }));
            triggerSave(prev => prev + 1);
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
            setRuntimeState(prev => ({ ...prev, textColor: e.target.value }));
            triggerSave(prev => prev + 1);
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
            const val = e.target.value === '' ? undefined : Number(e.target.value);
            setRuntimeState(prev => ({ ...prev, fontSize: val }));
            triggerSave(prev => prev + 1);
          }}
          style={{ display: 'block', marginTop: '4px', width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
        />
      </label>
    </div>
  );
}
