'use client';

import { useEffect, useMemo, useState } from 'react';
import ManagerShell from '@/components/manager-shell';

type User = { name: string; role: 'admin' | 'manager'; canManageEmployees?: boolean };
type CatalogItem = { code: string; school: string; title: string };
type JobTitle = { id: string; name: string; assignments: string[]; activeEmployees: number; completedModules: number };
type ProgressStatus = 'not_assigned' | 'not_started' | 'in_progress' | 'complete';
type LessonProgress = { code: string; school: string; title: string; completed: boolean; score: number | null; completedAt: string | null; lastAttemptAt: string | null };
type EmployeeProgress = { id: string; employeeNumber: string; name: string; jobTitle: string; location: string; assignedCount: number; completedCount: number; percent: number; status: ProgressStatus; lastActivity: string | null; lessons: LessonProgress[] };
const schoolAssignments = [
  { code: 'door', label: 'Door School', prefix: 'door-' },
  { code: 'moulding', label: 'Moulding School', prefix: 'moulding-' },
  { code: 'pvc', label: 'PVC School', prefix: 'pvc-' },
];

export default function AcademyAdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [employees, setEmployees] = useState<EmployeeProgress[]>([]);
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [jobTitleFilter, setJobTitleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  async function load() {
    const [sessionResponse, academyResponse] = await Promise.all([fetch('/api/auth/session'), fetch('/api/admin/academy')]);
    const sessionData = await sessionResponse.json();
    if (!sessionResponse.ok || (sessionData.user?.role !== 'admin' && !sessionData.user?.canManageEmployees)) return;
    setUser(sessionData.user);
    const data = await academyResponse.json();
    if (!academyResponse.ok) throw new Error(data.message || 'Unable to load Academy assignments.');
    setCatalog(data.catalog || []); setJobTitles(data.jobTitles || []); setEmployees(data.employees || []);
  }
  useEffect(() => { load().catch(err => setError(err instanceof Error ? err.message : 'Unable to load Academy assignments.')).finally(() => setLoading(false)); }, []);
  const sops = useMemo(() => catalog.filter(module => module.school === 'SOP School'), [catalog]);
  async function toggle(jobTitle: JobTitle, assignmentCode: string, enabled: boolean) {
    setError('');
    const response = await fetch('/api/admin/academy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobTitleId: jobTitle.id, assignmentCode, enabled }) });
    const data = await response.json();
    if (!response.ok) { setError(data.message || 'Unable to update assignment.'); return; }
    await load();
  }
  const schoolChecked = (jobTitle: JobTitle, prefix: string) => catalog.filter(module => module.code.startsWith(prefix)).every(module => jobTitle.assignments.includes(module.code));
  const locations = useMemo(() => Array.from(new Set(employees.map(employee => employee.location))).sort(), [employees]);
  const employeeJobTitles = useMemo(() => Array.from(new Set(employees.map(employee => employee.jobTitle))).sort(), [employees]);
  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter(employee => {
      const matchesSearch = !term || `${employee.name} ${employee.employeeNumber} ${employee.location} ${employee.jobTitle}`.toLowerCase().includes(term);
      return matchesSearch
        && (locationFilter === 'all' || employee.location === locationFilter)
        && (jobTitleFilter === 'all' || employee.jobTitle === jobTitleFilter)
        && (statusFilter === 'all' || employee.status === statusFilter);
    });
  }, [employees, search, locationFilter, jobTitleFilter, statusFilter]);
  if (loading) return <main className="managerShell"><section className="managerCard loginBox">Loading Academy assignments…</section></main>;
  if (!user) return <main className="managerShell"><section className="managerCard loginBox"><h1>Administrator Access Required</h1><p>Sign in with an administrator PIN.</p></section></main>;
  return <ManagerShell brand="BM OS" title="BM Academy" user={user}>
    <div className="summary"><div><strong>{catalog.length}</strong><span>Training Modules</span></div><div><strong>{employees.filter(employee => employee.status === 'complete').length}</strong><span>Employees Complete</span></div><div><strong>{employees.filter(employee => employee.status === 'in_progress').length}</strong><span>In Progress</span></div><div><strong>{employees.reduce((sum, employee) => sum + employee.completedCount, 0)}</strong><span>Lessons Completed</span></div></div>
    <section className="managerCard academyProgressCard">
      <div className="sectionHeading"><div><h2>Employee Training Progress</h2><p>Individual status, scores, lesson completion and latest activity.</p></div><a href="/academy" target="_blank" rel="noreferrer">Open Employee Academy →</a></div>
      {error ? <div className="error">{error}</div> : null}
      <div className="academyProgressFilters">
        <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search employee or number" aria-label="Search employees" />
        <select value={locationFilter} onChange={event => setLocationFilter(event.target.value)} aria-label="Filter by location"><option value="all">All Locations</option>{locations.map(location => <option key={location}>{location}</option>)}</select>
        <select value={jobTitleFilter} onChange={event => setJobTitleFilter(event.target.value)} aria-label="Filter by job title"><option value="all">All Job Titles</option>{employeeJobTitles.map(title => <option key={title}>{title}</option>)}</select>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Filter by status"><option value="all">All Statuses</option><option value="not_started">Not Started</option><option value="in_progress">In Progress</option><option value="complete">Complete</option><option value="not_assigned">Not Assigned</option></select>
      </div>
      <div className="tableWrap academyProgressTable"><table><thead><tr><th>Employee</th><th>Location</th><th>Job Title</th><th>Progress</th><th>Status</th><th>Last Activity</th></tr></thead><tbody>{filteredEmployees.map(employee => <EmployeeProgressRows key={employee.id} employee={employee} expanded={expandedId === employee.id} onToggle={() => setExpandedId(current => current === employee.id ? null : employee.id)} />)}{filteredEmployees.length === 0 ? <tr><td colSpan={6}>No employees match these filters.</td></tr> : null}</tbody></table></div>
    </section>
    {user.role === 'admin' ? <section className="managerCard"><div className="sectionHeading"><div><h2>Curriculum by Job Title</h2><p>Schools assign all eight lessons. SOPs can be assigned individually.</p></div></div><div className="academyAssignmentList">{jobTitles.map(title => <article key={title.id} className="academyAssignment"><div className="academyAssignmentTitle"><div><h3>{title.name}</h3><span>{title.activeEmployees} active employees · {title.assignments.length} modules</span></div><strong>{title.completedModules} completions</strong></div><div className="academyAssignmentOptions">{schoolAssignments.map(school => <label key={school.code}><input type="checkbox" checked={schoolChecked(title, school.prefix)} onChange={event => toggle(title, school.code, event.target.checked)}/>{school.label}</label>)}{sops.map(sop => <label key={sop.code}><input type="checkbox" checked={title.assignments.includes(sop.code)} onChange={event => toggle(title, sop.code, event.target.checked)}/>{sop.title}</label>)}</div></article>)}</div></section> : null}
  </ManagerShell>;
}

function EmployeeProgressRows({ employee, expanded, onToggle }: { employee: EmployeeProgress; expanded: boolean; onToggle: () => void }) {
  return <>
    <tr className="academyEmployeeRow"><td><button className="academyEmployeeButton" onClick={onToggle} aria-expanded={expanded}><span>{expanded ? '−' : '+'}</span><strong>{employee.name}</strong><small>#{employee.employeeNumber}</small></button></td><td>{employee.location}</td><td>{employee.jobTitle}</td><td><div className="academyEmployeeProgress"><strong>{employee.percent}%</strong><span>{employee.completedCount}/{employee.assignedCount} lessons</span><i><b style={{ width: `${employee.percent}%` }} /></i></div></td><td><span className={`academyProgressStatus ${employee.status}`}>{statusLabel(employee.status)}</span></td><td>{employee.lastActivity ? formatDate(employee.lastActivity) : '—'}</td></tr>
    {expanded ? <tr className="academyLessonDetailRow"><td colSpan={6}>{employee.lessons.length ? <div className="academyLessonDetail">{employee.lessons.map(lesson => <article key={lesson.code} className={lesson.completed ? 'complete' : ''}><span>{lesson.completed ? '✓' : '○'}</span><div><strong>{lesson.title}</strong><small>{lesson.school}</small></div><div><b>{lesson.completed ? 'Passed' : lesson.score !== null ? 'Attempted' : 'Not Started'}</b><small>{lesson.score !== null ? `${lesson.score}/5` : 'No score'}{lesson.completedAt ? ` · ${formatDate(lesson.completedAt)}` : ''}</small></div></article>)}</div> : <p className="timecardState">No curriculum is assigned to this employee’s job title.</p>}</td></tr> : null}
  </>;
}

function statusLabel(status: ProgressStatus) {
  if (status === 'complete') return 'Complete';
  if (status === 'in_progress') return 'In Progress';
  if (status === 'not_assigned') return 'Not Assigned';
  return 'Not Started';
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
