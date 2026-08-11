'use client';

import { useEffect, useState } from 'react';
import ManagerShell from '@/components/manager-shell';

type Row = {
  id: string;
  name: string;
  location: string;
  jobTitle: string;
  status: string;
  latest: string | null;
};

type User = {
  name: string;
  role: 'admin' | 'manager';
  locationName: string | null;
  allLocations: boolean;
  canManageEmployees: boolean;
};

export default function ManagerPage() {
  const [pin, setPin] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    loadDashboard().catch(() => undefined).finally(() => setChecking(false));
  }, []);

  async function signIn() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/pin-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to sign in.');
      setPin('');
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard() {
    const response = await fetch('/api/manager/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const data = await response.json();
    if (response.status === 401) setUser(null);
    if (!response.ok) throw new Error(data.message || 'Unable to load the dashboard.');
    setRows(data.rows || []);
    setUser(data.user);
  }

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh.');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setRows([]);
    setPin('');
    setError('');
  }

  if (checking) return <main className="managerShell"><section className="managerCard loginBox">Loading management portal…</section></main>;

  if (!user) {
    return (
      <main className="managerShell">
        <header className="managerHeader">
          <div><div className="brand">BM TIME</div><div className="location">Manager Dashboard</div></div>
          <a href="/kiosk">Open Kiosk</a>
        </header>
        <section className="managerCard">
          <div className="loginBox">
            <h1>Manager Login</h1>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="\d{4}"
              placeholder="4-digit PIN"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(event) => event.key === 'Enter' && pin.length === 4 && signIn()}
            />
            <button className="primary" onClick={signIn} disabled={pin.length !== 4 || loading}>
              {loading ? 'Signing in…' : 'Open Dashboard'}
            </button>
            {error && <div className="error">{error}</div>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <ManagerShell brand="BM TIME" title="Dashboard" user={user}>
      <section className="managerCard">
        <div className="summary">
          <div><strong>{rows.filter((row) => row.status === 'clocked_in').length}</strong><span>Clocked In</span></div>
          <div><strong>{rows.length}</strong><span>Active Employees</span></div>
        </div>

        <div className="tableWrap">
          <table>
            <thead><tr><th>Employee</th><th>Location</th><th>Job Title</th><th>Status</th><th>Last Punch</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.location}</td>
                  <td>{row.jobTitle}</td>
                  <td><span className={`pill ${row.status}`}>{row.status === 'clocked_in' ? 'Clocked In' : 'Clocked Out'}</span></td>
                  <td>{row.latest ? new Date(row.latest).toLocaleString() : '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5}>No active employees are available for this account.</td></tr>}
            </tbody>
          </table>
        </div>

        <button className="refresh" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        {error && <div className="error">{error}</div>}
      </section>
    </ManagerShell>
  );
}
