'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Access = { system_code: string; access_level: string; scope_type: string; scope_ids: string[] };
type Portal = { user: { name: string; locationName: string | null }; systems: Access[] };
type Timecard = {
  range: { startDate: string; endDate: string };
  summary: { workedHours: number; breakHours: number; paidTimeOffHours: number; incomplete: boolean };
  punches: Array<{ id: string; action: 'clock_in' | 'clock_out'; occurredAt: string }>;
  paidTimeOff: Array<{ id: string; entryType: 'vacation' | 'sick'; entryDate: string; hours: number; note: string }>;
};

const catalog = {
  time: { name: 'BM Time', description: 'Punch in, take breaks and access your time tools.', href: '/kiosk', action: 'Open Time Clock' },
  academy: { name: 'BM Academy', description: 'Training and learning assigned to your role.', href: '/api/auth/academy-handoff', action: 'Open Academy' },
  warehouse: { name: 'BM Warehouse', description: 'Receiving, transfers and warehouse operations.', href: '/api/auth/warehouse-handoff', action: 'Open Warehouse' },
  sales: { name: 'BM Sales', description: 'Customer, quote and order workflows.', href: null, action: 'Coming soon' },
  prospecting: { name: 'BM Prospecting', description: 'Field prospecting and new-business activity.', href: '/api/auth/prospecting-handoff', action: 'Open Prospecting' },
} as const;

export default function EmployeePortal() {
  const router = useRouter();
  const [portal, setPortal] = useState<Portal | null>(null);
  const [weekStart, setWeekStart] = useState(currentThursday);
  const [timecard, setTimecard] = useState<Timecard | null>(null);
  const [timecardLoading, setTimecardLoading] = useState(true);
  const [timecardError, setTimecardError] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/portal').then(async response => {
      const data = await response.json();
      if (response.status === 401) return router.replace('/manager');
      if (!response.ok) throw new Error(data.message || 'Unable to load BM OS.');
      setPortal(data);
    }).catch(err => setError(err instanceof Error ? err.message : 'Unable to load BM OS.'));
  }, [router]);

  useEffect(() => {
    const endDate = addDays(weekStart, 6);
    setTimecardLoading(true);
    setTimecardError('');
    fetch(`/api/portal/timecard?startDate=${weekStart}&endDate=${endDate}`).then(async response => {
      const data = await response.json();
      if (response.status === 401) return router.replace('/manager');
      if (!response.ok) throw new Error(data.message || 'Unable to load your timecard.');
      setTimecard(data);
    }).catch(err => setTimecardError(err instanceof Error ? err.message : 'Unable to load your timecard.'))
      .finally(() => setTimecardLoading(false));
  }, [router, weekStart]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
    router.refresh();
  }

  if (!portal) return <main className="managerShell"><section className="managerCard loginBox">{error || 'Loading your BM OS…'}</section></main>;
  const systems = portal.systems.map(access => ({ access, system: catalog[access.system_code as keyof typeof catalog] })).filter(item => item.system);
  return <main className="employeePortal">
    <header className="employeePortalHeader"><div><div className="brand">BM OS</div><span>Employee Workspace</span></div><button onClick={logout}>Log Out</button></header>
    <section className="employeePortalBody">
      <div className="osWelcome"><div><span className="osEyebrow">Your Bargain Moulding operating system</span><h2>Welcome, {portal.user.name.split(' ')[0]}.</h2><p>{portal.user.locationName || 'Your assigned workspace'} · Only systems assigned to you are shown.</p></div></div>
      <section className="managerCard employeeTimecard">
        <div className="sectionHeading employeeTimecardHeading"><div><h2>My Timecard</h2><p>Your punches, paid hours, breaks and time off are private to your login.</p></div>
          <div className="timecardWeekNav"><button type="button" onClick={() => setWeekStart(value => addDays(value, -7))}>← Previous</button><strong>{formatRange(weekStart, addDays(weekStart, 6))}</strong><button type="button" onClick={() => setWeekStart(value => addDays(value, 7))} disabled={weekStart >= currentThursday()}>Next →</button></div>
        </div>
        {timecardLoading ? <p className="timecardState">Loading your timecard…</p> : timecardError ? <div className="error">{timecardError}</div> : timecard ? <>
          <div className="summary employeeTimecardSummary"><div><strong>{timecard.summary.workedHours.toFixed(2)}</strong><span>Worked hours</span></div><div><strong>{timecard.summary.breakHours.toFixed(2)}</strong><span>Unpaid breaks</span></div><div><strong>{timecard.summary.paidTimeOffHours.toFixed(2)}</strong><span>Paid time off</span></div><div><strong>{timecard.summary.incomplete ? 'Check' : 'Good'}</strong><span>{timecard.summary.incomplete ? 'Incomplete punch' : 'Punch status'}</span></div></div>
          <div className="employeeTimecardTables">
            <section><h3>Punches</h3><div className="tableWrap"><table><thead><tr><th>Action</th><th>Date</th><th>Time</th></tr></thead><tbody>{timecard.punches.map(punch => { const occurredAt = new Date(punch.occurredAt); return <tr key={punch.id}><td>{punch.action === 'clock_in' ? 'Clock In' : 'Clock Out'}</td><td>{occurredAt.toLocaleDateString()}</td><td>{occurredAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td></tr>; })}{timecard.punches.length === 0 ? <tr><td colSpan={3}>No punches in this week.</td></tr> : null}</tbody></table></div></section>
            <section><h3>Paid Time Off</h3><div className="tableWrap"><table><thead><tr><th>Type</th><th>Date</th><th>Hours</th></tr></thead><tbody>{timecard.paidTimeOff.map(entry => <tr key={entry.id}><td>{entry.entryType === 'vacation' ? 'Vacation' : 'Sick'}</td><td>{formatDate(entry.entryDate)}</td><td>{entry.hours.toFixed(2)}</td></tr>)}{timecard.paidTimeOff.length === 0 ? <tr><td colSpan={3}>No paid time off in this week.</td></tr> : null}</tbody></table></div></section>
          </div>
        </> : null}
      </section>
      <section className="managerCard"><div className="sectionHeading"><div><h2>Your Systems</h2><p>Access is controlled by your BM OS identity and location permissions.</p></div></div>
        <div className="systemCardGrid">{systems.map(({ access, system }) => {
          const content = <><div className={`systemMark ${access.system_code}`}>{system.name.replace('BM ', '').slice(0,1)}</div><div className="systemCardTop"><h3>{system.name}</h3><span>{access.access_level.replaceAll('_', ' ')}</span></div><p>{system.description}</p><div className={`systemCardAction ${system.href ? 'ready' : ''}`}>{system.action}<span>→</span></div></>;
          return system.href ? <a key={access.system_code} className="systemCard" href={system.href}>{content}</a> : <div key={access.system_code} className="systemCard systemCardPending">{content}</div>;
        })}</div>
      </section>
    </section>
  </main>;
}

function currentThursday() {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 3) % 7));
  return dateValue(date);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateValue(date);
}

function dateValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRange(start: string, end: string) {
  return `${formatDate(start)} – ${formatDate(end)}`;
}
