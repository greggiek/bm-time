'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import ManagerShell from '@/components/manager-shell';

type User = { name: string; role: 'admin' | 'manager'; canManageEmployees: boolean };
type Employee = { id: string; first_name: string; last_name: string; time_locations: { id: string; name: string } | null; time_job_titles: { id: string; name: string } | null };
type Item = { id: string; label: string; completed: boolean; completed_by_name: string | null };
type OnboardingRecord = { id: string; employee_id: string; start_date: string | null; assigned_manager: string; notes: string; status: 'active' | 'completed' | 'cancelled'; time_employees: Employee; hr_onboarding_items: Item[] };

export default function OnboardingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<OnboardingRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session').then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (data.user.role === 'admin' || data.user.canManageEmployees) { setUser(data.user); await request({}); }
    }).finally(() => setLoading(false));
  }, []);

  async function request(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to update onboarding.');
    setEmployees(data.employees || []);
    setRecords(data.records || []);
    return data;
  }

  async function run(body: Record<string, unknown>, success: string) {
    setError(''); setMessage(''); setLoading(true);
    try { await request(body); setMessage(success); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to continue.'); } finally { setLoading(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run({ action: 'create', employeeId: form.get('employeeId'), startDate: form.get('startDate'), assignedManager: form.get('assignedManager'), notes: form.get('notes') }, 'Onboarding checklist created.');
    event.currentTarget.reset();
  }

  const availableEmployees = useMemo(() => employees.filter(employee => !records.some(record => record.employee_id === employee.id)), [employees, records]);
  const activeRecords = records.filter(record => record.status !== 'cancelled');
  const selected = activeRecords.find(record => record.id === selectedId) || activeRecords[0] || null;
  const completedCount = selected?.hr_onboarding_items.filter(item => item.completed).length || 0;

  if (loading && !user) return <main className="managerShell"><section className="managerCard loginBox">Loading onboarding…</section></main>;
  if (!user) return <main className="managerShell"><section className="managerCard loginBox"><h1>Access denied</h1><p>Sign in through BM Time with employee-management access.</p></section></main>;

  return <ManagerShell brand="BM TIME" title="Onboarding" user={user}>
    <div className="onboardingLayout">
      <section className="managerCard onboardingCreate">
        <div className="sectionHeading"><div><h2>Start Onboarding</h2><p>Operational checklist only. Never enter SSNs, DOBs, banking, tax, medical, or identity-document information.</p></div></div>
        <form onSubmit={create}>
          <select name="employeeId" required defaultValue=""><option value="" disabled>Select employee</option>{availableEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.last_name}, {employee.first_name} · {employee.time_locations?.name || 'No location'}</option>)}</select>
          <input name="startDate" type="date" aria-label="Start date" />
          <input name="assignedManager" maxLength={120} placeholder="Assigned manager" />
          <textarea name="notes" maxLength={1000} placeholder="Optional non-sensitive notes" rows={3} />
          <button className="primary" disabled={loading || availableEmployees.length === 0}>{availableEmployees.length === 0 ? 'All employees have a checklist' : 'Create Checklist'}</button>
        </form>
      </section>

      {(message || error) && <section className="managerCard onboardingNotice">{message && <div className="loginSuccess">{message}</div>}{error && <div className="error">{error}</div>}</section>}

      <div className="onboardingWorkspace">
        <section className="managerCard onboardingRoster">
          <div className="sectionHeading"><div><h2>New Hires</h2><p>{activeRecords.length} onboarding checklist{activeRecords.length === 1 ? '' : 's'}</p></div></div>
          <div className="onboardingRosterList">{activeRecords.map(record => {
            const done = record.hr_onboarding_items.filter(item => item.completed).length;
            return <button key={record.id} className={selected?.id === record.id ? 'selected' : ''} onClick={() => setSelectedId(record.id)}>
              <strong>{record.time_employees.first_name} {record.time_employees.last_name}</strong>
              <span>{record.time_employees.time_locations?.name || 'No location'} · {done}/{record.hr_onboarding_items.length}</span>
            </button>;
          })}{activeRecords.length === 0 && <p className="timecardState">No onboarding checklists yet.</p>}</div>
        </section>

        <section className="managerCard onboardingChecklist">
          {!selected ? <p className="timecardState">Create an onboarding checklist to begin.</p> : <>
            <div className="onboardingTitle"><div><span className="osEyebrow">{selected.time_employees.time_locations?.name || 'No location'}</span><h2>{selected.time_employees.first_name} {selected.time_employees.last_name}</h2><p>{selected.time_employees.time_job_titles?.name || 'No job title'}{selected.start_date ? ` · Starts ${new Date(`${selected.start_date}T12:00:00`).toLocaleDateString()}` : ''}</p></div><strong>{completedCount}/{selected.hr_onboarding_items.length}</strong></div>
            <div className="onboardingProgress"><i style={{ width: `${selected.hr_onboarding_items.length ? completedCount / selected.hr_onboarding_items.length * 100 : 0}%` }} /></div>
            <div className="onboardingItems">{selected.hr_onboarding_items.map(item => <label key={item.id} className={item.completed ? 'done' : ''}>
              <input type="checkbox" checked={item.completed} disabled={loading || selected.status === 'completed'} onChange={event => run({ action: 'toggle', itemId: item.id, completed: event.target.checked }, 'Checklist updated.')} />
              <span><strong>{item.label}</strong>{item.completed_by_name && <small>Completed by {item.completed_by_name}</small>}</span>
            </label>)}</div>
            {(selected.assigned_manager || selected.notes) && <div className="onboardingMeta">{selected.assigned_manager && <p><strong>Assigned manager:</strong> {selected.assigned_manager}</p>}{selected.notes && <p><strong>Notes:</strong> {selected.notes}</p>}</div>}
            <div className="onboardingActions">{selected.status !== 'completed' ? <button className="primary" disabled={loading || completedCount !== selected.hr_onboarding_items.length} onClick={() => run({ action: 'status', onboardingId: selected.id, status: 'completed' }, 'Onboarding completed.')}>Complete Onboarding</button> : <span className="accessPill accessGranted">Onboarding complete</span>}<button disabled={loading} onClick={() => run({ action: 'status', onboardingId: selected.id, status: 'cancelled' }, 'Onboarding cancelled.')}>Cancel Checklist</button></div>
          </>}
        </section>
      </div>
    </div>
  </ManagerShell>;
}
