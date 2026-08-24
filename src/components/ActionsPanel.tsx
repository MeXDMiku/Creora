import { useAtom, useAtomValue, useStore } from 'jotai'
import { useMemo, useState } from 'react'
import { actionsAtom, allBlockIdsAtom } from '../state/atoms'
import { rawTableScope } from '../lib/bindingEngine'
import {
  STEP_WORDS, SERVER_WORDS, describeAction, warningsFor, runAction, toFunction, originOf,
  setAsLines, parseSet,
  type CreoraAction, type ActionStep, type StepKind,
} from '../lib/actions'

/**
 * THE SCREEN AN ACTION IS WRITTEN ON.
 *
 * `actions.ts` could interpret one and compile one, and a builder still could
 * not write one -- an action could only arrive by being typed into a saved page
 * blob by hand. Same gap the Query had between `query.ts` and QuestionsPanel,
 * and it is the whole difference between a primitive that exists and one that
 * is used.
 *
 * WHAT THIS PANEL IS ABOUT, WHICH IS NOT "FILLING IN STEPS"
 * Primitive B exists for one reason: today a page decides the price. The panel
 * therefore has to make the difference between a trusted value and a page value
 * VISIBLE while it is being typed, not report it afterwards. So every value box
 * carries its own origin beside it --
 *
 *     Total = {{Price}} * {{Qty}}        from the table
 *     Total = {{Total}}                  from the page
 *
 * -- because a builder who can see that has already understood the primitive,
 * and one who cannot will read the warning as noise. `warningsFor` still says
 * the sentence; the marker is what makes the sentence land on the right box.
 *
 * WHY THE PREVIEW RUNS ON THE REAL TABLES
 * Every account of every node tool names the per-node preview as the thing that
 * makes it usable. An action written blind is an action you find out about from
 * a stranger. `runAction` writes to a COPY, so the preview cannot reach the
 * store -- which is what makes it safe to run on every keystroke.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * No drag-ordering, no branching, no nesting. Five step words in a list. Fifty
 * years of these tools say a thousand nodes is the same problem as a thousand
 * functions, and the lab's seven sites all came out as these five in a
 * different order.
 *
 * LOG
 * 2026-08-24  Written. Preview is live, origin is per value, and the copy
 *             button says out loud that the action is not running yet.
 */

const NEW_ACTION = (n: number): CreoraAction => ({
  id: `a_${Math.random().toString(36).slice(2, 10)}`,
  name: n === 0 ? 'Do the thing' : `Action ${n + 1}`,
  takes: [],
  steps: [],
})

const NEW_STEP = (kind: StepKind): ActionStep => ({ kind })

const BOX: React.CSSProperties = {
  width: '100%', background: '#0d141c', border: '1px solid #334155', borderRadius: '5px',
  padding: '5px 7px', color: '#e2e8f0', fontSize: '12px', fontFamily: 'ui-monospace, monospace',
}
const LABEL: React.CSSProperties = {
  fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em',
  color: '#64748b', display: 'block', marginBottom: '2px', marginTop: '8px',
}

/** What a step word asks for, so the boxes are the step's own and no others. */
const FIELDS: Record<string, string[]> = {
  'refuse when': ['when', 'message'],
  'remember': ['name', 'table', 'column', 'where'],
  'add row to': ['table', 'set', 'remember'],
  'change rows in': ['table', 'where', 'set'],
  'remove rows from': ['table', 'where'],
}

export function ActionsPanel({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const [actions, setActions] = useAtom(actionsAtom)
  const blockIds = useAtomValue(allBlockIdsAtom)
  const [openId, setOpenId] = useState<string | null>(actions[0]?.id ?? null)
  const [given, setGiven] = useState<Record<string, Record<string, string>>>({})
  const [note, setNote] = useState<string>('')

  /**
   * Read through the same door the page uses, so the tables offered here are the
   * tables the action will actually be answered over. A panel that offers a name
   * the engine cannot resolve is worse than no panel.
   */
  const tables = useMemo(() => {
    void blockIds
    return rawTableScope(store as any)
  }, [store, blockIds, actions])

  const tableNames = Object.keys(tables).filter(n => !n.includes('__'))

  const update = (id: string, patch: Partial<CreoraAction>) =>
    setActions(as => as.map(a => (a.id === id ? { ...a, ...patch } : a)))
  const updateStep = (id: string, i: number, patch: Partial<ActionStep>) =>
    setActions(as => as.map(a => (a.id === id
      ? { ...a, steps: a.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }
      : a)))

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: '440px',
      background: '#0f172a', color: '#e2e8f0', zIndex: 9998,
      borderLeft: '1px solid #334155', overflowY: 'auto',
      fontFamily: 'sans-serif', padding: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: '14px' }}>Actions</strong>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px' }}>x</button>
      </div>
      <p style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.5, margin: '6px 0 12px' }}>
        An action happens <b>where the data is</b>, all of it or none of it. A button runs
        its steps in the browser, so the page decides the price. An action reads the price
        from the table instead &mdash; and if it refuses halfway, nothing it did stays.
      </p>

      {actions.length === 0 && (
        <p style={{ fontSize: '12px', color: '#94a3b8', background: '#1e293b', padding: '10px', borderRadius: '6px' }}>
          Nothing yet. The one worth writing first is the one you would be embarrassed
          to have a stranger do twice &mdash; taking the last seat, spending the last of the stock.
        </p>
      )}

      {actions.map((a) => {
        const open = openId === a.id
        const takes = a.takes || []
        const trial = given[a.id] || {}
        const warnings = warningsFor(a, tables)
        const result = runAction(a, tables, trial)

        /** What this action has read BY this step -- which is what makes a value trusted. */
        const readBy = (upto: number) => {
          const read = new Set<string>()
          const remembered = new Set<string>()
          for (const [i, s] of a.steps.entries()) {
            if (i >= upto) break
            if (s.table && (s.kind === 'remember' || s.kind === 'change rows in' || s.kind === 'remove rows from')) read.add(s.table)
            if (s.kind === 'remember' && s.name) remembered.add(s.name)
            if (s.kind === 'add row to' && s.remember) remembered.add(s.remember)
          }
          return { read, remembered }
        }

        return (
          <div key={a.id} style={{
            background: '#111c2e', border: `1px solid ${warnings.length ? '#7f1d1d' : '#243449'}`,
            borderRadius: '8px', padding: '10px', marginBottom: '10px',
          }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                value={a.name}
                onChange={e => update(a.id, { name: e.target.value })}
                style={{ ...BOX, fontWeight: 600, fontFamily: 'inherit' }}
              />
              <button onClick={() => setOpenId(open ? null : a.id)}
                style={{ background: 'none', border: '1px solid #334155', borderRadius: '5px',
                  color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', fontSize: '11px' }}>
                {open ? 'Hide' : 'Edit'}
              </button>
              <button
                onClick={() => setActions(as => as.filter(o => o.id !== a.id))}
                title="Remove this action"
                style={{ background: 'none', border: '1px solid #334155', borderRadius: '5px',
                  color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', fontSize: '11px' }}>
                x
              </button>
            </div>

            {/* THE SENTENCE. A column of boxes does not read as one. */}
            <p style={{ fontSize: '11px', color: '#8fa8c8', margin: '8px 0 0', lineHeight: 1.5 }}>
              {describeAction(a)}
            </p>

            {open && (
              <div>
                <label style={LABEL}>What a visitor may hand it</label>
                <input
                  value={takes.join(', ')}
                  placeholder="Qty, ProductId"
                  onChange={e => update(a.id, {
                    takes: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  })}
                  style={BOX}
                />
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', lineHeight: 1.5 }}>
                  Everything else must be <b>read from a table</b> or be one of {SERVER_WORDS.join(', ')}.
                </div>

                {a.steps.map((s, i) => {
                  const fields = FIELDS[s.kind] || []
                  const { read, remembered } = readBy(i)
                  return (
                    <div key={i} style={{
                      border: '1px solid #243449', borderRadius: '6px', padding: '8px',
                      marginTop: '10px', background: '#0d1626',
                    }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: '#64748b', width: '38px' }}>Step {i + 1}</span>
                        <select
                          value={s.kind}
                          onChange={e => updateStep(a.id, i, NEW_STEP(e.target.value as StepKind))}
                          style={{ ...BOX, fontFamily: 'inherit' }}
                        >
                          {STEP_WORDS.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <button
                          onClick={() => update(a.id, { steps: a.steps.filter((_, j) => j !== i) })}
                          title="Remove this step"
                          style={{ background: 'none', border: '1px solid #334155', borderRadius: '5px',
                            color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', fontSize: '11px' }}>x</button>
                      </div>

                      {fields.includes('table') && (
                        <>
                          <label style={LABEL}>Which table</label>
                          <select value={s.table ?? ''} onChange={e => updateStep(a.id, i, { table: e.target.value })}
                            style={{ ...BOX, fontFamily: 'inherit' }}>
                            <option value="">&mdash; pick one &mdash;</option>
                            {tableNames.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </>
                      )}
                      {fields.includes('name') && (
                        <>
                          <label style={LABEL}>Call it</label>
                          <input value={s.name ?? ''} placeholder="Left"
                            onChange={e => updateStep(a.id, i, { name: e.target.value })} style={BOX} />
                        </>
                      )}
                      {fields.includes('column') && (
                        <>
                          <label style={LABEL}>Read which column <span style={{ textTransform: 'none', letterSpacing: 0 }}>(blank counts the rows)</span></label>
                          <input value={s.column ?? ''} placeholder="Stock"
                            onChange={e => updateStep(a.id, i, { column: e.target.value })} style={BOX} />
                        </>
                      )}
                      {fields.includes('when') && (
                        <>
                          <label style={LABEL}>Refuse when</label>
                          <input value={s.when ?? ''} placeholder={'{{Qty}} > {{Left}}'}
                            onChange={e => updateStep(a.id, i, { when: e.target.value })} style={BOX} />
                        </>
                      )}
                      {fields.includes('message') && (
                        <>
                          <label style={LABEL}>And say</label>
                          <input value={s.message ?? ''} placeholder="There are not that many left."
                            onChange={e => updateStep(a.id, i, { message: e.target.value })}
                            style={{ ...BOX, fontFamily: 'inherit' }} />
                        </>
                      )}
                      {fields.includes('where') && (
                        <>
                          <label style={LABEL}>
                            Which rows
                            {(s.kind === 'change rows in' || s.kind === 'remove rows from') && !String(s.where ?? '').trim()
                              ? <span style={{ color: '#d97706', textTransform: 'none', letterSpacing: 0 }}> &mdash; blank means every row</span>
                              : null}
                          </label>
                          <input value={s.where ?? ''} placeholder={'{{id}} == {{ProductId}}'}
                            onChange={e => updateStep(a.id, i, { where: e.target.value })} style={BOX} />
                        </>
                      )}
                      {fields.includes('set') && (
                        <>
                          <label style={LABEL}>Set, one per line</label>
                          <textarea
                            value={setAsLines(s.set)} rows={Math.max(2, Object.keys(s.set || {}).length + 1)}
                            placeholder={'Total = {{Price}} * {{Qty}}\nCustomer = Me\nAt = Now'}
                            onChange={e => updateStep(a.id, i, { set: parseSet(e.target.value) })}
                            style={{ ...BOX, resize: 'vertical' }}
                          />
                          {/*
                            THE POINT OF THE WHOLE PRIMITIVE, ON THE BOX THAT
                            DECIDES IT. warningsFor says the sentence; this says
                            WHICH LINE the sentence is about, while it is typed.
                          */}
                          <div style={{ marginTop: '4px' }}>
                            {Object.entries(s.set || {}).map(([column, formula]) => {
                              const origin = originOf(formula, read, tables, remembered)
                              const trusted = origin.anyTrusted
                              return (
                                <div key={column} style={{ fontSize: '10px', lineHeight: 1.6, color: '#64748b' }}>
                                  <code style={{ color: '#94a3b8' }}>{column}</code>
                                  {' '}
                                  <span style={{ color: trusted ? '#4ade80' : '#f59e0b' }}>
                                    {trusted ? 'from the table' : 'from the page'}
                                  </span>
                                  {!trusted && origin.fromPage.length
                                    ? <span> &mdash; a visitor can change {origin.fromPage.join(', ')}</span>
                                    : null}
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}
                      {fields.includes('remember') && (
                        <>
                          <label style={LABEL}>Keep the new row&apos;s id as <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                          <input value={s.remember ?? ''} placeholder="OrderId"
                            onChange={e => updateStep(a.id, i, { remember: e.target.value })} style={BOX} />
                        </>
                      )}
                    </div>
                  )
                })}

                <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                  {STEP_WORDS.map(w => (
                    <button key={w}
                      onClick={() => update(a.id, { steps: [...a.steps, NEW_STEP(w)] })}
                      style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '5px',
                        color: '#cbd5e1', cursor: 'pointer', padding: '5px 8px', fontSize: '11px' }}>
                      + {w}
                    </button>
                  ))}
                </div>

                {takes.length > 0 && (
                  <>
                    <label style={LABEL}>Try it with</label>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {takes.map(t => (
                        <input key={t} value={trial[t] ?? ''} placeholder={t}
                          onChange={e => setGiven(g => ({ ...g, [a.id]: { ...(g[a.id] || {}), [t]: e.target.value } }))}
                          style={{ ...BOX, width: 'auto', flex: '1 1 90px' }} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/*
              WHAT IT WOULD DO. runAction writes to a COPY, so this is safe to
              run on every keystroke and can never reach the store.
            */}
            <div style={{ borderTop: '1px dashed #243449', marginTop: '10px', paddingTop: '8px' }}>
              {a.steps.length === 0
                ? <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                    add a step and this fills in
                  </div>
                : result.ok
                  ? (
                    <div style={{ fontSize: '11px', color: '#cbd5e1', lineHeight: 1.6 }}>
                      {result.changes.length === 0
                        ? <span style={{ color: '#64748b', fontStyle: 'italic' }}>it would do nothing</span>
                        : result.changes.map((c, i) => (
                          <div key={i}>
                            <span style={{ color: '#64748b' }}>{c.at}</span>{' '}
                            {c.kind === 'remember' ? <>remembered <code>{c.name}</code> = {String(c.value)}</>
                              : c.kind === 'add' ? <>would add 1 row to <b>{c.table}</b></>
                              : c.kind === 'change' ? <>would change {c.count} row{c.count === 1 ? '' : 's'} in <b>{c.table}</b></>
                              : <>would remove {c.count} row{c.count === 1 ? '' : 's'} from <b>{c.table}</b></>}
                          </div>
                        ))}
                    </div>
                  )
                  : (
                    <div style={{ fontSize: '11px', color: '#fca5a5', lineHeight: 1.5 }}>
                      would refuse at step {(result.refusedAt ?? 0) + 1}: {result.message}
                      {/*
                        A refusal is not the action failing. It is the action
                        WORKING, and the panel says so -- otherwise every
                        builder's first correct action looks broken.
                      */}
                      <div style={{ color: '#64748b', marginTop: '3px' }}>
                        Nothing before it stays &mdash; a refusal rolls the whole thing back.
                      </div>
                    </div>
                  )}
            </div>

            {warnings.map((w, i) => (
              <div key={i} style={{
                fontSize: '10px', color: '#fbbf24', background: '#2a2010', border: '1px solid #4d3d16',
                borderRadius: '5px', padding: '6px 8px', marginTop: '6px', lineHeight: 1.5,
              }}>{w}</div>
            ))}

            <button
              type="button"
              onClick={() => {
                try {
                  const sql = toFunction(a)
                  navigator.clipboard?.writeText(sql)
                  setNote('Copied. Supabase -> SQL Editor -> paste -> Run. Until you do, this action is written and NOT running.')
                } catch (err: any) {
                  setNote(err?.message || 'That action could not be turned into a migration.')
                }
              }}
              style={{ marginTop: '8px', width: '100%', padding: '7px', borderRadius: '5px',
                border: '1px solid #b91c1c', background: 'none', color: '#fca5a5',
                fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}
            >
              Copy the migration that makes this real
            </button>
          </div>
        )
      })}

      {note && (
        <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 10px' }}>{note}</div>
      )}

      <button
        onClick={() => {
          const a = NEW_ACTION(actions.length)
          setActions(as => [...as, a])
          setOpenId(a.id)
        }}
        style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px',
          color: '#e2e8f0', cursor: 'pointer', padding: '8px', fontSize: '12px', fontWeight: 600 }}
      >
        + Write an action
      </button>
    </div>
  )
}
