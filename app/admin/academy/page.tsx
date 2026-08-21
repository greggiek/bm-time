'use client';

import { useEffect, useMemo, useState } from 'react';
import ManagerShell from '@/components/manager-shell';

type User = { name: string; role: 'admin' | 'manager'; canManageEmployees?: boolean };
type CatalogItem = { code: string; school: string; title: string };
type JobTitle = { id: string; name: string; assignments: string[]; activeEmployees: number; completedModules: number };
const schoolAssignments = [
  { code: 'door', label: 'Door School', prefix: 'door-' },
  { code: 'moulding', label: 'Moulding School', prefix: 'moulding-' },
  { code: 'pvc', label: 'PVC School', prefix: 'pvc-' },
];

export default function AcademyAdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  async function load() {
    const [sessionResponse, academyResponse] = await Promise.all([fetch('/api/auth/session'), fetch('/api/admin/academy')]);
    const sessionData = await sessionResponse.json();
    if (!sessionResponse.ok || sessionData.user?.role !== 'admin') return;
    setUser(sessionData.user);
    const data = await academyResponse.json();
    if (!academyResponse.ok) throw new Error(data.message || 'Unable to load Academy assignments.');
    setCatalog(data.catalog || []); setJobTitles(data.jobTitles || []);
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
  if (loading) return <main className="managerShell"><section className="managerCard loginBox">Loading Academy assignments…</section></main>;
  if (!user) return <main className="managerShell"><section className="managerCard loginBox"><h1>Administrator Access Required</h1><p>Sign in with an administrator PIN.</p></section></main>;
  return <ManagerShell brand="BM OS" title="BM Academy" user={user}>
    <div className="summary"><div><strong>{catalog.length}</strong><span>Training Modules</span></div><div><strong>{jobTitles.filter(title => title.assignments.length).length}</strong><span>Assigned Job Titles</span></div><div><strong>{jobTitles.reduce((sum, title) => sum + title.activeEmployees, 0)}</strong><span>Active Employees</span></div><div><strong>{jobTitles.reduce((sum, title) => sum + title.completedModules, 0)}</strong><span>Completions</span></div></div>
    <section className="managerCard"><div className="sectionHeading"><div><h2>Curriculum by Job Title</h2><p>Schools assign all eight lessons. SOPs can be assigned individually.</p></div><a href="/academy" target="_blank" rel="noreferrer">Open Employee Academy →</a></div>{error ? <div className="error">{error}</div> : null}<div className="academyAssignmentList">{jobTitles.map(title => <article key={title.id} className="academyAssignment"><div className="academyAssignmentTitle"><div><h3>{title.name}</h3><span>{title.activeEmployees} active employees · {title.assignments.length} modules</span></div><strong>{title.completedModules} completions</strong></div><div className="academyAssignmentOptions">{schoolAssignments.map(school => <label key={school.code}><input type="checkbox" checked={schoolChecked(title, school.prefix)} onChange={event => toggle(title, school.code, event.target.checked)}/>{school.label}</label>)}{sops.map(sop => <label key={sop.code}><input type="checkbox" checked={title.assignments.includes(sop.code)} onChange={event => toggle(title, sop.code, event.target.checked)}/>{sop.title}</label>)}</div></article>)}</div></section>
  </ManagerShell>;
}
