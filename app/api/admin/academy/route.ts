import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { academyCatalog } from '@/lib/academy/catalog';
import { readSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

const UpdateSchema = z.object({ jobTitleId: z.string().uuid(), assignmentCode: z.string().min(1), enabled: z.boolean() });
const schoolPrefixes: Record<string, string> = { door: 'door-', moulding: 'moulding-', pvc: 'pvc-' };

function admin(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  return session?.role === 'admin' ? session : null;
}

export async function GET(request: NextRequest) {
  if (!admin(request)) return NextResponse.json({ message: 'Company administrator access is required.' }, { status: 403 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  const [titlesResult, assignmentsResult, employeesResult, completionsResult] = await Promise.all([
    supabase.from('time_job_titles').select('id,name').order('name'),
    supabase.from('academy_job_title_modules').select('job_title_id,module_code').eq('required', true),
    supabase.from('time_employees').select('id,job_title_id').eq('active', true),
    supabase.from('academy_completions').select('employee_id,module_code'),
  ]);
  const firstError = [titlesResult, assignmentsResult, employeesResult, completionsResult].find(result => result.error)?.error;
  if (firstError) return NextResponse.json({ message: firstError.message }, { status: 500 });
  const assignments = new Map<string, string[]>();
  for (const row of assignmentsResult.data || []) assignments.set(row.job_title_id, [...(assignments.get(row.job_title_id) || []), row.module_code]);
  const employeesByTitle = new Map<string, string[]>();
  for (const employee of employeesResult.data || []) if (employee.job_title_id) employeesByTitle.set(employee.job_title_id, [...(employeesByTitle.get(employee.job_title_id) || []), employee.id]);
  const completedByEmployee = new Map<string, number>();
  for (const row of completionsResult.data || []) completedByEmployee.set(row.employee_id, (completedByEmployee.get(row.employee_id) || 0) + 1);
  return NextResponse.json({
    catalog: academyCatalog.map(module => ({ code: module.code, school: module.school, title: module.title })),
    jobTitles: (titlesResult.data || []).map(title => {
      const employeeIds = employeesByTitle.get(title.id) || [];
      return { ...title, assignments: assignments.get(title.id) || [], activeEmployees: employeeIds.length, completedModules: employeeIds.reduce((sum, id) => sum + (completedByEmployee.get(id) || 0), 0) };
    }),
  });
}

export async function POST(request: NextRequest) {
  if (!admin(request)) return NextResponse.json({ message: 'Company administrator access is required.' }, { status: 403 });
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
  return NextResponse.json({ ok: true });
}
