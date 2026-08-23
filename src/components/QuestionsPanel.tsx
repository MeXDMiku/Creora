import { useAtom, useAtomValue, useStore } from 'jotai'
import { useMemo, useState } from 'react'
import { queriesAtom, allBlockIdsAtom, blockRuntimeAtom, type NamedQuery } from '../state/atoms'
import { rawTableScope, resolvePageQueries, formulaScope } from '../lib/bindingEngine'
import { previewQuery, KEEP_PHRASES } from '../lib/query'
import { describeNamedQuery, queryNameProblem, pageNamesIn, parseKeep, keepAsLine } from '../lib/queries'

/**
 * THE BOX A BUILDER FILLS IN.
 *
 * `queries.ts` made a question answerable and `tableScope` made the answer
 * readable, and between them a builder still could not write one -- a query
 * could only arrive inside a saved page blob. This panel is the whole
 * difference between a primitive that exists and a primitive that is used.
 *
 * WHAT DECIDED THE SHAPE
 * The single thing every review of every node tool names as what makes them
 * usable is the PER-NODE PREVIEW: n8n's users forgive the rest of it because
 * each node can be run and looked at. A group-by written blind is a group-by
 * you cannot check -- an average over the wrong buckets is not an error, does
 * not look like an error, and sits on a dashboard being wrong. So the rows are
 * on screen while the boxes are being typed, and they are never more than eight.
 *
 * The second thing is the sentence. Eight boxes do not read as a sentence, and
 * somebody checking their own work has to be able to read back what they said.
 * Same reason wireSentence exists.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * No syntax colouring, no autocomplete, no expression builder. The barrier a
 * non-coder hits is not typing -- it is not knowing what is allowed. So every
 * refusal lists what IS allowed, and the keep box carries its seven phrases
 * above it rather than in documentation nobody opens.
 *
 * LOG
 * 2026-08-23  Written. Preview is live and capped at eight rows.
 */

const NEW_QUERY = (n: number): NamedQuery => ({
  id: `q_${Math.random().toString(36).slice(2, 10)}`,
  name: n === 0 ? 'Question' : `Question ${n + 1}`,
  def: { from: '' },
})

const BOX: React.CSSProperties = {
  width: '100%', background: '#0d141c', border: '1px solid #334155', borderRadius: '5px',
  padding: '5px 7px', color: '#e2e8f0', fontSize: '12px', fontFamily: 'ui-monospace, monospace',
}
const LABEL: React.CSSProperties = {
  fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em',
  color: '#64748b', display: 'block', marginBottom: '2px', marginTop: '8px',
}

export function QuestionsPanel({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const [queries, setQueries] = useAtom(queriesAtom)
  const blockIds = useAtomValue(allBlockIdsAtom)
  const [openId, setOpenId] = useState<string | null>(queries[0]?.id ?? null)

  /**
   * The tables a question may be about, and the page values it may mention.
   *
   * Read through the same door the page uses, so the list in the panel is the
   * list the answer will actually be looked up in. A panel that offers a name
   * the engine cannot resolve is worse than no panel.
   */
  const { tables, page, resolved } = useMemo(() => {
    // blockIds is in the deps so this recomputes as blocks come and go; the
    // runtimes are read through the store rather than subscribed one by one.
    void blockIds
    return {
      tables: rawTableScope(store as any),
      page: formulaScope(store as any),
      resolved: resolvePageQueries(store as any),
    }
  }, [store, blockIds, queries])

  const tableNames = Object.keys(tables).filter(n => !n.includes('__'))

  const update = (id: string, patch: Partial<NamedQuery>) =>
    setQueries(qs => qs.map(q => (q.id === id ? { ...q, ...patch } : q)))
  const updateDef = (id: string, patch: Record<string, any>) =>
    setQueries(qs => qs.map(q => (q.id === id ? { ...q, def: { ...q.def, ...patch } } : q)))

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: '420px',
      background: '#0f172a', color: '#e2e8f0', zIndex: 9998,
      borderLeft: '1px solid #334155', overflowY: 'auto',
      fontFamily: 'sans-serif', padding: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: '14px' }}>Questions</strong>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px' }}>×</button>
      </div>
      <p style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.5, margin: '6px 0 12px' }}>
        A question is a table you wrote. Give it a name and the whole page can use it —
        a repeater shows it, a total adds it up, a rule can ask whether it is empty.
      </p>

      {queries.length === 0 && (
        <p style={{ fontSize: '12px', color: '#94a3b8', background: '#1e293b', padding: '10px', borderRadius: '6px' }}>
          Nothing yet. A first one worth trying: <em>everything in a table, grouped by
          one of its columns</em> — that is most dashboards.
        </p>
      )}

      {queries.map((q) => {
        const open = openId === q.id
        const others = new Set([
          ...tableNames,
          ...queries.filter(o => o.id !== q.id).map(o => String(o.name).trim()),
        ])
        const nameProblem = queryNameProblem(q.name, others)
        const failure = resolved.errors[q.id]
        const preview = previewQuery(q.def, { ...tables }, page, 8)
        const wants = pageNamesIn(q.def).filter(n => !(n in page))

        return (
          <div key={q.id} style={{
            background: '#111c2e', border: `1px solid ${failure || nameProblem ? '#7f1d1d' : '#243449'}`,
            borderRadius: '8px', padding: '10px', marginBottom: '10px',
          }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                value={q.name}
                onChange={e => update(q.id, { name: e.target.value })}
                style={{ ...BOX, fontWeight: 600, fontFamily: 'inherit' }}
              />
              <button onClick={() => setOpenId(open ? null : q.id)}
                style={{ background: 'none', border: '1px solid #334155', borderRadius: '5px',
                  color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', fontSize: '11px' }}>
                {open ? 'Hide' : 'Edit'}
              </button>
              <button
                onClick={() => setQueries(qs => qs.filter(o => o.id !== q.id))}
                title="Remove this question"
                style={{ background: 'none', border: '1px solid #334155', borderRadius: '5px',
                  color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', fontSize: '11px' }}>
                ×
              </button>
            </div>

            {/* THE SENTENCE. Eight boxes do not read as one. */}
            <p style={{ fontSize: '11px', color: '#8fa8c8', margin: '8px 0 0', lineHeight: 1.5 }}>
              {describeNamedQuery(q)}
            </p>

            {/*
              ONE SENTENCE, SAID ONCE. The resolver's failure and the preview's
              failure are the same failure seen from two places, and the panel
              showed both — stacked, eight lines apart, in identical red. A
              second copy of a problem reads as a second problem.
            */}
            {nameProblem && <Bad>{nameProblem}</Bad>}
            {!nameProblem && failure && !preview.error && <Bad>{failure}</Bad>}

            {open && (
              <div>
                <label style={LABEL}>About which table</label>
                <select
                  value={typeof q.def.from === 'string' ? q.def.from : ''}
                  onChange={e => updateDef(q.id, { from: e.target.value })}
                  style={{ ...BOX, fontFamily: 'inherit' }}
                >
                  <option value="">— pick one —</option>
                  {tableNames.map(n => <option key={n} value={n}>{n}</option>)}
                  {queries.filter(o => o.id !== q.id && String(o.name).trim())
                    .map(o => <option key={o.id} value={o.name}>{o.name} (a question)</option>)}
                </select>

                <label style={LABEL}>Keep only rows where</label>
                <input value={q.def.where ?? ''} placeholder={'{{Status}} == "open"'}
                  onChange={e => updateDef(q.id, { where: e.target.value })} style={BOX} />

                <label style={LABEL}>What makes two rows the same row</label>
                <input value={q.def.groupBy ?? ''} placeholder={'{{Product}}  ·  left({{At}}, 7)'}
                  onChange={e => updateDef(q.id, { groupBy: e.target.value })} style={BOX} />

                <label style={LABEL}>And for each of those, work out</label>
                <input
                  value={keepAsLine(q.def.keep)}
                  placeholder={'taken = sum of {{Pence}}, sold = count'}
                  onChange={e => updateDef(q.id, { keep: parseKeep(e.target.value) })}
                  style={BOX}
                />
                {/* The seven phrases, where they are needed, not in a manual. */}
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', lineHeight: 1.6 }}>
                  {KEEP_PHRASES.join(' · ')}
                </div>

                <label style={LABEL}>Order by</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input value={q.def.orderBy ?? ''} placeholder={'{{taken}}'}
                    onChange={e => updateDef(q.id, { orderBy: e.target.value })} style={BOX} />
                  <select value={q.def.direction ?? 'asc'}
                    onChange={e => updateDef(q.id, { direction: e.target.value })}
                    style={{ ...BOX, width: 'auto', fontFamily: 'inherit' }}>
                    <option value="asc">smallest first</option>
                    <option value="desc">largest first</option>
                  </select>
                </div>

                <label style={LABEL}>Only the first</label>
                <input value={q.def.limit ?? ''} placeholder="all of them" inputMode="numeric"
                  onChange={e => updateDef(q.id, { limit: e.target.value ? Number(e.target.value) : undefined })}
                  style={BOX} />
              </div>
            )}

            {/*
              WHAT CAME OUT. The one feature every account of these tools names.
              Live, capped, and never allowed to throw -- previewQuery hands back
              its failure instead, because a preview that takes the panel down
              with it is worse than no preview.
            */}
            <div style={{ borderTop: '1px dashed #243449', marginTop: '10px', paddingTop: '8px' }}>
              {preview.error
                ? <Bad>{preview.error}</Bad>
                : preview.rows.length === 0
                  ? <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                      {String(q.def.from ?? '').trim()
                        ? 'answered, and there was nothing'
                        : 'pick a table and this fills in'}
                    </div>
                  : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                      <tbody>
                        <tr>{preview.columns.map(c => (
                          <th key={c} style={{ textAlign: 'left', color: '#64748b', fontWeight: 500,
                            padding: '1px 6px 2px 0', borderBottom: '1px solid #243449' }}>{c}</th>
                        ))}</tr>
                        {preview.rows.map((r, i) => (
                          <tr key={i}>{preview.columns.map(c => (
                            <td key={c} style={{ padding: '1px 6px 1px 0', color: '#cbd5e1' }}>
                              {String(r[c] ?? '').slice(0, 22)}
                            </td>
                          ))}</tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              {/*
                A question about who is looking answers with NOTHING when nobody
                is. That is not an error and does not look like one, so it has to
                be said out loud rather than left as an empty list.
              */}
              {wants.length > 0 && (
                <div style={{ fontSize: '10px', color: '#d97706', marginTop: '5px', lineHeight: 1.5 }}>
                  This asks about {wants.join(', ')}, which the page does not know yet — so
                  it will answer differently once somebody is signed in.
                </div>
              )}
            </div>
          </div>
        )
      })}

      <button
        onClick={() => {
          const q = NEW_QUERY(queries.length)
          setQueries(qs => [...qs, q])
          setOpenId(q.id)
        }}
        style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px',
          color: '#e2e8f0', cursor: 'pointer', padding: '8px', fontSize: '12px', fontWeight: 600 }}
      >
        + Ask something
      </button>
    </div>
  )
}

function Bad({ children }: { children: any }) {
  return (
    <div style={{
      fontSize: '11px', color: '#fca5a5', background: '#2a1416', border: '1px solid #4d2226',
      borderRadius: '5px', padding: '6px 8px', marginTop: '8px', lineHeight: 1.5,
    }}>{children}</div>
  )
}
