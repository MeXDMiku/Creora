import { useAtom, useSetAtom } from 'jotai'
import { blockRuntimeAtom, triggerSaveAtom } from '../state/atoms'

const fieldStyle: React.CSSProperties = {
  display: 'block', marginTop: '4px', width: '100%', padding: '6px',
  borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box',
  background: '#f8fafc', color: '#0f172a', outline: 'none', fontSize: '13px',
}

const hintStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: 1.4,
}

/**
 * The question, and nothing else.
 *
 * A branch has one setting worth having. Everything a builder needs to know
 * about it is on the canvas: the question is written on the block, and the two
 * ports say YES and NO. This panel exists to write the question and to explain
 * the one thing that is not obvious -- that an unanswerable question fires
 * NEITHER side, rather than quietly taking NO.
 */
export default function BranchBlockInspector({ blockId }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)

  const set = (patch: Record<string, unknown>) => {
    setRuntimeState(prev => ({ ...prev, ...patch }))
    triggerSave(prev => prev + 1)
  }

  const question = String(runtimeState.question || '')

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '12px' }}>
        Block Name
        <input
          type="text"
          value={runtimeState.blockName || ''}
          onChange={(e) => set({ blockName: e.target.value })}
          placeholder="If"
          style={fieldStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        The question
        <input
          type="text"
          value={question}
          onChange={(e) => set({ question: e.target.value })}
          placeholder="Total > 100"
          style={fieldStyle}
        />
        <span style={hintStyle}>
          Written the same way as any other formula. Put a block&apos;s name in
          double braces, or name a table: <code>{'{{Total}} > 100'}</code>.
        </span>
      </label>

      <div style={{
        fontSize: '11px', color: '#334155', background: '#f8fafc',
        border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px', lineHeight: 1.5,
      }}>
        <strong>YES</strong> runs when the question is true, <strong>NO</strong> when it is not.
        {' '}
        {question.trim()
          ? 'Only one side runs each time.'
          : 'Until there is a question here, NEITHER side runs — a branch that cannot be worked out refuses rather than quietly always taking NO.'}
      </div>
    </div>
  )
}
