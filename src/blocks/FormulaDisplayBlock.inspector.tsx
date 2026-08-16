import { useAtom, useSetAtom, useStore } from 'jotai'
import { blockRuntimeAtom, triggerSaveAtom, formulasAtom, getBlockTypeDisplayName, getCanvasBlocks } from '../state/atoms'
import { recalculateAllFormulas } from '../lib/bindingEngine'
import { FORMULA_FUNCTION_NAMES } from '../lib/formula'
import { useMemo, useState, useEffect } from 'react'

const PAGE_ID = '00000000-0000-0000-0000-000000000001'

export default function FormulaDisplayBlockInspector({ blockId, editor }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)
  const store = useStore()
  const [formulas, setFormulas] = useAtom(formulasAtom)

  const canvasBlocks = useMemo(() => {
    return getCanvasBlocks(editor, store, blockId)
  }, [editor, blockId, store])

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
            placeholder='e.g. round(Price * 0.18, 2)' 
            style={{ display: 'block', marginTop: '4px', width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', outline: 'none' }}
          />
        </label>

        {/*
          What this formula says right now, or why it does not.

          A formula language nobody can see is not a language. The error text
          comes from the block's own `error` field rather than being computed
          again here, so the sentence a builder reads is the same one the engine
          produced -- two evaluators would eventually disagree, and the one on
          screen would be the wrong one.
        */}
        {formulaValue.trim() !== '' && (
          <div style={{ marginTop: '6px', fontSize: '12px', lineHeight: 1.4 }}>
            {runtimeState.error ? (
              <span style={{ color: '#b91c1c' }}>{runtimeState.error}</span>
            ) : (
              <span style={{ color: '#475569' }}>
                = <strong style={{ color: '#0f172a' }}>{String(runtimeState.value ?? '')}</strong>
              </span>
            )}
          </div>
        )}

        {/*
          The list exists because the tester's complaint was not "this is ugly",
          it was "there is not much I can do" -- said about a product with
          seventeen block types. Everything a formula can do was invisible.
        */}
        <details style={{ marginTop: '10px' }}>
          <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#475569', fontWeight: 500 }}>
            What can I write here?
          </summary>
          <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#475569', lineHeight: 1.5 }}>
            <div style={{ marginBottom: '6px' }}>
              Maths <code>+ - * / %</code> &middot; questions <code>&gt; &lt; &gt;= &lt;= == !=</code>
            </div>
            <div style={{ marginBottom: '6px' }}>
              <strong>Choose:</strong> <code>if(Stock &gt; 0, "In stock", "Sold out")</code>
            </div>
            <div style={{ marginBottom: '6px' }}>
              <strong>Round money:</strong> <code>round(Price * 0.18, 2)</code>
            </div>
            <div style={{ marginBottom: '6px' }}>
              <strong>Join text:</strong> <code>join(" ", First, Last)</code>
            </div>
            <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #e5e7eb' }}>
              {FORMULA_FUNCTION_NAMES.join(' &middot; ').replace(/&middot;/g, '\u00b7')}
            </div>
            <div style={{ marginTop: '6px', color: '#64748b' }}>
              Use the picker below to drop a block in by name.
            </div>
          </div>
        </details>

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
                style={{ padding: '4px 8px', borderRadius: '4px', border: 'none', background: '#6366f1', color: 'white', fontSize: '12px', cursor: 'pointer' }}
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
