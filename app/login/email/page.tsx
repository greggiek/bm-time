'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase-browser';

export default function EmailLoginPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function sendMagicLink() {
    const normalizedEmail = email.trim().toLowerCase();
    const callbackOrigin = window.location.hostname === 'localhost'
      ? 'https://bm-time-git-bm-os-identity-bargain-moulding1.vercel.app'
      : window.location.origin;
    if (!normalizedEmail.endsWith('@bargainmoulding.com')) {
      setError('Use your @bargainmoulding.com email address.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: emailError } = await getBrowserClient().auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${callbackOrigin}/auth/callback`,
      },
    });
    if (emailError) setError(emailError.message);
    else setSent(true);
    setLoading(false);
  }

  return (
    <main className="shell homeShell">
      <section className="card loginChoiceCard" aria-labelledby="email-login-title">
        <div className="brand">BM OS</div>
        <h1 id="email-login-title">Email Log In</h1>
        <p className="emailLoginNotice">We’ll email a secure sign-in link to your Bargain Moulding account.</p>
        <label className="emailLoginField">
          <span>Work email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@bargainmoulding.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && !loading && sendMagicLink()}
          />
        </label>
        <button className="googleLogin" disabled={loading || sent} onClick={sendMagicLink}>
          {loading ? 'Sending…' : sent ? 'Check your email' : 'Email me a login link'}
        </button>
        {sent ? <div className="loginSuccess" aria-live="polite">Login link sent to {email.trim().toLowerCase()}.</div> : null}
        {error ? <div className="error">{error}</div> : null}
        <Link className="loginBack" href="/login">Back to login options</Link>
      </section>
    </main>
  );
}
