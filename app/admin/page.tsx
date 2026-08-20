'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ManagerShell from '@/components/manager-shell';

type User = { name: string; role: 'admin' | 'manager'; locationName?: string | null; allLocations?: boolean; canManageEmployees?: boolean };
type Overview = {
  identities: number; activeEmployees: number; clockedIn: number; onBreak: number;
  systems: Record<'time' | 'academy' | 'warehouse' | 'sales' | 'prospecting', number>;
};
const emptyOverview: Overview = { identities: 0, activeEmployees: 0, clockedIn: 0, onBreak: 0, systems: { time: 0, academy: 0, warehouse: 0, sales: 0, prospecting: 0 } };
const systems = [
  { key: 'time', name: 'BM Time', description: 'Time clock, breaks, timecards and labor visibility.', href: '/manager', action: 'Open Time' },
  { key: 'academy', name: 'BM Academy', description: 'Employee onboarding, training and assigned learning.', href: '/academy', action: 'Open Academy' },
  { key: 'warehouse', name: 'BM Warehouse', description: 'Purchasing, transfers, receiving and fulfillment.', href: null, action: 'Integration queued' },
  { key: 'sales', name: 'BM Sales', description: 'Customer, quote, order and approval workflows.', href: null, action: 'Integration queued' },
  { key: 'prospecting', name: 'BM Prospecting', description: 'Field prospecting, activity and new-business tracking.', href: 'https://greg-playground.vercel.app', action: 'Open Prospecting' },
] as const;

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetch('/api/auth/session'), fetch('/api/admin/overview')])
      .then(async ([sessionResponse, overviewResponse]) => {
        const sessionData = await sessionResponse.json();
        if (!sessionResponse.ok || sessionData.user?.role !== 'admin') return;
        setUser(sessionData.user);
        const overviewData = await overviewResponse.json();
        if (!overviewResponse.ok) throw new Error(overviewData.message || 'Unable to load BM OS.');
        setOverview(overviewData);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Unable to load BM OS.'))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <main className="managerShell"><section className="managerCard loginBox">Loading BM OS…</section></main>;
  if (!user) return <main className="managerShell"><section className="managerCard loginBox"><h1>Administrator Access Required</h1><p>Sign in through the Manager Dashboard with an administrator PIN.</p></section></main>;

  return <ManagerShell brand="BM OS" title="Company Overview" user={user}>
    <div className="osWelcome">
      <div><span className="osEyebrow">Bargain Moulding operating system</span><h2>Good afternoon, {user.name.split(' ')[0]}.</h2><p>One place to see your people, systems and day-to-day operation.</p></div>
      <Link className="osAccessLink" href="/admin/access">Manage Identity &amp; Access</Link>
    </div>
    <div className="summary osSummary">
      <div><strong>{overview.identities}</strong><span>Company Identities</span></div>
      <div><strong>{overview.activeEmployees}</strong><span>Active Employees</span></div>
      <div><strong>{overview.clockedIn}</strong><span>Working Now</span></div>
      <div><strong>{overview.onBreak}</strong><span>On Break</span></div>
    </div>
    {error ? <div className="error">{error}</div> : null}
    <section className="managerCard">
      <div className="sectionHeading"><div><h2>Your Systems</h2><p>Live access totals from the BM OS identity roster.</p></div><span className="osLive"><i /> Live development data</span></div>
      <div className="systemCardGrid">{systems.map(system => {
        const content = <><div className={`systemMark ${system.key}`}>{system.name.replace('BM ', '').slice(0, 1)}</div><div className="systemCardTop"><h3>{system.name}</h3><span>{overview.systems[system.key]} users</span></div><p>{system.description}</p><div className={`systemCardAction ${system.href ? 'ready' : ''}`}>{system.action}<span>→</span></div></>;
        return system.href ? <Link key={system.key} href={system.href} className="systemCard">{content}</Link> : <div key={system.key} className="systemCard systemCardPending">{content}</div>;
      })}</div>
    </section>
  </ManagerShell>;
}
