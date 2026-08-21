'use client';

import { useEffect, useMemo, useState } from 'react';
import ManagerShell from '@/components/manager-shell';

type User = { name: string; role: 'admin' | 'manager'; canManageEmployees: boolean };
type SystemAccess = { enabled: boolean; level: string; scope: string };
type AccessRow = {
  id: string;
  displayName: string;
  googleEmail: string | null;
  employeeNumber: string | null;
  location: string | null;
  loginMethod: string;
  active: boolean;
  systems: {
    time: SystemAccess;
    academy: SystemAccess;
    warehouse: SystemAccess;
    sales: SystemAccess;
    prospecting: SystemAccess;
  };
};
type Summary = { identities: number; warehouseUsers: number; salesUsers: number; prospectingUsers: number };

const emptySummary: Summary = { identities: 0, warehouseUsers: 0, salesUsers: 0, prospectingUsers: 0 };

function AccessCell({ access }: { access: SystemAccess }) {
  if (!access.enabled) return <span className="accessNone">—</span>;
  return (
    <div className="systemAccess">
      <span className="accessPill accessGranted">{access.level}</span>
      <span>{access.scope}</span>
    </div>
  );
}

export default function AccessPage() {
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [search, setSearch] = useState('');
  const [loginFilter, setLoginFilter] = useState('All');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session').then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (data.user.role !== 'admin') return;
      setUser(data.user);
      const accessResponse = await fetch('/api/admin/access');
      const accessData = await accessResponse.json();
      if (!accessResponse.ok) throw new Error(accessData.message || 'Unable to load identity access.');
      setRows(accessData.rows || []);
      setSummary(accessData.summary || emptySummary);
    }).catch(err => setError(err instanceof Error ? err.message : 'Unable to load identity access.'))
      .finally(() => setChecking(false));
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(row => {
      const matchesLogin = loginFilter === 'All' || row.loginMethod === loginFilter;
      const systemTerms = Object.values(row.systems).flatMap(access => [access.level, access.scope]);
      const haystack = [row.displayName, row.googleEmail, row.employeeNumber, row.location, ...systemTerms]
        .filter(Boolean).join(' ').toLowerCase();
      return matchesLogin && (!query || haystack.includes(query));
    });
  }, [rows, search, loginFilter]);

  if (checking) return <main className="managerShell"><section className="managerCard loginBox">Loading identity access…</section></main>;
  if (!user) return <main className="managerShell"><section className="managerCard loginBox"><h1>Administrator Access Required</h1><p>Sign in through the Manager Dashboard with an administrator PIN.</p>{error ? <div className="error">{error}</div> : null}</section></main>;

  return (
    <ManagerShell brand="BM OS" title="Identity & Access" user={user}>
      <div className="summary">
        <div><strong>{summary.identities}</strong><span>Identities</span></div>
        <div><strong>{summary.warehouseUsers}</strong><span>BM Warehouse</span></div>
        <div><strong>{summary.salesUsers}</strong><span>BM Sales</span></div>
        <div><strong>{summary.prospectingUsers}</strong><span>BM Prospecting</span></div>
      </div>

      <section className="managerCard">
        <div className="sectionHeading">
          <div>
            <h2>System Access</h2>
            <p>System access is assigned directly. Job title and primary location do not silently grant software access.</p>
          </div>
          <div className="accessTools">
            <input
              aria-label="Search identities"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search people, locations or access"
            />
            <select aria-label="Filter by login method" value={loginFilter} onChange={event => setLoginFilter(event.target.value)}>
              <option>All</option><option>PIN</option><option>Google</option><option>Google + PIN</option><option>None</option>
            </select>
          </div>
        </div>
        {error ? <div className="error">{error}</div> : null}
        <div className="tableWrap accessTableWrap">
          <table className="accessMatrix">
            <thead>
              <tr>
                <th>Identity</th>
                <th>Login</th>
                <th>Location</th>
                <th>BM Time</th>
                <th>BM Academy</th>
                <th>BM Warehouse</th>
                <th>BM Sales</th>
                <th>BM Prospecting</th>
              </tr>
            </thead>
            <tbody>{filteredRows.map(row => (
              <tr key={row.id}>
                <td>
                  <strong>{row.displayName}</strong>
                  <div className="cellMeta">{row.googleEmail || row.employeeNumber || 'No linked login'}</div>
                </td>
                <td><span className="accessPill">{row.loginMethod}</span></td>
                <td>{row.location || '—'}</td>
                <td><AccessCell access={row.systems.time} /></td>
                <td><AccessCell access={row.systems.academy} /></td>
                <td><AccessCell access={row.systems.warehouse} /></td>
                <td><AccessCell access={row.systems.sales} /></td>
                <td><AccessCell access={row.systems.prospecting} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </ManagerShell>
  );
}
