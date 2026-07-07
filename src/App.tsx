import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useSetAtom, useAtom, useAtomValue, useStore } from 'jotai'
import { workflowsAtom, blockRuntimeAtom, blockPositionAtom, selectedBlockIdAtom, activeWireAtom, connectionsAtom, snapTargetAtom, pendingConnectionAtom, triggerSaveAtom, contextMenuAtom, getBlockDataType, formulasAtom, allBlockIdsAtom } from './state/atoms'
import { ButtonBlock } from './blocks/ButtonBlock'
import { NumberDisplayBlock } from './blocks/NumberDisplayBlock'
import { TextLabelBlock } from './blocks/TextLabelBlock'
import { ToggleBlock } from './blocks/ToggleBlock'
import { InputBlock } from './blocks/InputBlock'
import { FormulaDisplayBlock } from './blocks/FormulaDisplayBlock'
import { WireOverlay } from './components/WireOverlay'
import { supabase } from './lib/supabase'
import { recalculateAllFormulas } from './lib/bindingEngine'
import type { FormulaBinding } from './types/creora'
import './App.css'

function InspectorControls({ blockId, editor }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)
  const store = useStore()
  const [formulas, setFormulas] = useAtom(formulasAtom)

  // Determine current block's type
  let blockType: string | null = null
  if (editor) {
    editor.state.doc.descendants((node: any) => {
      if (node.attrs?.blockId === blockId) {
        blockType = node.type.name
        return false
      }
    })
  }

  const showTextControls = blockType === 'buttonBlock' || blockType === 'numberDisplayBlock' || blockType === 'textLabelBlock' || blockType === 'formulaDisplayBlock'
  const showNumericConstraints = blockType === 'numberDisplayBlock'

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
        typeName === 'textLabelBlock'
      )) {
        let label = ''
        if (typeName === 'buttonBlock') {
          label = `Button (${node.attrs.label || bId})`
        } else if (typeName === 'numberDisplayBlock') {
          label = `Number Display (${bId})`
        } else if (typeName === 'formulaDisplayBlock') {
          label = `Formula Display (${bId})`
        } else if (typeName === 'toggleBlock') {
          label = `Toggle (${bId})`
        } else if (typeName === 'inputBlock') {
          label = `Input (${bId})`
        } else if (typeName === 'textLabelBlock') {
          label = `Text Label (${bId})`
        }
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
    <div key={blockId}>
      {/* Universal controls */}
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

      {/* Text controls */}
      {showTextControls && (
        <>
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
        </>
      )}

      {/* Numeric constraints */}
      {showNumericConstraints && (
        <>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            Minimum value
            <input
              type="number"
              value={runtimeState.min !== undefined ? runtimeState.min : ''}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : Number(e.target.value);
                setRuntimeState(prev => ({ ...prev, min: val }));
                triggerSave(prev => prev + 1);
              }}
              style={{ display: 'block', marginTop: '4px', width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            Maximum value
            <input
              type="number"
              value={runtimeState.max !== undefined ? runtimeState.max : ''}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : Number(e.target.value);
                setRuntimeState(prev => ({ ...prev, max: val }));
                triggerSave(prev => prev + 1);
              }}
              style={{ display: 'block', marginTop: '4px', width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </label>
        </>
      )}

      {/* Formula controls */}
      {blockType === 'formulaDisplayBlock' && (
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
      )}
    </div>
  )
}

function Inspector({ editor }: { editor: any }) {
  const selectedBlockId = useAtomValue(selectedBlockIdAtom)

  return (
    <div style={{ width: '240px', borderLeft: '1px solid #e5e7eb', padding: '16px', background: '#fff' }}>
      <h3>Inspector {selectedBlockId ? `(${selectedBlockId})` : ''}</h3>
      {selectedBlockId ? (
        <InspectorControls blockId={selectedBlockId} editor={editor} />
      ) : (
        <p style={{ color: '#9ca3af' }}>No block selected</p>
      )}
    </div>
  )
}

function ConnectionPopup({ editor }: { editor: any }) {
  const [pending, setPending] = useAtom(pendingConnectionAtom)
  const setConnections = useSetAtom(connectionsAtom)
  const setWorkflows = useSetAtom(workflowsAtom)

  const [action, setAction] = useState<string>('increment')
  const [amount, setAmount] = useState<number>(1)
  const [value, setValue] = useState<string>('')

  // Conditional state
  const [isConditional, setIsConditional] = useState(false)
  const [conditionFieldId, setConditionFieldId] = useState('')
  const [conditionOperator, setConditionOperator] = useState('equals')
  const [conditionValue, setConditionValue] = useState('')

  // Determine target block node type
  let targetNodeType: string | null = null
  if (pending && editor) {
    const traverse = (node: any) => {
      if (node.attrs?.blockId === pending.targetBlockId) {
        targetNodeType = node.type
      }
      if (node.content) {
        node.content.forEach(traverse)
      }
    }
    editor.getJSON().content?.forEach(traverse)
  }

  const isToggleBlock = targetNodeType === 'toggleBlock'

  // Get all OTHER blocks on the canvas
  const canvasBlocks = useMemo(() => {
    if (!editor || !pending) return []
    const list: { id: string; type: string; label: string; dataType: string }[] = []
    
    const docJson = editor.getJSON()
    const traverse = (node: any) => {
      if (!node) return
      const bId = node.attrs?.blockId
      const typeName = node.type
      if (bId && bId !== pending.targetBlockId && (
        typeName === 'buttonBlock' || 
        typeName === 'numberDisplayBlock' || 
        typeName === 'toggleBlock' || 
        typeName === 'inputBlock' || 
        typeName === 'textLabelBlock'
      )) {
        const dataType = getBlockDataType(typeName)
        let label = ''
        if (typeName === 'buttonBlock') {
          label = `Button (${node.attrs.label || bId})`
        } else if (typeName === 'numberDisplayBlock') {
          label = `Number Display (${bId})`
        } else if (typeName === 'toggleBlock') {
          label = `Toggle (${bId})`
        } else if (typeName === 'inputBlock') {
          label = `Input (${bId})`
        } else if (typeName === 'textLabelBlock') {
          label = `Text Label (${bId})`
        }
        list.push({ id: bId, type: typeName, label, dataType })
      }
      if (node.content) {
        node.content.forEach(traverse)
      }
    }
    
    if (docJson && docJson.content) {
      docJson.content.forEach(traverse)
    }
    return list
  }, [editor, pending])

  // Sync action default state when pending connection loads
  useEffect(() => {
    if (pending && editor) {
      let type: string | null = null
      const traverse = (node: any) => {
        if (node.attrs?.blockId === pending.targetBlockId) {
          type = node.type
        }
        if (node.content) {
          node.content.forEach(traverse)
        }
      }
      editor.getJSON().content?.forEach(traverse)

      if (type === 'toggleBlock') {
        setAction('toggle')
      } else {
        setAction('increment')
      }
    }
  }, [pending, editor])

  // Initialize and update default condition block selection
  useEffect(() => {
    if (canvasBlocks.length > 0 && !conditionFieldId) {
      setConditionFieldId(canvasBlocks[0].id)
    }
  }, [canvasBlocks, conditionFieldId])

  // Automatically update operator default based on selected block type
  useEffect(() => {
    const picked = canvasBlocks.find(b => b.id === conditionFieldId)
    if (picked) {
      if (picked.dataType === 'boolean') {
        setConditionOperator('is ON')
      } else {
        setConditionOperator('equals')
      }
    }
  }, [conditionFieldId, canvasBlocks])

  if (!pending) return null

  const pickedBlock = canvasBlocks.find(b => b.id === conditionFieldId)
  const pickedDataType = pickedBlock?.dataType || 'unknown'

  // Standard select input styles that look consistent in light/dark mode and include a dropdown arrow
  const selectStyle: React.CSSProperties = {
    padding: '6px 36px 6px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    background: '#ffffff',
    color: '#0f172a',
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23475569' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
    backgroundPosition: 'right 8px center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '18px 18px',
    cursor: 'pointer',
    width: '100%',
    boxSizing: 'border-box'
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    background: '#ffffff',
    color: '#0f172a',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  }

  // Place it slightly offset from the target port (x2, y2)
  const popupStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${pending.x2 + 10}px`,
    top: `${pending.y2 - 80}px`,
    zIndex: 1000,
    background: 'white',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    padding: '16px',
    width: '260px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontSize: '14px',
  }

  const handleConnect = () => {
    const connId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const wfId = `wf_${connId}`

    // Create persistent connection for wire rendering
    setConnections(prev => [...prev, {
      id: connId,
      sourceBlockId: pending.sourceBlockId,
      targetBlockId: pending.targetBlockId,
    }])

    let stepStep: any = {
      id: `step_${connId}`,
      action: action,
      targetId: pending.targetBlockId,
      condition: null,
    }

    if (isToggleBlock) {
      if (action === 'turnOn') {
        stepStep.action = 'set'
        stepStep.value = true
      } else if (action === 'turnOff') {
        stepStep.action = 'set'
        stepStep.value = false
      } else {
        stepStep.action = 'toggle'
      }
    } else {
      if (action === 'increment' || action === 'decrement') {
        stepStep.amount = amount
      } else if (action === 'set') {
        const parsedNum = Number(value)
        stepStep.value = isNaN(parsedNum) || value.trim() === '' ? value : parsedNum
      }
    }

    if (isConditional && conditionFieldId) {
      let condVal: any = conditionValue
      if (conditionOperator === 'equals' || conditionOperator === 'greaterThan' || conditionOperator === 'lessThan') {
        const parsed = Number(conditionValue)
        if (!isNaN(parsed) && conditionValue.trim() !== '') {
          condVal = parsed
        }
      }
      stepStep.condition = {
        fieldId: conditionFieldId,
        operator: conditionOperator,
        value: condVal
      }
    }

    const newWorkflow = {
      id: wfId,
      sourceId: pending.sourceBlockId,
      sourceEvent: 'onClick' as const,
      permission: 'public' as const,
      pageId: 'page_1',
      steps: [stepStep],
    }

    console.log('[DIAG] Successfully created connection. Adding new workflow to workflowsAtom:', JSON.stringify(newWorkflow, null, 2))
    setWorkflows(prev => [...prev, newWorkflow])

    // Clear pending connection
    setPending(null)
  }

  const handleCancel = () => {
    setPending(null)
  }

  return (
    <div style={popupStyle} onPointerDown={(e) => e.stopPropagation()}>
      <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#1e293b', marginBottom: '4px' }}>Configure Action</div>
      
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 500, color: '#475569', fontSize: '13px' }}>
        Action
        <select 
          value={action} 
          onChange={(e) => setAction(e.target.value)}
          style={selectStyle}
        >
          {isToggleBlock ? (
            <>
              <option value="turnOn">Turn On</option>
              <option value="turnOff">Turn Off</option>
              <option value="toggle">Toggle</option>
            </>
          ) : (
            <>
              <option value="increment">Increment</option>
              <option value="decrement">Decrement</option>
              <option value="set">Set to value</option>
              <option value="toggle">Toggle</option>
            </>
          )}
        </select>
      </label>

      {!isToggleBlock && (action === 'increment' || action === 'decrement') && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 500, color: '#475569', fontSize: '13px' }}>
          Amount
          <input 
            type="number" 
            value={amount} 
            onChange={(e) => setAmount(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
      )}

      {!isToggleBlock && action === 'set' && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 500, color: '#475569', fontSize: '13px' }}>
          Value
          <input 
            type="text" 
            value={value} 
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 42 or hello"
            style={inputStyle}
          />
        </label>
      )}

      {/* Divider */}
      <hr style={{ border: '0', borderTop: '1px solid #e2e8f0', margin: '6px 0' }} />

      {/* Only if... Section */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: '#334155', fontSize: '13px', userSelect: 'none' }}>
        <input 
          type="checkbox" 
          checked={isConditional}
          onChange={(e) => setIsConditional(e.target.checked)}
          style={{ width: '15px', height: '15px', accentColor: '#6366f1', cursor: 'pointer' }}
        />
        Only if...
      </label>

      {isConditional && canvasBlocks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
          {/* Pick block */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 500, color: '#475569', fontSize: '12px' }}>
            Block
            <select
              value={conditionFieldId}
              onChange={(e) => setConditionFieldId(e.target.value)}
              style={{ ...selectStyle, fontSize: '12px', padding: '6px 32px 6px 10px' }}
            >
              {canvasBlocks.map(b => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </label>

          {/* Pick operator */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 500, color: '#475569', fontSize: '12px' }}>
            Condition
            <select
              value={conditionOperator}
              onChange={(e) => setConditionOperator(e.target.value)}
              style={{ ...selectStyle, fontSize: '12px', padding: '6px 32px 6px 10px' }}
            >
              {pickedDataType === 'boolean' ? (
                <>
                  <option value="is ON">is ON</option>
                  <option value="is OFF">is OFF</option>
                </>
              ) : pickedDataType === 'number' ? (
                <>
                  <option value="equals">equals</option>
                  <option value="greaterThan">greater than</option>
                  <option value="lessThan">less than</option>
                </>
              ) : (
                <>
                  <option value="equals">equals</option>
                </>
              )}
            </select>
          </label>

          {/* Value input (only show if not boolean state check) */}
          {conditionOperator !== 'is ON' && conditionOperator !== 'is OFF' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 500, color: '#475569', fontSize: '12px' }}>
              Value
              <input
                type="text"
                value={conditionValue}
                onChange={(e) => setConditionValue(e.target.value)}
                placeholder="e.g. 10"
                style={{ ...inputStyle, fontSize: '12px' }}
              />
            </label>
          )}
        </div>
      )}

      {isConditional && canvasBlocks.length === 0 && (
        <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', marginTop: '2px', paddingLeft: '24px' }}>
          No other blocks available on canvas
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button 
          onClick={handleConnect}
          style={{
            flex: 1,
            padding: '8px',
            background: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '13px'
          }}
        >
          Connect
        </button>
        <button 
          onClick={handleCancel}
          style={{
            flex: 1,
            padding: '8px',
            background: '#e5e7eb',
            color: '#374151',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '13px'
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function ContextMenu({ editor }: { editor: any }) {
  const store = useStore()
  const setFormulas = useSetAtom(formulasAtom)
  const [menu, setMenu] = useAtom(contextMenuAtom)
  const setConnections = useSetAtom(connectionsAtom)
  const setWorkflows = useSetAtom(workflowsAtom)
  const [selectedBlockId, setSelectedBlockId] = useAtom(selectedBlockIdAtom)
  const triggerSave = useSetAtom(triggerSaveAtom)

  if (!menu || !menu.visible) return null

  const handleDelete = () => {
    const blockId = menu.blockId

    // 1. Delete node from TipTap editor
    if (editor) {
      editor.commands.command(({ tr, dispatch }: any) => {
        let foundPos = -1
        tr.doc.descendants((node: any, pos: number) => {
          if ((node.type.name === 'buttonBlock' || node.type.name === 'numberDisplayBlock' || node.type.name === 'formulaDisplayBlock' || node.type.name === 'toggleBlock' || node.type.name === 'inputBlock' || node.type.name === 'textLabelBlock') && node.attrs.blockId === blockId) {
            foundPos = pos
            return false
          }
        })
        if (foundPos !== -1) {
          if (dispatch) {
            tr.delete(foundPos, foundPos + 1)
          }
          return true
        }
        return false
      })
    }

    // 2. Clean up atoms
    blockPositionAtom.remove(blockId)
    blockRuntimeAtom.remove(blockId)
    store.set(allBlockIdsAtom, (prev: string[]) => prev.filter((id: string) => id !== blockId))
    setFormulas((prev: FormulaBinding[]) => prev.filter((f: FormulaBinding) => f.targetBlockId !== blockId))

    // 3. Clean up connections and workflows
    setConnections(prev => prev.filter(c => c.sourceBlockId !== blockId && c.targetBlockId !== blockId))
    setWorkflows(prev => prev.filter(w => w.sourceId !== blockId && !w.steps.some(step => step.targetId === blockId)))

    // 4. Clear selection if this block was selected
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null)
    }

    // 5. Trigger save
    triggerSave(prev => prev + 1)

    // 6. Close menu
    setMenu(null)
  }

  const handleDisconnectAll = () => {
    const blockId = menu.blockId

    // Remove connections
    setConnections(prev => prev.filter(c => c.sourceBlockId !== blockId && c.targetBlockId !== blockId))
    
    // Remove workflows
    setWorkflows(prev => prev.filter(w => w.sourceId !== blockId && !w.steps.some(step => step.targetId === blockId)))

    // Trigger save
    triggerSave(prev => prev + 1)

    // Close menu
    setMenu(null)
  }

  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${menu.x}px`,
    top: `${menu.y}px`,
    zIndex: 2000,
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    padding: '4px 0',
    width: '160px',
    display: 'flex',
    flexDirection: 'column',
  }

  const optionStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  }

  return (
    <div style={menuStyle} onPointerDown={(e) => e.stopPropagation()}>
      <button 
        onClick={handleDelete}
        style={{ ...optionStyle, color: '#ef4444' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#fee2e2'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        Delete Block
      </button>
      <button 
        onClick={handleDisconnectAll}
        style={optionStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#f3f4f6'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        Disconnect all wires
      </button>
    </div>
  )
}

const PAGE_ID = '00000000-0000-0000-0000-000000000001'


function App() {
  const store = useStore()
  const setWorkflows = useSetAtom(workflowsAtom)
  const canvasRef = useRef<HTMLDivElement>(null)
  const activeWire = useAtomValue(activeWireAtom)
  const setActiveWire = useSetAtom(activeWireAtom)
  const setConnections = useSetAtom(connectionsAtom)
  const setSnapTarget = useSetAtom(snapTargetAtom)
  const [pendingConnection, setPendingConnection] = useAtom(pendingConnectionAtom)
  const [contextMenu, setContextMenu] = useAtom(contextMenuAtom)

  // Type mismatch notification state
  const [typeMismatch, setTypeMismatch] = useState<{
    x: number;
    y: number;
    message: string;
  } | null>(null)
  const mismatchTimeoutRef = useRef<any | null>(null)

  useEffect(() => {
    return () => {
      if (mismatchTimeoutRef.current) {
        clearTimeout(mismatchTimeoutRef.current)
      }
    }
  }, [])

  // Slash menu state & refs
  const [slashMenu, setSlashMenu] = useState<{
    x: number;
    y: number;
    query: string;
  } | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const slashMenuOpenRef = useRef(false)
  slashMenuOpenRef.current = slashMenu !== null

  const selectedIndexRef = useRef(0)
  selectedIndexRef.current = selectedIndex

  const filteredCommandsRef = useRef<any[]>([])
  const triggerSelectRef = useRef<() => void>(() => {})

  // Loading and Saving State
  const [isLoading, setIsLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'Saved' | 'Saving...' | 'Error saving' | 'Ready'>('Ready')
  const debouncedSaveRef = useRef<any | null>(null)
  const [triggerSaveValue, setTriggerSave] = useAtom(triggerSaveAtom)

  // Ref to hold saveToSupabase callback to break mutual dependency with editor hook
  const saveToSupabaseRef = useRef<(() => void) | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      ButtonBlock,
      NumberDisplayBlock,
      TextLabelBlock,
      ToggleBlock,
      InputBlock,
      FormulaDisplayBlock,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      saveToSupabaseRef.current?.()

      // Synchronize allBlockIdsAtom
      const blockIds: string[] = []
      editor.state.doc.descendants((node: any) => {
        const typeName = node.type.name
        if (typeName === 'buttonBlock' || typeName === 'numberDisplayBlock' || typeName === 'formulaDisplayBlock' || typeName === 'toggleBlock' || typeName === 'inputBlock' || typeName === 'textLabelBlock') {
          if (node.attrs?.blockId) {
            blockIds.push(node.attrs.blockId)
          }
        }
      })
      store.set(allBlockIdsAtom, blockIds)

      // Live recalculate all formulas
      recalculateAllFormulas(store)

      const { selection } = editor.state
      const { $from } = selection
      const currentLineText = $from.nodeBefore?.text || ''
      const lastSlashIndex = currentLineText.lastIndexOf('/')

      if (lastSlashIndex !== -1 && lastSlashIndex === currentLineText.length - 1) {
        // Just typed '/'
        const query = ''
        try {
          const coords = editor.view.coordsAtPos($from.pos)
          const container = document.getElementById('editor-container')
          if (container) {
            const containerRect = container.getBoundingClientRect()
            setSlashMenu({
              x: coords.left - containerRect.left,
              y: coords.bottom - containerRect.top + 5,
              query,
            })
            setSelectedIndex(0)
          }
        } catch (e) {
          console.error(e)
        }
      } else if (lastSlashIndex !== -1 && lastSlashIndex < currentLineText.length - 1) {
        // Typing query after '/' (e.g. '/bu')
        const query = currentLineText.substring(lastSlashIndex + 1)
        try {
          const coords = editor.view.coordsAtPos($from.pos)
          const container = document.getElementById('editor-container')
          if (container) {
            const containerRect = container.getBoundingClientRect()
            setSlashMenu({
              x: coords.left - containerRect.left,
              y: coords.bottom - containerRect.top + 5,
              query,
            })
          }
        } catch (e) {
          console.error(e)
        }
      } else {
        setSlashMenu(null)
      }
    },
    onSelectionUpdate: ({ editor }) => {
      const { selection } = editor.state
      const { $from } = selection
      const currentLineText = $from.nodeBefore?.text || ''
      const lastSlashIndex = currentLineText.lastIndexOf('/')

      if (lastSlashIndex !== -1 && lastSlashIndex === currentLineText.length - 1) {
        const query = ''
        try {
          const coords = editor.view.coordsAtPos($from.pos)
          const container = document.getElementById('editor-container')
          if (container) {
            const containerRect = container.getBoundingClientRect()
            setSlashMenu({
              x: coords.left - containerRect.left,
              y: coords.bottom - containerRect.top + 5,
              query,
            })
          }
        } catch (e) {
          console.error(e)
        }
      } else if (lastSlashIndex !== -1 && lastSlashIndex < currentLineText.length - 1) {
        const query = currentLineText.substring(lastSlashIndex + 1)
        try {
          const coords = editor.view.coordsAtPos($from.pos)
          const container = document.getElementById('editor-container')
          if (container) {
            const containerRect = container.getBoundingClientRect()
            setSlashMenu({
              x: coords.left - containerRect.left,
              y: coords.bottom - containerRect.top + 5,
              query,
            })
          }
        } catch (e) {
          console.error(e)
        }
      } else {
        setSlashMenu(null)
      }
    },
    editorProps: {
      handleKeyDown: (_, event) => {
        if (slashMenuOpenRef.current) {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            const total = filteredCommandsRef.current.length
            if (total > 0) {
              setSelectedIndex(prev => (prev + 1) % total)
            }
            return true
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            const total = filteredCommandsRef.current.length
            if (total > 0) {
              setSelectedIndex(prev => (prev - 1 + total) % total)
            }
            return true
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            triggerSelectRef.current()
            return true
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setSlashMenu(null)
            return true
          }
        }
        return false
      }
    }
  })

  const commands = useMemo(() => [
    {
      id: 'button',
      title: 'Button',
      description: 'Insert an interactive button that triggers actions',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M12 18V6" />
          <path d="M6 12h12" />
        </svg>
      ),
      action: () => {
        if (!blockExists('test_btn_1')) {
          insertButtonBlock()
        } else {
          insertButtonBlock2()
        }
      }
    },
    {
      id: 'numberDisplay',
      title: 'Number Display',
      description: 'Insert a numeric display to show and constrain counters',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="9" x2="15" y2="15" />
          <line x1="15" y1="9" x2="9" y2="15" />
        </svg>
      ),
      action: () => {
        if (!blockExists('test_num_1')) {
          insertNumberDisplay()
        } else {
          insertNumberDisplay2()
        }
      }
    },
    {
      id: 'toggle',
      title: 'Toggle',
      description: 'Insert a boolean toggle switch',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="6" ry="6" />
          <circle cx="8" cy="12" r="3" fill="currentColor" />
        </svg>
      ),
      action: () => {
        if (!blockExists('test_tgl_1')) {
          insertToggleBlock()
        } else {
          insertToggleBlock2()
        }
      }
    },
    {
      id: 'input',
      title: 'Input',
      description: 'Insert a text input box for typing live values',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <line x1="10" y1="3" x2="8" y2="21" />
          <line x1="16" y1="3" x2="14" y2="21" />
        </svg>
      ),
      action: () => {
        if (!blockExists('test_inp_1')) {
          insertInputBlock()
        } else {
          insertInputBlock2()
        }
      }
    },
    {
      id: 'textLabel',
      title: 'Text Label',
      description: 'Insert a text label that displays string values',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      ),
      action: () => {
        if (!blockExists('test_lbl_1')) {
          insertTextLabel()
        } else {
          insertTextLabel2()
        }
      }
    },
    {
      id: 'formula',
      title: 'Formula Display',
      description: 'Insert a formula display that evaluates math expression bindings',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19L8 5L12 19L16 5" />
          <line x1="12" y1="12" x2="20" y2="12" />
        </svg>
      ),
      action: () => {
        if (!blockExists('test_frm_1')) {
          insertFormulaDisplay()
        } else {
          insertFormulaDisplay2()
        }
      }
    }
  ], [editor])

  const filteredCommands = useMemo(() => {
    if (!slashMenu) return []
    const q = slashMenu.query.toLowerCase()
    return commands.filter(cmd => 
      cmd.title.toLowerCase().includes(q) || 
      cmd.description.toLowerCase().includes(q)
    )
  }, [slashMenu, commands])

  // Sync references to avoid stale closures in ProseMirror event handlers
  filteredCommandsRef.current = filteredCommands

  const handleSelectCommand = useCallback((cmd: any) => {
    if (!editor) return

    // Delete range: from slash index to current position
    const { selection } = editor.state
    const { $from } = selection
    const currentLineText = $from.nodeBefore?.text || ''
    const lastSlashIndex = currentLineText.lastIndexOf('/')
    
    if (lastSlashIndex !== -1) {
      const startPos = $from.pos - (currentLineText.length - lastSlashIndex)
      editor.chain().focus().deleteRange({ from: startPos, to: $from.pos }).run()
    }

    cmd.action()
    setSlashMenu(null)
    setSelectedIndex(0)
  }, [editor])

  triggerSelectRef.current = () => {
    const cmd = filteredCommandsRef.current[selectedIndexRef.current]
    if (cmd) {
      handleSelectCommand(cmd)
    }
  }

  const saveToSupabase = useCallback(() => {
    if (isLoading || !editor) return

    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current)
    }

    setSaveStatus('Saving...')

    debouncedSaveRef.current = setTimeout(async () => {
      try {
        const docJson = editor.getJSON()
        
        // Extract all block IDs from editor content
        const blockIds: string[] = []
        const traverse = (node: any) => {
          if (node.type === 'buttonBlock' || node.type === 'numberDisplayBlock' || node.type === 'formulaDisplayBlock' || node.type === 'toggleBlock' || node.type === 'inputBlock' || node.type === 'textLabelBlock') {
            if (node.attrs?.blockId) {
              blockIds.push(node.attrs.blockId)
            }
          }
          if (node.content) {
            node.content.forEach(traverse)
          }
        }
        traverse(docJson)

        const positions: Record<string, { x: number; y: number }> = {}
        const runtimeStates: Record<string, any> = {}

        blockIds.forEach(id => {
          positions[id] = store.get(blockPositionAtom(id))
          runtimeStates[id] = store.get(blockRuntimeAtom(id))
        })

        const workflows = store.get(workflowsAtom)
        const connections = store.get(connectionsAtom)
        const formulas = store.get(formulasAtom)

        const blocksPayload = {
          documentContent: docJson,
          positions,
          runtimeStates,
          connections,
          formulas,
        }

        const { error } = await supabase
          .from('pages')
          .update({
            blocks: blocksPayload,
            workflows,
            updated_at: new Date().toISOString()
          })
          .eq('id', PAGE_ID)

        if (error) throw error
        setSaveStatus('Saved')
      } catch (err: any) {
        console.error('Failed to save to Supabase:', err)
        console.error('[Supabase Error Message]:', err?.message)
        setSaveStatus('Error saving')
      }
    }, 500)
  }, [editor, store, isLoading])

  // Sync ref with callback
  useEffect(() => {
    saveToSupabaseRef.current = saveToSupabase
  }, [saveToSupabase])

  const onCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!activeWire) return
    const container = canvasRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()

    // Update wire endpoint
    setActiveWire(prev => prev ? {
      ...prev,
      currentX: e.clientX - containerRect.left,
      currentY: e.clientY - containerRect.top,
    } : null)

    // Snap detection: find the closest input port within 20px
    const inputPorts = container.querySelectorAll('[data-port-input]')
    let closestBlockId: string | null = null
    let closestDist = Infinity

    inputPorts.forEach(port => {
      const targetBlockId = port.getAttribute('data-port-input')
      if (!targetBlockId || targetBlockId === activeWire.sourceBlockId) return

      const portRect = port.getBoundingClientRect()
      const portCenterX = portRect.left + portRect.width / 2
      const portCenterY = portRect.top + portRect.height / 2
      const dx = e.clientX - portCenterX
      const dy = e.clientY - portCenterY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 20 && dist < closestDist) {
        closestDist = dist
        closestBlockId = targetBlockId
      }
    })

    setSnapTarget(closestBlockId)
  }, [activeWire, setActiveWire, setSnapTarget])

  const onCanvasPointerUp = useCallback(() => {
    if (!activeWire) return
    const container = canvasRef.current

    // Check if we're snapped to a valid target
    if (container) {
      const inputPorts = container.querySelectorAll('[data-port-input]')
      let droppedOnBlockId: string | null = null
      let targetPortX = 0
      let targetPortY = 0

      // Re-check snap at the moment of release (use last known cursor position from activeWire)
      const containerRect = container.getBoundingClientRect()
      const cursorX = activeWire.currentX + containerRect.left
      const cursorY = activeWire.currentY + containerRect.top

      inputPorts.forEach(port => {
        const targetBlockId = port.getAttribute('data-port-input')
        if (!targetBlockId || targetBlockId === activeWire.sourceBlockId) return

        const portRect = port.getBoundingClientRect()
        const portCenterX = portRect.left + portRect.width / 2
        const portCenterY = portRect.top + portRect.height / 2
        const dx = cursorX - portCenterX
        const dy = cursorY - portCenterY
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < 20) {
          droppedOnBlockId = targetBlockId
          targetPortX = portCenterX - containerRect.left
          targetPortY = portCenterY - containerRect.top
        }
      })

      if (droppedOnBlockId) {
        // Determine source and target node types
        let sourceNodeType: string | null = null
        let targetNodeType: string | null = null
        if (editor) {
          const traverse = (node: any) => {
            if (node.attrs?.blockId === activeWire.sourceBlockId) {
              sourceNodeType = node.type
            }
            if (node.attrs?.blockId === droppedOnBlockId) {
              targetNodeType = node.type
            }
            if (node.content) {
              node.content.forEach(traverse)
            }
          }
          editor.getJSON().content?.forEach(traverse)
        }

        const sourceDataType = getBlockDataType(sourceNodeType || '')
        const targetDataType = getBlockDataType(targetNodeType || '')

        // Check if types are compatible
        let isCompatible = false
        if (sourceDataType === 'string' && targetDataType === 'string') isCompatible = true
        else if (sourceDataType === 'trigger' && targetDataType === 'number') isCompatible = true
        else if (sourceDataType === 'trigger' && targetDataType === 'boolean') isCompatible = true

        if (!isCompatible) {
          const srcLbl = sourceDataType === 'string' ? 'text' : sourceDataType
          const tgtLbl = targetDataType === 'string' ? 'text' : targetDataType
          setTypeMismatch({
            x: targetPortX,
            y: targetPortY,
            message: `Type mismatch: ${srcLbl} cannot connect to a ${tgtLbl}`
          })
          if (mismatchTimeoutRef.current) {
            clearTimeout(mismatchTimeoutRef.current)
          }
          mismatchTimeoutRef.current = setTimeout(() => {
            setTypeMismatch(null)
          }, 2000)
        } else {
          if (sourceNodeType === 'inputBlock') {
            // InputBlock -> TextLabelBlock: direct mirror connection (no popup)
            if (targetNodeType === 'textLabelBlock') {
              const connId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
              const wfId = `wf_${connId}`

              setConnections(prev => [...prev, {
                id: connId,
                sourceBlockId: activeWire.sourceBlockId,
                targetBlockId: droppedOnBlockId!,
              }])

              const newWorkflow = {
                id: wfId,
                sourceId: activeWire.sourceBlockId,
                sourceEvent: 'onChange' as const,
                permission: 'public' as const,
                pageId: 'page_1',
                steps: [{
                  id: `step_${connId}`,
                  action: 'set' as const,
                  targetId: droppedOnBlockId!,
                  value: '__sourceValue__',
                  condition: null,
                }],
              }

              setWorkflows(prev => [...prev, newWorkflow])
              setTriggerSave(prev => prev + 1)
            }
          } else {
            // Normal connection popup
            setPendingConnection({
              sourceBlockId: activeWire.sourceBlockId,
              targetBlockId: droppedOnBlockId,
              x1: activeWire.sourceX,
              y1: activeWire.sourceY,
              x2: targetPortX,
              y2: targetPortY,
            })
          }
        }
      }
    }

    setActiveWire(null)
    setSnapTarget(null)
  }, [activeWire, setActiveWire, setSnapTarget, setPendingConnection, editor, setConnections, setWorkflows, setTriggerSave])

  const onCanvasPointerDown = useCallback(() => {
    if (pendingConnection) {
      setPendingConnection(null)
    }
    if (contextMenu) {
      setContextMenu(null)
    }
  }, [pendingConnection, setPendingConnection, contextMenu, setContextMenu])

  // Save when triggerSaveValue changes
  useEffect(() => {
    if (triggerSaveValue > 0) {
      saveToSupabase()
    }
  }, [triggerSaveValue, saveToSupabase])

  // Save when workflows, connections, or formulas change
  useEffect(() => {
    if (isLoading) return
    const unsubWorkflows = store.sub(workflowsAtom, () => {
      saveToSupabase()
    })
    const unsubConnections = store.sub(connectionsAtom, () => {
      saveToSupabase()
    })
    const unsubFormulas = store.sub(formulasAtom, () => {
      saveToSupabase()
    })
    return () => {
      unsubWorkflows()
      unsubConnections()
      unsubFormulas()
    }
  }, [store, saveToSupabase, isLoading])


  // Load from Supabase on init
  useEffect(() => {
    async function loadPage() {
      try {
        setIsLoading(true)
        setSaveStatus('Ready')
        let { data, error } = await supabase
          .from('pages')
          .select('*')
          .eq('id', PAGE_ID)
          .maybeSingle()

        if (error) throw error

        if (!data) {
          // If no row exists, insert one
          const defaultBlocks = {
            documentContent: {
              type: 'doc',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 3 },
                  content: [{ type: 'text', text: 'Creora Test Canvas' }]
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Click the buttons above to insert blocks, then test the interactive counter.' }]
                }
              ]
            },
            positions: {},
            runtimeStates: {},
            connections: []
          }
          
          const { data: newRow, error: insertError } = await supabase
            .from('pages')
            .insert({
              id: PAGE_ID,
              blocks: defaultBlocks,
              workflows: []
            })
            .select()
            .single()

          if (insertError) throw insertError
          data = newRow
        }

        if (data) {
          const blocksData = data.blocks || {}
          const workflowsData = data.workflows || []

          // 1. Populate block positions
          if (blocksData.positions) {
            Object.entries(blocksData.positions).forEach(([id, pos]: [string, any]) => {
              store.set(blockPositionAtom(id), pos)
            })
          }

          // 2. Populate block runtime states
          if (blocksData.runtimeStates) {
            Object.entries(blocksData.runtimeStates).forEach(([id, rState]: [string, any]) => {
              store.set(blockRuntimeAtom(id), rState)
            })
          }

          // 3. Populate connections
          if (blocksData.connections) {
            store.set(connectionsAtom, blocksData.connections)
          }

          // 3b. Populate formulas
          if (blocksData.formulas) {
            store.set(formulasAtom, blocksData.formulas)
          } else {
            store.set(formulasAtom, [])
          }

          // 4. Populate workflows
          store.set(workflowsAtom, workflowsData)

          // 5. Populate TipTap editor content
          if (editor && blocksData.documentContent) {
            // Migrate document content (textDisplayBlock -> numberDisplayBlock)
            const migrateNodes = (node: any) => {
              if (node.type === 'textDisplayBlock') {
                node.type = 'numberDisplayBlock'
              }
              if (node.content) {
                node.content.forEach(migrateNodes)
              }
            }
            migrateNodes(blocksData.documentContent)
            editor.commands.setContent(blocksData.documentContent)

            // Extract all block IDs to populate allBlockIdsAtom
            const blockIds: string[] = []
            const traverse = (node: any) => {
              if (node.type === 'buttonBlock' || node.type === 'numberDisplayBlock' || node.type === 'formulaDisplayBlock' || node.type === 'toggleBlock' || node.type === 'inputBlock' || node.type === 'textLabelBlock') {
                if (node.attrs?.blockId) {
                  blockIds.push(node.attrs.blockId)
                }
              }
              if (node.content) {
                node.content.forEach(traverse)
              }
            }
            traverse(blocksData.documentContent)
            store.set(allBlockIdsAtom, blockIds)

            // Recalculate all formulas with loaded states
            recalculateAllFormulas(store)
          }
        }
      } catch (err) {
        console.error('Error loading page from Supabase:', err)
      } finally {
        setIsLoading(false)
      }
    }

    if (editor) {
      loadPage()
    }
  }, [editor, store])

  // Helper: check if a block with this ID already exists in the editor
  function blockExists(blockId: string): boolean {
    if (!editor) return false
    let found = false
    editor.state.doc.descendants((node: any) => {
      if (node.attrs?.blockId === blockId) {
        found = true
        return false
      }
    })
    return found
  }

  function insertButtonBlock() {
    if (!editor || blockExists('test_btn_1')) return
    editor.chain().focus('end').insertContent({
      type: 'buttonBlock',
      attrs: {
        blockId: 'test_btn_1',
        label: 'Increment Counter'
      }
    }).run()
    store.set(blockPositionAtom('test_btn_1'), { x: 80, y: 60 })
  }

  function insertNumberDisplay() {
    if (!editor || blockExists('test_num_1')) return
    editor.chain().focus('end').insertContent({
      type: 'numberDisplayBlock',
      attrs: {
        blockId: 'test_num_1'
      }
    }).run()
    store.set(blockPositionAtom('test_num_1'), { x: 300, y: 60 })
  }

  function insertButtonBlock2() {
    if (!editor || blockExists('test_btn_2')) return
    editor.chain().focus('end').insertContent({
      type: 'buttonBlock',
      attrs: {
        blockId: 'test_btn_2',
        label: 'Counter B'
      }
    }).run()
    store.set(blockPositionAtom('test_btn_2'), { x: 80, y: 200 })
  }

  function insertNumberDisplay2() {
    if (!editor || blockExists('test_num_2')) return
    editor.chain().focus('end').insertContent({
      type: 'numberDisplayBlock',
      attrs: {
        blockId: 'test_num_2'
      }
    }).run()
    store.set(blockPositionAtom('test_num_2'), { x: 300, y: 200 })
  }

  function insertTextLabel() {
    if (!editor || blockExists('test_lbl_1')) return
    editor.chain().focus('end').insertContent({
      type: 'textLabelBlock',
      attrs: {
        blockId: 'test_lbl_1'
      }
    }).run()
    store.set(blockPositionAtom('test_lbl_1'), { x: 520, y: 340 })
  }

  function insertTextLabel2() {
    if (!editor || blockExists('test_lbl_2')) return
    editor.chain().focus('end').insertContent({
      type: 'textLabelBlock',
      attrs: {
        blockId: 'test_lbl_2'
      }
    }).run()
    store.set(blockPositionAtom('test_lbl_2'), { x: 520, y: 440 })
  }

  function insertToggleBlock() {
    if (!editor || blockExists('test_tgl_1')) return
    editor.chain().focus('end').insertContent({
      type: 'toggleBlock',
      attrs: {
        blockId: 'test_tgl_1'
      }
    }).run()
    store.set(blockPositionAtom('test_tgl_1'), { x: 80, y: 340 })
  }

  function insertToggleBlock2() {
    if (!editor || blockExists('test_tgl_2')) return
    editor.chain().focus('end').insertContent({
      type: 'toggleBlock',
      attrs: {
        blockId: 'test_tgl_2'
      }
    }).run()
    store.set(blockPositionAtom('test_tgl_2'), { x: 300, y: 340 })
  }

  function insertInputBlock() {
    if (!editor || blockExists('test_inp_1')) return
    editor.chain().focus('end').insertContent({
      type: 'inputBlock',
      attrs: {
        blockId: 'test_inp_1'
      }
    }).run()
    store.set(blockPositionAtom('test_inp_1'), { x: 520, y: 60 })
  }

  function insertInputBlock2() {
    if (!editor || blockExists('test_inp_2')) return
    editor.chain().focus('end').insertContent({
      type: 'inputBlock',
      attrs: {
        blockId: 'test_inp_2'
      }
    }).run()
    store.set(blockPositionAtom('test_inp_2'), { x: 520, y: 200 })
  }

  function insertFormulaDisplay() {
    if (!editor || blockExists('test_frm_1')) return
    editor.chain().focus('end').insertContent({
      type: 'formulaDisplayBlock',
      attrs: {
        blockId: 'test_frm_1'
      }
    }).run()
    store.set(blockPositionAtom('test_frm_1'), { x: 300, y: 340 })
  }

  function insertFormulaDisplay2() {
    if (!editor || blockExists('test_frm_2')) return
    editor.chain().focus('end').insertContent({
      type: 'formulaDisplayBlock',
      attrs: {
        blockId: 'test_frm_2'
      }
    }).run()
    store.set(blockPositionAtom('test_frm_2'), { x: 300, y: 440 })
  }



  return (
    <div className="app-container" style={{ display: 'flex', fontFamily: 'sans-serif', minHeight: '100vh' }}>
      <div style={{ flex: 1, padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <h1 style={{ margin: 0 }}>Creora Playground</h1>
          {isLoading ? (
            <span style={{ fontSize: '14px', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>
              Loading from database...
            </span>
          ) : (
            <span style={{ 
              fontSize: '14px', 
              color: saveStatus === 'Error saving' ? '#ef4444' : saveStatus === 'Saving...' ? '#3b82f6' : '#10b981', 
              background: saveStatus === 'Error saving' ? '#fee2e2' : saveStatus === 'Saving...' ? '#dbeafe' : '#d1fae5', 
              padding: '4px 8px', 
              borderRadius: '4px',
              fontWeight: 500,
              transition: 'all 0.2s'
            }}>
              {saveStatus}
            </span>
          )}
        </div>


        <div
          id="editor-container"
          ref={canvasRef}
          style={{ position: 'relative', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', height: '500px', overflow: 'hidden' }}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerDown={onCanvasPointerDown}
        >
          <EditorContent editor={editor} />
          <WireOverlay />
          <ConnectionPopup editor={editor} />
          <ContextMenu editor={editor} />
          {typeMismatch && (
            <div
              style={{
                position: 'absolute',
                left: `${typeMismatch.x + 12}px`,
                top: `${typeMismatch.y - 14}px`,
                background: '#ef4444',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                zIndex: 9999,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease-in-out',
                border: '1px solid #fee2e2',
              }}
            >
              ⚠️ {typeMismatch.message}
            </div>
          )}
          {slashMenu && filteredCommands.length > 0 && (
            <div
              style={{
                position: 'absolute',
                left: `${slashMenu.x}px`,
                top: `${slashMenu.y}px`,
                background: '#1e293b',
                color: 'white',
                borderRadius: '8px',
                border: '1px solid #334155',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.5)',
                zIndex: 10000,
                width: '320px',
                maxHeight: '300px',
                overflowY: 'auto',
                padding: '4px',
              }}
            >
              {filteredCommands.map((cmd, idx) => {
                const isActive = idx === selectedIndex
                return (
                  <div
                    key={cmd.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelectCommand(cmd)
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: isActive ? '#4f46e5' : 'transparent',
                      color: isActive ? 'white' : '#e2e8f0',
                      transition: 'background-color 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', flexShrink: 0 }}>
                      {cmd.icon}
                    </div>
                    <div style={{ flex: 1, marginLeft: '8px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13px', textAlign: 'left' }}>
                        {cmd.title}
                      </div>
                      <div style={{ fontSize: '11px', color: isActive ? '#c7d2fe' : '#94a3b8', marginTop: '2px', textAlign: 'left' }}>
                        {cmd.description}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <Inspector editor={editor} />
    </div>
  )
}

export default App
