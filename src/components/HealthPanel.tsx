import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { useMemo } from 'react'
import {
  allBlockIdsAtom,
  blockRuntimeAtom,
  workflowsAtom,
  formulasAtom,
  connectionsAtom,
  selectedBlockIdAtom,
  currentPageIsPublishedAtom,
  pagesListAtom,
  currentPageIdAtom,
} from '../state/atoms'
import { diagnosePage, sortProblems, type Problem } from '../lib/diagnose'

/**
 * The Operations layer: what this page is, and what is wrong with it.
 *
 * The panel is the easy half. The half worth having is the list of references
 * that point at nothing -- a wire into a deleted block, a formula naming a block
 * that no longer exists, a repeater whose search box was removed. None of those
 * throw, none of them log, and the page simply does slightly less than it used
 * to until somebody notices months later.
 */

const COLOURS: Record<Problem['severity'], { dot: string; label: string }> = {
  broken: { dot: '#dc2626', label: 'Broken' },
  warning: { dot: '#d97706', label: 'Worth checking' },
  idle: { dot: '#64748b', label: 'Does nothing yet' },
}

export function HealthPanel({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const blockIds = useAtomValue(allBlockIdsAtom)
  const workflows = useAtomValue(workflowsAtom)
  const formulas = useAtomValue(formulasAtom)
  const connections = useAtomValue(connectionsAtom)
  const isPublished = useAtomValue(currentPageIsPublishedAtom)
  const pagesList = useAtomValue(pagesListAtom)
  const currentPageId = useAtomValue(currentPageIdAtom)
  const setSelected = useSetAtom(selectedBlockIdAtom)

  const problems = useMemo(() => {
    const states: Record<string, any> = {}
    for (const id of blockIds) states[id] = store.get(blockRuntimeAtom(id))
    return sortProblems(diagnosePage({ blockIds, states, workflows, formulas, connections }))
  }, [blockIds, workflows, formulas, connections, store])

  const rowCount = useMemo(() => {
    let total = 0
    for (const id of blockIds) {
      const rows = store.get(blockRuntimeAtom(id))?.rows
      if (Array.isArray(rows)) total += rows.length
    }
    return total
  }, [blockIds, store])

  const pageName = pagesList.find(p => p.id === currentPageId)?.name || 'Untitled'
  const broken = problems.filter(p => p.severity === 'broken').length

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: '380px',
      background: '#0f172a', color: '#e2e8f0', zIndex: 9998,
      borderLeft: '1px solid #334155', overflowY: 'auto',
      fontFamily: 'sans-serif', padding: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <strong style={{ fontSize: '14px' }}>This page</strong>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px' }}
        >
          ×
        </button>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px',
      }}>
        {[
          ['Name', pageName],
          ['Live', isPublished ? 'Published' : 'Private'],
          ['Blocks', String(blockIds.length)],
          ['Wires', String((workflows || []).length)],
          ['Formulas', String((formulas || []).length)],
          ['Rows held', String(rowCount)],
        ].map(([label, value]) => (
          <div key={label} style={{ background: '#1e293b', borderRadius: '6px', padding: '8px' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>{label}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '2px', wordBreak: 'break-word' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '12px', color: broken ? '#fca5a5' : '#86efac', marginBottom: '10px', fontWeight: 600 }}>
        {problems.length === 0
          ? 'Nothing is pointing at anything missing.'
          : broken
            ? `${broken} thing${broken === 1 ? '' : 's'} on this page cannot work`
            : 'Nothing broken, a few things worth a look'}
      </div>

      {problems.map((problem, i) => (
        <div
          key={i}
          onClick={() => problem.blockId && setSelected(problem.blockId)}
          style={{
            background: '#1e293b', borderRadius: '6px', padding: '10px',
            marginBottom: '8px', cursor: problem.blockId ? 'pointer' : 'default',
            borderLeft: `3px solid ${COLOURS[problem.severity].dot}`,
          }}
        >
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: COLOURS[problem.severity].dot, marginBottom: '3px' }}>
            {COLOURS[problem.severity].label}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.3 }}>{problem.title}</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.4, marginTop: '4px' }}>{problem.detail}</div>
          {problem.blockId && (
            <div style={{ fontSize: '11px', color: '#6366f1', marginTop: '6px' }}>Select it →</div>
          )}
        </div>
      ))}

      <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.5, marginTop: '16px' }}>
        Everything here is about a name or an id that points at nothing. Those
        never throw an error and never appear in the run log — the page just
        quietly does less than it used to.
      </div>
    </div>
  )
}
