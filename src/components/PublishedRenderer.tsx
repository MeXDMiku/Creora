import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore, useAtomValue } from 'jotai';
import { supabase } from '../lib/supabase';
import { blockToCSS } from '../lib/renderBlockStyles';
import { executeWorkflow, recalculateAllFormulas } from '../lib/bindingEngine';
import {
  blockPositionAtom,
  blockRuntimeAtom,
  workflowsAtom,
  formulasAtom,
  connectionsAtom,
  allBlockIdsAtom,
} from '../state/atoms';

// Document Item & Block extraction
interface ExtractedBlock {
  id: string;
  type: string;
  attrs: any;
}

type DocItem =
  | { kind: 'block'; block: ExtractedBlock }
  | { kind: 'text'; node: any };

const supportedBlockTypes = [
  'buttonBlock',
  'numberDisplayBlock',
  'toggleBlock',
  'inputBlock',
  'textLabelBlock',
  'formulaDisplayBlock',
  'timerBlock',
  'historyChartBlock',
  'databaseBlock',
  'listBlock',
  'shapeBlock',
];

const extractDocItems = (node: any): { docItems: DocItem[]; blocks: ExtractedBlock[] } => {
  if (!node) return { docItems: [], blocks: [] };
  const docItems: DocItem[] = [];
  const blocks: ExtractedBlock[] = [];

  const traverse = (n: any) => {
    if (!n) return;

    if (n.attrs?.blockId && supportedBlockTypes.includes(n.type)) {
      const extBlock: ExtractedBlock = {
        id: n.attrs.blockId,
        type: n.type,
        attrs: n.attrs,
      };
      blocks.push(extBlock);
      docItems.push({ kind: 'block', block: extBlock });
      return;
    }

    if (n.type === 'doc') {
      if (n.content && Array.isArray(n.content)) {
        n.content.forEach((child: any) => traverse(child));
      }
      return;
    }

    // Standard document flow node (paragraph, heading, list, blockquote, hr, etc.)
    docItems.push({ kind: 'text', node: n });

    // Also check for embedded custom block nodes inside
    if (n.content && Array.isArray(n.content)) {
      n.content.forEach((child: any) => {
        if (child.attrs?.blockId && supportedBlockTypes.includes(child.type)) {
          const extBlock: ExtractedBlock = {
            id: child.attrs.blockId,
            type: child.type,
            attrs: child.attrs,
          };
          blocks.push(extBlock);
        }
      });
    }
  };

  traverse(node);
  return { docItems, blocks };
};

function RenderInlineNode({ node }: { node: any }) {
  if (!node) return null;
  if (node.type === 'text') {
    let element: React.ReactNode = node.text || '';
    if (node.marks && Array.isArray(node.marks)) {
      node.marks.forEach((mark: any) => {
        if (mark.type === 'bold') element = <strong>{element}</strong>;
        if (mark.type === 'italic') element = <em>{element}</em>;
        if (mark.type === 'strike') element = <del>{element}</del>;
        if (mark.type === 'code') element = <code>{element}</code>;
        if (mark.type === 'link') {
          element = (
            <a
              href={mark.attrs?.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#4f46e5', textDecoration: 'underline' }}
            >
              {element}
            </a>
          );
        }
      });
    }
    return element;
  }
  if (node.type === 'hardBreak') return <br />;
  return null;
}

function RenderDocNode({ node }: { node: any }) {
  if (!node) return null;

  const children = node.content?.map((child: any, idx: number) => (
    <RenderDocNode key={idx} node={child} />
  )) || null;

  switch (node.type) {
    case 'paragraph':
      return (
        <p style={{ margin: '0 0 0.5em 0', minHeight: '1em', color: 'var(--text-h, #0f172a)', lineHeight: '1.5' }}>
          {children && children.length > 0 ? children : <br />}
        </p>
      );
    case 'heading': {
      const level = node.attrs?.level || 1;
      const fontSizes: Record<number, string> = { 1: '2em', 2: '1.5em', 3: '1.25em', 4: '1em', 5: '0.875em', 6: '0.75em' };
      const style = { margin: '0.5em 0 0.25em 0', fontSize: fontSizes[level] || '1.5em', fontWeight: 600, color: 'var(--text-h, #0f172a)' };
      if (level === 1) return <h1 style={style}>{children}</h1>;
      if (level === 2) return <h2 style={style}>{children}</h2>;
      if (level === 3) return <h3 style={style}>{children}</h3>;
      if (level === 4) return <h4 style={style}>{children}</h4>;
      if (level === 5) return <h5 style={style}>{children}</h5>;
      return <h6 style={style}>{children}</h6>;
    }
    case 'bulletList':
      return <ul style={{ paddingLeft: '24px', margin: '0.5em 0', color: 'var(--text-h, #0f172a)' }}>{children}</ul>;
    case 'orderedList':
      return <ol style={{ paddingLeft: '24px', margin: '0.5em 0', color: 'var(--text-h, #0f172a)' }}>{children}</ol>;
    case 'listItem':
      return <li style={{ margin: '0.25em 0' }}>{children}</li>;
    case 'blockquote':
      return (
        <blockquote style={{ borderLeft: '4px solid #cbd5e1', paddingLeft: '12px', color: '#64748b', margin: '0.5em 0', fontStyle: 'italic' }}>
          {children}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre style={{ background: '#1e293b', color: '#f8fafc', padding: '12px', borderRadius: '6px', overflowX: 'auto', margin: '0.5em 0' }}>
          <code>{children}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '1em 0' }} />;
    case 'text':
      return <RenderInlineNode node={node} />;
    default:
      if (children) return <>{children}</>;
      return null;
  }
}

function PublishedTimerBlock({ block }: { block: ExtractedBlock }) {
  const position = useAtomValue(blockPositionAtom(block.id));
  const runtimeState = useAtomValue(blockRuntimeAtom(block.id));
  const store = useStore();

  const { outer: outerStyle, inner: innerStyle } = blockToCSS(block.type, position, runtimeState);

  const isRunning = !!runtimeState?.value;
  const mode = runtimeState?.mode ?? 'countdown';
  const duration = runtimeState?.duration ?? 10;
  const autoStart = runtimeState?.autoStart ?? false;

  const [seconds, setSeconds] = useState(mode === 'interval' ? 0 : duration);

  useEffect(() => {
    if (!isRunning) {
      setSeconds(mode === 'interval' ? 0 : duration);
    }
  }, [duration, mode, isRunning]);

  useEffect(() => {
    if (autoStart && !isRunning) {
      store.set(blockRuntimeAtom(block.id), (curr) => ({ ...curr, value: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, block.id, store]);

  useEffect(() => {
    if (!isRunning) return;

    const intervalId = setInterval(() => {
      setSeconds((prev) => {
        if (mode === 'countdown') {
          const next = prev - 1;
          if (next <= 0) {
            executeWorkflow(block.id, 'onTick', store);
            executeWorkflow(block.id, 'onComplete', store);
            store.set(blockRuntimeAtom(block.id), (curr) => ({ ...curr, value: false }));
            return 0;
          }
          executeWorkflow(block.id, 'onTick', store);
          return next;
        } else {
          const next = prev + 1;
          executeWorkflow(block.id, 'onTick', store);
          return next;
        }
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isRunning, mode, duration, block.id, store]);

  const toggleTimer = () => {
    const nextRunning = !isRunning;
    store.set(blockRuntimeAtom(block.id), (curr) => ({ ...curr, value: nextRunning }));
  };

  return (
    <div style={outerStyle}>
      <div
        style={{
          ...innerStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '8px 16px',
          background: runtimeState?.backgroundColor || '#10b981',
          color: runtimeState?.textColor || 'white',
          borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
          fontSize: runtimeState?.fontSize !== undefined ? `${runtimeState.fontSize}px` : '14px',
          boxSizing: 'border-box',
          width: runtimeState?.width !== undefined ? '100%' : 'auto',
        }}
      >
        <span style={{ fontSize: '16px' }}>⏱️</span>
        <span style={{ fontWeight: 600 }}>{seconds}s</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleTimer();
          }}
          style={{
            background: 'rgba(255, 255, 255, 0.25)',
            border: 'none',
            color: 'white',
            borderRadius: '4px',
            padding: '2px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            fontSize: '11px',
            fontWeight: 'bold',
            transition: 'background 0.2s',
            outline: 'none'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.4)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)')}
        >
          {isRunning ? '⏸️ Stop' : '▶️ Start'}
        </button>
      </div>
    </div>
  );
}

function PublishedDatabaseBlock({ block }: { block: ExtractedBlock }) {
  const position = useAtomValue(blockPositionAtom(block.id));
  const runtimeState = useAtomValue(blockRuntimeAtom(block.id));
  const store = useStore();

  const { outer: outerStyle } = blockToCSS(block.type, position, runtimeState);

  const columns = runtimeState?.columns || [];
  const rows = runtimeState?.rows || [];
  const outputMode = runtimeState?.outputMode || 'row_count';

  useEffect(() => {
    async function loadRows() {
      try {
        const { data, error } = await supabase
          .rpc('list_database_rows', { p_block_id: block.id });

        if (error) return;

        if (data) {
          const parsedRows = data.map((item: any) => ({
            id: item.id,
            ...item.row_data
          }));
          const currentLocalState = store.get(blockRuntimeAtom(block.id));
          const currentLocalRows = currentLocalState?.rows || [];
          if (parsedRows.length > 0 || currentLocalRows.length === 0) {
            let nextValue = 0;
            if (outputMode === 'row_count') {
              nextValue = parsedRows.length;
            } else {
              const lastRow = parsedRows[parsedRows.length - 1];
              nextValue = lastRow ? lastRow[outputMode] : 0;
            }
            store.set(blockRuntimeAtom(block.id), {
              ...currentLocalState,
              rows: parsedRows,
              value: nextValue
            });
            recalculateAllFormulas(store);
          }
        }
      } catch (err) {}
    }
    loadRows();
  }, [block.id, outputMode, columns.length, store]);

  const debouncedSaveRef = useRef<Record<string, any>>({});
  const saveCellToSupabase = useCallback((rowId: string, rowData: any) => {
    if (debouncedSaveRef.current[rowId]) {
      clearTimeout(debouncedSaveRef.current[rowId]);
    }
    debouncedSaveRef.current[rowId] = setTimeout(async () => {
      try {
        await supabase.rpc('update_database_row', { p_id: rowId, p_row_data: rowData });
      } catch (err) {}
    }, 500);
  }, []);

  const handleCellEdit = (rowId: string, colName: string, val: any) => {
    const updatedRows = rows.map((r: any) => {
      if (r.id === rowId) return { ...r, [colName]: val };
      return r;
    });

    let nextValue = 0;
    if (outputMode === 'row_count') {
      nextValue = updatedRows.length;
    } else {
      const lastRow = updatedRows[updatedRows.length - 1];
      nextValue = lastRow ? lastRow[outputMode] : 0;
    }

    store.set(blockRuntimeAtom(block.id), {
      ...runtimeState,
      rows: updatedRows,
      value: nextValue
    });

    executeWorkflow(block.id, 'onClick', store);
    recalculateAllFormulas(store);

    const targetRow = updatedRows.find((r: any) => r.id === rowId);
    if (targetRow) {
      const { id, ...rowData } = targetRow;
      saveCellToSupabase(rowId, rowData);
    }
  };

  const handleAddRow = async () => {
    const rowId = `row_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const defaultData: Record<string, any> = {};
    columns.forEach((col: any) => {
      if (col.type === 'number') defaultData[col.name] = 0;
      else if (col.type === 'boolean') defaultData[col.name] = false;
      else defaultData[col.name] = '';
    });

    const updatedRows = [...rows, { id: rowId, ...defaultData }];

    let nextValue = 0;
    if (outputMode === 'row_count') {
      nextValue = updatedRows.length;
    } else {
      const lastRow = updatedRows[updatedRows.length - 1];
      nextValue = lastRow ? lastRow[outputMode] : 0;
    }

    store.set(blockRuntimeAtom(block.id), {
      ...runtimeState,
      rows: updatedRows,
      value: nextValue
    });

    executeWorkflow(block.id, 'onClick', store);
    recalculateAllFormulas(store);

    try {
      await supabase.rpc('add_database_row', {
        p_id: rowId,
        p_block_id: block.id,
        p_row_data: defaultData
      });
    } catch (err) {}
  };

  const handleDeleteRow = async (rowId: string) => {
    const updatedRows = rows.filter((r: any) => r.id !== rowId);

    let nextValue = 0;
    if (outputMode === 'row_count') {
      nextValue = updatedRows.length;
    } else {
      const lastRow = updatedRows[updatedRows.length - 1];
      nextValue = lastRow ? lastRow[outputMode] : 0;
    }

    store.set(blockRuntimeAtom(block.id), {
      ...runtimeState,
      rows: updatedRows,
      value: nextValue
    });

    executeWorkflow(block.id, 'onClick', store);
    recalculateAllFormulas(store);

    try {
      await supabase.rpc('delete_database_row', { p_id: rowId });
    } catch (err) {}
  };

  const customBg = runtimeState?.backgroundColor || '#ffffff';
  const customBorderRadius = `${runtimeState?.borderRadius ?? 8}px`;
  const customWidth = runtimeState?.width !== undefined ? `${runtimeState.width}px` : '400px';
  const customTextColor = runtimeState?.textColor || '#0f172a';
  const customFontSize = `${runtimeState?.fontSize ?? 13}px`;

  return (
    <div style={outerStyle}>
      <div
        style={{
          backgroundColor: customBg,
          borderRadius: customBorderRadius,
          width: customWidth,
          padding: '12px',
          boxSizing: 'border-box',
          border: '2px solid transparent',
          boxShadow: '0 4px 6px -2px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          color: customTextColor,
          fontSize: customFontSize,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
          <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Database Table
          </span>
          <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>
            {outputMode === 'row_count' ? `Count: ${rows.length}` : `Output: ${outputMode}`}
          </span>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '160px', overflowY: 'auto', marginBottom: '8px' }}>
          {columns.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>
              No columns defined. Define columns in the Editor.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '300px' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #cbd5e1' }}>
                  {columns.map((col: any) => (
                    <th key={col.name} style={{ padding: '6px 8px', fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'capitalize' }}>
                      {col.name}
                    </th>
                  ))}
                  <th style={{ width: '24px' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    {columns.map((col: any) => {
                      const cellVal = row[col.name];
                      return (
                        <td key={col.name} style={{ padding: '4px 6px' }}>
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
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
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

        {columns.length > 0 && (
          <button
            onClick={handleAddRow}
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
          >
            + Add Row
          </button>
        )}
      </div>
    </div>
  );
}

function PublishedListBlock({ block }: { block: ExtractedBlock }) {
  const position = useAtomValue(blockPositionAtom(block.id));
  const runtimeState = useAtomValue(blockRuntimeAtom(block.id));
  const store = useStore();

  const { outer: outerStyle } = blockToCSS(block.type, position, runtimeState);

  const trackedBlockId = runtimeState?.trackedBlockId;
  const [supabaseRows, setSupabaseRows] = useState<any[]>([]);

  useEffect(() => {
    if (!trackedBlockId) {
      setSupabaseRows([]);
      return;
    }

    supabase
      .rpc('list_database_rows', { p_block_id: trackedBlockId })
      .then(({ data, error }: any) => {
        if (error) return;
        if (data) {
          const parsed = data.map((item: any) => ({
            id: item.id,
            ...item.row_data
          }));
          setSupabaseRows(parsed);
        }
      });
  }, [trackedBlockId]);

  const dbAtom = useMemo(() => blockRuntimeAtom(trackedBlockId || ''), [trackedBlockId]);
  const dbState = useAtomValue(dbAtom, { store });
  const dbRows = dbState?.rows || [];

  const displayRows = dbRows.length > 0 ? dbRows : supabaseRows;

  const customBg = runtimeState?.backgroundColor || '#ffffff';
  const customBorderRadius = runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px';
  const customOpacity = runtimeState?.opacity !== undefined ? runtimeState.opacity / 100 : 1;
  const customWidth = runtimeState?.width !== undefined ? `${runtimeState.width}px` : '300px';
  const customTextColor = runtimeState?.textColor || '#0f172a';

  return (
    <div style={outerStyle}>
      <div
        style={{
          backgroundColor: customBg,
          borderRadius: customBorderRadius,
          opacity: customOpacity,
          width: customWidth,
          padding: '12px',
          boxSizing: 'border-box',
          border: '2px solid transparent',
          boxShadow: '0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          color: customTextColor,
          maxHeight: '300px',
          overflowY: 'auto',
        }}
      >
        {!trackedBlockId || displayRows.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '12px', padding: '16px' }}>
            No data
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {displayRows.map((row: any, idx: number) => (
              <div
                key={row.id || idx}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  background: '#f8fafc',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                {Object.entries(row)
                  .filter(([key]) => key !== 'id')
                  .map(([colName, colVal]) => (
                    <div key={colName} style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                      <span style={{ fontWeight: 600, color: '#475569', minWidth: '60px' }}>{colName}:</span>
                      <span style={{ color: '#0f172a' }}>{String(colVal)}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Render block wrapper component to subscribe to Jotai values reactively
function RenderedBlock({ block }: { block: ExtractedBlock }) {
  const position = useAtomValue(blockPositionAtom(block.id));
  const runtimeState = useAtomValue(blockRuntimeAtom(block.id));
  const store = useStore();
  const navigate = useNavigate();

  /**
   * A published page is a real route, so navigation is a router push, not the
   * editor's switchPageFn (which is an editor-only concept and does not exist
   * here). useNavigate was imported in this file but never called, so buttons
   * with a target page did nothing at all on published pages.
   */
  const runTrigger = () => {
    executeWorkflow(block.id, 'onClick', store);
    recalculateAllFormulas(store);
    const targetPageId = runtimeState?.targetPageId;
    if (targetPageId) navigate(`/view/${targetPageId}`);
  };

  const { outer: outerStyle, inner: innerStyle } = blockToCSS(block.type, position, runtimeState);

  if (block.type === 'buttonBlock') {
    return (
      <div style={outerStyle}>
        <button
          style={innerStyle}
          onClick={runTrigger}
        >
          {block.attrs.label || 'Button'}
        </button>
      </div>
    );
  }

  if (block.type === 'numberDisplayBlock') {
    return (
      <div style={outerStyle}>
        <div style={innerStyle}>
          {String(runtimeState?.value ?? 0)}
        </div>
      </div>
    );
  }

  if (block.type === 'toggleBlock') {
    const runtimeValue = typeof runtimeState?.value === 'boolean' ? runtimeState.value : false;
    return (
      <div style={outerStyle}>
        <div
          style={innerStyle}
          onClick={() => {
            const nextVal = !runtimeValue;
            store.set(blockRuntimeAtom(block.id), {
              ...runtimeState,
              value: nextVal,
            });
            executeWorkflow(block.id, 'onClick', store);
            recalculateAllFormulas(store);
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: 'white',
              position: 'absolute',
              top: '2px',
              left: runtimeValue ? '22px' : '2px',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
        </div>
      </div>
    );
  }

  if (block.type === 'inputBlock') {
    return (
      <div style={outerStyle}>
        <input
          type="text"
          style={innerStyle}
          value={String(runtimeState?.value ?? '')}
          onChange={(e) => {
            store.set(blockRuntimeAtom(block.id), {
              ...runtimeState,
              value: e.target.value,
            });
            executeWorkflow(block.id, 'onChange', store);
            recalculateAllFormulas(store);
          }}
          placeholder="Type something..."
        />
      </div>
    );
  }

  if (block.type === 'textLabelBlock') {
    return (
      <div style={outerStyle}>
        <div style={innerStyle}>
          {String(runtimeState?.value ?? '')}
        </div>
      </div>
    );
  }

  if (block.type === 'shapeBlock') {
    const isTrigger = runtimeState?.role === 'trigger';
    return (
      <div style={outerStyle}>
        <div
          style={{
            ...innerStyle,
            cursor: isTrigger ? 'pointer' : 'default',
          }}
          onClick={() => {
            if (isTrigger) runTrigger();
          }}
        >
          {String(runtimeState?.text ?? runtimeState?.value ?? '')}
        </div>
      </div>
    );
  }

  if (block.type === 'formulaDisplayBlock') {
    return (
      <div style={outerStyle}>
        <div style={innerStyle}>
          <span style={{ 
            fontSize: '11px', 
            background: 'rgba(255, 255, 255, 0.2)', 
            padding: '2px 6px', 
            borderRadius: '4px',
            textTransform: 'uppercase',
            fontWeight: 'bold',
            letterSpacing: '0.5px'
          }}>
            fx
          </span>
          {String(runtimeState?.value ?? '0')}
        </div>
      </div>
    );
  }

  if (block.type === 'timerBlock') {
    return <PublishedTimerBlock block={block} />;
  }

  if (block.type === 'databaseBlock') {
    return <PublishedDatabaseBlock block={block} />;
  }

  if (block.type === 'listBlock') {
    return <PublishedListBlock block={block} />;
  }

  if (block.type === 'historyChartBlock') {
    const customBg = runtimeState?.backgroundColor || '#1e293b';
    const customBorderRadius = runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px';
    const customWidth = runtimeState?.width !== undefined ? `${runtimeState.width}px` : '180px';
    const customTextColor = runtimeState?.textColor || '#ffffff';

    const svgWidth = 140;
    const svgHeight = 60;
    const padding = 4;

    const history = runtimeState?.history || [];
    const trackedBlockId = runtimeState?.trackedBlockId;

    let chartContent;
    if (!trackedBlockId) {
      chartContent = (
        <text x={svgWidth / 2} y={svgHeight / 2} textAnchor="middle" dominantBaseline="middle" fill="#64748b" fontSize="10px" fontWeight={500}>
          No tracked block
        </text>
      );
    } else if (history.length === 0) {
      chartContent = (
        <text x={svgWidth / 2} y={svgHeight / 2} textAnchor="middle" dominantBaseline="middle" fill="#64748b" fontSize="10px" fontWeight={500}>
          Awaiting changes...
        </text>
      );
    } else {
      const maxVal = Math.max(...history, 1);
      const minVal = Math.min(...history, 0);
      const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;

      const barPadding = 2;
      const numBars = history.length;
      const barWidth = (svgWidth - (numBars - 1) * barPadding) / numBars;

      const baselineY = svgHeight - ((0 - minVal) / range) * svgHeight;

      chartContent = history.map((val: number, idx: number) => {
        let barHeight = (Math.abs(val) / range) * (svgHeight - 2 * padding);
        if (barHeight < 2) {
          barHeight = 2;
        }

        let yPos = baselineY - barHeight;
        if (val < 0) {
          yPos = baselineY;
        }

        const xPos = idx * (barWidth + barPadding);

        return (
          <rect
            key={idx}
            x={xPos}
            y={yPos}
            width={barWidth}
            height={barHeight}
            rx={1}
            ry={1}
            fill={val >= 0 ? '#6366f1' : '#f43f5e'}
            style={{ transition: 'all 0.2s', opacity: 0.85 }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.85';
            }}
          >
            <title>{`Val: ${val}`}</title>
          </rect>
        );
      });
    }

    return (
      <div style={outerStyle}>
        <div
          style={{
            backgroundColor: customBg,
            borderRadius: customBorderRadius,
            width: customWidth,
            height: '110px',
            padding: '8px 12px',
            boxSizing: 'border-box',
            border: '2px solid transparent',
            boxShadow: '0 4px 6px -2px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              History Chart
            </span>
            {history.length > 0 && (
              <span style={{ fontSize: '9px', fontWeight: 700, color: customTextColor, opacity: 0.7 }}>
                {`Last: ${history[history.length - 1]}`}
              </span>
            )}
          </div>
          <div
            style={{
              width: '100%',
              height: `${svgHeight}px`,
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '4px',
              padding: '2px',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="100%" height="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ display: 'block', overflow: 'visible' }}>
              {chartContent}
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function PublishedRenderer() {
  const { pageId } = useParams<{ pageId: string }>();
  const store = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageName, setPageName] = useState('Published Page');
  const [docItemsList, setDocItemsList] = useState<DocItem[]>([]);

  useEffect(() => {
    if (!pageId) return;

    const fetchPage = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .rpc('get_page', { p_id: pageId })
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          setError('Page not found');
          return;
        }

        const blocksData = data.blocks || {};
        const workflowsData = data.workflows || [];
        setPageName(blocksData.pageName || 'Published Page');

        // Extract doc items and blocks from documentContent
        const documentContent = blocksData.documentContent || {};
        const { docItems, blocks } = extractDocItems(documentContent);
        setDocItemsList(docItems);

        // Populate Jotai store
        store.set(workflowsAtom, workflowsData);
        store.set(formulasAtom, blocksData.formulas || []);
        store.set(connectionsAtom, blocksData.connections || []);

        const blockIds = blocks.map((b) => b.id);
        store.set(allBlockIdsAtom, blockIds);

        if (blocksData.positions) {
          Object.entries(blocksData.positions).forEach(([id, pos]: [string, any]) => {
            store.set(blockPositionAtom(id), pos);
          });
        }

        if (blocksData.runtimeStates) {
          Object.entries(blocksData.runtimeStates).forEach(([id, rState]: [string, any]) => {
            store.set(blockRuntimeAtom(id), rState);
          });
        }

        // Recalculate initial values
        recalculateAllFormulas(store);
      } catch (err: any) {
        console.error('Failed to load published page:', err);
        setError(err.message || 'Failed to load page');
      } finally {
        setLoading(false);
      }
    };

    fetchPage();
  }, [pageId, store]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', fontFamily: 'sans-serif' }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #e2e8f0',
          borderTopColor: '#4f46e5',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ marginTop: '16px', color: '#64748b', fontWeight: 500 }}>Loading page...</p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', fontFamily: 'sans-serif' }}>
        <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px' }}>
          <h2 style={{ color: '#ef4444', margin: '0 0 8px 0' }}>Error</h2>
          <p style={{ color: '#64748b', margin: '0 0 16px 0' }}>{error}</p>
          <a href="/" style={{ display: 'inline-block', background: '#4f46e5', color: '#fff', padding: '8px 16px', borderRadius: '6px', textDecoration: 'none', fontWeight: 500 }}>Go to Editor</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Premium Header */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>{pageName}</h1>
        </div>
        <a href="/" style={{ fontSize: '13px', color: '#4f46e5', textDecoration: 'none', fontWeight: 500 }}>Edit Dashboard</a>
      </header>

      {/* Canvas view area */}
      <div
        id="editor-container"
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'auto',
          padding: '24px'
        }}
      >
        {docItemsList.map((item, idx) => {
          if (item.kind === 'block') {
            return (
              <div
                key={item.block.id}
                style={{
                  height: 0,
                  overflow: 'visible',
                  margin: 0,
                  padding: 0,
                }}
              >
                <RenderedBlock block={item.block} />
              </div>
            );
          }
          return <RenderDocNode key={idx} node={item.node} />;
        })}
      </div>
    </div>
  );
}
