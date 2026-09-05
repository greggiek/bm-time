'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ManagerShell from '@/components/manager-shell';

type User = { name: string; role: 'admin' | 'manager'; canManageEmployees: boolean };
type SystemCode = 'time' | 'academy' | 'warehouse' | 'sales' | 'prospecting';
type SystemAccess = { enabled: boolean; level: string; scope: string; accessLevel: string; scopeType: string; scopeIds: string[] };
type Location = { id: string; name: string };
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
const systemLabels: Record<SystemCode, string> = {
  time: 'BM Time', academy: 'BM Academy', warehouse: 'BM Warehouse', sales: 'BM Sales', prospecting: 'BM Prospecting',
};
const systemCodes = Object.keys(systemLabels) as SystemCode[];

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
  const [locations, setLocations] = useState<Location[]>([]);
  const [editing, setEditing] = useState<AccessRow | null>(null);
  const [draft, setDraft] = useState<AccessRow['systems'] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
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
      setLocations(accessData.locations || []);
    }).catch(err => setError(err instanceof Error ? err.message : 'Unable to load identity access.'))
      .finally(() => setChecking(false));
  }, []);

  function beginEdit(row: AccessRow) {
    setEditing(row);
    setDraft(structuredClone(row.systems));
    setError('');
    setMessage('');
  }

  function updateDraft(systemCode: SystemCode, update: Partial<SystemAccess>) {
    setDraft(current => current ? { ...current, [systemCode]: { ...current[systemCode], ...update } } : current);
  }

  function closeEditor() {
    if (saving) return;
    setEditing(null);
    setDraft(null);
  }

  async function saveAccess() {
    if (!editing || !draft) return;
    const missingLocation = systemCodes.find(code => draft[code].enabled && draft[code].scopeType === 'location' && draft[code].scopeIds.length === 0);
    if (missingLocation) {
      setError(`Choose at least one location for ${systemLabels[missingLocation]}.`);
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityId: editing.id,
          systems: systemCodes.map(systemCode => ({
            systemCode,
            enabled: draft[systemCode].enabled,
            accessLevel: draft[systemCode].accessLevel,
            scopeType: draft[systemCode].scopeType,
            scopeIds: draft[systemCode].scopeType === 'location' ? draft[systemCode].scopeIds : [],
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save access.');
      const accessResponse = await fetch('/api/admin/access');
      const accessData = await accessResponse.json();
      if (!accessResponse.ok) throw new Error(accessData.message || 'Access saved, but the page could not refresh.');
      setRows(accessData.rows || []);
      setSummary(accessData.summary || emptySummary);
      setLocations(accessData.locations || []);
      setEditing(null);
      setDraft(null);
      setMessage(`Access updated for ${editing.displayName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save access.');
    } finally {
      setSaving(false);
    }
  }

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
  if (!user) return <main className="managerShell"><section className="managerCard loginBox"><h1>Administrator Access Required</h1><p>Sign in through the Manager Dashboard with an administrator PIN.</p><Link className="primary accessLoginLink" href="/manager">Go to Admin Login</Link>{error ? <div className="error">{error}</div> : null}</section></main>;

  return (
    <ManagerShell brand="BM TIME" title="Access & Permissions" user={user}>
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
        {message ? <div className="accessSuccess">{message}</div> : null}
        {error && !editing ? <div className="error">{error}</div> : null}
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>{filteredRows.map(row => (
              <tr key={row.id}>
                <td>
                  <button type="button" className="accessIdentityButton" onClick={() => beginEdit(row)}>{row.displayName}</button>
                  <div className="cellMeta">{row.googleEmail || row.employeeNumber || 'No linked login'}</div>
                </td>
                <td><span className="accessPill">{row.loginMethod}</span></td>
                <td>{row.location || '—'}</td>
                <td><AccessCell access={row.systems.time} /></td>
                <td><AccessCell access={row.systems.academy} /></td>
                <td><AccessCell access={row.systems.warehouse} /></td>
                <td><AccessCell access={row.systems.sales} /></td>
                <td><AccessCell access={row.systems.prospecting} /></td>
                <td><button type="button" onClick={() => beginEdit(row)}>Edit access</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      {editing && draft ? <div className="accessEditorBackdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && closeEditor()}>
        <section className="accessEditor" role="dialog" aria-modal="true" aria-labelledby="access-editor-title">
          <header>
            <div><span className="osEyebrow">Identity &amp; Access</span><h2 id="access-editor-title">{editing.displayName}</h2><p>{editing.location || 'No primary location'} · {editing.loginMethod}</p></div>
            <button type="button" className="accessEditorClose" onClick={closeEditor} aria-label="Close access editor">×</button>
          </header>
          <div className="accessEditorSystems">
            {systemCodes.map(systemCode => {
              const access = draft[systemCode];
              return <fieldset key={systemCode} className={access.enabled ? 'accessEditorSystem enabled' : 'accessEditorSystem'}>
                <div className="accessEditorSystemHeading"><legend>{systemLabels[systemCode]}</legend><label className="accessToggle"><input type="checkbox" checked={access.enabled} onChange={event => updateDraft(systemCode, { enabled: event.target.checked })}/><span>{access.enabled ? 'Access on' : 'No access'}</span></label></div>
                {access.enabled ? <div className="accessEditorFields">
                  <label>Access level<select value={access.accessLevel} onChange={event => updateDraft(systemCode, { accessLevel: event.target.value })}><option value="user">User</option><option value="location_manager">Location manager</option><option value="company_manager">Company manager</option><option value="administrator">Administrator</option></select></label>
                  <label>Scope<select value={access.scopeType} onChange={event => updateDraft(systemCode, { scopeType: event.target.value, scopeIds: event.target.value === 'location' ? access.scopeIds : [] })}><option value="self">Self</option><option value="location">Location</option><option value="company">Company</option></select></label>
                  {access.scopeType === 'location' ? <div className="accessLocationChoices" aria-label={`${systemLabels[systemCode]} locations`}>{locations.map(location => <label key={location.id}><input type="checkbox" checked={access.scopeIds.includes(location.id)} onChange={event => updateDraft(systemCode, { scopeIds: event.target.checked ? [...access.scopeIds, location.id] : access.scopeIds.filter(id => id !== location.id) })}/>{location.name}</label>)}</div> : null}
                </div> : null}
              </fieldset>;
            })}
          </div>
          {error ? <div className="error">{error}</div> : null}
          <footer><button type="button" onClick={closeEditor} disabled={saving}>Cancel</button><button type="button" className="primary" onClick={saveAccess} disabled={saving}>{saving ? 'Saving…' : 'Save access'}</button></footer>
        </section>
      </div> : null}
    </ManagerShell>
  );
}
