'use client';

import { FormEvent, useState } from 'react';

type Location = { id: string; name: string };
type Manager = {
  id: string;
  name: string;
  locationId: string | null;
  locationName: string | null;
  allLocations: boolean;
  active: boolean;
};
type AdminUser = { name: string; role: 'admin' | 'manager' };
type EditState = {
  id: string;
  name: string;
  pin: string;
  locationId: string;
  allLocations: boolean;
  active: boolean;
};

export default function ManagersPage() {
  const [pin, setPin] = useState('');
  const [user, setUser] = useState<AdminUser | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [formKey, setFormKey] = useState(0);

  async function managerRequest(body: Record<string, unknown> = {}) {
    const response = await fetch('/api/admin/managers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (response.status === 401) setUser(null);
    if (!response.ok) throw new Error(data.message || 'Unable to manage manager accounts.');
    setManagers(data.managers || []);
    setLocations(data.locations || []);
    return data;
  }

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
      if (data.user.role !== 'admin') {
        await fetch('/api/auth/logout', { method: 'POST' });
        throw new Error('Administrator access is required.');
      }
      setUser(data.user);
      setPin('');
      await managerRequest();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  async function addManager(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const allLocations = form.get('allLocations') === 'on';
      await managerRequest({
        action: 'create',
        name: form.get('name'),
        pin: form.get('pin'),
        allLocations,
        locationId: allLocations ? null : form.get('locationId'),
      });
      setFormKey((value) => value + 1);
      setMessage('Manager added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add manager.');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(manager: Manager) {
    setEditing({
      id: manager.id,
      name: manager.name,
      pin: '',
      locationId: manager.locationId || '',
      allLocations: manager.allLocations,
      active: manager.active,
    });
    setError('');
    setMessage('');
  }

  async function saveManager(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await managerRequest({
        action: 'update',
        userId: editing.id,
        name: editing.name,
        pin: editing.pin,
        locationId: editing.allLocations ? null : editing.locationId,
        allLocations: editing.allLocations,
        active: editing.active,
      });
      setEditing(null);
      setMessage('Manager updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update manager.');
    } finally {
      setLoading(false);
    }
  }

  async function deactivate(manager: Manager) {
    if (!confirm(`Deactivate ${manager.name}?`)) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await managerRequest({ action: 'deactivate', userId: manager.id });
      if (editing?.id === manager.id) setEditing(null);
      setMessage('Manager deactivated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to deactivate manager.');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setManagers([]);
    setLocations([]);
    setEditing(null);
  }

  if (!user) {
    return (
      <main className="managerShell">
        <header className="managerHeader">
          <div><div className="brand">BM TIME</div><div className="location">Manager Accounts</div></div>
          <a href="/kiosk">Kiosk</a>
        </header>
        <section className="managerCard loginBox">
          <h1>Enter Administrator PIN</h1>
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
          <button className="primary" disabled={pin.length !== 4 || loading} onClick={signIn}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          {error && <div className="error">{error}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="managerShell">
      <header className="managerHeader">
        <div><div className="brand">BM TIME</div><div className="location">Manager Accounts · {user.name}</div></div>
        <div><a href="/admin/timecards">Timecards</a> · <a href="/admin/employees">Employees</a> · <a href="/kiosk">Kiosk</a> · <button onClick={logout}>Log Out</button></div>
      </header>

      <div style={{ display: 'grid', gap: 20 }}>
        <section className="managerCard">
          <h2>Add Manager</h2>
          <form key={formKey} onSubmit={addManager} style={{ display: 'grid', gap: 12 }}>
            <input name="name" placeholder="Manager name" required />
            <input name="pin" placeholder="4-digit PIN" inputMode="numeric" pattern="\d{4}" maxLength={4} required />
            <label><input name="allLocations" type="checkbox" /> Access to all warehouses</label>
            <select name="locationId" defaultValue="">
              <option value="" disabled>Select assigned warehouse</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
            <p style={{ color: '#6b7280', margin: 0 }}>Choose a warehouse unless “Access to all warehouses” is selected.</p>
            <button className="primary" disabled={loading}>{loading ? 'Saving…' : 'Add Manager'}</button>
          </form>
        </section>

        {editing && (
          <section className="managerCard" style={{ border: '2px solid #151515' }}>
            <h2>Edit {editing.name}</h2>
            <form onSubmit={saveManager} style={{ display: 'grid', gap: 12 }}>
              <input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} required />
              <input
                value={editing.pin}
                onChange={(event) => setEditing({ ...editing, pin: event.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="New 4-digit PIN (leave blank to keep current)"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
              />
              <label><input type="checkbox" checked={editing.allLocations} onChange={(event) => setEditing({ ...editing, allLocations: event.target.checked })} /> Access to all warehouses</label>
              {!editing.allLocations && (
                <select value={editing.locationId} onChange={(event) => setEditing({ ...editing, locationId: event.target.value })} required>
                  <option value="" disabled>Select assigned warehouse</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              )}
              <label><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} /> Active manager</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="primary" disabled={loading}>{loading ? 'Saving…' : 'Save Changes'}</button>
                <button type="button" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </form>
          </section>
        )}

        {(message || error) && <section className="managerCard">{message && <div>{message}</div>}{error && <div className="error">{error}</div>}</section>}

        <section className="managerCard">
          <h2>Managers</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Name</th><th>Warehouse Access</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {managers.map((manager) => (
                  <tr key={manager.id}>
                    <td><strong>{manager.name}</strong></td>
                    <td>{manager.allLocations ? 'All warehouses' : manager.locationName || 'Unassigned'}</td>
                    <td>{manager.active ? 'Active' : 'Inactive'}</td>
                    <td>
                      <button type="button" onClick={() => startEdit(manager)}>Edit / Reset PIN</button>
                      {manager.active && <> <button type="button" onClick={() => deactivate(manager)}>Deactivate</button></>}
                    </td>
                  </tr>
                ))}
                {managers.length === 0 && <tr><td colSpan={4}>No manager accounts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
