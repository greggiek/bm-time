import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { academyCatalog } from '@/lib/academy/catalog';
import { readSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';
import { syncAcademyOnboardingStatus } from '@/lib/academy/onboarding-progress';

const UpdateSchema = z.object({ jobTitleId: z.string().uuid(), assignmentCode: z.string().min(1), enabled: z.boolean() });
const schoolPrefixes: Record<string, string> = { door: 'door-', moulding: 'moulding-', pvc: 'pvc-' };

function academyManager(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  return session && (session.role === 'admin' || session.canManageEmployees) ? session : null;
}

export async function GET(request: NextRequest) {
  const session = academyManager(request);
  if (!session) return NextResponse.json({ message: 'Employee-management access is required.' }, { status: 403 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  let employeeQuery = supabase
    .from('time_employees')
    .select('id,employee_number,first_name,last_name,job_title_id,primary_location_id,time_job_titles(name),time_locations!time_employees_primary_location_id_fkey(name)')
    .eq('active', true)
    .order('last_name');
  if (session.role !== 'admin' && !session.allLocations) {
    if (!session.locationId) return NextResponse.json({ message: 'A manager location is required.' }, { status: 403 });
    employeeQuery = employeeQuery.eq('primary_location_id', session.locationId);
  }
  const [titlesResult, assignmentsResult, employeesResult, completionsResult, attemptsResult] = await Promise.all([
    supabase.from('time_job_titles').select('id,name').order('name'),
    supabase.from('academy_job_title_modules').select('job_title_id,module_code').eq('required', true),
    employeeQuery,
    supabase.from('academy_completions').select('employee_id,module_code,latest_score,completed_at'),
    supabase.from('academy_attempts').select('employee_id,module_code,score,passed,attempted_at').order('attempted_at', { ascending: false }),
  ]);
  const firstError = [titlesResult, assignmentsResult, employeesResult, completionsResult, attemptsResult].find(result => result.error)?.error;
  if (firstError) return NextResponse.json({ message: firstError.message }, { status: 500 });
  const assignments = new Map<string, string[]>();
  for (const row of assignmentsResult.data || []) assignments.set(row.job_title_id, [...(assignments.get(row.job_title_id) || []), row.module_code]);
  const completions = new Map<string, Map<string, any>>();
  for (const row of completionsResult.data || []) {
    if (!completions.has(row.employee_id)) completions.set(row.employee_id, new Map());
    completions.get(row.employee_id)!.set(row.module_code, row);
  }
  const latestAttempts = new Map<string, any>();
  for (const row of attemptsResult.data || []) {
    const key = `${row.employee_id}:${row.module_code}`;
    if (!latestAttempts.has(key)) latestAttempts.set(key, row);
  }
  const employeeProgress = (employeesResult.data || []).map((employee: any) => {
    const assignedCodes = employee.job_title_id ? assignments.get(employee.job_title_id) || [] : [];
    const completionMap = completions.get(employee.id) || new Map<string, any>();
    const lessons = academyCatalog.filter(module => assignedCodes.includes(module.code)).map(module => {
      const completion = completionMap.get(module.code);
      const attempt = latestAttempts.get(`${employee.id}:${module.code}`);
      return {
        code: module.code,
        school: module.school,
        title: module.title,
        completed: Boolean(completion),
        score: completion?.latest_score ?? attempt?.score ?? null,
        passed: Boolean(completion || attempt?.passed),
        completedAt: completion?.completed_at || null,
        lastAttemptAt: attempt?.attempted_at || null,
      };
    });
    const completedCount = lessons.filter(lesson => lesson.completed).length;
    const lastActivity = lessons.map(lesson => lesson.lastAttemptAt || lesson.completedAt).filter(Boolean).sort().at(-1) || null;
    const hasAssignedLessonActivity = lessons.some(lesson => lesson.lastAttemptAt || lesson.completedAt);
    const status = lessons.length === 0 ? 'not_assigned' : completedCount === lessons.length ? 'complete' : hasAssignedLessonActivity ? 'in_progress' : 'not_started';
    return {
      id: employee.id,
      employeeNumber: employee.employee_number,
      name: `${employee.first_name || ''} ${employee.last_name || ''}`.trim(),
      jobTitle: relationName(employee.time_job_titles) || 'No job title',
      location: relationName(employee.time_locations) || 'No location',
      assignedCount: lessons.length,
      completedCount,
      percent: lessons.length ? Math.round(completedCount / lessons.length * 100) : 0,
      status,
      lastActivity,
      lessons,
    };
  });
  return NextResponse.json({
    catalog: academyCatalog.map(module => ({ code: module.code, school: module.school, title: module.title })),
    jobTitles: (titlesResult.data || []).map(title => {
      const employees = employeeProgress.filter(employee => (employeesResult.data || []).find((row: any) => row.id === employee.id)?.job_title_id === title.id);
      return { ...title, assignments: assignments.get(title.id) || [], activeEmployees: employees.length, completedModules: employees.reduce((sum, employee) => sum + employee.completedCount, 0) };
    }),
    employees: employeeProgress,
  });
}

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (session?.role !== 'admin') return NextResponse.json({ message: 'Company administrator access is required.' }, { status: 403 });
  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Invalid Academy assignment.' }, { status: 400 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  const prefix = schoolPrefixes[parsed.data.assignmentCode];
  const moduleCodes = prefix ? academyCatalog.filter(module => module.code.startsWith(prefix)).map(module => module.code) : [parsed.data.assignmentCode];
  if (!moduleCodes.length || moduleCodes.some(code => !academyCatalog.some(module => module.code === code))) return NextResponse.json({ message: 'Training module not found.' }, { status: 404 });
  if (parsed.data.enabled) {
    const { error } = await supabase.from('academy_job_title_modules').upsert(moduleCodes.map(module_code => ({ job_title_id: parsed.data.jobTitleId, module_code, required: true })), { onConflict: 'job_title_id,module_code' });
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from('academy_job_title_modules').delete().eq('job_title_id', parsed.data.jobTitleId).in('module_code', moduleCodes);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }
  const { data: affectedEmployees, error: employeeError } = await supabase.from('time_employees').select('id').eq('job_title_id', parsed.data.jobTitleId).eq('active', true);
  if (employeeError) return NextResponse.json({ message: employeeError.message }, { status: 500 });
  try {
    await Promise.all((affectedEmployees || []).map(employee => syncAcademyOnboardingStatus(supabase, employee.id)));
  } catch (error) {
    console.error('Academy onboarding status sync failed after curriculum update.', error);
    return NextResponse.json({ message: 'The curriculum was updated, but onboarding status could not be refreshed.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

function relationName(value: unknown) {
  if (Array.isArray(value)) return (value[0] as { name?: string } | undefined)?.name || '';
  return (value as { name?: string } | null)?.name || '';
}
