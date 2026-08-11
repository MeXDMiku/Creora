import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Ownership, made visible and made portable.
 *
 * Creora signs every browser in anonymously so auth.uid() exists and pages can
 * have an owner. That identity lives in browser storage, so clearing it — or
 * opening Creora anywhere else — produces a different uid and silently orphans
 * your own pages. That already happened once, on 11 Aug: two anonymous users
 * existed, the pages belonged to the wrong one, and the app loaded empty.
 *
 * Attaching an email fixes it permanently, because Supabase keeps the same
 * user id when an anonymous user is linked to an email — the pages come with
 * it. On another device the same email signs into the same id, so the work
 * follows you.
 *
 * Visitors to a published page are unaffected and still need no account.
 */
export function AccountBadge() {
  const [email, setEmail] = useState<string | null>(null);
  const [isAnon, setIsAnon] = useState(true);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const read = async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data?.user?.email ?? null);
      setIsAnon(!data?.user?.email);
    };
    read();
    const { data: sub } = supabase.auth.onAuthStateChange(() => read());
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = input.trim();
    if (!addr) return;
    setBusy(true);
    setMsg(null);

    const redirect = window.location.origin;

    // First try to attach this email to the CURRENT anonymous user, which keeps
    // the same user id and therefore keeps every page already owned by it.
    const linked = await supabase.auth.updateUser(
      { email: addr },
      { emailRedirectTo: redirect }
    );

    if (!linked.error) {
      setMsg({ kind: 'ok', text: `Confirmation sent to ${addr}. Open it in this browser to finish — your pages stay yours.` });
      setBusy(false);
      return;
    }

    const m = linked.error.message || '';
    if (/rate|too many|429/i.test(m)) {
      setMsg({ kind: 'err', text: 'Supabase allows only 2 auth emails per hour on the built-in mail service. Try again later, or add custom SMTP.' });
      setBusy(false);
      return;
    }

    // Email already belongs to an account: this is a sign-in on a new browser
    // or after storage was cleared. Sign into that account instead; its pages
    // come back with it.
    if (/already|registered|exists|taken/i.test(m)) {
      const otp = await supabase.auth.signInWithOtp({
        email: addr,
        options: { emailRedirectTo: redirect },
      });
      setMsg(
        otp.error
          ? { kind: 'err', text: otp.error.message }
          : { kind: 'ok', text: `Sign-in link sent to ${addr}. Open it in this browser and your pages will load.` }
      );
      setBusy(false);
      return;
    }

    setMsg({ kind: 'err', text: m || 'Could not send the email.' });
    setBusy(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const chip: React.CSSProperties = {
    background: isAnon ? '#fef3c7' : '#dcfce7',
    color: isAnon ? '#92400e' : '#166534',
    border: `1px solid ${isAnon ? '#fcd34d' : '#86efac'}`,
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ position: 'relative' }}>
      <button style={chip} onClick={() => setOpen(o => !o)} title={isAnon ? 'These pages are tied to this browser only' : `Signed in as ${email}`}>
        {isAnon ? 'This browser only' : (email ?? 'Signed in')}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '38px', right: 0, zIndex: 1000,
          width: '320px', background: '#ffffff', color: '#0f172a',
          border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)', fontSize: '13px',
        }}>
          {isAnon ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>Your pages live in this browser</div>
              <div style={{ color: '#475569', lineHeight: 1.5, marginBottom: '10px' }}>
                Clear your browser data, or open Creora anywhere else, and you get a new identity — these pages
                would no longer be yours. Add an email and they follow you instead.
              </div>
              <form onSubmit={submit} style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="email"
                  required
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="you@example.com"
                  style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
                <button type="submit" disabled={busy}
                  style={{ padding: '8px 12px', background: busy ? '#94a3b8' : '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
                  {busy ? '...' : 'Send link'}
                </button>
              </form>
              <div style={{ color: '#64748b', marginTop: '8px', fontSize: '12px' }}>
                No password. If this email already has Creora pages, you'll be signed into that account instead.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>Signed in</div>
              <div style={{ color: '#475569', marginBottom: '10px' }}>
                {email} — your pages will load anywhere you open Creora with this email.
              </div>
              <button onClick={signOut}
                style={{ padding: '8px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                Sign out
              </button>
            </>
          )}

          {msg && (
            <div style={{
              marginTop: '10px', padding: '8px 10px', borderRadius: '6px', lineHeight: 1.45,
              background: msg.kind === 'ok' ? '#ecfdf5' : '#fef2f2',
              color: msg.kind === 'ok' ? '#065f46' : '#991b1b',
              border: `1px solid ${msg.kind === 'ok' ? '#a7f3d0' : '#fecaca'}`,
            }}>
              {msg.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
