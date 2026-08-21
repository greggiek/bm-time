'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase-browser';

export default function EmailLoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function continueWithGoogle() {
    setLoading(true);
    setError('');
    const { error: oauthError } = await getBrowserClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: 'bargainmoulding.com', prompt: 'select_account' },
      },
    });
    if (oauthError) { setError(oauthError.message); setLoading(false); }
  }

  return (
    <main className="shell homeShell">
      <section className="card loginChoiceCard" aria-labelledby="email-login-title">
        <div className="brand">BM OS</div>
        <h1 id="email-login-title">Email Log In</h1>
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
