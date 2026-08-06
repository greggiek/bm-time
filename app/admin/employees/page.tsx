'use client';

import { FormEvent, useRef, useState } from 'react';

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

type EditState = {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  locationId: string;
  jobTitleId: string;
  pin: string;
  active: boolean;
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
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<EditState | null>(null);
  const editSectionRef = useRef<HTMLElement | null>(null);

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
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    setMessage('');

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
      setFormKey((value) => value + 1);
      setMessage('Employee added.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add employee.');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(employee: Employee) {
    setEditing({
      employeeId: employee.id,
      employeeNumber: employee.employee_number,
      firstName: employee.first_name,
      lastName: employee.last_name,
      locationId: employee.time_locations?.id || '',
      jobTitleId: employee.time_job_titles?.id || '',
      pin: '',
      active: employee.active,
    });
    setError('');
    setMessage('');
    window.requestAnimationFrame(() => {
      editSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await request({
        action: 'update',
        employeeId: editing.employeeId,
        employeeNumber: editing.employeeNumber,
        firstName: editing.firstName,
        lastName: editing.lastName,
        locationId: editing.locationId,
        jobTitleId: editing.jobTitleId || null,
        pin: editing.pin,
        active: editing.active,
      });
      setEditing(null);
      setMessage('Employee updated.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update employee.');
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
        <div><a href="/admin">Dashboard</a> · <a href="/admin/timecards">Timecards</a> · <a href="/kiosk">Kiosk</a></div>
      </header>

      {!unlocked ? (
        <section className="managerCard loginBox">
          <h1>Admin Login</h1>
          <input type="password" placeholder="Admin password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load()} />
          <button className="primary" disabled={!password || loading} onClick={load}>{loading ? 'Loading…' : 'Open Employees'}</button>
          {error && <div className="error">{error}</div>}
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          <section className="managerCard">
            <h2>Add Employee</h2>
            <form key={formKey} onSubmit={addEmployee} style={{ display: 'grid', gap: 12 }}>
              <input name="employeeNumber" placeholder="Employee number" required />
              <input name="firstName" placeholder="First name" required />
              <input name="lastName" placeholder="Last name" required />
              <input name="pin" placeholder="4-digit PIN" inputMode="numeric" pattern="\d{4}" maxLength={4} required />
              <select name="locationId" required defaultValue=""><option value="" disabled>Select location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
              <select name="jobTitleId" defaultValue=""><option value="">No job title</option>{jobTitles.map((jobTitle) => <option key={jobTitle.id} value={jobTitle.id}>{jobTitle.name}</option>)}</select>
              <button className="primary" disabled={loading}>{loading ? 'Saving…' : 'Add Employee'}</button>
            </form>
          </section>

          {editing && (
            <section ref={editSectionRef} className="managerCard" style={{ scrollMarginTop: 20, border: '2px solid #151515' }}>
              <h2>Edit {editing.firstName} {editing.lastName}</h2>
              <form onSubmit={saveEdit} style={{ display: 'grid', gap: 12 }}>
                <input value={editing.employeeNumber} onChange={(event) => setEditing({ ...editing, employeeNumber: event.target.value })} placeholder="Employee number" required />
                <input value={editing.firstName} onChange={(event) => setEditing({ ...editing, firstName: event.target.value })} placeholder="First name" required />
                <input value={editing.lastName} onChange={(event) => setEditing({ ...editing, lastName: event.target.value })} placeholder="Last name" required />
                <input value={editing.pin} onChange={(event) => setEditing({ ...editing, pin: event.target.value })} placeholder="New 4-digit PIN (optional)" inputMode="numeric" pattern="\d{4}" maxLength={4} />
                <select value={editing.locationId} onChange={(event) => setEditing({ ...editing, locationId: event.target.value })} required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
                <select value={editing.jobTitleId} onChange={(event) => setEditing({ ...editing, jobTitleId: event.target.value })}><option value="">No job title</option>{jobTitles.map((jobTitle) => <option key={jobTitle.id} value={jobTitle.id}>{jobTitle.name}</option>)}</select>
                <label><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} /> Active employee</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="primary" disabled={loading}>{loading ? 'Saving…' : 'Save Changes'}</button>
                  <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </form>
            </section>
          )}

          {(message || error) && <section className="managerCard">{message && <div>{message}</div>}{error && <div className="error">{error}</div>}</section>}

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
                      <td><button type="button" onClick={() => startEdit(employee)}>Edit</button>{employee.active && <> <button type="button" onClick={() => deactivate(employee.id)}>Deactivate</button></>}</td>
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
