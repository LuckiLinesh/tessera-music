'use client';

import { useEffect, useState } from 'react';

const STEPS = [
  'Open console.cloud.google.com and create a project (any name).',
  'APIs & Services -> Library -> enable "YouTube Data API v3".',
  'APIs & Services -> Credentials -> Create credentials -> API key.',
  'Paste the key below. That is the whole setup.',
];

export default function SettingsPage() {
  const [desktop, setDesktop] = useState(false);
  const [state, setState] = useState({ youtube: false, jamendo: false });
  const [youtubeKey, setYoutubeKey] = useState('');
  const [jamendoId, setJamendoId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      if (res.ok) setState(await res.json());
    } catch {
      /* the panel still renders without live state */
    }
  };

  useEffect(() => {
    setDesktop(Boolean(window.tessera?.saveSettings));
    load();
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const payload = { youtubeKey: youtubeKey.trim(), jamendoId: jamendoId.trim() };
      if (window.tessera?.saveSettings) {
        const result = await window.tessera.saveSettings(payload);
        setState({ youtube: Boolean(result?.youtube), jamendo: Boolean(result?.jamendo) });
        setMessage(result?.ok ? 'Saved. Search again - full songs are live now.' : 'The key was saved but the catalog did not accept it.');
      } else {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setState(await res.json());
          setMessage('Saved for this server process. Set YOUTUBE_API_KEY to keep it after a restart.');
        } else {
          setMessage('Keys can only be changed from the desktop app, or with environment variables.');
        }
      }
    } catch {
      setMessage('Could not save the key.');
    } finally {
      setBusy(false);
    }
  };

  const input = {
    width: '100%',
    background: 'var(--bg-elevated, #1f1f1f)',
    border: '1px solid #ffffff1f',
    borderRadius: 8,
    padding: '10px 12px',
    color: 'var(--text, #fff)',
    fontSize: 14,
  };

  return (
    <div>
      <div className="hero">
        <span className="eyebrow">Settings</span>
        <h1>Playback sources</h1>
        <p className="lede">
          Everything plays without an account. This page only switches on the sources that need a key of your own.
        </p>
      </div>

      <section className="panel" style={{ padding: 20, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>YouTube - full songs for commercial releases</h2>
          <span className={`pill ${state.youtube ? 'pill--ok' : 'pill--warn'}`}>{state.youtube ? 'on' : 'off'}</span>
        </div>
        <p style={{ color: 'var(--text-subdued)', margin: '0 0 14px', lineHeight: 1.6, maxWidth: '70ch' }}>
          With a free YouTube Data API key, any song that has an official upload plays in full inside YouTube&apos;s own
          player - ads included, nothing ripped or proxied. Without it you still get full-length independent and
          public-domain audio, plus 30-second previews.
        </p>
        <ol style={{ color: 'var(--text-subdued)', margin: '0 0 16px 18px', lineHeight: 1.8, fontSize: 13.5 }}>
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <label style={{ display: 'block', fontSize: 12.5, color: 'var(--text-subdued)', marginBottom: 6 }}>
          API key
        </label>
        <input
          type="password"
          value={youtubeKey}
          onChange={(event) => setYoutubeKey(event.target.value)}
          placeholder="AIza..."
          spellCheck={false}
          autoComplete="off"
          style={input}
        />
        <p style={{ fontSize: 12, color: '#8f8f9b', margin: '8px 0 0' }}>
          The key stays on this machine. It is stored by the desktop app and passed to the local catalog server; it is
          never bundled into the build or sent anywhere except Google.
        </p>
      </section>

      <section className="panel" style={{ padding: 20, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Jamendo - Creative Commons full tracks</h2>
          <span className={`pill ${state.jamendo ? 'pill--ok' : 'pill--warn'}`}>{state.jamendo ? 'on' : 'off'}</span>
        </div>
        <p style={{ color: 'var(--text-subdued)', margin: '0 0 14px', lineHeight: 1.6, maxWidth: '70ch' }}>
          A free client id from developer.jamendo.com adds a large catalogue of Creative Commons music that plays and
          downloads in full.
        </p>
        <label style={{ display: 'block', fontSize: 12.5, color: 'var(--text-subdued)', marginBottom: 6 }}>
          Client id
        </label>
        <input
          value={jamendoId}
          onChange={(event) => setJamendoId(event.target.value)}
          placeholder="your Jamendo client id"
          spellCheck={false}
          autoComplete="off"
          style={input}
        />
      </section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
          {busy ? 'Saving...' : 'Save keys'}
        </button>
        {message ? <span style={{ fontSize: 13, color: 'var(--text-subdued)' }}>{message}</span> : null}
        {!desktop ? (
          <span style={{ fontSize: 12.5, color: '#8f8f9b' }}>
            Running in a browser: set <code>YOUTUBE_API_KEY</code> / <code>JAMENDO_CLIENT_ID</code> in{' '}
            <code>catalog/.env.local</code> instead.
          </span>
        ) : null}
      </div>
    </div>
  );
}
