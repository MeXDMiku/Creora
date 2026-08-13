import { useState } from 'react'
import { FILTERS } from '../lib/format'

/**
 * The list of filters, in both places that have a template box.
 *
 * One component rather than two copies, for the same reason everything else
 * here is one thing: the day a filter is added, a second copy is the one that
 * does not get it.
 *
 * Closed by default. A builder who has not met filters yet does not need a
 * fifteen-row table in the way of the box they are typing in.
 */
export function FilterHelp() {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ marginBottom: '12px' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          border: '1px solid #e2e8f0',
          background: '#f8fafc',
          borderRadius: '6px',
          padding: '6px 8px',
          fontSize: '12px',
          fontWeight: 600,
          color: '#334155',
          cursor: 'pointer',
        }}
      >
        {open ? '▾' : '▸'} Formatting a value
      </button>

      {open && (
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 6px 6px', padding: '8px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4, marginBottom: '8px' }}>
            Add a pipe inside the braces. They chain, left to right, so
            {' '}<code>{'{{now | plus: 7 days | date: dddd}}'}</code> gives you a weekday.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <tbody>
              {FILTERS.map(f => (
                <tr key={f.name} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '4px 4px 4px 0', verticalAlign: 'top' }}>
                    <code style={{ color: '#4338ca', whiteSpace: 'nowrap' }}>{f.example}</code>
                  </td>
                  <td style={{ padding: '4px 0', color: '#64748b', verticalAlign: 'top' }}>{f.does}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4, marginTop: '8px' }}>
            Date pieces: <code>YYYY YY MMMM MMM MM M DD D dddd ddd HH H hh h mm ss a A</code>.
            Put your own words in square brackets — <code>[at]</code> — or the
            letters in them get read as date pieces.
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4, marginTop: '6px' }}>
            <code>{'{{now}}'}</code> and <code>{'{{today}}'}</code> always work,
            unless something on the page is actually called that.
          </div>
        </div>
      )}
    </div>
  )
}
