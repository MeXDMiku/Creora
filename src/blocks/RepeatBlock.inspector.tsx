import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useMemo } from 'react'
import { blockRuntimeAtom, triggerSaveAtom, getBlockTypeDisplayName, getCanvasBlocks } from '../state/atoms'
import { useStore } from 'jotai'
import { sanitizeHtml } from '../lib/sanitizeHtml'
import { MAX_RENDERED_ROWS } from '../lib/rows'

const fieldStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '4px',
  width: '100%',
  padding: '6px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  boxSizing: 'border-box',
  background: '#f8fafc',
  color: '#0f172a',
  outline: 'none',
  fontSize: '13px',
}

const codeStyle: React.CSSProperties = {
  ...fieldStyle,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '12px',
  lineHeight: 1.5,
  minHeight: '140px',
  resize: 'vertical',
}

const hintStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  color: '#64748b',
  marginTop: '4px',
  lineHeight: 1.4,
}

export default function RepeatBlockInspector({ blockId, editor }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)
  const store = useStore()

  const databases = useMemo(
    () => getCanvasBlocks(editor, store, blockId).filter(b => b.type === 'databaseBlock'),
    [editor, store, blockId, runtimeState]
  )

  const tracked = useAtomValue(blockRuntimeAtom(runtimeState.trackedBlockId || ''))
  const columns = (tracked?.columns || []).map(c => c.name).filter(Boolean)
  const slotNames = [...columns, 'Row number', 'Row id']

  const set = (patch: Record<string, unknown>) => {
    setRuntimeState(prev => ({ ...prev, ...patch }))
    triggerSave(prev => prev + 1)
  }

  // What the sanitiser stripped, said out loud. Silently removing half of
  // somebody's markup and letting them wonder is the worst possible behaviour.
  const cleaned = useMemo(() => sanitizeHtml(runtimeState.rowHtml), [runtimeState.rowHtml])

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '12px' }}>
        Block Name
        <input
          type="text"
          value={runtimeState.blockName || ''}
          onChange={(e) => set({ blockName: e.target.value })}
          placeholder={getBlockTypeDisplayName('repeatBlock')}
          style={fieldStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        Rows come from
        <select
          value={runtimeState.trackedBlockId || ''}
          onChange={(e) => set({ trackedBlockId: e.target.value })}
          style={fieldStyle}
        >
          <option value="">Pick a Database</option>
          {databases.map(b => (
            <option key={b.id} value={b.id}>{b.label}</option>
          ))}
        </select>
        {databases.length === 0 && (
          <span style={hintStyle}>
            There is no Database block on this page yet. Add one, give it columns,
            and it will appear here.
          </span>
        )}
      </label>

      <label style={{ display: 'block', marginBottom: '4px' }}>
        One row looks like this
        <textarea
          value={runtimeState.rowHtml || ''}
          onChange={(e) => set({ rowHtml: e.target.value })}
          spellCheck={false}
          style={codeStyle}
        />
      </label>
      <span style={hintStyle}>
        Your own markup, repeated once per row. Paste a card from anywhere -
        Figma, an AI, a site you liked - and put slots where the data goes.
      </span>

      {slotNames.length > 0 && (
        <div style={{ margin: '8px 0 12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
            Slots you can use
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {slotNames.map(name => (
              <code
                key={name}
                style={{
                  fontSize: '11px',
                  background: '#eef2ff',
                  color: '#4338ca',
                  border: '1px solid #c7d2fe',
                  borderRadius: '4px',
                  padding: '2px 5px',
                }}
              >
                {'{{' + name + '}}'}
              </code>
            ))}
          </div>
          <span style={hintStyle}>
            A slot that is not a column falls back to a block on this page with
            that name, so a card can show a heading or a search term too.
          </span>
        </div>
      )}

      {cleaned.removed.length > 0 && (
        <div style={{ marginBottom: '12px', padding: '8px', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fecaca' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#b91c1c' }}>
            Removed from your markup
          </div>
          <div style={{ fontSize: '11px', color: '#7f1d1d', marginTop: '4px', lineHeight: 1.4 }}>
            {cleaned.removed.join(', ')}
          </div>
          <div style={{ fontSize: '11px', color: '#7f1d1d', marginTop: '4px', lineHeight: 1.4 }}>
            Styling and markup are kept; anything that could run is not. Every
            page is served from one domain, so a script on yours could read a
            visitor's sign-in on someone else's.
          </div>
        </div>
      )}

      <label style={{ display: 'block', marginBottom: '12px' }}>
        When there is nothing to show
        <textarea
          value={runtimeState.emptyHtml || ''}
          onChange={(e) => set({ emptyHtml: e.target.value })}
          spellCheck={false}
          style={{ ...codeStyle, minHeight: '70px' }}
        />
        <span style={hintStyle}>
          An empty list that shows nothing at all reads as broken. This is the
          state everyone forgets and every visitor eventually sees.
        </span>
      </label>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', marginBottom: '12px', background: '#f8fafc' }}>
        <div style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#334155', marginBottom: '8px' }}>
          Which rows, in what order
        </div>

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
          Only rows where
          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
            <select
              value={runtimeState.filterColumn || ''}
              onChange={(e) => set({ filterColumn: e.target.value })}
              style={{ ...fieldStyle, marginTop: 0, flex: 1 }}
            >
              <option value="">(every row)</option>
              {columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text"
              value={runtimeState.filterValue ?? ''}
              onChange={(e) => set({ filterValue: e.target.value })}
              placeholder="equals..."
              style={{ ...fieldStyle, marginTop: 0, flex: 1 }}
            />
          </div>
        </label>

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
          Ordered by
          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
            <select
              value={runtimeState.sortColumn || ''}
              onChange={(e) => set({ sortColumn: e.target.value })}
              style={{ ...fieldStyle, marginTop: 0, flex: 1 }}
            >
              <option value="">(the order they were added)</option>
              {columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={runtimeState.sortDirection || 'asc'}
              onChange={(e) => set({ sortDirection: e.target.value })}
              style={{ ...fieldStyle, marginTop: 0, flex: 1 }}
            >
              <option value="asc">first to last</option>
              <option value="desc">last to first</option>
            </select>
          </div>
          <span style={hintStyle}>
            With no column chosen, "last to first" is newest first, which is what
            a blog or a feed wants. Empty cells always sort to the end.
          </span>
        </label>

        <label style={{ display: 'block', fontSize: '12px' }}>
          At most this many
          <input
            type="number"
            min="1"
            value={runtimeState.maxRows ?? ''}
            onChange={(e) => set({ maxRows: e.target.value === '' ? undefined : Number(e.target.value) })}
            placeholder="all of them"
            style={fieldStyle}
          />
          <span style={hintStyle}>
            Whatever you put here, no more than {MAX_RENDERED_ROWS} are drawn at
            once, and the page says so on screen when it stops short.
          </span>
        </label>
      </div>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Laid out as
        <select
          value={runtimeState.layout || 'list'}
          onChange={(e) => set({ layout: e.target.value })}
          style={fieldStyle}
        >
          <option value="list">A list, stacked</option>
          <option value="grid">A grid</option>
        </select>
      </label>

      {runtimeState.layout === 'grid' && (
        <label style={{ display: 'block', marginBottom: '8px' }}>
          How many across
          <input
            type="number"
            min="1"
            max="12"
            value={runtimeState.gridColumns ?? 3}
            onChange={(e) => set({ gridColumns: Number(e.target.value) })}
            style={fieldStyle}
          />
        </label>
      )}

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Space between: {runtimeState.gap ?? 12}px
        <input
          type="range"
          min="0"
          max="48"
          value={runtimeState.gap ?? 12}
          onInput={(e) => set({ gap: Number((e.target as HTMLInputElement).value) })}
          style={{ display: 'block', marginTop: '4px', width: '100%' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Width (px)
        <input
          type="number"
          value={runtimeState.width ?? ''}
          onChange={(e) => set({ width: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="360"
          style={fieldStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        Clicking a row gives me
        <select
          value={runtimeState.clickColumn || ''}
          onChange={(e) => set({ clickColumn: e.target.value })}
          style={fieldStyle}
        >
          <option value="">(rows are not clickable)</option>
          {columns.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="Row id">Row id</option>
        </select>
        <span style={hintStyle}>
          The clicked row's value lands in this block, then anything wired out of
          it runs. That is how a card opens a page, fills a form, or adds to a
          cart - without a per-row wire.
        </span>
      </label>
    </div>
  )
}
