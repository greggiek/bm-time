'use client';

import { useMemo, useState } from 'react';

type Punch = {
  id: string;
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

export default function TimecardsPage() {
  const [password, setPassword] = useState('');
  const [weekStart, setWeekStart] = useState(currentMonday());
  const [punches, setPunches] = useState<Punch[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [weekEnd, setWeekEnd] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const totalHours = useMemo(
    () => summaries.reduce((sum, row) => sum + row.totalHours, 0),
    [summaries],
  );

  async function loadWeek() {
    setLoading(true);
    setError('');

    const response = await fetch('/api/admin/timecards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password, weekStart }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.message || 'Unable to load timecards.');
    } else {
      setPunches(data.punches || []);
      setSummaries(data.summaries || []);
      setWeekEnd(data.weekEnd || '');
      setLoaded(true);
    }

    setLoading(false);
  }

  function exportCsv() {
    const lines = [
      ['Weekly Summary'],
      ['Week Start', weekStart],
      ['Week End', weekEnd],
      [],
      ['Employee Number', 'Employee', 'Location', 'Total Hours', 'Incomplete Punch'],
      ...summaries.map((row) => [
        row.employeeNumber,
        row.employeeName,
        row.location,
        row.totalHours.toFixed(2),
        row.incomplete ? 'Yes' : 'No',
      ]),
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
          <h1>Export Weekly CSV</h1>
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <label>
            Week starting Monday
            <input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} />
          </label>
          <button className="primary" onClick={loadWeek} disabled={!password || !weekStart || loading}>
            {loading ? 'Loading…' : 'Load Week'}
          </button>
          {error && <div className="error">{error}</div>}
        </div>

        {loaded && (
          <div style={{ marginTop: 30 }}>
            <div className="summary">
              <div><strong>{summaries.length}</strong><span>Employees</span></div>
              <div><strong>{totalHours.toFixed(2)}</strong><span>Total Hours</span></div>
              <div><strong>{summaries.filter((row) => row.incomplete).length}</strong><span>Incomplete</span></div>
            </div>

            <button className="primary" onClick={exportCsv} disabled={punches.length === 0}>
              Download CSV
            </button>

            <div className="tableWrap" style={{ marginTop: 20 }}>
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Location</th>
                    <th>Hours</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((row) => (
                    <tr key={row.employeeId}>
                      <td><strong>{row.employeeName}</strong><br />#{row.employeeNumber}</td>
                      <td>{row.location}</td>
                      <td>{row.totalHours.toFixed(2)}</td>
                      <td>{row.incomplete ? 'Incomplete punch' : 'Complete'}</td>
                    </tr>
                  ))}
                  {summaries.length === 0 && (
                    <tr><td colSpan={4}>No punches found for this week.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
