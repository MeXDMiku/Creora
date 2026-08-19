import { withoutVisitorState, isBlockNodeType } from '../lib/blockRegistry';
import { displayCell } from '../lib/rows';
import { usePollWhileVisible } from '../hooks/usePollWhileVisible';
import { useValueChangeAnimation } from '../hooks/useValueChangeAnimation';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useStore, useAtomValue } from 'jotai';
import { supabase } from '../lib/supabase';
import { blockToCSS } from '../lib/renderBlockStyles';
import { valueAtPath } from '../lib/jsonPaths';
import { fetchDataSource } from '../lib/dataSource';
import { runPageLoadWorkflows } from '../lib/bindingEngine';
import { computeDatabaseOutput } from '../lib/databaseOutput';
import { CustomHtmlView } from '../blocks/CustomHtmlBlock';
import { RepeatView } from '../blocks/RepeatBlock';
import { FieldView, FieldError } from '../blocks/FieldView';
import { refreshPageValue, buildParamsFromTemplate } from '../lib/pageValue';
import { parseParams } from '../lib/pageParams';
import { nodeTypeFromBlockId } from '../lib/blockRegistry';
import { layoutPage, PHONE_MAX_WIDTH, type StackItem, type BlockPlacement } from '../lib/layout';
import { refreshVisitor } from '../lib/visitor';
import { executeWorkflow, recalculateAllFormulas } from '../lib/bindingEngine';
import { normalizeImageUrl, IMAGE_MIME_TYPES } from '../lib/images';
import { uploadImage } from '../lib/imageUpload';
import {
  blockPositionAtom,
  blockRuntimeAtom,
  pageParamsAtom,
  workflowsAtom,
  formulasAtom,
  connectionsAtom,
  allBlockIdsAtom,
  blockValuesByName,
  switchPageFnAtom,
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

// The list this used to hold was a second copy of BLOCK_NODE_TYPES that
// happened to be up to date. The copies in App.tsx were not, and that is how
// three blocks ended up unsaveable. One list.

const extractDocItems = (node: any): { docItems: DocItem[]; blocks: ExtractedBlock[] } => {
  if (!node) return { docItems: [], blocks: [] };
  const docItems: DocItem[] = [];
  const blocks: ExtractedBlock[] = [];

  const traverse = (n: any) => {
    if (!n) return;

    if (n.attrs?.blockId && isBlockNodeType(n.type)) {
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
        if (child.attrs?.blockId && isBlockNodeType(child.type)) {
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

function PublishedVisitorBlock({ block }: { block: ExtractedBlock }) {
  const position = useAtomValue(blockPositionAtom(block.id));
  const runtimeState = useAtomValue(blockRuntimeAtom(block.id));
  const store = useStore();
  const { outer: outerStyle, inner: innerStyle } = blockToCSS(block.type, position, runtimeState);
  const field = runtimeState?.visitorField;

  // createSession: true. A page that ASKS who you are may make you an anonymous
  // identity; a page that never asks must not, because every session is a row in
  // auth.users and the free tier counts 50,000 monthly active users in total.
  useEffect(() => {
    refreshVisitor(block.id, store, true);
  }, [block.id, store, field]);

  const v = runtimeState?.value;
  const shown = typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v ?? '');

  return (
    <div style={outerStyle}>
      <div style={innerStyle}>{shown || '\u2014'}</div>
    </div>
  );
}

function PublishedDataSourceBlock({ block }: { block: ExtractedBlock }) {
  const position = useAtomValue(blockPositionAtom(block.id));
  const runtimeState = useAtomValue(blockRuntimeAtom(block.id));
  const store = useStore();
  const { outer: outerStyle, inner: innerStyle } = blockToCSS(block.type, position, runtimeState);

  const mode = runtimeState?.refreshMode || 'load';
  const secs = Math.max(5, runtimeState?.refreshSeconds ?? 60);
  const url = runtimeState?.url;

  // The visitor's browser does the fetching. That is the whole reason this works
  // without a server -- and the reason it only works for APIs that allow it.
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const run = () => { if (!cancelled) fetchDataSource(block.id, store); };
    if (mode === 'load' || mode === 'interval') run();
    if (mode === 'interval') {
      const id = setInterval(run, secs * 1000);
      return () => { cancelled = true; clearInterval(id); };
    }
    return () => { cancelled = true; };
  }, [block.id, url, mode, secs, store]);

  const shown = runtimeState?.fetchError
    ? '—'
    : runtimeState?.loading && runtimeState?.lastFetchedAt === undefined
      ? '…'
      : runtimeState?.outputPath
        ? String(valueAtPath(runtimeState?.lastResponse, runtimeState.outputPath) ?? '—')
        : String(runtimeState?.value ?? '—');

  return (
    <div style={outerStyle}>
      <div style={innerStyle}>{shown}</div>
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

  const loadRowsRef = useRef<() => void>(() => {});
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
            nextValue = computeDatabaseOutput(parsedRows, currentLocalState);
            // Did anything actually change? This runs on first paint AND on every
            // poll, so firing workflows unconditionally would re-run them forever.
            const changed =
              JSON.stringify(currentLocalRows) !== JSON.stringify(parsedRows) ||
              currentLocalState?.value !== nextValue;

            store.set(blockRuntimeAtom(block.id), {
              ...currentLocalState,
              rows: parsedRows,
              value: nextValue
            });
            recalculateAllFormulas(store);

            if (changed) {
              // Without this a visitor sees whatever count was saved into the page
              // rather than the real one: "Count: 2" beside a Number Display of 0.
              executeWorkflow(block.id, 'onChange', store);
              recalculateAllFormulas(store);
            }
          }
        }
      } catch (err) {}
    }
    loadRowsRef.current = loadRows;
    loadRows();
  }, [block.id, outputMode, columns.length, store]);

  usePollWhileVisible(() => loadRowsRef.current());

  // A published Database is display-only. update_database_row and
  // delete_database_row are owner-only, so a visitor pressing edit or delete
  // was always going to be refused; and a direct "+ Add Row" let a stranger
  // write straight past the form the page was designed around. Rows arrive
  // through wired actions (a Submit button -> addRow), which the ownership
  // model does permit.

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
        {/*
          The same message a builder sees in the editor, shown to a VISITOR --
          because on a published page they are the one whose submission was
          refused, and they are the only one who can try again. A row limit
          reached in silence looks exactly like a form that worked.
        */}
        {runtimeState?.error && (
          <div
            style={{
              fontSize: '11px',
              color: '#b91c1c',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '6px 8px',
              lineHeight: 1.4,
              marginBottom: '8px',
            }}
          >
            {runtimeState.error}
          </div>
        )}

        <div style={{ overflowX: 'auto', maxHeight: '160px', overflowY: 'auto', marginBottom: '8px' }}>
          {columns.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>
              No columns defined.
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
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    {columns.map((col: any) => {
                      const cellVal = row[col.name];
                      /*
                        Shared with the editor rather than decided here. This
                        branch knew only about booleans, so when a date column
                        arrived a visitor was shown
                        "2026-08-17T00:00:00.000Z" -- the sixth time this
                        renderer has drifted from the editor by having its own
                        opinion about something.
                      */
                      const display = displayCell(cellVal, col.type);
                      return (
                        <td
                          key={col.name}
                          style={{
                            padding: '6px',
                            fontSize: customFontSize,
                            color: customTextColor,
                            verticalAlign: 'top',
                            wordBreak: 'break-word',
                          }}
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

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
  // Declared for every block rather than inside the image branch, because a
  // hook behind an `if` is a hook that fires in a different order on the next
  // render. Two unused refs cost nothing; a conditional hook costs the page.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  /**
   * A published page is a real route, so navigation is a router push, not the
   * editor's switchPageFn (which is an editor-only concept and does not exist
   * here). useNavigate was imported in this file but never called, so buttons
   * with a target page did nothing at all on published pages.
   */
  const runTrigger = () => {
    // Busy or switched off stops everything, navigation included. The engine
    // guards its own steps; this guards the half that is not a step.
    if (runtimeState?.loading || runtimeState?.disabled) return;
    executeWorkflow(block.id, 'onClick', store);
    recalculateAllFormulas(store);
    const targetPageId = runtimeState?.targetPageId;
    if (targetPageId) {
      // Values built from other blocks on this page, so a "See details" button
      // can carry whatever is selected. Same template shape as a row click.
      const query = buildParamsFromTemplate(runtimeState?.targetParams, blockValuesByName(store));
      navigate(`/view/${targetPageId}${query}`);
    }
  };

  const { outer: outerStyle, inner: innerStyle } = blockToCSS(block.type, position, runtimeState);

  if (block.type === 'buttonBlock') {
    const isBusy = !!runtimeState?.loading;
    const inert = isBusy || !!runtimeState?.disabled;
    return (
      <div style={outerStyle}>
        <button
          style={{
            ...innerStyle,
            ...(inert ? { opacity: 0.6, cursor: isBusy ? 'progress' : 'not-allowed' } : null),
          }}
          disabled={inert}
          aria-busy={isBusy}
          onClick={runTrigger}
        >
          {isBusy && runtimeState?.busyText
            ? runtimeState.busyText
            : block.attrs.label || 'Button'}
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
    /**
     * The same FieldView the editor draws, so a dropdown, a date picker or a
     * set of checkboxes cannot behave differently once published. This block
     * used to hold its own copy of the input, the touched rule and the error
     * line; the copy is gone rather than kept in step by hand.
     */
    return (
      <div style={outerStyle}>
        <FieldView blockId={block.id} style={innerStyle} />
        <FieldError blockId={block.id} />
      </div>
    );
  }

  if (block.type === 'imageBlock') {
    /**
     * The picture, and optionally the way a visitor replaces it.
     *
     * The upload writes the new address into this block's value, which is all
     * it does. A form that wants to keep that address maps this block into a
     * Database column exactly as it would map a text field -- there is no
     * special "file column" concept, because the file is already just a value.
     */
    const url = normalizeImageUrl(runtimeState?.value);
    const isBusy = !!runtimeState?.loading;
    const uploadError = runtimeState?.uploadError || null;
    const isBroken = !!url && brokenUrl === url;
    const canUpload = !!runtimeState?.allowVisitorUpload;
    const clickable = !!runtimeState?.targetPageId || canUpload;

    const boxWidth = runtimeState?.width !== undefined ? runtimeState.width : 240;
    const boxHeight = runtimeState?.height !== undefined ? runtimeState.height : 160;
    const radius = (runtimeState?.borderRadius ?? 8) + 'px';

    return (
      <div style={outerStyle}>
        <div style={{ position: 'relative', width: boxWidth + 'px' }}>
          {canUpload && (
            <input
              ref={fileInputRef}
              type="file"
              accept={IMAGE_MIME_TYPES.join(',')}
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files && e.target.files[0];
                e.target.value = '';
                if (file) await uploadImage(file, block.id, store);
              }}
            />
          )}

          {url && !isBroken ? (
            <img
              src={url}
              alt={runtimeState?.alt || ''}
              style={{ ...innerStyle, cursor: clickable ? 'pointer' : 'default' }}
              onError={() => setBrokenUrl(url)}
              onClick={() => {
                if (isBusy) return;
                if (canUpload) fileInputRef.current?.click();
                runTrigger();
              }}
            />
          ) : (
            <div
              onClick={() => {
                if (isBusy) return;
                if (canUpload) fileInputRef.current?.click();
                runTrigger();
              }}
              style={{
                width: boxWidth + 'px',
                height: boxHeight + 'px',
                borderRadius: radius,
                border: '2px dashed #cbd5e1',
                background: '#f8fafc',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                fontSize: '13px',
                padding: '8px',
                boxSizing: 'border-box',
                cursor: canUpload ? 'pointer' : 'default',
                userSelect: 'none',
              }}
            >
              {canUpload
                ? runtimeState?.uploadHint || 'Choose a picture'
                : isBroken
                  ? runtimeState?.alt || 'This picture could not be loaded'
                  : runtimeState?.alt || ''}
            </div>
          )}

          {isBusy && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: radius,
                background: 'rgba(15,23,42,0.55)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              Uploading...
            </div>
          )}

          {uploadError && (
            <div role="alert" style={{ marginTop: '4px', fontSize: '12px', lineHeight: 1.35, color: '#dc2626' }}>
              {uploadError}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (block.type === 'repeatBlock') {
    // Same component as the editor, so what was designed is what is served.
    // `poll` is on here and off in the editor: a visitor should watch the list
    // grow as other people add to it, which is the shared-state idea working.
    return (
      <div style={outerStyle}>
        <div style={{ ...innerStyle, width: (runtimeState?.width ?? 360) + 'px' }}>
          <RepeatView blockId={block.id} poll interactive onNavigate={(to) => navigate(to)} />
        </div>
      </div>
    );
  }

  if (block.type === 'pageValueBlock') {
    // Deliberately visible. A builder who does not want it on the page hides it
    // with the visible switch, exactly like any other block -- rather than this
    // being a special invisible thing with its own rules.
    return (
      <div style={outerStyle}>
        <div style={innerStyle}>{String(runtimeState?.value ?? '')}</div>
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

  if (block.type === 'visitorBlock') {
    return <PublishedVisitorBlock block={block} />;
  }

  if (block.type === 'customHtmlBlock') {
    // The builder's own markup, with live values in it. Creora imposes no
    // styling of its own here on purpose -- the design is entirely theirs.
    return (
      <div style={outerStyle}>
        <CustomHtmlView blockId={block.id} />
      </div>
    );
  }

  if (block.type === 'dataSourceBlock') {
    return <PublishedDataSourceBlock block={block} />;
  }

  if (block.type === 'shapeBlock') {
    // The same shape, doing whatever job it was given. runTrigger already
    // navigates when targetPageId is set, so Link needs nothing extra.
    const role = runtimeState?.role ?? null;
    const isClickable = role === 'trigger' || role === 'link';
    return (
      <div style={outerStyle}>
        <div
          style={{
            ...innerStyle,
            cursor: isClickable ? 'pointer' : 'default',
          }}
          onClick={() => {
            if (isClickable) runTrigger();
          }}
        >
          {role === 'input' ? (
            <input
              type="text"
              value={String(runtimeState?.value ?? '')}
              onChange={(e) => {
                store.set(blockRuntimeAtom(block.id), {
                  ...runtimeState,
                  value: e.target.value,
                });
                executeWorkflow(block.id, 'onChange', store);
                recalculateAllFormulas(store);
              }}
              placeholder={runtimeState?.text || 'Type something...'}
              style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', color: 'inherit', font: 'inherit', boxSizing: 'border-box' }}
            />
          ) : role === 'display' ? (
            String(runtimeState?.value ?? runtimeState?.text ?? '')
          ) : (
            String(runtimeState?.text ?? runtimeState?.value ?? '')
          )}
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

/**
 * Blocks sit at fixed x/y, which is fine on a monitor and unusable on a phone:
 * the Feedback page put its Submissions table at x=420, entirely off the right
 * edge of a 390px screen. Below `maxWidth` a published page stops using those
 * coordinates and stacks instead. The editor and the desktop view are untouched.
 */
/**
 * Carries the animation class for a block. It sits on the wrapper rather than
 * inside each of the eleven block components: transform and filter apply to
 * descendants, including the absolutely positioned child in the desktop layout,
 * so one element covers every block type in both layouts.
 */
function AnimatedBlock({
  block,
  style,
  className,
}: {
  block: ExtractedBlock;
  style: React.CSSProperties;
  className?: string;
}) {
  const animation = useValueChangeAnimation(block.id);
  const classes = [className, animation].filter(Boolean).join(' ');
  return (
    <div style={style} className={classes || undefined}>
      <RenderedBlock block={block} />
    </div>
  );
}

function useIsNarrow(maxWidth = 640) {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return narrow;
}

// Blocks whose width is not stored explicitly still occupy real space.
const FALLBACK_WIDTH: Record<string, number> = {
  databaseBlock: 400,
  listBlock: 300,
  historyChartBlock: 300,
  timerBlock: 240,
};

/**
 * Reading order for a stacked phone layout.
 *
 * Sorting purely by y is wrong for anything laid out in columns: on the Feedback
 * page the table shares a y with the first input, so it would land between the
 * two form fields. Instead group blocks into columns by whether their horizontal
 * extents overlap, order each column top-to-bottom, then read the columns left to
 * right — the way a person reads a two-column layout on a narrow screen.
 * A single-column page has one group and this degrades to a plain sort by y.
 */
/**
 * The page's blocks, described the way src/lib/layout.ts wants them.
 *
 * Heights are not measured and not guessed: layoutPage returns automatic blocks
 * as an ORDER and lets CSS decide the pixels, precisely because nothing here
 * knows how tall a Text label ended up.
 */
function toStackItems(blocks: ExtractedBlock[], store: any): StackItem[] {
  return blocks.map((b) => {
    const placement = (store.get(blockPositionAtom(b.id)) || { x: 0, y: 0 }) as BlockPlacement;
    const rs = store.get(blockRuntimeAtom(b.id));
    const width = typeof rs?.width === 'number' ? rs.width : (FALLBACK_WIDTH[b.type] ?? 200);
    return { id: b.id, placement, width, height: 0 };
  });
}

export default function PublishedRenderer() {
  const { pageId } = useParams<{ pageId: string }>();
  const location = useLocation();
  const store = useStore();
  const pageNavigate = useNavigate();

  /**
   * Tell the engine how to change page here.
   *
   * The editor has always filled this in; a published page never did, and
   * navigated instead by calling react-router directly inside a block's click
   * handler. Two mechanisms for one idea is the shape that has drifted five
   * times in this codebase -- published tables, the count, form values, the
   * XSS, the columns -- every one of them the editor and the published renderer
   * doing the same thing two ways. `goToPage` uses this seam, so both sides
   * navigate the same way or neither does.
   */
  useEffect(() => {
    /**
     * `() => fn`, not `fn`.
     *
     * jotai's primitive atoms treat a function passed to set() as an UPDATER --
     * it gets called with the previous value and the RESULT is stored. Passing
     * the navigator directly stores whatever calling it returned, and the next
     * caller gets "go is not a function". The editor already knew this; this
     * registration was written without it and a check caught it immediately.
     */
    store.set(switchPageFnAtom, () => async (targetPageId: string) => {
      // The address is preserved, because a page opened WITH a value should be
      // able to hand one on -- the detail-page chain depends on it.
      pageNavigate(`/view/${targetPageId}${window.location.search || ''}`);
    });
    return () => store.set(switchPageFnAtom, null);
  }, [store, pageNavigate]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageName, setPageName] = useState('Untitled');
  const [docItemsList, setDocItemsList] = useState<DocItem[]>([]);
  /** Which page's onLoad workflows have already run in this component. */
  const pageLoadRanFor = useRef<string | null>(null);
  const isNarrow = useIsNarrow(PHONE_MAX_WIDTH);
  const blocksOnPage = useMemo(
    () => docItemsList.flatMap((i) => (i.kind === 'block' ? [i.block] : [])),
    [docItemsList]
  );
  const pageLayout = useMemo(
    () => layoutPage(toStackItems(blocksOnPage, store), isNarrow ? 'phone' : 'base'),
    [blocksOnPage, store, isNarrow]
  );
  const autoBlocks = useMemo(
    () => pageLayout.auto.map((id) => blocksOnPage.find((b) => b.id === id)).filter(Boolean) as ExtractedBlock[],
    [pageLayout, blocksOnPage]
  );
  /**
   * How much room the placed blocks need. Their own heights are unknown, so the
   * lowest authored y plus a generous allowance is the honest answer -- and a
   * builder who places blocks on a phone is choosing to own the arrangement.
   */
  const phoneAreaHeight = useMemo(() => {
    const ys = Object.values(pageLayout.placed).map((p) => p.y + (p.height ?? 80));
    return ys.length ? Math.max(...ys) + 'px' : undefined;
  }, [pageLayout]);
  const placedBlocks = useMemo(
    () => blocksOnPage.filter((b) => pageLayout.placed[b.id] !== undefined),
    [pageLayout, blocksOnPage]
  );

  /**
   * What this page was opened with, published in one place.
   *
   * Set BEFORE the page loads and updated whenever the address changes, so a
   * link from one detail page to another -- next post, related product -- works
   * without a full reload. Setting it to an object rather than leaving it null
   * is what tells every Page value block "this is a real address; stop showing
   * the editor's stand-in".
   */
  useEffect(() => {
    store.set(pageParamsAtom, parseParams(location.search));
    for (const id of (store.get(allBlockIdsAtom) || []) as string[]) {
      // Resolved through the registry, not by matching the start of an id.
      // A string standing in for a type check is the exact thing that once made
      // three block types unsaveable.
      if (nodeTypeFromBlockId(id) === 'pageValueBlock') refreshPageValue(id, store);
    }
  }, [location.search, store, docItemsList]);

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

        const row = data as any
      const blocksData = row.blocks || {};
        const workflowsData = row.workflows || [];
        setPageName(blocksData.pageName || 'Untitled');

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
            // A visitor arrives with a clean form: no red, no button stuck busy,
            // no error left over from whatever the builder was doing at save time.
            store.set(blockRuntimeAtom(id), withoutVisitorState(rState, nodeTypeFromBlockId(id)));
          });
        }

        // Recalculate initial values. Not propagating: a page settling on
        // load is not an event, and the page-load workflows below are the
        // deliberate version of "do something when this opens".
        recalculateAllFormulas(store);

        /**
         * Now the page exists, run whatever is wired to it opening.
         *
         * Guarded by a ref rather than by a flag inside the engine: this effect
         * re-runs whenever pageId or the store identity changes, React mounts
         * effects twice in development, and a page-load workflow that adds a row
         * must add one row. The guard is keyed on the page so that navigating
         * from one published page to another runs the new page's own.
         */
        if (pageLoadRanFor.current !== pageId) {
          pageLoadRanFor.current = pageId ?? null;
          runPageLoadWorkflows(store);
        }
      } catch (err: any) {
        console.error('Failed to load published page:', err);
        setError(err.message || 'Failed to load page');
      } finally {
        setLoading(false);
      }
    };

    fetchPage();
  }, [pageId, store]);

  // The browser tab said "a" - the index.html title - on every published page.
  useEffect(() => {
    if (pageName) document.title = pageName;
  }, [pageName]);

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
        {/* No link back to the editor. A visitor is not the owner, and this page
            is the whole product as far as they are concerned. */}
      </header>

      {/* Canvas view area */}
      <div
        id="editor-container"
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'auto',
          padding: isNarrow ? '16px' : '24px',
        }}
      >
        {isNarrow ? (
          <>
            <style>{`
              .creora-stacked > div { position: static !important; max-width: 100% !important; box-sizing: border-box; }
              .creora-stacked > div > * { max-width: 100%; box-sizing: border-box; }
              .creora-stacked input, .creora-stacked textarea, .creora-stacked select, .creora-stacked table { max-width: 100%; box-sizing: border-box; }
            `}</style>
            {docItemsList.map((item, idx) =>
              item.kind === 'block' ? null : <RenderDocNode key={`n${idx}`} node={item.node} />
            )}

            {/*
              Blocks the builder placed on a phone keep the exact coordinates
              they were given, inside their own positioned area. Everything else
              stacks below in reading order. Two paths in one renderer, not two
              renderers -- the editor calls the same layoutPage.
            */}
            {placedBlocks.length > 0 && (
              <div style={{ position: 'relative', height: phoneAreaHeight }}>
                {placedBlocks.map((block) => {
                  const at = pageLayout.placed[block.id];
                  if (pageLayout.hidden[block.id]) return null;
                  return (
                    <AnimatedBlock
                      key={block.id}
                      block={block}
                      style={{
                        position: 'absolute',
                        left: at.x + 'px',
                        top: at.y + 'px',
                        width: at.width !== undefined ? at.width + 'px' : undefined,
                        height: 0,
                        overflow: 'visible',
                        margin: 0,
                        padding: 0,
                      }}
                    />
                  );
                })}
              </div>
            )}

            {autoBlocks.map((block) =>
              pageLayout.hidden[block.id] ? null : (
                <AnimatedBlock
                  key={block.id}
                  block={block}
                  className="creora-stacked"
                  style={{ marginBottom: '18px' }}
                />
              )
            )}
          </>
        ) : (
          docItemsList.map((item, idx) => {
            if (item.kind === 'block') {
              return (
                <AnimatedBlock
                  key={item.block.id}
                  block={item.block}
                  style={{
                    height: 0,
                    overflow: 'visible',
                    margin: 0,
                    padding: 0,
                  }}
                />
              );
            }
            return <RenderDocNode key={idx} node={item.node} />;
          })
        )}
      </div>

      {/* Every free published page carries this. It is the whole marketing
          budget -- the only way somebody handed a link finds out what made it.
          Deliberately NOT a link into the owner's editor: that was removed for
          good reason. TODO: point at a marketing page once one exists. */}
      <footer
        style={{
          padding: '10px 24px 18px',
          textAlign: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        <a
          href="/"
          style={{
            fontSize: '11px',
            color: '#64748b',
            textDecoration: 'none',
            border: '1px solid #e2e8f0',
            borderRadius: '999px',
            padding: '4px 10px',
            background: '#fff',
            whiteSpace: 'nowrap',
          }}
        >
          Made with <strong style={{ color: '#4f46e5', fontWeight: 600 }}>Creora</strong>
        </a>
      </footer>
    </div>
  );
}
