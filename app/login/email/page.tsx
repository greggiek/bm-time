'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase-browser';

export default function EmailLoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function continueWithGoogle() {
    const callbackOrigin = window.location.hostname === 'localhost'
      ? 'https://bm-time-git-bm-os-identity-bargain-moulding1.vercel.app'
      : window.location.origin;
    setLoading(true);
    setError('');
    const requestedNext = new URLSearchParams(window.location.search).get('next');
    const next = requestedNext && /^\/(?:admin(?:\/|$)|manager(?:\/|$))/.test(requestedNext) ? requestedNext : '/admin';
    const { error: oauthError } = await getBrowserClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${callbackOrigin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { hd: 'bargainmoulding.com', prompt: 'select_account' },
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  return (
    <main className="shell homeShell">
      <section className="card loginChoiceCard" aria-labelledby="email-login-title">
        <div className="brand">BM OS</div>
        <h1 id="email-login-title">Google Workspace Login</h1>
        <p className="emailLoginNotice">Use your Bargain Moulding Google account.</p>
        <button className="googleLogin" disabled={loading} onClick={continueWithGoogle}>
          {loading ? 'Opening Google…' : 'Continue with Google'}
        </button>
        {error ? <div className="error">{error}</div> : null}
        <Link className="loginBack" href="/login">Back to login options</Link>
      </section>
    </main>
  );
}
