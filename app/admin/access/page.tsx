'use client';

import { useEffect, useMemo, useState } from 'react';
import ManagerShell from '@/components/manager-shell';

type User = { name: string; role: 'admin' | 'manager'; canManageEmployees: boolean };
type AccessRow = {
  id: string;
  displayName: string;
  googleEmail: string | null;
  employeeNumber: string | null;
  location: string | null;
  loginMethod: string;
  active: boolean;
  roles: string[];
  scopes: string[];
  permissions: string[];
};
type Summary = { identities: number; pinUsers: number; googleUsers: number; administrators: number };

export default function AccessPage() {
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ identities: 0, pinUsers: 0, googleUsers: 0, administrators: 0 });
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
      setSummary(accessData.summary);
    }).catch(err => setError(err instanceof Error ? err.message : 'Unable to load identity access.'))
      .finally(() => setChecking(false));
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(row => {
      const matchesLogin = loginFilter === 'All' || row.loginMethod === loginFilter;
      const haystack = [row.displayName, row.googleEmail, row.employeeNumber, row.location, ...row.roles, ...row.permissions]
        .filter(Boolean).join(' ').toLowerCase();
      return matchesLogin && (!query || haystack.includes(query));
    });
  }, [rows, search, loginFilter]);

  if (checking) return <main className="managerShell"><section className="managerCard loginBox">Loading identity access…</section></main>;
  if (!user) return <main className="managerShell"><section className="managerCard loginBox"><h1>Administrator Access Required</h1><p>Sign in through the Manager Dashboard with an administrator PIN.</p>{error && <div className="error">{error}</div>}</section></main>;

  return (
    <ManagerShell brand="BM OS" title="Identity & Access" user={user}>
      <div className="summary">
        <div><strong>{summary.identities}</strong><span>Identities</span></div>
        <div><strong>{summary.pinUsers}</strong><span>PIN users</span></div>
        <div><strong>{summary.googleUsers}</strong><span>Google users</span></div>
        <div><strong>{summary.administrators}</strong><span>Company administrators</span></div>
      </div>

      <section className="managerCard">
        <div className="sectionHeading">
          <div><h2>Effective Access</h2><p>Read-only development audit. Roles can overlap and permissions are combined.</p></div>
          <div className="accessTools">
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search people, roles or permissions" />
            <select value={loginFilter} onChange={event => setLoginFilter(event.target.value)}>
              <option>All</option><option>PIN</option><option>Google</option><option>Google + PIN</option><option>None</option>
            </select>
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="tableWrap">
          <table>
            <thead><tr><th>Identity</th><th>Login</th><th>Location</th><th>Roles</th><th>Scope</th><th>Effective Permissions</th></tr></thead>
            <tbody>{filteredRows.map(row => (
              <tr key={row.id}>
                <td><strong>{row.displayName}</strong><div className="cellMeta">{row.googleEmail || row.employeeNumber || 'No linked login'}</div></td>
                <td><span className="accessPill">{row.loginMethod}</span></td>
                <td>{row.location || '—'}</td>
                <td><div className="tagList">{row.roles.map(role => <span key={role}>{role}</span>)}</div></td>
                <td>{row.scopes.join(', ') || '—'}</td>
                <td><details><summary>{row.permissions.length} permissions</summary><div className="permissionList">{row.permissions.map(permission => <code key={permission}>{permission}</code>)}</div></details></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </ManagerShell>
  );
}
