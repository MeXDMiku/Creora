import { useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { supabase } from '../lib/supabase';
import { currentPageIsPublishedAtom, currentPageIdAtom } from '../state/atoms';

/**
 * The button that makes a page real to somebody else.
 *
 * set_page_published() has worked in the database since the identity migration
 * — private by default, owner-only to change, visitors able to read and submit
 * to a published page but nothing else. Nothing in the interface called it, so
 * publishing meant hand-calling an RPC.
 */
export function PublishButton() {
  const pageId = useAtomValue(currentPageIdAtom);
  const [isPublished, setIsPublished] = useAtom(currentPageIsPublishedAtom);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareUrl = `${window.location.origin}/view/${pageId}`;

  const toggle = async (next: boolean) => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('set_page_published', {
      p_id: pageId,
      p_published: next,
    });
    if (error) {
      setError(error.message);
    } else {
      setIsPublished(next);
      setOpen(next);
    }
    setBusy(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy. Select the link and copy it manually.');
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => (isPublished ? setOpen(o => !o) : toggle(true))}
        disabled={busy}
        title={isPublished ? 'This page is live' : 'Publish so anyone with the link can use it'}
        style={{
          padding: '8px 14px',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 700,
          cursor: busy ? 'default' : 'pointer',
          border: 'none',
          background: busy ? '#94a3b8' : isPublished ? '#dcfce7' : '#0f172a',
          color: busy ? '#fff' : isPublished ? '#166534' : '#ffffff',
          boxShadow: isPublished ? 'inset 0 0 0 1px #86efac' : 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {busy ? 'Working…' : isPublished ? '● Live' : 'Publish'}
      </button>

      {open && isPublished && (
        <div style={{
          position: 'absolute', top: '40px', right: 0, zIndex: 1000, width: '340px',
          background: '#fff', color: '#0f172a', border: '1px solid #e2e8f0',
          borderRadius: '10px', padding: '14px', boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          fontSize: '13px',
        }}>
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>This page is live</div>
          <div style={{ color: '#475569', lineHeight: 1.5, marginBottom: '10px' }}>
            Anyone with the link can open it and use it — press buttons, submit rows. They cannot
            edit it, and they cannot see your other pages.
          </div>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <input
              readOnly
              value={shareUrl}
              onFocus={e => e.currentTarget.select()}
              style={{
                flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px',
                fontSize: '12px', fontFamily: 'monospace', background: '#f8fafc',
              }}
            />
            <button onClick={copy} style={{
              padding: '8px 12px', background: copied ? '#16a34a' : '#4f46e5', color: '#fff',
              border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer',
            }}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <a href={shareUrl} target="_blank" rel="noreferrer" style={{
              flex: 1, textAlign: 'center', padding: '8px', borderRadius: '6px',
              background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a',
              textDecoration: 'none', fontWeight: 600,
            }}>
              Open it
            </a>
            <button onClick={() => toggle(false)} disabled={busy} style={{
              flex: 1, padding: '8px', borderRadius: '6px', background: '#fff',
              border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 600, cursor: 'pointer',
            }}>
              Unpublish
            </button>
          </div>

          {error && (
            <div style={{
              marginTop: '10px', padding: '8px 10px', borderRadius: '6px',
              background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
            }}>{error}</div>
          )}
        </div>
      )}

      {error && !open && (
        <div style={{
          position: 'absolute', top: '40px', right: 0, zIndex: 1000, width: '260px',
          padding: '8px 10px', borderRadius: '6px', fontSize: '12px',
          background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
        }}>{error}</div>
      )}
    </div>
  );
}
