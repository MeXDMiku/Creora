import { usePollWhileVisible } from '../hooks/usePollWhileVisible';
import { describeLive } from '../lib/liveChanges';
import { isoToDateInput, dateInputToIso } from '../lib/rows';
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { executeWorkflow, recalculateAllFormulas } from '../lib/bindingEngine';
import { describeRowWriteError, withoutRow } from '../lib/rowWrite';
import { computeDatabaseOutput } from '../lib/databaseOutput';
import { loadDatabaseRows } from '../lib/databaseRows';
import { blockRuntimeAtom, activeWireAtom, snapTargetAtom, triggerSaveAtom, contextMenuAtom, getPortBadge, getBlockTypeDisplayName } from '../state/atoms';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { supabase } from '../lib/supabase';
import { FailureNote } from '../components/FailureNote'

const DatabaseBlockComponent = (props: NodeViewProps) => {
  const { node } = props;
  const { blockId } = node.attrs;
  const store = useStore();
  const [isHovered, setIsHovered] = useState(false);
  const setActiveWire = useSetAtom(activeWireAtom);
  const activeWire = useAtomValue(activeWireAtom);
  const snapTarget = useAtomValue(snapTargetAtom);
  const triggerSave = useSetAtom(triggerSaveAtom);
  const setContextMenu = useSetAtom(contextMenuAtom);

  const atomInstance = useMemo(() => blockRuntimeAtom(blockId), [blockId]);
  const runtimeState = useAtomValue(atomInstance, { store });

  const containerRef = useRef<HTMLElement | null>(null);
  if (!containerRef.current) {
    containerRef.current = document.getElementById('editor-container');
  }

  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useBlockDrag(blockId, containerRef as React.RefObject<HTMLElement>);

  const columns = runtimeState?.columns || [];
  const rows = runtimeState?.rows || [];
  const outputMode = runtimeState?.outputMode || 'row_count';

  // Load rows from Supabase
  // Returns whether the answer differed, so the poll can slow down when
  // nothing is happening -- see hooks/usePollWhileVisible.
  const loadRowsRef = useRef<() => boolean | Promise<boolean>>(() => false);
  useEffect(() => {
    /**
     * One implementation, shared with the published page.
     *
     * This was fifty lines here and fifty more in PublishedRenderer, and they
     * had already drifted in the one place the comment inside `loadDatabaseRows`
     * describes. Database is the block that writes real data, so it is the
     * worst possible place for two copies. See src/lib/databaseRows.ts.
     */
    const loadRows = () => loadDatabaseRows(
      blockId,
      store,
      (id) => supabase.rpc('list_database_rows', { p_block_id: id }),
      () => { executeWorkflow(blockId, 'onChange', store); recalculateAllFormulas(store); },
      () => recalculateAllFormulas(store),
    );
    loadRowsRef.current = loadRows;
    loadRows();
  }, [blockId, outputMode, columns.length, store]);

  // Rows can arrive from anyone using the published page, so keep looking --
  // and, once migration 0010 is run, be told the moment they do.
  const { connected: isLive, live } = usePollWhileVisible(() => loadRowsRef.current(), undefined, blockId);

  /**
   * Say that a write did not land, on the block itself.
   *
   * Every write in this file used to console.warn and carry on -- three of
   * them: a cell edit, a new row, a delete. The builder saw the table change,
   * the database did not, and the next reload put it back with no explanation.
   * A console message is not telling somebody; it is telling nobody.
   *
   * The engine's row actions made the same choice at the same time; this is the
   * editor's half of it, and it shares the wording.
   */
  const reportWriteFailure = useCallback((error: unknown) => {
    const current = store.get(atomInstance);
    store.set(atomInstance, { ...current, error: describeRowWriteError(error).message });
  }, [store, atomInstance]);

  // Debounced cell edit save
  const debouncedSaveRef = useRef<Record<string, any>>({});
  const saveCellToSupabase = useCallback((rowId: string, rowData: any) => {
    if (debouncedSaveRef.current[rowId]) {
      clearTimeout(debouncedSaveRef.current[rowId]);
    }
    debouncedSaveRef.current[rowId] = setTimeout(async () => {
      try {
        const { error } = await supabase
          .rpc('update_database_row', { p_id: rowId, p_row_data: rowData });
        /**
         * A failed cell edit is NOT rolled back, and that is the one place this
         * file differs from the others.
         *
         * By the time a debounced save answers, the builder has typed on.
         * Yanking the cell back to its old value under their cursor would lose
         * whatever they wrote since, which is worse than the wrong value being
         * on screen while the message says it did not save.
         */
        if (error) reportWriteFailure(error);
        else {
          const ok = store.get(atomInstance);
          if (ok?.error) store.set(atomInstance, { ...ok, error: null });
        }
      } catch (err) {
        reportWriteFailure(err);
      }
    }, 500);
  }, [reportWriteFailure]);

  const handleCellEdit = (rowId: string, colName: string, val: any) => {
    const updatedRows = rows.map(r => {
      if (r.id === rowId) {
        return { ...r, [colName]: val };
      }
      return r;
    });

    // Re-evaluate output value
    let nextValue = 0;
    nextValue = computeDatabaseOutput(updatedRows, runtimeState);

    store.set(atomInstance, {
      ...runtimeState,
      rows: updatedRows,
      value: nextValue
    });

    executeWorkflow(blockId, 'onClick', store);
    // The rows changed. onClick is kept for pages wired before onChange existed.
    executeWorkflow(blockId, 'onChange', store);
    recalculateAllFormulas(store);
    triggerSave(prev => prev + 1);

    // Save specific row data to Supabase
    const targetRow = updatedRows.find(r => r.id === rowId);
    if (targetRow) {
      const { id, ...rowData } = targetRow;
      saveCellToSupabase(rowId, rowData);
    }
  };

  const handleAddRow = async () => {
    const rowId = `row_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const defaultData: Record<string, any> = {};
    columns.forEach(col => {
      if (col.type === 'number') defaultData[col.name] = 0;
      else if (col.type === 'boolean') defaultData[col.name] = false;
      else defaultData[col.name] = '';
    });

    const updatedRows = [...rows, { id: rowId, ...defaultData }];

    let nextValue = 0;
    nextValue = computeDatabaseOutput(updatedRows, runtimeState);

    store.set(atomInstance, {
      ...runtimeState,
      rows: updatedRows,
      value: nextValue
    });

    executeWorkflow(blockId, 'onClick', store);
    // The rows changed. onClick is kept for pages wired before onChange existed.
    executeWorkflow(blockId, 'onChange', store);
    recalculateAllFormulas(store);
    triggerSave(prev => prev + 1);

    // Insert row to Supabase
    try {
      const { error } = await supabase
        .rpc('add_database_row', {
          p_id: rowId,
          p_block_id: blockId,
          p_row_data: defaultData
        });
      // A stale message is its own kind of lie: the write that failed has
      // been followed by one that worked, and the red line would still be
      // there saying otherwise.
      if (!error) {
        const ok = store.get(atomInstance);
        if (ok?.error) store.set(atomInstance, { ...ok, error: null });
      }
      // The row comes back off the table if it was not stored, so the count
      // and the table agree with the database rather than with the click.
      if (error) {
        const current = store.get(atomInstance);
        const kept = withoutRow(current?.rows || [], rowId);
        store.set(atomInstance, {
          ...current,
          rows: kept,
          value: computeDatabaseOutput(kept, current),
          error: describeRowWriteError(error).message,
        });
      }
    } catch (err) {
      const current = store.get(atomInstance);
      const kept = withoutRow(current?.rows || [], rowId);
      store.set(atomInstance, {
        ...current,
        rows: kept,
        value: computeDatabaseOutput(kept, current),
        error: describeRowWriteError(err).message,
      });
    }
  };

  const restoreDeletedRow = (row: any, failure: string) => {
    if (!row) return;
    const current = store.get(atomInstance);
    const already = (current?.rows || []).some((r: any) => r?.id === row.id);
    const back = already ? (current?.rows || []) : [...(current?.rows || []), row];
    store.set(atomInstance, {
      ...current,
      rows: back,
      value: computeDatabaseOutput(back, current),
      error: failure,
    });
  };

  const handleDeleteRow = async (rowId: string) => {
    const doomedRow = rows.find(r => r.id === rowId);
    const updatedRows = rows.filter(r => r.id !== rowId);

    let nextValue = 0;
    nextValue = computeDatabaseOutput(updatedRows, runtimeState);

    store.set(atomInstance, {
      ...runtimeState,
      rows: updatedRows,
      value: nextValue
    });

    executeWorkflow(blockId, 'onClick', store);
    // The rows changed. onClick is kept for pages wired before onChange existed.
    executeWorkflow(blockId, 'onChange', store);
    recalculateAllFormulas(store);
    triggerSave(prev => prev + 1);

    // Delete row from Supabase
    try {
      const { error } = await supabase
        .rpc('delete_database_row', { p_id: rowId });
      // A row that would not delete comes back, rather than sitting deleted on
      // screen and reappearing on the next reload.
      if (error) restoreDeletedRow(doomedRow, describeRowWriteError(error).message);
    } catch (err) {
      restoreDeletedRow(doomedRow, describeRowWriteError(err).message);
    }
  };

  // Custom visual styles
  const customBg = runtimeState?.backgroundColor || '#ffffff';
  const customBorderRadius = `${runtimeState?.borderRadius ?? 8}px`;
  const customOpacity = runtimeState?.opacity !== undefined ? runtimeState.opacity / 100 : 1;
  const customWidth = runtimeState?.width !== undefined ? `${runtimeState.width}px` : '400px';
  const customTextColor = runtimeState?.textColor || '#0f172a';
  const customFontSize = `${runtimeState?.fontSize ?? 13}px`;

  // Output port details
  // Determine output port badge data type dynamically
  let outputDataType: 'number' | 'string' | 'boolean' | 'unknown' = 'number';
  if (outputMode !== 'row_count') {
    const col = columns.find(c => c.name === outputMode);
    if (col) {
      if (col.type === 'number') outputDataType = 'number';
      else if (col.type === 'boolean') outputDataType = 'boolean';
      else outputDataType = 'string';
    }
  }

  const onOutputPortPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const portEl = e.currentTarget as HTMLElement;
    const portRect = portEl.getBoundingClientRect();
    const portCenterX = portRect.left + portRect.width / 2 - containerRect.left;
    const portCenterY = portRect.top + portRect.height / 2 - containerRect.top;
    setActiveWire({
      sourceBlockId: blockId,
      sourceX: portCenterX,
      sourceY: portCenterY,
      currentX: portCenterX,
      currentY: portCenterY,
    });
  };

  const isWireActive = activeWire !== null;
  const isWireSource = isWireActive && activeWire.sourceBlockId === blockId;
  const isSnapTarget = snapTarget === blockId;
  const showLeftPort = isHovered || (isWireActive && !isWireSource);
  const showRightPort = isHovered || isWireSource;

  // Native DOM ref for context menu — bypasses React's synthetic events entirely
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;
    setContextMenu({
      blockId,
      x,
      y,
      visible: true,
    });
  }, [blockId, setContextMenu]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.addEventListener('contextmenu', handleContextMenu, true);
    return () => {
      el.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [handleContextMenu]);

  return (
    <NodeViewWrapper
      data-block-id={blockId}
      ref={wrapperRef}
      as="div"
      className="database-block-wrapper"
      style={{
        display: 'block',
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: isHovered ? 100 : 10,
        opacity: customOpacity,
        userSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Floating Name Label */}
      <div
        style={{
          position: 'absolute',
          top: '-16px',
          left: '0',
          fontSize: '10px',
          opacity: 0.6,
          color: '#cbd5e1',
          userSelect: 'none',
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        {runtimeState?.blockName || getBlockTypeDisplayName('databaseBlock')}
      </div>

      {/* Main Database Table Face */}
      <div
        contentEditable={false}
        style={{
          backgroundColor: customBg,
          borderRadius: customBorderRadius,
          width: customWidth,
          padding: '12px',
          boxSizing: 'border-box',
          border: isHovered ? '2px solid #818cf8' : '2px solid transparent',
          boxShadow: isHovered ? '0 10px 15px -3px rgba(0, 0, 0, 0.3)' : '0 4px 6px -2px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          color: customTextColor,
          fontSize: customFontSize,
        }}
      >
        {/* Table Title / Mode Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
          <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Database Table
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/*
              WHICH OF THE TWO THIS TABLE IS DOING. A builder cannot see a
              websocket; they can see whether the page is being told or asking,
              and that difference is the entire feature. Without migration 0010
              this never lights, which is the honest answer rather than a
              hopeful one. The whole sentence is on hover.
            */}
            <span
              title={describeLive(live.current, Date.now())}
              style={{
                fontSize: '9px', fontWeight: 600, letterSpacing: '0.4px',
                padding: '2px 6px', borderRadius: '4px',
                background: isLive ? '#ecfdf5' : '#f1f5f9',
                color: isLive ? '#047857' : '#94a3b8',
              }}
            >
              {isLive ? 'LIVE' : 'ON A TIMER'}
            </span>
            <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>
              {outputMode === 'row_count' ? `Count: ${rows.length}` : `Output: ${outputMode}`}
            </span>
          </span>
        </div>

        {/* Scrollable Table Viewport */}
        <div style={{ overflowX: 'auto', maxHeight: '160px', overflowY: 'auto', marginBottom: '8px' }}>
          {columns.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>
              No columns defined. Define columns in the Inspector.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '300px' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #cbd5e1' }}>
                  {columns.map(col => (
                    <th key={col.name} style={{ padding: '6px 8px', fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'capitalize' }}>
                      {col.name}
                    </th>
                  ))}
                  <th style={{ width: '24px' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="table-row-hover" style={{ borderBottom: '1px solid #e2e8f0' }}>
                    {columns.map(col => {
                      const cellVal = row[col.name];
                      return (
                        <td key={col.name} style={{ padding: '4px 6px' }} onPointerDown={(e) => e.stopPropagation()}>
                          {col.type === 'boolean' ? (
                            <input
                              type="checkbox"
                              checked={!!cellVal}
                              onChange={(e) => handleCellEdit(row.id, col.name, e.target.checked)}
                              style={{ cursor: 'pointer' }}
                            />
                          ) : col.type === 'number' ? (
                            <input
                              type="number"
                              value={cellVal !== undefined ? cellVal : ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? 0 : Number(e.target.value);
                                handleCellEdit(row.id, col.name, v);
                              }}
                              style={{
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                                padding: '2px 4px',
                                outline: 'none',
                                fontSize: customFontSize,
                                color: customTextColor,
                                boxSizing: 'border-box'
                              }}
                            />
                          ) : col.type === 'date' ? (
                            /*
                              A real date picker rather than a text box. The
                              input speaks only YYYY-MM-DD and shows an empty
                              box for anything else -- silently -- so the stored
                              ISO has to be translated both ways. Both halves
                              live in rows.ts together, because written apart
                              they disagreed about the timezone and a date typed
                              near midnight came back a day earlier.
                            */
                            <input
                              type="date"
                              value={isoToDateInput(cellVal)}
                              onChange={(e) => handleCellEdit(row.id, col.name, dateInputToIso(e.target.value))}
                              style={{
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                                padding: '2px 4px',
                                outline: 'none',
                                fontSize: customFontSize,
                                color: customTextColor,
                                boxSizing: 'border-box'
                              }}
                            />
                          ) : (
                            <input
                              type="text"
                              value={cellVal !== undefined ? cellVal : ''}
                              onChange={(e) => handleCellEdit(row.id, col.name, e.target.value)}
                              style={{
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                                padding: '2px 4px',
                                outline: 'none',
                                fontSize: customFontSize,
                                color: customTextColor,
                                boxSizing: 'border-box'
                              }}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td style={{ padding: '4px 6px', textAlign: 'center' }} onPointerDown={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDeleteRow(row.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          padding: '0 4px',
                          lineHeight: 1,
                          opacity: 0.6
                        }}
                        title="Delete row"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/*
          WHAT DID NOT SAVE, SAID ON THE BLOCK.
          Without this line every "report the failure" branch in this file sets
          a field nothing renders -- which is the shipped-and-unreachable
          failure this project keeps catching elsewhere, committed here by the
          same hand that was checking for it. The table showing a row and the
          database not holding it is exactly what this exists to stop being
          silent, so the message has to be somewhere a builder looks: on the
          block, not in a console.
        */}
        <FailureNote
          message={runtimeState?.error}
          onPointerDown={(e) => e.stopPropagation()}
          onDismiss={() => store.set(atomInstance, { ...store.get(atomInstance), error: null })}
        />

        {/* Add Row Button */}
        {columns.length > 0 && (
          <button
            onClick={handleAddRow}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1.5px dashed #cbd5e1',
              background: '#f8fafc',
              color: '#475569',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              transition: 'all 0.15s',
              outline: 'none',
            }}
            className="add-row-button-hover"
          >
            + Add Row
          </button>
        )}
      </div>

      {/* Right (output) port */}
      <div
        contentEditable={false}
        data-port-output={blockId}
        title="Drag from here to another block: this hands over its value and makes that block react"
        onPointerDown={onOutputPortPointerDown}
        style={{
          position: 'absolute',
          right: '-5px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: '#6366f1',
          border: '2px solid white',
          opacity: showRightPort ? 1 : 0,
          pointerEvents: showRightPort ? 'all' as const : 'none' as const,
          cursor: 'crosshair',
          transition: 'opacity 0.15s',
        }}
      >
        <span style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '10px',
          fontWeight: 'bold',
          color: '#6366f1',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {getPortBadge(outputDataType)}
        </span>
      </div>

      {/* Left (input) port */}
      <div
        contentEditable={false}
        data-port-input={blockId}
        title="Something wired into here makes this block react"
        style={{
          position: 'absolute',
          left: '-5px',
          top: '50%',
          transform: isSnapTarget ? 'translateY(-50%) scale(1.5)' : 'translateY(-50%)',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: '#22c55e',
          border: '2px solid white',
          boxShadow: isSnapTarget ? '0 0 8px 2px #22c55e' : 'none',
          opacity: showLeftPort ? 1 : 0,
          pointerEvents: showLeftPort ? 'all' as const : 'none' as const,
          transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s',
        }}
      >
        <span style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '10px',
          fontWeight: 'bold',
          color: '#22c55e',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {getPortBadge('database')}
        </span>
      </div>
    </NodeViewWrapper>
  );
};

export const DatabaseBlock = Node.create({
  name: 'databaseBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: {
        default: () => 'db_' + Math.random().toString(36).substring(2, 11),
        parseHTML: (element: HTMLElement) => element.getAttribute('data-blockid'),
        renderHTML: (attributes: Record<string, any>) =>
          attributes.blockId ? { 'data-blockid': attributes.blockId } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="database-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'database-block', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DatabaseBlockComponent, { as: 'div' });
  },
});
