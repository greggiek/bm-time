'use client';

import { FormEvent, useEffect, useState } from 'react';
import ManagerShell from '@/components/manager-shell';

type User = { name: string; role: 'admin' | 'manager'; canManageEmployees: boolean };
type OperationalSystem = 'warehouse' | 'sales' | 'prospecting';
type Option = { id: string; name: string; defaultOperationalSystems?: OperationalSystem[] };
type Employee = { id: string; first_name: string; last_name: string; time_locations: { id: string; name: string } | null; time_job_titles: { id: string; name: string } | null };
type ItemStatus = 'not_started' | 'sent' | 'completed' | 'not_applicable';
type Item = { id: string; item_key: string; label: string; item_status: ItemStatus; completed: boolean; completed_by_name: string | null };
type OnboardingRecord = { id: string; employee_id: string; start_date: string | null; assigned_manager: string; notes: string; status: 'active' | 'completed' | 'cancelled'; time_employees: Employee; hr_onboarding_items: Item[] };

export default function OnboardingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [locations, setLocations] = useState<Option[]>([]);
  const [jobTitles, setJobTitles] = useState<Option[]>([]);
  const [records, setRecords] = useState<OnboardingRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedJobTitleId, setSelectedJobTitleId] = useState('');
  const [selectedSystems, setSelectedSystems] = useState<OperationalSystem[]>([]);

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
    setLocations(data.locations || []);
    setJobTitles(data.jobTitles || []);
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
    await run({
      action: 'create', employeeNumber: form.get('employeeNumber'), firstName: form.get('firstName'), lastName: form.get('lastName'),
      pin: form.get('pin'), locationId: form.get('locationId'), jobTitleId: form.get('jobTitleId'), startDate: form.get('startDate'),
      assignedManager: form.get('assignedManager'), notes: form.get('notes'),
      googleEmail: form.get('googleEmail'), operationalSystems: selectedSystems,
    }, 'Employee created and onboarding started.');
    event.currentTarget.reset();
    setSelectedJobTitleId('');
    setSelectedSystems([]);
  }

  function selectJobTitle(id: string) {
    setSelectedJobTitleId(id);
    setSelectedSystems(jobTitles.find((option) => option.id === id)?.defaultOperationalSystems || []);
  }

  function toggleSystem(system: OperationalSystem) {
    setSelectedSystems((current) => current.includes(system) ? current.filter((item) => item !== system) : [...current, system]);
  }

  const activeRecords = records.filter(record => record.status !== 'cancelled');
  const selected = activeRecords.find(record => record.id === selectedId) || activeRecords[0] || null;
  const completedCount = selected?.hr_onboarding_items.filter(item => item.completed).length || 0;

  if (loading && !user) return <main className="managerShell"><section className="managerCard loginBox">Loading onboarding…</section></main>;
  if (!user) return <main className="managerShell"><section className="managerCard loginBox"><h1>Access denied</h1><p>Sign in through BM Time with employee-management access.</p></section></main>;

  return <ManagerShell brand="BM TIME" title="Onboarding" user={user}>
    <div className="onboardingLayout">
      <section className="managerCard onboardingCreate">
        <div className="sectionHeading"><div><h2>Add New Employee</h2><p>This creates the employee in BM Time and starts the HR checklist. Never enter SSNs, DOBs, bank details, tax, medical, or identity-document information.</p></div></div>
        <form onSubmit={create}>
          <input name="employeeNumber" required maxLength={20} placeholder="Employee number" />
          <input name="firstName" required maxLength={80} placeholder="First name" />
          <input name="lastName" required maxLength={80} placeholder="Last name" />
          <input name="pin" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="4-digit BM Time PIN" />
          <select name="locationId" required defaultValue=""><option value="" disabled>Select location</option>{locations.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
          <select name="jobTitleId" required value={selectedJobTitleId} onChange={(event) => selectJobTitle(event.target.value)}><option value="" disabled>Select job title</option>{jobTitles.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
          <input name="startDate" type="date" aria-label="Start date" />
          <input name="assignedManager" maxLength={120} placeholder="Assigned manager" />
          <input name="googleEmail" type="email" maxLength={254} placeholder="Google email (optional)" />
          <fieldset className="onboardingAccess">
            <legend>BM OS access</legend>
            <p>BM Time and BM Academy are always included. Select any operational systems this employee needs.</p>
            {(['warehouse', 'sales', 'prospecting'] as OperationalSystem[]).map((system) => <label key={system}>
              <input type="checkbox" checked={selectedSystems.includes(system)} onChange={() => toggleSystem(system)} />
              <span>{system === 'warehouse' ? 'BM Warehouse' : system === 'sales' ? 'BM Sales' : 'BM Prospecting'}</span>
            </label>)}
            <small>PIN-only employees can use assigned systems. Google email is required only when their role needs Google Workspace.</small>
          </fieldset>
          <textarea name="notes" maxLength={1000} placeholder="Optional non-sensitive notes" rows={3} />
          <button className="primary" disabled={loading}>{loading ? 'Creating…' : 'Add Employee & Start Onboarding'}</button>
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
            <div className="onboardingItems">{selected.hr_onboarding_items.map(item => <div key={item.id} className={item.completed ? 'done' : ''}>
              <span><strong>{item.label}</strong>{item.item_key === 'academy_training' ? <small>Updated automatically from BM Academy</small> : item.completed_by_name && <small>Updated by {item.completed_by_name}</small>}</span>
              {item.item_key === 'academy_training' ? <span className={`academyAutoStatus ${item.item_status}`}>{academyStatusLabel(item.item_status)}</span> : <select aria-label={`${item.label} status`} value={item.item_status || (item.completed ? 'completed' : 'not_started')} disabled={loading || selected.status === 'completed'} onChange={event => run({ action: 'toggle', itemId: item.id, itemStatus: event.target.value }, 'Checklist updated.')}>
                <option value="not_started">Not Started</option><option value="sent">Sent</option><option value="completed">Completed</option><option value="not_applicable">Not Applicable</option>
              </select>}
            </div>)}</div>
            {(selected.assigned_manager || selected.notes) && <div className="onboardingMeta">{selected.assigned_manager && <p><strong>Assigned manager:</strong> {selected.assigned_manager}</p>}{selected.notes && <p><strong>Notes:</strong> {selected.notes}</p>}</div>}
            <div className="onboardingActions">{selected.status !== 'completed' ? <button className="primary" disabled={loading || completedCount !== selected.hr_onboarding_items.length} onClick={() => run({ action: 'status', onboardingId: selected.id, status: 'completed' }, 'Onboarding completed.')}>Complete Onboarding</button> : <span className="accessPill accessGranted">Onboarding complete</span>}<button disabled={loading} onClick={() => run({ action: 'status', onboardingId: selected.id, status: 'cancelled' }, 'Onboarding cancelled.')}>Cancel Checklist</button></div>
          </>}
        </section>
      </div>
    </div>
  </ManagerShell>;
}

function academyStatusLabel(status: ItemStatus) {
  if (status === 'sent') return 'In Progress';
  if (status === 'completed') return 'Complete';
  if (status === 'not_applicable') return 'Not Assigned';
  return 'Not Started';
}
