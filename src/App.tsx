import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useSetAtom, useAtom, useAtomValue, useStore } from 'jotai'
import { workflowsAtom, blockRuntimeAtom, blockPositionAtom, selectedBlockIdAtom, activeWireAtom, connectionsAtom, snapTargetAtom, pendingConnectionAtom, triggerSaveAtom, contextMenuAtom, getBlockDataType, formulasAtom, allBlockIdsAtom, getBlockDefaultValue, connectionContextMenuAtom, getBlockTypeDisplayName, isGarbageName, getCanvasBlocks, currentPageIdAtom, pagesListAtom, switchPageFnAtom } from './state/atoms'
import { ButtonBlock } from './blocks/ButtonBlock'
import { NumberDisplayBlock } from './blocks/NumberDisplayBlock'
import { TextLabelBlock } from './blocks/TextLabelBlock'
import { ToggleBlock } from './blocks/ToggleBlock'
import { InputBlock } from './blocks/InputBlock'
import { FormulaDisplayBlock } from './blocks/FormulaDisplayBlock'
import { TimerBlock } from './blocks/TimerBlock'
import { HistoryChartBlock } from './blocks/HistoryChartBlock'
import { DatabaseBlock } from './blocks/DatabaseBlock'
import { ListBlock } from './blocks/ListBlock'
import { WireOverlay } from './components/WireOverlay'
import { supabase } from './lib/supabase'
import { recalculateAllFormulas } from './lib/bindingEngine'
import type { FormulaBinding, CreoraFile, Page, Block, BlockProps, StyleConfig, AnimationConfig, BlockType } from './types/creora'
import './App.css'

const inspectorModules = import.meta.glob<{ default: React.ComponentType<{ blockId: string; editor: any }> }>('./blocks/*.inspector.tsx', { eager: true })

function InspectorControls({ blockId, editor }: { blockId: string; editor: any }) {
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

  if (!blockType) return null

  // Resolve and render matching inspector
  const capitalized = (blockType as string).charAt(0).toUpperCase() + (blockType as string).slice(1)
  const moduleKey = `./blocks/${capitalized}.inspector.tsx`
  const InspectorComponent = inspectorModules[moduleKey]?.default

  if (!InspectorComponent) {
    return <div style={{ fontSize: '12px', color: '#ef4444' }}>No inspector found for {blockType}</div>
  }

  return <InspectorComponent blockId={blockId} editor={editor} />
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
  const store = useStore()
  const [pending, setPending] = useAtom(pendingConnectionAtom)
  const setConnections = useSetAtom(connectionsAtom)
  const setWorkflows = useSetAtom(workflowsAtom)

  const [action, setAction] = useState<string>('increment')
  const [amount, setAmount] = useState<number>(1)
  const [value, setValue] = useState<string>('')
  const [timerEvent, setTimerEvent] = useState<'onTick' | 'onComplete'>('onTick')

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

  // Determine source block node type
  let sourceNodeType: string | null = null
  if (pending && editor) {
    const traverse = (node: any) => {
      if (node.attrs?.blockId === pending.sourceBlockId) {
        sourceNodeType = node.type
      }
      if (node.content) {
        node.content.forEach(traverse)
      }
    }
    editor.getJSON().content?.forEach(traverse)
  }

  const isToggleBlock = targetNodeType === 'toggleBlock'
  const isDatabaseBlock = targetNodeType === 'databaseBlock'
  const targetState = pending ? store.get(blockRuntimeAtom(pending.targetBlockId)) : null
  const databaseColumns = targetState?.columns || []

  const [mappings, setMappings] = useState<Record<string, { source: 'fixed' | 'block'; value: string }>>({})
  const [matchColumn, setMatchColumn] = useState<string>('')
  const [matchValueSource, setMatchValueSource] = useState<'fixed' | 'block'>('fixed')
  const [matchValueVal, setMatchValueVal] = useState<string>('')

  useEffect(() => {
    if (isDatabaseBlock && databaseColumns.length > 0) {
      const initialMappings: Record<string, { source: 'fixed' | 'block'; value: string }> = {}
      databaseColumns.forEach((col: any) => {
        initialMappings[col.name] = { source: 'fixed', value: '' }
      })
      setMappings(initialMappings)

      if (!matchColumn || !databaseColumns.some((c: any) => c.name === matchColumn)) {
        setMatchColumn(databaseColumns[0].name)
      }
    }
  }, [isDatabaseBlock, databaseColumns])

  // Get all OTHER blocks on the canvas
  const canvasBlocks = useMemo(() => {
    if (!editor || !pending) return []
    return getCanvasBlocks(editor, store, pending.targetBlockId)
  }, [editor, pending, store])

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
      } else if (type === 'databaseBlock') {
        setAction('addRow')
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

  // Calculate coordinates relative to viewport (fixed positioning)
  const canvasEl = document.getElementById('editor-container')
  const canvasRect = canvasEl ? canvasEl.getBoundingClientRect() : { left: 0, top: 0 }
  
  const popupWidth = 260
  const popupExpectedHeight = isConditional ? 420 : 300
  
  const targetViewportX = canvasRect.left + pending.x2
  const targetViewportY = canvasRect.top + pending.y2

  // Clamp positioning inside the viewport boundaries
  const leftPos = targetViewportX > window.innerWidth - 300 ? targetViewportX - popupWidth - 10 : targetViewportX + 10
  const topPos = Math.max(10, Math.min(targetViewportY - 80, window.innerHeight - popupExpectedHeight - 10))

  const popupStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${leftPos}px`,
    top: `${topPos}px`,
    zIndex: 9999, // Render above canvas boundary layer
    background: 'white',
    border: '1px solid #cbd5e1',
    borderRadius: '12px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.05)',
    padding: '24px',
    width: `${popupWidth}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
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
      } else if (action === 'reset') {
        stepStep.action = 'reset'
      } else {
        stepStep.action = 'toggle'
      }
    } else if (isDatabaseBlock) {
      stepStep.action = action
      if (action === 'addRow' || action === 'updateRow') {
        stepStep.mappings = mappings
      }
      if (action === 'updateRow' || action === 'deleteRow') {
        stepStep.matchColumn = matchColumn
        stepStep.matchValue = {
          source: matchValueSource,
          value: matchValueVal || (canvasBlocks[0]?.id || '')
        }
      }
    } else {
      if (action === 'reset') {
        stepStep.action = 'reset'
      } else if (action === 'increment' || action === 'decrement') {
        stepStep.amount = amount
      } else if (action === 'set') {
        const parsedNum = Number(value)
        stepStep.value = isNaN(parsedNum) || value.trim() === '' ? value : parsedNum
      } else {
        stepStep.action = 'toggle'
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
      sourceEvent: sourceNodeType === 'timerBlock' ? timerEvent : ('onClick' as const),
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
      
      {sourceNodeType === 'timerBlock' && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 500, color: '#475569', fontSize: '13px' }}>
          Trigger Event
          <select 
            value={timerEvent} 
            onChange={(e) => setTimerEvent(e.target.value as any)}
            style={selectStyle}
          >
            <option value="onTick">On Tick (every second)</option>
            <option value="onComplete">On Complete (reaches zero)</option>
          </select>
        </label>
      )}

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
              <option value="reset">Reset</option>
            </>
          ) : isDatabaseBlock ? (
            <>
              <option value="addRow">Add Row</option>
              <option value="updateRow">Update Row</option>
              <option value="deleteRow">Delete Row</option>
            </>
          ) : (
            <>
              <option value="increment">Increment</option>
              <option value="decrement">Decrement</option>
              <option value="set">Set to value</option>
              <option value="toggle">Toggle</option>
              <option value="reset">Reset</option>
            </>
          )}
        </select>
      </label>

      {!isToggleBlock && !isDatabaseBlock && (action === 'increment' || action === 'decrement') && (
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

      {!isToggleBlock && !isDatabaseBlock && action === 'set' && (
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

      {isDatabaseBlock && (action === 'updateRow' || action === 'deleteRow') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #94a3b8', padding: '8px', borderRadius: '6px', background: '#f1f5f9', marginBottom: '8px' }}>
          <div style={{ fontWeight: 600, color: '#334155', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Find Matcher Row</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', fontWeight: 500, color: '#475569' }}>
              Where Column
              <select
                value={matchColumn}
                onChange={(e) => setMatchColumn(e.target.value)}
                style={{ ...selectStyle, padding: '2px 24px 2px 6px', fontSize: '11px', height: '24px' }}
              >
                {databaseColumns.map((col: any) => (
                  <option key={col.name} value={col.name}>
                    {col.name} ({col.type})
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, color: '#475569' }}>Equals Value</span>
              <select
                value={matchValueSource}
                onChange={(e) => {
                  setMatchValueSource(e.target.value as any);
                  setMatchValueVal(e.target.value === 'fixed' ? '' : (canvasBlocks[0]?.id || ''));
                }}
                style={{ ...selectStyle, width: '90px', padding: '2px 20px 2px 6px', fontSize: '10px', height: '22px' }}
              >
                <option value="fixed">Fixed value</option>
                <option value="block">From block</option>
              </select>
            </div>

            {matchValueSource === 'fixed' ? (
              <input
                type="text"
                value={matchValueVal}
                onChange={(e) => setMatchValueVal(e.target.value)}
                placeholder="Enter value to match"
                style={{ ...inputStyle, padding: '4px 6px', fontSize: '11px', height: '24px' }}
              />
            ) : (
              <select
                value={matchValueVal}
                onChange={(e) => setMatchValueVal(e.target.value)}
                style={{ ...selectStyle, padding: '2px 24px 2px 6px', fontSize: '11px', height: '24px' }}
              >
                {canvasBlocks.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {isDatabaseBlock && (action === 'addRow' || action === 'updateRow') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
          <div style={{ fontWeight: 600, color: '#475569', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Column Mappings</div>
          {databaseColumns.map((col: any) => {
            const currentMap = mappings[col.name] || { source: 'fixed', value: '' };
            return (
              <div key={col.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid #cbd5e1', padding: '6px 8px', borderRadius: '6px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '11px', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }} title={col.name}>
                    {col.name} <span style={{ fontSize: '9px', fontWeight: 500, color: '#64748b' }}>({col.type})</span>
                  </span>
                  <select
                    value={currentMap.source}
                    onChange={(e) => {
                      setMappings(prev => ({
                        ...prev,
                        [col.name]: { source: e.target.value as any, value: e.target.value === 'fixed' ? '' : (canvasBlocks[0]?.id || '') }
                      }));
                    }}
                    style={{ ...selectStyle, width: '90px', padding: '2px 20px 2px 6px', fontSize: '10px', height: '22px' }}
                  >
                    <option value="fixed">Fixed value</option>
                    <option value="block">From block</option>
                  </select>
                </div>
                {currentMap.source === 'fixed' ? (
                  <input
                    type="text"
                    value={currentMap.value}
                    onChange={(e) => {
                      setMappings(prev => ({
                        ...prev,
                        [col.name]: { ...currentMap, value: e.target.value }
                      }));
                    }}
                    placeholder={`Fixed ${col.type}`}
                    style={{ ...inputStyle, padding: '4px 6px', fontSize: '11px', height: '24px' }}
                  />
                ) : (
                  <select
                    value={currentMap.value}
                    onChange={(e) => {
                      setMappings(prev => ({
                        ...prev,
                        [col.name]: { ...currentMap, value: e.target.value }
                      }));
                    }}
                    style={{ ...selectStyle, padding: '2px 24px 2px 6px', fontSize: '11px', height: '24px' }}
                  >
                    {canvasBlocks.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
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

function ContextMenu({ editor, deleteBlock }: { editor: any; deleteBlock: (blockId: string) => void }) {
  const store = useStore()
  const [menu, setMenu] = useAtom(contextMenuAtom)
  const setConnections = useSetAtom(connectionsAtom)
  const setWorkflows = useSetAtom(workflowsAtom)
  const triggerSave = useSetAtom(triggerSaveAtom)

  if (!menu || !menu.visible) return null

  const handleDelete = () => {
    deleteBlock(menu.blockId)
    setMenu(null)
  }

  const handleDuplicate = () => {
    const blockId = menu.blockId

    let nodeToDuplicate: any = null
    if (editor) {
      editor.state.doc.descendants((node: any) => {
        if (node.attrs?.blockId === blockId) {
          nodeToDuplicate = node
          return false
        }
      })
    }

    if (!nodeToDuplicate) {
      setMenu(null)
      return
    }

    const typeName = nodeToDuplicate.type.name
    const newBlockId = `block_${Math.random().toString(36).substring(2, 9)}`

    const origRuntime = store.get(blockRuntimeAtom(blockId))

    const defaultValue = getBlockDefaultValue(typeName)

    const newRuntime = {
      value: defaultValue,
      visible: origRuntime?.opacity !== 0,
      disabled: false,
      loading: false,
      error: null,
      backgroundColor: origRuntime?.backgroundColor,
      borderRadius: origRuntime?.borderRadius,
      textColor: origRuntime?.textColor,
      fontSize: origRuntime?.fontSize,
      opacity: origRuntime?.opacity,
      width: origRuntime?.width,
      min: origRuntime?.min,
      max: origRuntime?.max,
      trackedBlockId: origRuntime?.trackedBlockId,
      history: origRuntime?.history ? [] : undefined,
      columns: origRuntime?.columns,
      rows: origRuntime?.rows ? [] : undefined,
      outputMode: origRuntime?.outputMode,
    }

    store.set(blockRuntimeAtom(newBlockId), newRuntime)

    const origPos = store.get(blockPositionAtom(blockId)) || { x: 100, y: 100 }
    const newPos = { x: origPos.x + 30, y: origPos.y + 30 }
    store.set(blockPositionAtom(newBlockId), newPos)

    if (editor) {
      editor.commands.command(({ tr, dispatch }: any) => {
        let foundPos = -1
        tr.doc.descendants((node: any, pos: number) => {
          if (node.attrs?.blockId === blockId) {
            foundPos = pos
            return false
          }
        })
        if (foundPos !== -1 && dispatch) {
          const nodeType = tr.doc.type.schema.nodes[typeName]
          const newAttrs = { ...nodeToDuplicate.attrs, blockId: newBlockId }
          const newNode = nodeType.create(newAttrs)
          tr.insert(foundPos + nodeToDuplicate.nodeSize, newNode)
          return true
        }
        return false
      })
    }

    triggerSave(prev => prev + 1)
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
        onClick={handleDuplicate}
        style={optionStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#f3f4f6'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        Duplicate Block
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
    </div>
  )
}

function ConnectionContextMenu() {
  const [menu, setMenu] = useAtom(connectionContextMenuAtom)
  const setConnections = useSetAtom(connectionsAtom)
  const setWorkflows = useSetAtom(workflowsAtom)
  const triggerSave = useSetAtom(triggerSaveAtom)

  if (!menu || !menu.visible) return null

  const handleDelete = () => {
    // Remove connection
    setConnections(prev => prev.filter(c => c.id !== menu.connectionId))
    
    // Remove workflow
    setWorkflows(prev => prev.filter(w => w.id !== `wf_${menu.connectionId}`))

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
    width: '180px',
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
    color: '#ef4444',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  }

  return (
    <div style={menuStyle} onPointerDown={(e) => e.stopPropagation()}>
      <button 
        onClick={handleDelete}
        style={optionStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#fee2e2'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        Delete this connection
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
  const [connectionContextMenu, setConnectionContextMenu] = useAtom(connectionContextMenuAtom)
  const setSelectedBlockId = useSetAtom(selectedBlockIdAtom)
  const allBlockIds = useAtomValue(allBlockIdsAtom)

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

  // Pages state
  const [activePageId, setActivePageId] = useAtom(currentPageIdAtom)
  const [pagesList, setPagesList] = useAtom(pagesListAtom)
  const [isCrossfading, setIsCrossfading] = useState(false)
  const setSwitchPageFn = useSetAtom(switchPageFnAtom)

  const activePageIdRef = useRef(PAGE_ID)
  useEffect(() => {
    activePageIdRef.current = activePageId || PAGE_ID
  }, [activePageId])

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
      TimerBlock,
      HistoryChartBlock,
      DatabaseBlock,
      ListBlock,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      saveToSupabaseRef.current?.()

      // Synchronize allBlockIdsAtom
      const blockIds: string[] = []
      editor.state.doc.descendants((node: any) => {
        const typeName = node.type.name
        if (
          typeName === 'buttonBlock' || 
          typeName === 'numberDisplayBlock' || 
          typeName === 'formulaDisplayBlock' || 
          typeName === 'toggleBlock' || 
          typeName === 'inputBlock' || 
          typeName === 'textLabelBlock' ||
          typeName === 'timerBlock' ||
          typeName === 'historyChartBlock' ||
          typeName === 'databaseBlock' ||
          typeName === 'listBlock'
        ) {
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

  // Export and Import state/handlers
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const handleExport = useCallback(() => {
    if (!editor) return

    const blocksArray: Block[] = []
    const positionsRecord: Record<string, { x: number; y: number }> = {}
    const runtimeStatesRecord: Record<string, any> = {}

    editor.state.doc.descendants((node: any) => {
      const typeName = node.type.name
      if (
        typeName === 'buttonBlock' || 
        typeName === 'numberDisplayBlock' || 
        typeName === 'formulaDisplayBlock' ||
        typeName === 'toggleBlock' || 
        typeName === 'inputBlock' || 
        typeName === 'textLabelBlock' ||
        typeName === 'timerBlock' ||
        typeName === 'historyChartBlock' ||
        typeName === 'databaseBlock' ||
        typeName === 'listBlock'
      ) {
        const blockId = node.attrs?.blockId
        if (blockId) {
          const pos = store.get(blockPositionAtom(blockId)) || { x: 100, y: 100 }
          const runtime = store.get(blockRuntimeAtom(blockId)) || {
            value: '',
            visible: true,
            disabled: false,
            loading: false,
            error: null
          }

          positionsRecord[blockId] = pos
          runtimeStatesRecord[blockId] = runtime

          let type: BlockType = 'text'
          if (typeName === 'buttonBlock') type = 'button'
          else if (typeName === 'timerBlock') type = 'timer'
          else if (typeName === 'numberDisplayBlock') type = 'number'
          else if (typeName === 'formulaDisplayBlock') type = 'number'
          else if (typeName === 'toggleBlock') type = 'toggle'
          else if (typeName === 'inputBlock') type = 'input'
          else if (typeName === 'textLabelBlock') type = 'text'
          else if (typeName === 'historyChartBlock') type = 'chart'
          else if (typeName === 'databaseBlock') type = 'database'
          else if (typeName === 'listBlock') type = 'list'

          const blockProps: BlockProps = {
            blockName: runtime.blockName,
            label: node.attrs?.label,
            defaultValue: runtime.value,
            trackedBlockId: runtime.trackedBlockId,
            history: runtime.history
          }

          const blockStyles: StyleConfig = {
            backgroundColor: runtime.backgroundColor || '#6366f1',
            color: runtime.textColor || '#ffffff',
            borderRadius: runtime.borderRadius ?? 8,
            fontSize: runtime.fontSize ?? 14,
            fontWeight: 400,
            paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
            opacity: runtime.opacity ?? 100,
            width: runtime.width ?? 'auto',
            height: 'auto',
            borderWidth: 0,
            borderColor: '#ffffff',
            borderStyle: 'none',
            shadow: null
          }

          const blockAnimations: AnimationConfig = {
            entrance: 'none',
            entranceDuration: 0,
            entranceDelay: 0,
            entranceTrigger: 'onLoad',
            hover: null,
            click: null
          }

          blocksArray.push({
            id: blockId,
            type,
            x: pos.x,
            y: pos.y,
            width: runtime.width || 120,
            height: 40,
            props: blockProps,
            styles: blockStyles,
            animations: blockAnimations,
            parentId: null,
            children: [],
            pageId: activePageIdRef.current
          })
        }
      }
    })

    const workflows = store.get(workflowsAtom)
    const formulas = store.get(formulasAtom)
    const connections = store.get(connectionsAtom)

    const activeName = pagesList.find(p => p.id === activePageIdRef.current)?.name || 'Page 1'

    const page: Page & { 
      documentContent: any;
      positions: Record<string, { x: number; y: number }>;
      runtimeStates: Record<string, any>;
      connections: any[];
    } = {
      id: activePageIdRef.current,
      name: activeName,
      route: '/main',
      layoutTemplateId: null,
      blocks: blocksArray,
      workflows,
      formulas,
      databases: [],
      documentContent: editor.getJSON(),
      positions: positionsRecord,
      runtimeStates: runtimeStatesRecord,
      connections
    }

    const creoraFile: CreoraFile = {
      version: '1.0',
      metadata: {
        name: 'Exported Creora Page',
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      },
      pages: [page],
      layoutTemplates: []
    }

    const blob = new Blob([JSON.stringify(creoraFile, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `page-export_${new Date().toISOString().slice(0, 10)}.creora`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [editor, store])

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        if (!text) {
          throw new Error('File is empty.')
        }

        let parsed: any
        try {
          parsed = JSON.parse(text)
        } catch {
          throw new Error('Failed to parse file as JSON. Please ensure it is a valid .creora file.')
        }

        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid file format. Parsed object is empty.')
        }
        if (parsed.version !== '1.0') {
          throw new Error('Unsupported CreoraFile version. Expected version "1.0".')
        }
        if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) {
          throw new Error('Invalid CreoraFile. Missing pages data.')
        }

        const importedPage = parsed.pages[0]
        if (!importedPage || typeof importedPage !== 'object') {
          throw new Error('Invalid page data inside CreoraFile.')
        }

        setIsLoading(true)
        setImportError(null)

        store.set(connectionsAtom, [])
        store.set(workflowsAtom, [])
        store.set(formulasAtom, [])
        store.set(allBlockIdsAtom, [])
        editor?.commands.clearContent()

        let docContent = importedPage.documentContent
        const positions = importedPage.positions || {}
        const runtimeStates = importedPage.runtimeStates || {}
        const connections = importedPage.connections || []

        if (!docContent) {
          const contentList: any[] = [
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Imported Canvas' }]
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Below are the blocks imported from the file.' }]
            }
          ]

          const blocks = importedPage.blocks || []
          blocks.forEach((b: any) => {
            let typeName = ''
            const attrs: any = { blockId: b.id }
            if (b.type === 'button') {
              typeName = 'buttonBlock'
              attrs.label = b.props?.label || 'Button'
            } else if (b.type === 'timer') {
              typeName = 'timerBlock'
            } else if (b.type === 'toggle') {
              typeName = 'toggleBlock'
            } else if (b.type === 'input') {
              typeName = 'inputBlock'
            } else if (b.type === 'text') {
              typeName = 'textLabelBlock'
            } else if (b.type === 'chart') {
              typeName = 'historyChartBlock'
            } else if (b.type === 'database') {
              typeName = 'databaseBlock'
            } else if (b.type === 'list') {
              typeName = 'listBlock'
            } else if (b.type === 'number') {
              const hasFormula = (importedPage.formulas || []).some((f: any) => f.targetBlockId === b.id)
              typeName = hasFormula ? 'formulaDisplayBlock' : 'numberDisplayBlock'
            }

            if (typeName) {
              contentList.push({ type: typeName, attrs })
              positions[b.id] = { x: b.x || 100, y: b.y || 100 }
              runtimeStates[b.id] = {
                blockName: b.props?.blockName,
                value: b.props?.defaultValue ?? '',
                visible: b.styles?.opacity !== 0,
                disabled: false,
                loading: false,
                error: null,
                backgroundColor: b.styles?.backgroundColor,
                borderRadius: b.styles?.borderRadius,
                textColor: b.styles?.color,
                fontSize: b.styles?.fontSize,
                opacity: b.styles?.opacity,
                width: typeof b.styles?.width === 'number' ? b.styles.width : undefined,
                trackedBlockId: b.props?.trackedBlockId,
                history: b.props?.history || [],
                columns: b.props?.columns,
                rows: b.props?.rows,
                outputMode: b.props?.outputMode
              }
            }
          })

          docContent = {
            type: 'doc',
            content: contentList
          }
        }

        Object.entries(positions).forEach(([id, pos]: [string, any]) => {
          store.set(blockPositionAtom(id), pos)
        })

        Object.entries(runtimeStates).forEach(([id, state]: [string, any]) => {
          store.set(blockRuntimeAtom(id), state)
        })

        store.set(connectionsAtom, connections)
        store.set(workflowsAtom, importedPage.workflows || [])
        store.set(formulasAtom, importedPage.formulas || [])

        if (editor) {
          editor.commands.setContent(docContent)
        }

        recalculateAllFormulas(store)
        setTriggerSave(prev => prev + 1)
        setIsLoading(false)
      } catch (err: any) {
        setIsLoading(false)
        setImportError(err?.message || 'Failed to import the file.')
      }
    }
    reader.onerror = () => {
      setImportError('Failed to read the file.')
    }
    reader.readAsText(file)

    e.target.value = ''
  }

  const deleteBlock = useCallback((blockId: string) => {
    // 1. Delete node from TipTap editor
    if (editor) {
      editor.commands.command(({ tr, dispatch }: any) => {
        let foundPos = -1
        tr.doc.descendants((node: any, pos: number) => {
          if (
            (
              node.type.name === 'buttonBlock' || 
              node.type.name === 'timerBlock' ||
              node.type.name === 'numberDisplayBlock' || 
              node.type.name === 'formulaDisplayBlock' || 
              node.type.name === 'toggleBlock' || 
              node.type.name === 'inputBlock' || 
              node.type.name === 'textLabelBlock' ||
              node.type.name === 'historyChartBlock' ||
              node.type.name === 'databaseBlock' ||
              node.type.name === 'listBlock'
            ) && node.attrs.blockId === blockId
          ) {
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
    store.set(formulasAtom, (prev: FormulaBinding[]) => prev.filter((f: FormulaBinding) => f.targetBlockId !== blockId))

    // 3. Clean up connections and workflows
    setConnections(prev => prev.filter(c => c.sourceBlockId !== blockId && c.targetBlockId !== blockId))
    setWorkflows(prev => prev.filter(w => w.sourceId !== blockId && !w.steps.some(step => step.targetId === blockId)))

    // 4. Clear selection if this block was selected
    if (store.get(selectedBlockIdAtom) === blockId) {
      setSelectedBlockId(null)
    }

    // 5. Trigger save
    setTriggerSave(prev => prev + 1)
  }, [editor, store, setConnections, setWorkflows, setTriggerSave, setSelectedBlockId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase()
        if (tagName === 'input' || tagName === 'textarea') {
          return
        }
        if (activeEl.classList.contains('ProseMirror')) {
          // If focus is inside the TipTap editor, only allow deletion if a block node is currently selected in ProseMirror
          const isNodeSelection = editor && (editor.state.selection as any).node
          if (!isNodeSelection) {
            return
          }
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedId = store.get(selectedBlockIdAtom)
        if (selectedId) {
          e.preventDefault()
          deleteBlock(selectedId)
        }
      }

      if (e.key === 'Escape') {
        const selectedId = store.get(selectedBlockIdAtom)
        if (selectedId) {
          e.preventDefault()
          setSelectedBlockId(null)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [editor, store, deleteBlock, setSelectedBlockId])

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
    },
    {
      id: 'timer',
      title: 'Timer',
      description: 'Insert a timer block that ticks and fires events',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      action: () => {
        if (!blockExists('test_tmr_1')) {
          insertTimerBlock()
        } else {
          insertTimerBlock2()
        }
      }
    },
    {
      id: 'historyChart',
      title: 'History Chart',
      description: 'Insert a history chart block that records and graphs values over time',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
      action: () => {
        if (!blockExists('test_chart_1')) {
          insertHistoryChart()
        } else {
          insertHistoryChart2()
        }
      }
    },
    {
      id: 'databaseBlock',
      title: 'Database Table',
      description: 'Insert an editable database block backed by Supabase',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="9" x2="9" y2="21" />
          <line x1="15" y1="9" x2="15" y2="21" />
        </svg>
      ),
      action: () => {
        if (!blockExists('test_db_1')) {
          insertDatabaseBlock()
        } else {
          insertDatabaseBlock2()
        }
      }
    },
    {
      id: 'list',
      title: 'List',
      description: 'Insert a list block that displays cards for database rows',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      ),
      action: () => {
        if (!blockExists('test_list_1')) {
          insertListBlock()
        } else {
          insertListBlock2()
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
          if (
            node.type === 'buttonBlock' || 
            node.type === 'timerBlock' || 
            node.type === 'numberDisplayBlock' || 
            node.type === 'formulaDisplayBlock' || 
            node.type === 'toggleBlock' || 
            node.type === 'inputBlock' || 
            node.type === 'textLabelBlock' ||
            node.type === 'historyChartBlock' ||
            node.type === 'databaseBlock' ||
            node.type === 'listBlock'
          ) {
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
          .eq('id', activePageIdRef.current)

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

        let sourceDataType = getBlockDataType(sourceNodeType || '')
        const targetDataType = getBlockDataType(targetNodeType || '')

        if (sourceNodeType === 'databaseBlock') {
          const srcState = store.get(blockRuntimeAtom(activeWire.sourceBlockId))
          const mode = srcState?.outputMode || 'row_count'
          if (mode === 'row_count') {
            sourceDataType = 'number'
          } else {
            const col = (srcState?.columns || []).find((c: any) => c.name === mode)
            if (col) {
              if (col.type === 'number') sourceDataType = 'number'
              else if (col.type === 'boolean') sourceDataType = 'boolean'
              else sourceDataType = 'string'
            } else {
              sourceDataType = 'number'
            }
          }
        }

        // Check if types are compatible
        let isCompatible = false
        if (sourceDataType === 'string' && targetDataType === 'string') isCompatible = true
        else if (sourceDataType === 'number' && targetDataType === 'number') isCompatible = true
        else if (sourceDataType === 'boolean' && targetDataType === 'boolean') isCompatible = true
        else if (sourceDataType === 'trigger' && targetDataType === 'number') isCompatible = true
        else if (sourceDataType === 'trigger' && targetDataType === 'boolean') isCompatible = true
        else if (sourceDataType === 'trigger' && targetDataType === 'database') isCompatible = true

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
    if (connectionContextMenu) {
      setConnectionContextMenu(null)
    }
    setSelectedBlockId(null)
  }, [pendingConnection, setPendingConnection, contextMenu, setContextMenu, connectionContextMenu, setConnectionContextMenu, setSelectedBlockId])

  // Save when triggerSaveValue changes
  useEffect(() => {
    if (triggerSaveValue > 0) {
      saveToSupabase()
    }
  }, [triggerSaveValue, saveToSupabase])

  // Automatically validate, correct garbage names, and assign clean auto-increment display names to blocks
  useEffect(() => {
    if (isLoading || !editor) return

    const currentBlocks: { id: string; type: string }[] = []
    editor.state.doc.descendants((node: any) => {
      const bId = node.attrs?.blockId
      const typeName = node.type.name
      if (bId && (
        typeName === 'buttonBlock' ||
        typeName === 'numberDisplayBlock' ||
        typeName === 'formulaDisplayBlock' ||
        typeName === 'toggleBlock' ||
        typeName === 'inputBlock' ||
        typeName === 'textLabelBlock' ||
        typeName === 'timerBlock' ||
        typeName === 'historyChartBlock' ||
        typeName === 'databaseBlock' ||
        typeName === 'listBlock'
      )) {
        currentBlocks.push({ id: bId, type: typeName })
      }
    })

    let changed = false

    currentBlocks.forEach((block) => {
      const runtime = store.get(blockRuntimeAtom(block.id))
      const currentName = runtime?.blockName

      if (isGarbageName(currentName)) {
        const baseDisplayName = getBlockTypeDisplayName(block.type)
        
        // Collect all numeric suffix indices taken by other blocks of this type
        const takenNumbers = new Set<number>()
        currentBlocks.forEach((b) => {
          if (b.id === block.id) return
          const r = store.get(blockRuntimeAtom(b.id))
          const name = r?.blockName
          if (name && !isGarbageName(name) && name.startsWith(baseDisplayName + ' ')) {
            const numPart = name.slice(baseDisplayName.length + 1)
            const num = parseInt(numPart, 10)
            if (!isNaN(num)) {
              takenNumbers.add(num)
            }
          }
        })

        // Find the lowest positive integer starting at 1
        let candidate = 1
        while (takenNumbers.has(candidate)) {
          candidate++
        }

        const newName = `${baseDisplayName} ${candidate}`
        store.set(blockRuntimeAtom(block.id), (prev) => ({
          ...prev,
          blockName: newName
        }))
        changed = true
      }
    })

    if (changed) {
      setTriggerSave(prev => prev + 1)
    }
  }, [allBlockIds, editor, isLoading, store, setTriggerSave])

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


  const fetchPagesList = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pages')
        .select('id, blocks')
        .order('updated_at', { ascending: true })

      if (error) throw error

      if (data) {
        const list = data.map((p, idx) => ({
          id: p.id,
          name: p.blocks?.pageName || (p.id === PAGE_ID ? 'Page 1' : `Page ${idx + 1}`)
        }))
        setPagesList(list)
      }
    } catch (err) {
      console.error('Failed to fetch pages list:', err)
    }
  }, [])

  const savePageData = async (pageId: string) => {
    if (!editor) return
    try {
      const docJson = editor.getJSON()
      const blockIds: string[] = []
      const traverse = (node: any) => {
        if (
          node.type === 'buttonBlock' || 
          node.type === 'timerBlock' || 
          node.type === 'numberDisplayBlock' || 
          node.type === 'formulaDisplayBlock' || 
          node.type === 'toggleBlock' || 
          node.type === 'inputBlock' || 
          node.type === 'textLabelBlock' ||
          node.type === 'historyChartBlock' ||
          node.type === 'databaseBlock' ||
          node.type === 'listBlock'
        ) {
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

      const pageName = pagesList.find(p => p.id === pageId)?.name || 'Page 1'

      const blocksPayload = {
        documentContent: docJson,
        positions,
        runtimeStates,
        connections,
        formulas,
        pageName
      }

      await supabase
        .from('pages')
        .update({
          blocks: blocksPayload,
          workflows,
          updated_at: new Date().toISOString()
        })
        .eq('id', pageId)
    } catch (err) {
      console.error('Failed to save page data:', pageId, err)
    }
  }

  const switchPage = async (targetPageId: string) => {
    if (targetPageId === activePageIdRef.current || !editor) return
    setIsLoading(true)
    setSaveStatus('Saving...')

    // 1. Save current page first
    await savePageData(activePageIdRef.current)

    // 2. Start crossfade transition
    setIsCrossfading(true)
    await new Promise(resolve => setTimeout(resolve, 150)) // Wait for 150ms fadeout

    // 3. Clear Jotai state of current blocks to avoid leaks
    const currentDoc = editor.getJSON()
    const currentIds: string[] = []
    const traverse = (node: any) => {
      if (node.attrs?.blockId) {
        currentIds.push(node.attrs.blockId)
      }
      if (node.content) {
        node.content.forEach(traverse)
      }
    }
    traverse(currentDoc)

    currentIds.forEach(id => {
      blockPositionAtom.remove(id)
      blockRuntimeAtom.remove(id)
    })
    store.set(connectionsAtom, [])
    store.set(workflowsAtom, [])
    store.set(formulasAtom, [])
    setSelectedBlockId(null)

    // 4. Update active page state and persist to localStorage
    setActivePageId(targetPageId)
    localStorage.setItem('creora_active_page_id', targetPageId)

    // 5. Load target page from Supabase
    try {
      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .eq('id', targetPageId)
        .maybeSingle()

      if (error) throw error

      if (data) {
        const blocksData = data.blocks || {}
        const workflowsData = data.workflows || []

        // Set TipTap Content
        editor.commands.setContent(blocksData.documentContent || '')

        // Populate block positions
        if (blocksData.positions) {
          Object.entries(blocksData.positions).forEach(([id, pos]: [string, any]) => {
            store.set(blockPositionAtom(id), pos)
          })
        }

        // Populate block runtime states
        if (blocksData.runtimeStates) {
          Object.entries(blocksData.runtimeStates).forEach(([id, rState]: [string, any]) => {
            store.set(blockRuntimeAtom(id), rState)
          })
        }

        // Populate connections
        store.set(connectionsAtom, blocksData.connections || [])

        // Populate formulas
        store.set(formulasAtom, blocksData.formulas || [])

        // Populate workflows
        store.set(workflowsAtom, workflowsData || [])

        // Sync allBlockIdsAtom
        const newBlockIds: string[] = []
        const traverseNew = (node: any) => {
          if (
            node.type === 'buttonBlock' || 
            node.type === 'timerBlock' ||
            node.type === 'numberDisplayBlock' || 
            node.type === 'formulaDisplayBlock' || 
            node.type === 'toggleBlock' || 
            node.type === 'inputBlock' || 
            node.type === 'textLabelBlock' ||
            node.type === 'historyChartBlock' ||
            node.type === 'databaseBlock' ||
            node.type === 'listBlock'
          ) {
            if (node.attrs?.blockId) {
              newBlockIds.push(node.attrs.blockId)
            }
          }
          if (node.content) {
            node.content.forEach(traverseNew)
          }
        }
        traverseNew(blocksData.documentContent)
        store.set(allBlockIdsAtom, newBlockIds)

        // Recalculate all formulas
        recalculateAllFormulas(store)
      }
    } catch (err) {
      console.error('Failed to load target page:', targetPageId, err)
    } finally {
      setIsLoading(false)
      setSaveStatus('Ready')
      // Fade back in
      setIsCrossfading(false)
    }
  }

  useEffect(() => {
    setSwitchPageFn(() => switchPage)
  }, [switchPage, setSwitchPageFn])

  const createNewPage = async () => {
    setIsLoading(true)
    setSaveStatus('Saving...')
    const newPageId = crypto.randomUUID()
    const newPageName = `Page ${pagesList.length + 1}`
    const defaultBlocks = {
      documentContent: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: newPageName }]
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'This is a brand new empty page. Press / to insert blocks.' }]
          }
        ]
      },
      positions: {},
      runtimeStates: {},
      connections: [],
      formulas: [],
      pageName: newPageName
    }

    try {
      const { error } = await supabase
        .from('pages')
        .insert({
          id: newPageId,
          blocks: defaultBlocks,
          workflows: []
        })

      if (error) throw error

      // Refresh local pages list
      await fetchPagesList()

      // Switch to the newly created page
      await switchPage(newPageId)
    } catch (err) {
      console.error('Failed to create new page:', err)
    } finally {
      setIsLoading(false)
      setSaveStatus('Ready')
    }
  }

  // Load from Supabase on init
  useEffect(() => {
    async function initApp() {
      try {
        setIsLoading(true)
        setSaveStatus('Ready')

        // 1. Fetch all pages
        const { data: allPages, error: fetchErr } = await supabase
          .from('pages')
          .select('id, blocks, workflows')
          .order('updated_at', { ascending: true })

        if (fetchErr) throw fetchErr

        let pages = allPages || []
        const hasDefaultPage = pages.some(p => p.id === PAGE_ID)
        
        if (!hasDefaultPage) {
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
            connections: [],
            formulas: [],
            pageName: 'Page 1'
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
          pages = [newRow, ...pages]
        }

        let pagesListFetched: any[] = pages
        const list = pagesListFetched.map((p, idx) => ({
          id: p.id,
          name: p.blocks?.pageName || (p.id === PAGE_ID ? 'Page 1' : `Page ${idx + 1}`)
        }))
        setPagesList(list)

        // 2. Resolve active page ID
        let lastActiveId = localStorage.getItem('creora_active_page_id')
        if (!lastActiveId || !pagesListFetched.some(p => p.id === lastActiveId)) {
          lastActiveId = PAGE_ID
        }
        setActivePageId(lastActiveId)
        localStorage.setItem('creora_active_page_id', lastActiveId)

        // 3. Load active page data
        const activePageData = pagesListFetched.find(p => p.id === lastActiveId)
        if (activePageData && editor) {
          const blocksData = activePageData.blocks || {}
          const workflowsData = activePageData.workflows || []

          // Migrate document content (textDisplayBlock -> numberDisplayBlock) if any
          const migrateNodes = (node: any) => {
            if (node.type === 'textDisplayBlock') {
              node.type = 'numberDisplayBlock'
            }
            if (node.content) {
              node.content.forEach(migrateNodes)
            }
          }
          if (blocksData.documentContent) {
            migrateNodes(blocksData.documentContent)
            editor.commands.setContent(blocksData.documentContent)
          }

          // Populate block positions
          if (blocksData.positions) {
            Object.entries(blocksData.positions).forEach(([id, pos]: [string, any]) => {
              store.set(blockPositionAtom(id), pos)
            })
          }

          // Populate block runtime states
          if (blocksData.runtimeStates) {
            Object.entries(blocksData.runtimeStates).forEach(([id, rState]: [string, any]) => {
              store.set(blockRuntimeAtom(id), rState)
            })
          }

          // Populate connections
          store.set(connectionsAtom, blocksData.connections || [])

          // Populate formulas
          store.set(formulasAtom, blocksData.formulas || [])

          // Populate workflows
          store.set(workflowsAtom, workflowsData || [])

          // Extract all block IDs to populate allBlockIdsAtom
          const blockIds: string[] = []
          const traverse = (node: any) => {
            if (
              node.type === 'buttonBlock' || 
              node.type === 'timerBlock' ||
              node.type === 'numberDisplayBlock' || 
              node.type === 'formulaDisplayBlock' || 
              node.type === 'toggleBlock' || 
              node.type === 'inputBlock' || 
              node.type === 'textLabelBlock' ||
              node.type === 'historyChartBlock' ||
              node.type === 'databaseBlock' ||
              node.type === 'listBlock'
            ) {
              if (node.attrs?.blockId) {
                blockIds.push(node.attrs.blockId)
              }
            }
            if (node.content) {
              node.content.forEach(traverse)
            }
          }
          if (blocksData.documentContent) {
            traverse(blocksData.documentContent)
          }
          store.set(allBlockIdsAtom, blockIds)

          // Recalculate all formulas
          recalculateAllFormulas(store)
        }
      } catch (err) {
        console.error('Error loading page from Supabase on init:', err)
      } finally {
        setIsLoading(false)
      }
    }

    if (editor) {
      initApp()
    }
  }, [editor, fetchPagesList])

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
    store.set(blockPositionAtom('test_frm_2'), { x: 300, y: 280 })
  }

  function insertTimerBlock() {
    if (!editor || blockExists('test_tmr_1')) return
    editor.chain().focus('end').insertContent({
      type: 'timerBlock',
      attrs: {
        blockId: 'test_tmr_1'
      }
    }).run()
    store.set(blockPositionAtom('test_tmr_1'), { x: 80, y: 280 })
    store.set(blockRuntimeAtom('test_tmr_1'), {
      value: false,
      visible: true,
      disabled: false,
      loading: false,
      error: null,
      mode: 'countdown',
      duration: 10,
      autoStart: false,
      backgroundColor: '#10b981',
      textColor: '#ffffff'
    })
  }

  function insertTimerBlock2() {
    if (!editor || blockExists('test_tmr_2')) return
    editor.chain().focus('end').insertContent({
      type: 'timerBlock',
      attrs: {
        blockId: 'test_tmr_2'
      }
    }).run()
    store.set(blockPositionAtom('test_tmr_2'), { x: 300, y: 280 })
    store.set(blockRuntimeAtom('test_tmr_2'), {
      value: false,
      visible: true,
      disabled: false,
      loading: false,
      error: null,
      mode: 'countdown',
      duration: 10,
      autoStart: false,
      backgroundColor: '#10b981',
      textColor: '#ffffff'
    })
  }

  function insertHistoryChart() {
    if (!editor || blockExists('test_chart_1')) return
    editor.chain().focus('end').insertContent({
      type: 'historyChartBlock',
      attrs: {
        blockId: 'test_chart_1'
      }
    }).run()
    store.set(blockPositionAtom('test_chart_1'), { x: 300, y: 180 })
    store.set(blockRuntimeAtom('test_chart_1'), {
      value: 0,
      visible: true,
      disabled: false,
      loading: false,
      error: null,
      trackedBlockId: '',
      history: [],
      backgroundColor: '#1e293b',
      textColor: '#ffffff'
    })
  }

  function insertHistoryChart2() {
    if (!editor || blockExists('test_chart_2')) return
    editor.chain().focus('end').insertContent({
      type: 'historyChartBlock',
      attrs: {
        blockId: 'test_chart_2'
      }
    }).run()
    store.set(blockPositionAtom('test_chart_2'), { x: 300, y: 280 })
    store.set(blockRuntimeAtom('test_chart_2'), {
      value: 0,
      visible: true,
      disabled: false,
      loading: false,
      error: null,
      trackedBlockId: '',
      history: [],
      backgroundColor: '#1e293b',
      textColor: '#ffffff'
    })
  }

  function insertDatabaseBlock() {
    if (!editor || blockExists('test_db_1')) return
    editor.chain().focus('end').insertContent({
      type: 'databaseBlock',
      attrs: {
        blockId: 'test_db_1'
      }
    }).run()
    store.set(blockPositionAtom('test_db_1'), { x: 80, y: 180 })
    store.set(blockRuntimeAtom('test_db_1'), {
      value: 0,
      visible: true,
      disabled: false,
      loading: false,
      error: null,
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'Age', type: 'number' }
      ],
      rows: [],
      outputMode: 'row_count',
      backgroundColor: '#ffffff',
      borderRadius: 8
    })
  }

  function insertDatabaseBlock2() {
    if (!editor || blockExists('test_db_2')) return
    editor.chain().focus('end').insertContent({
      type: 'databaseBlock',
      attrs: {
        blockId: 'test_db_2'
      }
    }).run()
    store.set(blockPositionAtom('test_db_2'), { x: 300, y: 280 })
    store.set(blockRuntimeAtom('test_db_2'), {
      value: 0,
      visible: true,
      disabled: false,
      loading: false,
      error: null,
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'Age', type: 'number' }
      ],
      rows: [],
      outputMode: 'row_count',
      backgroundColor: '#ffffff',
      borderRadius: 8
    })
  }

  function insertListBlock() {
    if (!editor || blockExists('test_list_1')) return
    editor.chain().focus('end').insertContent({
      type: 'listBlock',
      attrs: {
        blockId: 'test_list_1'
      }
    }).run()
    store.set(blockPositionAtom('test_list_1'), { x: 80, y: 180 })
    store.set(blockRuntimeAtom('test_list_1'), {
      value: '',
      visible: true,
      disabled: false,
      loading: false,
      error: null,
      trackedBlockId: '',
      backgroundColor: '#ffffff',
      textColor: '#0f172a',
      borderRadius: 8
    })
  }

  function insertListBlock2() {
    if (!editor || blockExists('test_list_2')) return
    editor.chain().focus('end').insertContent({
      type: 'listBlock',
      attrs: {
        blockId: 'test_list_2'
      }
    }).run()
    store.set(blockPositionAtom('test_list_2'), { x: 300, y: 280 })
    store.set(blockRuntimeAtom('test_list_2'), {
      value: '',
      visible: true,
      disabled: false,
      loading: false,
      error: null,
      trackedBlockId: '',
      backgroundColor: '#ffffff',
      textColor: '#0f172a',
      borderRadius: 8
    })
  }



  return (
    <div className="app-container" style={{ display: 'flex', fontFamily: 'sans-serif', minHeight: '100vh', background: 'var(--bg)' }}>
      <div
        style={{
          flex: 1,
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
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

          {/* Page Switcher Tabs */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', background: '#f1f5f9', padding: '3px', borderRadius: '6px', marginLeft: '16px' }}>
            {pagesList.map((page) => {
              const isActive = page.id === (activePageId || PAGE_ID);
              return (
                <button
                  key={page.id}
                  onClick={() => switchPage(page.id)}
                  style={{
                    padding: '4px 10px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    background: isActive ? '#4f46e5' : 'transparent',
                    color: isActive ? 'white' : '#475569',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseOver={(e) => {
                    if (!isActive) e.currentTarget.style.background = '#e2e8f0';
                  }}
                  onMouseOut={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {page.name}
                </button>
              );
            })}
            <button
              onClick={createNewPage}
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                background: 'transparent',
                color: '#4f46e5',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#fee2e2')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              + New Page
            </button>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              onClick={handleExport}
              style={{
                padding: '6px 12px',
                background: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#4338ca')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#4f46e5')}
            >
              Export .creora
            </button>
            <button
              onClick={handleImportClick}
              style={{
                padding: '6px 12px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#059669')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#10b981')}
            >
              Import .creora
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".creora"
              onChange={handleImportFile}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {importError && (
          <div style={{
            background: '#fee2e2',
            color: '#b91c1c',
            padding: '10px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '14px',
            fontWeight: 500,
            border: '1px solid #fca5a5'
          }}>
            <span>⚠️ {importError}</span>
            <button
              onClick={() => setImportError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#b91c1c',
                cursor: 'pointer',
                fontSize: '18px',
                fontWeight: 'bold',
                lineHeight: 1,
                padding: '0 4px'
              }}
            >
              ×
            </button>
          </div>
        )}


        <div
          id="editor-container"
          ref={canvasRef}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerDown={onCanvasPointerDown}
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'visible',
            minHeight: 'calc(100vh - 120px)',
            opacity: isCrossfading ? 0 : 1,
            transition: 'opacity 150ms ease-in-out',
            pointerEvents: isCrossfading ? 'none' : 'auto',
          }}
        >
          <EditorContent editor={editor} style={{ flex: 1, position: 'relative', pointerEvents: activeWire ? 'none' : 'auto' }} />
          <WireOverlay />
          <ConnectionPopup editor={editor} />
          <ContextMenu editor={editor} deleteBlock={deleteBlock} />
          <ConnectionContextMenu />
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
