'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Access = { system_code: string; access_level: string; scope_type: string; scope_ids: string[] };
type Portal = { user: { name: string; locationName: string | null }; systems: Access[] };

const catalog = {
  time: { name: 'BM Time', description: 'Punch in, take breaks and access your time tools.', href: '/kiosk', action: 'Open Time Clock' },
  academy: { name: 'BM Academy', description: 'Training and learning assigned to your role.', href: '/academy', action: 'Open Academy' },
  warehouse: { name: 'BM Warehouse', description: 'Receiving, transfers and warehouse operations.', href: '/api/auth/warehouse-handoff', action: 'Open Warehouse' },
  sales: { name: 'BM Sales', description: 'Customer, quote and order workflows.', href: null, action: 'Coming soon' },
  prospecting: { name: 'BM Prospecting', description: 'Field prospecting and new-business activity.', href: 'https://greg-playground.vercel.app', action: 'Open Prospecting' },
} as const;

export default function EmployeePortal() {
  const router = useRouter();
  const [portal, setPortal] = useState<Portal | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/portal').then(async response => {
      const data = await response.json();
      if (response.status === 401) return router.replace('/manager');
      if (!response.ok) throw new Error(data.message || 'Unable to load BM OS.');
      setPortal(data);
    }).catch(err => setError(err instanceof Error ? err.message : 'Unable to load BM OS.'));
  }, [router]);

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
      <section className="managerCard"><div className="sectionHeading"><div><h2>Your Systems</h2><p>Access is controlled by your BM OS identity and location permissions.</p></div></div>
        <div className="systemCardGrid">{systems.map(({ access, system }) => {
          const content = <><div className={`systemMark ${access.system_code}`}>{system.name.replace('BM ', '').slice(0,1)}</div><div className="systemCardTop"><h3>{system.name}</h3><span>{access.access_level.replaceAll('_', ' ')}</span></div><p>{system.description}</p><div className={`systemCardAction ${system.href ? 'ready' : ''}`}>{system.action}<span>→</span></div></>;
          return system.href ? <a key={access.system_code} className="systemCard" href={system.href}>{content}</a> : <div key={access.system_code} className="systemCard systemCardPending">{content}</div>;
        })}</div>
      </section>
    </section>
  </main>;
}
