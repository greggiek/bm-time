'use client';

import { FormEvent, useMemo, useState } from 'react';

type Punch = {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  location: string;
  action: 'clock_in' | 'clock_out';
  occurredAt: string;
};

type Summary = {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  location: string;
  totalHours: number;
  incomplete: boolean;
};

type EmployeeOption = {
  id: string;
  employeeNumber: string;
  name: string;
};

function currentMonday() {
  const date = new Date();
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function csvCell(value: string | number | boolean) {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function TimecardsPage() {
  const [password, setPassword] = useState('');
  const [weekStart, setWeekStart] = useState(currentMonday());
  const [punches, setPunches] = useState<Punch[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [weekEnd, setWeekEnd] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const totalHours = useMemo(
    () => summaries.reduce((sum, row) => sum + row.totalHours, 0),
    [summaries],
  );

  async function request(body: Record<string, unknown> = {}) {
    const response = await fetch('/api/admin/timecards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password, weekStart, ...body }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to update timecards.');
    setPunches(data.punches || []);
    setSummaries(data.summaries || []);
    setEmployees(data.employees || []);
    setWeekEnd(data.weekEnd || '');
    setLoaded(true);
  }

  async function loadWeek() {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await request();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load timecards.');
    } finally {
      setLoading(false);
    }
  }

  async function updatePunch(punchId: string, occurredAt: string) {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await request({ action: 'update_punch', punchId, occurredAt: new Date(occurredAt).toISOString() });
      setMessage('Punch updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update punch.');
    } finally {
      setLoading(false);
    }
  }

  async function addPunch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await request({
        action: 'create_punch',
        employeeId: form.get('employeeId'),
        punchAction: form.get('punchAction'),
        occurredAt: new Date(String(form.get('occurredAt'))).toISOString(),
      });
      setMessage('Manual punch added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add punch.');
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const lines = [
      ['Weekly Summary'],
      ['Week Start', weekStart],
      ['Week End', weekEnd],
      [],
      ['Employee Number', 'Employee', 'Location', 'Total Hours', 'Incomplete Punch'],
      ...summaries.map((row) => [row.employeeNumber, row.employeeName, row.location, row.totalHours.toFixed(2), row.incomplete ? 'Yes' : 'No']),
      [],
      ['Punch Detail'],
      ['Employee Number', 'Employee', 'Location', 'Action', 'Date', 'Time'],
      ...punches.map((punch) => {
        const date = new Date(punch.occurredAt);
        return [
          punch.employeeNumber,
          punch.employeeName,
          punch.location,
          punch.action === 'clock_in' ? 'Clock In' : 'Clock Out',
          date.toLocaleDateString(),
          date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        ];
      }),
    ];

    const csv = lines.map((row) => row.map((cell) => csvCell(cell ?? '')).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bm-time-${weekStart}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="managerShell">
      <header className="managerHeader">
        <div>
          <div className="brand">BM TIME</div>
          <div className="location">Weekly Timecards</div>
        </div>
        <div><a href="/admin">Dashboard</a> · <a href="/admin/employees">Employees</a></div>
      </header>

      <section className="managerCard">
        <div className="loginBox" style={{ margin: 0, maxWidth: 620 }}>
          <h1>Weekly Timecards</h1>
          <input type="password" placeholder="Admin password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <label>
            Week starting Monday
            <input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} />
          </label>
          <button className="primary" onClick={loadWeek} disabled={!password || !weekStart || loading}>
            {loading ? 'Loading…' : 'Load Week'}
          </button>
          {message && <div style={{ marginTop: 12 }}>{message}</div>}
          {error && <div className="error">{error}</div>}
        </div>

        {loaded && (
          <div style={{ marginTop: 30, display: 'grid', gap: 24 }}>
            <div className="summary">
              <div><strong>{summaries.length}</strong><span>Employees</span></div>
              <div><strong>{totalHours.toFixed(2)}</strong><span>Total Hours</span></div>
              <div><strong>{summaries.filter((row) => row.incomplete).length}</strong><span>Incomplete</span></div>
            </div>

            <button className="primary" onClick={exportCsv} disabled={punches.length === 0}>Download CSV</button>

            <section>
              <h2>Add Missing Punch</h2>
              <form onSubmit={addPunch} style={{ display: 'grid', gap: 10, maxWidth: 620 }}>
                <select name="employeeId" required defaultValue="">
                  <option value="" disabled>Select employee</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} (#{employee.employeeNumber})</option>)}
                </select>
                <select name="punchAction" required defaultValue="clock_in">
                  <option value="clock_in">Clock In</option>
                  <option value="clock_out">Clock Out</option>
                </select>
                <input name="occurredAt" type="datetime-local" required />
                <button className="primary" disabled={loading}>{loading ? 'Saving…' : 'Add Punch'}</button>
              </form>
            </section>

            <section>
              <h2>Weekly Summary</h2>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Employee</th><th>Location</th><th>Hours</th><th>Status</th></tr></thead>
                  <tbody>
                    {summaries.map((row) => (
                      <tr key={row.employeeId}>
                        <td><strong>{row.employeeName}</strong><br />#{row.employeeNumber}</td>
                        <td>{row.location}</td>
                        <td>{row.totalHours.toFixed(2)}</td>
                        <td>{row.incomplete ? 'Incomplete punch' : 'Complete'}</td>
                      </tr>
                    ))}
                    {summaries.length === 0 && <tr><td colSpan={4}>No punches found for this week.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2>Punch Detail</h2>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Employee</th><th>Action</th><th>Date & Time</th><th></th></tr></thead>
                  <tbody>
                    {punches.map((punch) => (
                      <PunchRow key={punch.id} punch={punch} loading={loading} onSave={updatePunch} />
                    ))}
                    {punches.length === 0 && <tr><td colSpan={4}>No punches found for this week.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function PunchRow({ punch, loading, onSave }: { punch: Punch; loading: boolean; onSave: (id: string, occurredAt: string) => void }) {
  const [value, setValue] = useState(toLocalInput(punch.occurredAt));
  return (
    <tr>
      <td><strong>{punch.employeeName}</strong><br />#{punch.employeeNumber}</td>
      <td>{punch.action === 'clock_in' ? 'Clock In' : 'Clock Out'}</td>
      <td><input type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} /></td>
      <td><button disabled={loading || !value} onClick={() => onSave(punch.id, value)}>Save</button></td>
    </tr>
  );
}
