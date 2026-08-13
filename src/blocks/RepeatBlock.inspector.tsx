import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useMemo } from 'react'
import { blockRuntimeAtom, triggerSaveAtom, getBlockTypeDisplayName, getCanvasBlocks } from '../state/atoms'
import { useStore } from 'jotai'
import { sanitizeHtml } from '../lib/sanitizeHtml'
import { MAX_RENDERED_ROWS } from '../lib/rows'
import { FilterHelp } from '../components/FilterHelp'
import { pagesListAtom, currentPageIdAtom } from '../state/atoms'

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
  const pagesList = useAtomValue(pagesListAtom)
  const currentPageId = useAtomValue(currentPageIdAtom)

  const allBlocks = useMemo(
    () => getCanvasBlocks(editor, store, blockId),
    [editor, store, blockId, runtimeState]
  )
  const databases = allBlocks.filter(b => b.type === 'databaseBlock')
  // Anything can drive a control: an Input for search, a Toggle for direction,
  // a Shape acting as a category button. Filtering the list to "sensible" types
  // would be a ceiling, and there is no way to guess what someone will wire.
  const otherBlocks = allBlocks.filter(b => b.type !== 'databaseBlock')

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

      <FilterHelp />

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
          Search
        </div>

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
          Search box
          <select
            value={runtimeState.searchBlockId || ''}
            onChange={(e) => set({ searchBlockId: e.target.value })}
            style={fieldStyle}
          >
            <option value="">(no search)</option>
            {otherBlocks.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <span style={hintStyle}>
            Point this at an Input block and whatever a visitor types narrows the
            list as they type. Every word has to appear somewhere in the row, but
            not in the same column — "ada lon" finds Ada in London.
          </span>
        </label>

        <label style={{ display: 'block', fontSize: '12px' }}>
          Looking at
          <select
            multiple
            size={Math.min(5, Math.max(2, columns.length))}
            value={runtimeState.searchColumns || []}
            onChange={(e) =>
              set({ searchColumns: Array.from(e.target.selectedOptions).map(o => o.value) })
            }
            style={{ ...fieldStyle, height: 'auto' }}
          >
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span style={hintStyle}>
            Nothing selected means every column, which is usually what you want.
          </span>
        </label>
      </div>

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
              <option value="Row id">Row id</option>
            </select>
            <select
              value={runtimeState.filterOperator || 'equals'}
              onChange={(e) => set({ filterOperator: e.target.value })}
              style={{ ...fieldStyle, marginTop: 0, flex: 1 }}
            >
              <option value="equals">is</option>
              <option value="notEquals">is not</option>
              <option value="contains">contains</option>
              <option value="notContains">does not contain</option>
              <option value="greaterThan">is more than</option>
              <option value="lessThan">is less than</option>
              <option value="greaterOrEqual">is at least</option>
              <option value="lessOrEqual">is at most</option>
              <option value="isEmpty">is empty</option>
              <option value="isNotEmpty">is not empty</option>
            </select>
          </div>
        </label>

        {runtimeState.filterColumn && (
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
            Compared with
            <select
              value={runtimeState.filterBlockId || ''}
              onChange={(e) => set({ filterBlockId: e.target.value })}
              style={fieldStyle}
            >
              <option value="">a fixed value</option>
              {otherBlocks.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
            {!runtimeState.filterBlockId && (
              <input
                type="text"
                value={runtimeState.filterValue ?? ''}
                onChange={(e) => set({ filterValue: e.target.value })}
                placeholder="the value"
                style={fieldStyle}
              />
            )}
            <span style={hintStyle}>
              Point it at a block and a visitor controls it — a dropdown of
              categories, a toggle for "in stock only". A blank value means no
              filter at all, so an empty box shows everything rather than nothing.
            </span>
          </label>
        )}

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

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
          Let a visitor choose the order
          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
            <select
              value={runtimeState.sortColumnBlockId || ''}
              onChange={(e) => set({ sortColumnBlockId: e.target.value })}
              style={{ ...fieldStyle, marginTop: 0, flex: 1 }}
            >
              <option value="">column: fixed above</option>
              {otherBlocks.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
            <select
              value={runtimeState.sortDirectionBlockId || ''}
              onChange={(e) => set({ sortDirectionBlockId: e.target.value })}
              style={{ ...fieldStyle, marginTop: 0, flex: 1 }}
            >
              <option value="">direction: fixed above</option>
              {otherBlocks.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </div>
          <span style={hintStyle}>
            A block whose value is a column name, and a Toggle where on means
            last-to-first. Either one overrides the fixed setting above.
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
            Ignored once pages are on. Without either, no more than
            {' '}{MAX_RENDERED_ROWS} are drawn at once and the page says so.
          </span>
        </label>
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', marginBottom: '12px', background: '#f8fafc' }}>
        <div style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#334155', marginBottom: '8px' }}>
          Pages
        </div>

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
          Rows per page
          <input
            type="number"
            min="0"
            value={runtimeState.pageSize ?? ''}
            onChange={(e) => set({ pageSize: e.target.value === '' ? 0 : Number(e.target.value) })}
            placeholder="0 — no pages"
            style={fieldStyle}
          />
          <span style={hintStyle}>
            Turning this on is what makes a table of 500 rows usable. Searching
            or re-sorting always returns to page one, because page four of the
            old results is an empty page that reads as "nothing found".
          </span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '12px' }}>
          <input
            type="checkbox"
            checked={runtimeState.showPager !== false}
            onChange={(e) => set({ showPager: e.target.checked })}
          />
          Show Previous / Next
        </label>

        {runtimeState.showPager !== false && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              type="text"
              value={runtimeState.prevLabel ?? ''}
              onChange={(e) => set({ prevLabel: e.target.value })}
              placeholder="Previous"
              style={{ ...fieldStyle, marginTop: 0, flex: 1 }}
            />
            <input
              type="text"
              value={runtimeState.nextLabel ?? ''}
              onChange={(e) => set({ nextLabel: e.target.value })}
              placeholder="Next"
              style={{ ...fieldStyle, marginTop: 0, flex: 1 }}
            />
          </div>
        )}
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

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', marginBottom: '12px', background: '#f8fafc' }}>
        <div style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#334155', marginBottom: '8px' }}>
          Clicking a row opens a page
        </div>

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
          Go to
          <select
            value={runtimeState.clickTargetPageId || ''}
            onChange={(e) => set({ clickTargetPageId: e.target.value })}
            style={fieldStyle}
          >
            <option value="">(stay here)</option>
            {pagesList.filter(p => p.id !== currentPageId).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        {runtimeState.clickTargetPageId && (
          <label style={{ display: 'block', fontSize: '12px' }}>
            Carrying
            <input
              type="text"
              value={runtimeState.clickParams ?? ''}
              onChange={(e) => set({ clickParams: e.target.value })}
              placeholder="id={{Row id}}"
              style={fieldStyle}
            />
            <span style={hintStyle}>
              Put a Page value block on the other page reading <code>id</code>,
              and point its repeater's filter at that block: you have a detail
              page. Slots and filters work here, so
              {' '}<code>{'id={{Row id}}&title={{Name}}'}</code> is fine, and a
              value containing an ampersand cannot break the link.
            </span>
          </label>
        )}
      </div>

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
