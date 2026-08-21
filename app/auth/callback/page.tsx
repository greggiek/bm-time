'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase-browser';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState('Finishing your BM OS login…');
  useEffect(() => {
    async function finishLogin() {
      const supabase = getBrowserClient();
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) return setMessage('Email login could not be completed. Return to login and try again.');
      const response = await fetch('/api/auth/google-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessToken: data.session.access_token }) });
      const result = await response.json();
      if (!response.ok) { await supabase.auth.signOut(); return setMessage(result.message || 'This email is not authorized for BM OS.'); }
      router.replace(result.redirectTo || '/manager');
      router.refresh();
    }
    finishLogin().catch(() => setMessage('Email login could not be completed.'));
  }, [router]);
  return <main className="shell"><section className="card loginChoiceCard"><div className="brand">BM OS</div><p>{message}</p></section></main>;
}
