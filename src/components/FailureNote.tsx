/**
 * The one red line that says why something did not happen.
 *
 * WHY IT IS A COMPONENT AND NOT FOUR COPIES OF A DIV
 * It started as one -- the Database block, when a row write was refused. Then
 * the published renderer needed the same line for the same reason (a visitor is
 * the only one who can try again), then the Button needed it, because an action
 * refuses ON PURPOSE and the person who was refused is looking at the button
 * they pressed, not at a table somewhere else on the page.
 *
 * Four near-identical divs is how the editor and the published renderer drifted
 * apart the first time, and `npm run check` has a guard that counts exactly this
 * and went red the moment the fourth was written. So: one line, one place.
 *
 * `onDismiss` is optional because only the editor has anywhere sensible to put
 * a dismiss button. A visitor should not be able to tidy away the reason their
 * submission did not save.
 */
export function FailureNote({
  message,
  onDismiss,
  onPointerDown,
}: {
  message?: string | null;
  onDismiss?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  if (!message) return null;
  return (
    <div
      contentEditable={false}
      onPointerDown={onPointerDown}
      style={{
        marginTop: '6px',
        fontSize: '11px',
        color: '#b91c1c',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '6px',
        padding: '6px 8px',
        lineHeight: 1.4,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '6px',
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            border: 'none', background: 'transparent', color: '#b91c1c',
            cursor: 'pointer', fontSize: '12px', lineHeight: 1, padding: 0,
          }}
          title="Dismiss"
        >
          &#10005;
        </button>
      )}
    </div>
  );
}
