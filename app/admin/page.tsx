'use client';
import { useState } from 'react';

type Row = {
  id: string;
  name: string;
  location: string;
  jobTitle: string;
  status: string;
  latest: string | null;
};

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError('');

    const response = await fetch('/api/manager/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await response.json();

    if (!response.ok) setError(data.message);
    else setRows(data.rows);

    setLoading(false);
  }

  return (
    <main className="managerShell">
      <header className="managerHeader">
        <div>
          <div className="brand">BM TIME</div>
          <div className="location">Admin Dashboard</div>
        </div>
        <div><a href="/admin/employees">Employees</a> · <a href="/admin/managers">Managers</a> · <a href="/admin/timecards">Timecards</a> · <a href="/kiosk">Kiosk</a></div>
      </header>

      <section className="managerCard">
        {rows.length === 0 ? (
          <div className="loginBox">
            <h1>Admin Login</h1>
            <input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && load()}
            />
            <button className="primary" onClick={load} disabled={!password || loading}>
              {loading ? 'Loading…' : 'View Time Clock'}
            </button>
            {error && <div className="error">{error}</div>}
          </div>
        ) : (
          <>
            <div className="summary">
              <div>
                <strong>{rows.filter((row) => row.status === 'clocked_in').length}</strong>
                <span>Clocked In</span>
              </div>
              <div>
                <strong>{rows.length}</strong>
                <span>Active Employees</span>
              </div>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Location</th>
                    <th>Job Title</th>
                    <th>Status</th>
                    <th>Last Punch</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.name}</strong></td>
                      <td>{row.location}</td>
                      <td>{row.jobTitle}</td>
                      <td>
                        <span className={`pill ${row.status}`}>
                          {row.status === 'clocked_in' ? 'Clocked In' : 'Clocked Out'}
                        </span>
                      </td>
                      <td>{row.latest ? new Date(row.latest).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="refresh" onClick={load}>Refresh</button>
          </>
        )}
      </section>
    </main>
  );
}
