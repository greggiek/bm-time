'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ManagerShell from '@/components/manager-shell';

type Row = {
  id: string;
  name: string;
  location: string;
  jobTitle: string;
  status: 'clocked_in' | 'clocked_out' | 'on_break';
  latest: string | null;
};

type User = {
  name: string;
  role: 'admin' | 'manager';
  locationName: string | null;
  allLocations: boolean;
  canManageEmployees: boolean;
};

type OvertimeEmployee = { id: string; name: string; location: string; jobTitle: string; totalHours: number };
type BranchPositionHours = { location: string; jobTitle: string; totalHours: number; employeeCount: number };
type PayPeriod = { start: string; end: string };

export default function ManagerPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [overtimeWatch, setOvertimeWatch] = useState<OvertimeEmployee[]>([]);
  const [hoursByBranchPosition, setHoursByBranchPosition] = useState<BranchPositionHours[]>([]);
  const [payPeriod, setPayPeriod] = useState<PayPeriod | null>(null);

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
      const next = new URLSearchParams(window.location.search).get('next');
      if (data.user?.role === 'employee') {
        router.push(next === '/api/auth/academy-handoff' ? next : (data.redirectTo || '/portal'));
        router.refresh();
        return;
      }
      if (data.user?.role === 'admin' && next && /^\/admin(?:\/|$)/.test(next)) {
        router.push(next);
        router.refresh();
        return;
      }
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
    setOvertimeWatch(data.overtimeWatch || []);
    setHoursByBranchPosition(data.hoursByBranchPosition || []);
    setPayPeriod(data.payPeriod || null);
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
            <h1>Employee Login</h1>
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
      <div className="dashboardPeriod">Current pay period: <strong>{payPeriod ? `${formatDate(payPeriod.start)} – ${formatDate(payPeriod.end)}` : 'Thursday – Wednesday'}</strong></div>
      <div className="dashboardGrid">
        <section className="managerCard">
          <div className="sectionHeading"><div><h2>Overtime Watch</h2><p>Employees at 35 hours or more</p></div><span className="countBadge">{overtimeWatch.length}</span></div>
          <div className="tableWrap"><table><thead><tr><th>Employee</th><th>Branch</th><th>Position</th><th>Hours</th></tr></thead><tbody>
            {overtimeWatch.map(employee => <tr key={employee.id}><td><strong>{employee.name}</strong></td><td>{employee.location}</td><td>{employee.jobTitle || '—'}</td><td><span className={`hoursBadge ${employee.totalHours >= 40 ? 'over' : ''}`}>{employee.totalHours.toFixed(2)}</span></td></tr>)}
            {overtimeWatch.length === 0 && <tr><td colSpan={4}>No employees are approaching overtime.</td></tr>}
          </tbody></table></div>
        </section>

        <section className="managerCard">
          <div className="sectionHeading"><div><h2>Hours by Branch & Position</h2><p>Current pay-period totals</p></div></div>
          <div className="tableWrap"><table><thead><tr><th>Branch</th><th>Position</th><th>Employees</th><th>Hours</th></tr></thead><tbody>
            {hoursByBranchPosition.map(group => <tr key={`${group.location}-${group.jobTitle}`}><td><strong>{group.location}</strong></td><td>{group.jobTitle}</td><td>{group.employeeCount}</td><td><strong>{group.totalHours.toFixed(2)}</strong></td></tr>)}
            {hoursByBranchPosition.length === 0 && <tr><td colSpan={4}>No completed hours in this pay period yet.</td></tr>}
          </tbody></table></div>
        </section>
      </div>

      <section className="managerCard">
        <div className="sectionHeading"><div><h2>Employee Status</h2><p>Current clock status across your branches</p></div></div>
        <div className="summary">
          <div><strong>{rows.filter((row) => row.status === 'clocked_in').length}</strong><span>Clocked In</span></div>
          <div><strong>{rows.filter((row) => row.status === 'on_break').length}</strong><span>On Break</span></div>
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
                  <td><span className={`pill ${row.status}`}>{row.status === 'on_break' ? 'On Break' : row.status === 'clocked_in' ? 'Clocked In' : 'Clocked Out'}</span></td>
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

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
