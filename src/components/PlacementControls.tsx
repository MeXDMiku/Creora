import { useAtom, useAtomValue } from 'jotai'
import { blockPositionAtom, editingBreakpointAtom, triggerSaveAtom } from '../state/atoms'
import { useSetAtom } from 'jotai'
import { isPlacedOnPhone } from '../lib/layout'

/**
 * Where this block sits on the size of screen being arranged, and how to give
 * it back.
 *
 * "Automatic until you touch it" is only humane if you can un-touch it. Without
 * a way back, one accidental nudge on the phone layout means hand-placing that
 * block forever, and the builder cannot even tell it happened. This control is
 * the other half of the model, not a convenience.
 */
export function PlacementControls({ blockId }: { blockId: string }) {
  const [placement, setPlacement] = useAtom(blockPositionAtom(blockId))
  const breakpoint = useAtomValue(editingBreakpointAtom)
  const triggerSave = useSetAtom(triggerSaveAtom)

  const placed = isPlacedOnPhone(placement)
  const hiddenHere = breakpoint === 'phone' ? !!placement.phone?.hidden : !!placement.hidden

  const setHidden = (hidden: boolean) => {
    setPlacement((prev) =>
      breakpoint === 'phone'
        ? { ...prev, phone: { ...(prev.phone || {}), hidden } }
        : { ...prev, hidden }
    )
    triggerSave((n) => n + 1)
  }

  const backToAutomatic = () => {
    setPlacement((prev) => {
      const phone = { ...(prev.phone || {}) }
      delete phone.x
      delete phone.y
      // An empty object would still read as "there is a phone placement", so it
      // is removed entirely rather than emptied.
      const isEmpty = Object.keys(phone).length === 0
      const next = { ...prev }
      if (isEmpty) delete next.phone
      else next.phone = phone
      return next
    })
    triggerSave((n) => n + 1)
  }

  return (
    <div style={{
      border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px',
      marginBottom: '12px', background: '#f8fafc',
    }}>
      <div style={{
        fontWeight: 600, fontSize: '12px', textTransform: 'uppercase',
        letterSpacing: '0.5px', color: '#334155', marginBottom: '6px',
      }}>
        {breakpoint === 'phone' ? 'On a phone' : 'On a laptop'}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '8px' }}>
        <input type="checkbox" checked={hiddenHere} onChange={(e) => setHidden(e.target.checked)} />
        Hide it here
      </label>

      {breakpoint === 'phone' && (
        placed ? (
          <>
            <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4, marginBottom: '6px' }}>
              You have placed this yourself, so it stays exactly where you put it.
            </div>
            <button
              type="button"
              onClick={backToAutomatic}
              style={{
                width: '100%', padding: '6px', fontSize: '12px', fontWeight: 600,
                borderRadius: '6px', border: '1px solid #c7d2fe',
                background: '#eef2ff', color: '#4338ca', cursor: 'pointer',
              }}
            >
              Back to automatic
            </button>
          </>
        ) : (
          <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>
            Automatic — it stacks with everything else you have not moved, in
            reading order. Drag it and it stops being automatic.
          </div>
        )
      )}
    </div>
  )
}
