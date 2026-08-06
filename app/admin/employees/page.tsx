'use client';

import { FormEvent, useState } from 'react';

type Option = { id: string; name: string };
type Employee = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  active: boolean;
  time_locations: Option | null;
  time_job_titles: Option | null;
};

export default function EmployeesPage() {
  const [password, setPassword] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [jobTitles, setJobTitles] = useState<Option[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  async function request(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/employees', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password, ...body }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to continue.');
    return data;
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await request({});
      setEmployees(data.employees);
      setLocations(data.locations);
      setJobTitles(data.jobTitles);
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load employees.');
    } finally {
      setLoading(false);
    }
  }

  async function addEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const form = new FormData(event.currentTarget);
    try {
      await request({
        action: 'create',
        employeeNumber: form.get('employeeNumber'),
        firstName: form.get('firstName'),
        lastName: form.get('lastName'),
        pin: form.get('pin'),
        locationId: form.get('locationId'),
        jobTitleId: form.get('jobTitleId') || null,
      });
      event.currentTarget.reset();
      setMessage('Employee added.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add employee.');
    } finally {
      setLoading(false);
    }
  }

  async function deactivate(employeeId: string) {
    if (!confirm('Deactivate this employee?')) return;
    setLoading(true);
    setError('');
    try {
      await request({ action: 'deactivate', employeeId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to deactivate employee.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="managerShell">
      <header className="managerHeader">
        <div>
          <div className="brand">BM TIME</div>
          <div className="location">Employees</div>
        </div>
        <div><a href="/admin">Dashboard</a> · <a href="/kiosk">Kiosk</a></div>
      </header>

      {!unlocked ? (
        <section className="managerCard loginBox">
          <h1>Admin Login</h1>
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && load()}
          />
          <button className="primary" disabled={!password || loading} onClick={load}>
            {loading ? 'Loading…' : 'Open Employees'}
          </button>
          {error && <div className="error">{error}</div>}
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          <section className="managerCard">
            <h2>Add Employee</h2>
            <form onSubmit={addEmployee} style={{ display: 'grid', gap: 12 }}>
              <input name="employeeNumber" placeholder="Employee number" required />
              <input name="firstName" placeholder="First name" required />
              <input name="lastName" placeholder="Last name" required />
              <input name="pin" placeholder="4-digit PIN" inputMode="numeric" pattern="\d{4}" maxLength={4} required />
              <select name="locationId" required defaultValue="">
                <option value="" disabled>Select location</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
              <select name="jobTitleId" defaultValue="">
                <option value="">No job title</option>
                {jobTitles.map((jobTitle) => <option key={jobTitle.id} value={jobTitle.id}>{jobTitle.name}</option>)}
              </select>
              <button className="primary" disabled={loading}>{loading ? 'Saving…' : 'Add Employee'}</button>
            </form>
            {message && <div style={{ marginTop: 12 }}>{message}</div>}
            {error && <div className="error">{error}</div>}
          </section>

          <section className="managerCard">
            <h2>Employees</h2>
            <div className="tableWrap">
              <table>
                <thead><tr><th>Employee</th><th>Number</th><th>Location</th><th>Job Title</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td><strong>{employee.first_name} {employee.last_name}</strong></td>
                      <td>{employee.employee_number}</td>
                      <td>{employee.time_locations?.name || '—'}</td>
                      <td>{employee.time_job_titles?.name || '—'}</td>
                      <td>{employee.active ? 'Active' : 'Inactive'}</td>
                      <td>{employee.active && <button onClick={() => deactivate(employee.id)}>Deactivate</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
