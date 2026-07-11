import { useAtom, useSetAtom, useStore } from 'jotai'
import { blockRuntimeAtom, triggerSaveAtom, formulasAtom, getBlockTypeDisplayName } from '../state/atoms'
import { recalculateAllFormulas } from '../lib/bindingEngine'
import { useMemo, useState, useEffect } from 'react'

const PAGE_ID = '00000000-0000-0000-0000-000000000001'

export default function FormulaDisplayBlockInspector({ blockId, editor }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)
  const store = useStore()
  const [formulas, setFormulas] = useAtom(formulasAtom)

  const canvasBlocks = useMemo(() => {
    if (!editor) return []
    const list: { id: string; type: string; label: string }[] = []
    editor.state.doc.descendants((node: any) => {
      const bId = node.attrs?.blockId
      const typeName = node.type.name
      if (bId && bId !== blockId && (
        typeName === 'buttonBlock' || 
        typeName === 'numberDisplayBlock' || 
        typeName === 'formulaDisplayBlock' ||
        typeName === 'toggleBlock' || 
        typeName === 'inputBlock' || 
        typeName === 'textLabelBlock' ||
        typeName === 'timerBlock'
      )) {
        const runtime = store.get(blockRuntimeAtom(bId))
        const name = runtime?.blockName || getBlockTypeDisplayName(typeName)
        const label = `${name} (${bId})`
        list.push({ id: bId, type: typeName, label })
      }
    })
    return list
  }, [editor, blockId])

  const [selectedVarBlockId, setSelectedVarBlockId] = useState('')
  useEffect(() => {
    if (canvasBlocks.length > 0 && !selectedVarBlockId) {
      setSelectedVarBlockId(canvasBlocks[0].id)
    }
  }, [canvasBlocks, selectedVarBlockId])

  const currentFormulaBinding = formulas.find(f => f.targetBlockId === blockId && f.targetProperty === 'value')
  const formulaValue = currentFormulaBinding?.formula || ''

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
          placeholder={getBlockTypeDisplayName('formulaDisplayBlock')}
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

      <div style={{ marginTop: '12px', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Formula
          <input
            type="text"
            value={formulaValue}
            onChange={(e) => {
              const newFormula = e.target.value
              setFormulas(prev => {
                const existing = prev.find(f => f.targetBlockId === blockId && f.targetProperty === 'value')
                if (existing) {
                  return prev.map(f => f.targetBlockId === blockId && f.targetProperty === 'value' ? { ...f, formula: newFormula } : f)
                } else {
                  return [...prev, {
                    id: `fb_${blockId}`,
                    targetBlockId: blockId,
                    targetProperty: 'value',
                    formula: newFormula,
                    pageId: PAGE_ID
                  }]
                }
              })
              // Recalculate immediately
              setTimeout(() => {
                recalculateAllFormulas(store)
                triggerSave(prev => prev + 1)
              }, 0)
            }}
            placeholder="e.g. test_num_1 * 5"
            style={{ display: 'block', marginTop: '4px', width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', outline: 'none' }}
          />
        </label>

        {canvasBlocks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#475569' }}>Insert block variable</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <select
                value={selectedVarBlockId}
                onChange={(e) => setSelectedVarBlockId(e.target.value)}
                style={{ flex: 1, padding: '4px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px', background: '#fff', color: '#0f172a' }}
              >
                {canvasBlocks.map(b => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (selectedVarBlockId) {
                    const newFormula = formulaValue ? `${formulaValue} + ${selectedVarBlockId}` : selectedVarBlockId
                    setFormulas(prev => {
                      const existing = prev.find(f => f.targetBlockId === blockId && f.targetProperty === 'value')
                      if (existing) {
                        return prev.map(f => f.targetBlockId === blockId && f.targetProperty === 'value' ? { ...f, formula: newFormula } : f)
                      } else {
                        return [...prev, {
                          id: `fb_${blockId}`,
                          targetBlockId: blockId,
                          targetProperty: 'value',
                          formula: newFormula,
                          pageId: PAGE_ID
                        }]
                      }
                    })
                    setTimeout(() => {
                      recalculateAllFormulas(store)
                      triggerSave(prev => prev + 1)
                    }, 0)
                  }
                }}
                style={{ padding: '4px 8px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                Insert
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
