import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useSetAtom, useAtom, useAtomValue, useStore } from 'jotai'
import { workflowsAtom, blockRuntimeAtom, blockPositionAtom, selectedBlockIdAtom, activeWireAtom, connectionsAtom, snapTargetAtom, pendingConnectionAtom, triggerSaveAtom, contextMenuAtom, getBlockDataType, formulasAtom, allBlockIdsAtom, getBlockDefaultValue, connectionContextMenuAtom, getBlockTypeDisplayName, isGarbageName, getCanvasBlocks, shapeRoleDataType, currentPageIdAtom, currentPageIsPublishedAtom, pagesListAtom, switchPageFnAtom, isPreviewModeAtom, canvasModeAtom } from './state/atoms'
import { newBlockId, defaultRuntimeForNodeType, defaultAttrsForNodeType, BLOCK_FOOTPRINT, nodeTypeFromBlockId, shortBlockId, type BlockNodeType } from './lib/blockRegistry'
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
import { ShapeBlock } from './blocks/ShapeBlock'
import { WireOverlay } from './components/WireOverlay'
import { supabase } from './lib/supabase'
import { ensureSession } from './lib/session'
import type { PageRow } from './types/creora'
import { AccountBadge } from './components/AccountBadge'
import { PublishButton } from './components/PublishButton'
import { recalculateAllFormulas } from './lib/bindingEngine'
import { ANIMATION_PRESETS, animationClass } from './lib/animations'
import { workflowRunsAtom, type WorkflowRun } from './state/atoms'
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

/** The header said `Inspector (buttonBlock__jdzm71nxbk)`. Nobody knows which block that is. */
function InspectorTitle({ blockId }: { blockId: string }) {
  const runtime = useAtomValue(blockRuntimeAtom(blockId))
  const name = isGarbageName(runtime?.blockName)
    ? getBlockTypeDisplayName(nodeTypeFromBlockId(blockId) ?? '')
    : runtime.blockName
  return (
    <h3 style={{ margin: '0 0 12px 0' }}>
      {name}{' '}
      <span style={{ fontSize: '11px', fontWeight: 400, color: '#9ca3af' }}>
        {shortBlockId(blockId)}
      </span>
    </h3>
  )
}

/**
 * Animation lives here rather than in each of the eleven per-type inspectors,
 * because it applies to all of them: any block with a value can animate when it
 * changes. Picking a preset replays it on the chip, since the editor canvas
 * itself does not preview animation yet — published pages do.
 */
function AnimationControl({ blockId }: { blockId: string }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)
  const [demo, setDemo] = useState(0)
  const preset = runtimeState.animateOnChange || 'none'
  const cls = animationClass(preset)

  return (
    <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
      <label style={{ display: 'block', fontSize: '13px' }}>
        Animate on change
        <select
          value={preset}
          onChange={(e) => {
            setRuntimeState(prev => ({ ...prev, animateOnChange: e.target.value }))
            triggerSave(prev => prev + 1)
            setDemo(d => d + 1)
          }}
          style={{ display: 'block', marginTop: '4px', width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', background: '#f8fafc', color: '#0f172a', fontSize: '13px' }}
        >
          {ANIMATION_PRESETS.map(p => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>

      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
        {ANIMATION_PRESETS.find(p => p.id === preset)?.hint}
      </div>

      {cls && (
        <div
          onClick={() => setDemo(d => d + 1)}
          title="Click to replay"
          style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
        >
          <div
            key={demo}
            className={cls}
            style={{ width: '46px', height: '26px', borderRadius: '6px', background: '#4f46e5' }}
          />
          <span style={{ fontSize: '11px', color: '#9ca3af' }}>replay</span>
        </div>
      )}
    </div>
  )
}

function useBlockLabel() {
  const store = useStore()
  return (blockId: string) => {
    const rt = store.get(blockRuntimeAtom(blockId))
    return isGarbageName(rt?.blockName)
      ? `${getBlockTypeDisplayName(nodeTypeFromBlockId(blockId) ?? '')} ${shortBlockId(blockId)}`
      : (rt.blockName as string)
  }
}

function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`
}

function RunRow({ run, label }: { run: WorkflowRun; label: (id: string) => string }) {
  const [open, setOpen] = useState(false)
  const ran = run.steps.filter(s => s.status === 'ran').length
  const skipped = run.steps.length - ran
  const nothingListening = run.matched === 0

  const summary = nothingListening
    ? 'nothing wired to this'
    : [ran ? `${ran} ran` : null, skipped ? `${skipped} skipped` : null].filter(Boolean).join(', ') || 'no steps'

  return (
    <div style={{ borderBottom: '1px solid #f1f5f9', padding: '8px 10px', fontSize: '12px' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', cursor: run.steps.length ? 'pointer' : 'default' }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
          background: nothingListening ? '#f59e0b' : (skipped && !ran ? '#94a3b8' : '#10b981') }} />
        <strong style={{ color: '#0f172a' }}>{label(run.sourceId)}</strong>
        <span style={{ color: '#94a3b8' }}>{run.event}</span>
        <span style={{ marginLeft: 'auto', color: '#94a3b8', whiteSpace: 'nowrap' }}>{ago(run.at)}</span>
      </div>
      <div style={{ color: nothingListening ? '#b45309' : '#64748b', marginTop: '2px', marginLeft: '13px' }}>{summary}</div>

      {open && run.steps.map((st, i) => (
        <div key={i} style={{ marginLeft: '13px', marginTop: '6px', paddingLeft: '8px', borderLeft: '2px solid #e2e8f0' }}>
          <div style={{ color: '#0f172a' }}>
            {st.action} &rarr; {label(st.targetId)}
          </div>
          {st.status === 'ran' ? (
            <div style={{ color: '#64748b' }}>
              {JSON.stringify(st.before)} &rarr; {JSON.stringify(st.after)}
            </div>
          ) : (
            <div style={{ color: '#b45309' }}>{st.reason}</div>
          )}
        </div>
      ))}
    </div>
  )
}

/** The "See Runs" panel. When something does not fire, this is the thing to look at. */
function RunsPanel({ onClose }: { onClose: () => void }) {
  const [runs, setRuns] = useAtom(workflowRunsAtom)
  const label = useBlockLabel()

  return (
    <div style={{
      position: 'fixed', left: '16px', bottom: '16px', width: '340px', maxHeight: '46vh',
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
      boxShadow: '0 12px 28px -8px rgba(0,0,0,0.22)', zIndex: 3000,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>
        <strong style={{ fontSize: '13px', color: '#0f172a' }}>Runs</strong>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{runs.length ? `last ${runs.length}` : 'this session'}</span>
        <button onClick={() => setRuns([])} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: '11px' }}>clear</button>
        <button onClick={onClose} style={{ border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: '15px', lineHeight: 1 }}>&times;</button>
      </div>

      <div style={{ overflowY: 'auto' }}>
        {runs.length === 0 ? (
          <div style={{ padding: '16px 12px', fontSize: '12px', color: '#94a3b8' }}>
            Nothing yet. Click a button or change an input, and every trigger that
            fires shows up here &mdash; including the ones with nothing wired to them.
          </div>
        ) : (
          runs.map(r => <RunRow key={r.id} run={r} label={label} />)
        )}
      </div>
    </div>
  )
}

function Inspector({ editor }: { editor: any }) {
  const selectedBlockId = useAtomValue(selectedBlockIdAtom)

  return (
    <div style={{ width: '240px', borderLeft: '1px solid #e5e7eb', padding: '16px', background: '#fff' }}>
      {selectedBlockId ? <InspectorTitle blockId={selectedBlockId} /> : <h3 style={{ margin: '0 0 12px 0' }}>Inspector</h3>}
      {selectedBlockId ? (
        <>
          <InspectorControls blockId={selectedBlockId} editor={editor} />
          <AnimationControl blockId={selectedBlockId} />
        </>
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
      sourceEvent:
        sourceNodeType === 'timerBlock'
          ? timerEvent
          : sourceNodeType === 'databaseBlock'
            ? ('onChange' as const)
            : ('onClick' as const),
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
      height: origRuntime?.height,
      text: origRuntime?.text,
      role: origRuntime?.role,
      borderWidth: origRuntime?.borderWidth,
      borderColor: origRuntime?.borderColor,
      borderStyle: origRuntime?.borderStyle,
      boxShadowPreset: origRuntime?.boxShadowPreset,
      textAlign: origRuntime?.textAlign,
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
  const [isPreviewMode, setIsPreviewMode] = useAtom(isPreviewModeAtom)
  const [showRuns, setShowRuns] = useState(false)
  const runCount = useAtomValue(workflowRunsAtom).length
  const [canvasMode, setCanvasMode] = useAtom(canvasModeAtom)

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
      ShapeBlock,
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
          typeName === 'listBlock' ||
          typeName === 'shapeBlock'
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
        typeName === 'listBlock' ||
        typeName === 'shapeBlock'
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
          else if (typeName === 'shapeBlock') type = 'shape'

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
            } else if (b.type === 'shape') {
              typeName = 'shapeBlock'
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
              node.type.name === 'listBlock' ||
              node.type.name === 'shapeBlock'
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
      action: () => insertBlock('buttonBlock')
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
      action: () => insertBlock('numberDisplayBlock')
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
      action: () => insertBlock('toggleBlock')
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
      action: () => insertBlock('inputBlock')
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
      action: () => insertBlock('textLabelBlock')
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
      action: () => insertBlock('formulaDisplayBlock')
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
      action: () => insertBlock('timerBlock')
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
      action: () => insertBlock('historyChartBlock')
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
      action: () => insertBlock('databaseBlock')
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
      action: () => insertBlock('listBlock')
    },
    {
      id: 'shape',
      title: 'Shape',
      description: 'Insert a plain, roleless shape object',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="4" />
        </svg>
      ),
      action: () => insertBlock('shapeBlock')
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
            node.type === 'listBlock' ||
            node.type === 'shapeBlock'
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
          .rpc('save_page', {
            p_id: activePageIdRef.current,
            p_blocks: blocksPayload,
            p_workflows: workflows
          })

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
        let targetDataType = getBlockDataType(targetNodeType || '')

        // A Shape's type is whatever role it was given, the same way a Database's
        // type comes from its output mode just below.
        if (sourceNodeType === 'shapeBlock') {
          sourceDataType = shapeRoleDataType(store.get(blockRuntimeAtom(activeWire.sourceBlockId))?.role)
        }
        if (targetNodeType === 'shapeBlock') {
          targetDataType = shapeRoleDataType(store.get(blockRuntimeAtom(droppedOnBlockId!))?.role)
        }

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
        typeName === 'listBlock' ||
        typeName === 'shapeBlock'
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
        .rpc('list_pages')

      if (error) throw error

      if (data) {
        const list = data.map((p: any) => ({
          id: p.id,
          name: p.page_name || 'Untitled'
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
          node.type === 'listBlock' ||
          node.type === 'shapeBlock'
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

      const { error } = await supabase
        .rpc('save_page', {
          p_id: pageId,
          p_blocks: blocksPayload,
          p_workflows: workflows
        })
      if (error) throw error
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
        .rpc('get_page', { p_id: targetPageId })
        .maybeSingle()

      if (error) throw error

      if (data) {
        const row = data as unknown as PageRow
        const blocksData = row.blocks || {}
        store.set(currentPageIsPublishedAtom, !!row.is_published)
        const workflowsData = row.workflows || []

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
            node.type === 'listBlock' ||
            node.type === 'shapeBlock'
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
    // A brand new page is private; do not inherit the previous page's state.
    store.set(currentPageIsPublishedAtom, false)
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
        .rpc('create_page', {
          p_id: newPageId,
          p_blocks: defaultBlocks
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

        // 0. Identity before anything else. Every page RPC is now scoped to
        // auth.uid(), so without a session list_pages returns nothing.
        await ensureSession()

        // 1. Fetch all pages
        const { data: allPagesList, error: fetchErr } = await supabase
          .rpc('list_pages')

        if (fetchErr) throw fetchErr

        let pages = allPagesList || []
        const hasDefaultPage = pages.some((p: any) => p.id === PAGE_ID)
        
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
          
          const { error: insertError } = await supabase
            .rpc('create_page', {
              p_id: PAGE_ID,
              p_blocks: defaultBlocks
            })

          if (insertError) throw insertError
          
          // Re-fetch list
          const { data: refreshedList, error: refreshErr } = await supabase
            .rpc('list_pages')
          if (refreshErr) throw refreshErr
          pages = refreshedList || []
        }

        const list = pages.map((p: any) => ({
          id: p.id,
          name: p.page_name || 'Untitled'
        }))
        setPagesList(list)

        // 2. Resolve active page ID
        let lastActiveId = localStorage.getItem('creora_active_page_id')
        if (!lastActiveId || !pages.some((p: any) => p.id === lastActiveId)) {
          lastActiveId = PAGE_ID
        }
        setActivePageId(lastActiveId)
        localStorage.setItem('creora_active_page_id', lastActiveId)

        // 3. Load active page data
        const { data: activePageData, error: activePageErr } = await supabase
          .rpc('get_page', { p_id: lastActiveId })
          .maybeSingle()

        if (activePageErr) throw activePageErr

        if (activePageData && editor) {
          const activeRow = activePageData as unknown as PageRow
          const blocksData = activeRow.blocks || {}
          store.set(currentPageIsPublishedAtom, !!activeRow.is_published)
          const workflowsData = activeRow.workflows || []

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
              node.type === 'listBlock' ||
              node.type === 'shapeBlock'
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
  /** First free slot on a coarse grid, so new blocks never land on top of each other. */
  function findFreePosition(): { x: number; y: number } {
    const taken: { x: number; y: number }[] = []
    if (editor) {
      editor.state.doc.descendants((node: any) => {
        const id = node.attrs?.blockId
        if (id) taken.push(store.get(blockPositionAtom(id)))
      })
    }
    const COLS = 4
    const startX = 80
    const startY = 60
    const stepX = BLOCK_FOOTPRINT.width + 20
    const stepY = BLOCK_FOOTPRINT.height + 20
    for (let i = 0; i < 400; i++) {
      const x = startX + (i % COLS) * stepX
      const y = startY + Math.floor(i / COLS) * stepY
      const clash = taken.some(
        (p) => p && Math.abs(p.x - x) < stepX * 0.75 && Math.abs(p.y - y) < stepY * 0.75
      )
      if (!clash) return { x, y }
    }
    return { x: startX, y: startY }
  }

  /**
   * Insert one block of the given type.
   *
   * Replaces the 22 hardcoded insertXBlock/insertXBlock2 functions, which
   * capped every page at two blocks per type (the third insert was a silent
   * no-op) and reused fixture IDs such as 'test_btn_1' across every page.
   * Position and runtime state are set before insertContent so the block
   * renders in place instead of flashing at the atom default.
   */
  function insertBlock(nodeType: BlockNodeType) {
    if (!editor) return
    const blockId = newBlockId(nodeType)
    store.set(blockPositionAtom(blockId), findFreePosition())
    store.set(blockRuntimeAtom(blockId), defaultRuntimeForNodeType(nodeType))
    editor
      .chain()
      .focus('end')
      .insertContent({
        type: nodeType,
        attrs: { blockId, ...defaultAttrsForNodeType(nodeType) },
      })
      .run()

    // Leave the editor usable for the NEXT insert.
    //
    // Two things break otherwise, and together they make the slash menu feel
    // broken rather than fiddly. Choosing a command clicks a button outside
    // ProseMirror, so focus lands on <body>; and the caret ends up after an
    // atom node, where the slash detector reads `$from.nodeBefore?.text` as
    // undefined and never opens the menu. The result is that every keystroke
    // after the first insert goes nowhere, with no cursor and no error.
    //
    // So: guarantee an empty trailing paragraph, put the caret in it, and take
    // focus back.
    const { doc } = editor.state
    const last = doc.lastChild
    if (!last || last.type.name !== 'paragraph' || last.content.size > 0) {
      editor.chain().insertContentAt(doc.content.size, { type: 'paragraph' }).run()
    }
    requestAnimationFrame(() => {
      editor.chain().focus('end').run()
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

          <button
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            style={{
              padding: '6px 12px',
              marginLeft: '8px',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              background: isPreviewMode ? '#475569' : '#ffffff',
              color: isPreviewMode ? '#ffffff' : '#475569',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isPreviewMode ? '👁 Edit Mode' : '👁 Preview'}
          </button>

          <button
            onClick={() => setShowRuns((v: boolean) => !v)}
            title="See what fired, and what did not"
            style={{
              padding: '6px 12px',
              marginLeft: '8px',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              background: showRuns ? '#475569' : '#ffffff',
              color: showRuns ? '#ffffff' : '#475569',
              transition: 'all 0.15s ease',
            }}
          >
            ⟳ Runs{runCount ? ` (${runCount})` : ''}
          </button>

          <button
            onClick={() => setCanvasMode(canvasMode === 'action' ? 'design' : 'action')}
            style={{
              padding: '6px 12px',
              marginLeft: '8px',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              background: canvasMode === 'design' ? '#475569' : '#ffffff',
              color: canvasMode === 'design' ? '#ffffff' : '#475569',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {canvasMode === 'action' ? '🎨 Design View' : '⚡ Action View'}
          </button>

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
            <PublishButton />
            <AccountBadge />
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
          className={`${isPreviewMode ? 'preview-mode' : ''} ${canvasMode === 'design' ? 'design-mode' : ''}`.trim()}
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
          {!isPreviewMode && canvasMode === 'action' && <WireOverlay />}
          {!isPreviewMode && <ConnectionPopup editor={editor} />}
          {!isPreviewMode && <ContextMenu editor={editor} deleteBlock={deleteBlock} />}
          {!isPreviewMode && <ConnectionContextMenu />}
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
      {!isPreviewMode && <Inspector editor={editor} />}
      {showRuns && <RunsPanel onClose={() => setShowRuns(false)} />}
    </div>
  )
}

export default App
