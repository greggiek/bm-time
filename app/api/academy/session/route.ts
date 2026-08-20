import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { academyCatalog, publicAcademyModule } from '@/lib/academy/catalog';
import { academySessionCookie, createAcademySession, readAcademySession } from '@/lib/academy/session';
import { getAdminClient } from '@/lib/supabase-server';

const LoginSchema = z.object({ pin: z.string().regex(/^\d{4}$/) });

export async function POST(request: NextRequest) {
  const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Enter a valid 4-digit PIN.' }, { status: 400 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  const { data: employees, error } = await supabase.from('time_employees')
    .select('id,first_name,last_name,pin_hash,job_title_id,time_job_titles(name),time_locations!time_employees_primary_location_id_fkey(name)')
    .eq('active', true);
  if (error) return NextResponse.json({ message: 'Unable to read employees.' }, { status: 500 });
  let employee: any = null;
  for (const candidate of employees || []) {
    if (await bcrypt.compare(parsed.data.pin, candidate.pin_hash)) { employee = candidate; break; }
  }
  if (!employee) return NextResponse.json({ message: 'PIN not recognized.' }, { status: 401 });
  const { data: identity } = await supabase.from('bm_identities').select('id').eq('employee_id', employee.id).eq('active', true).maybeSingle();
  if (!identity) return NextResponse.json({ message: 'Your BM OS identity is not active.' }, { status: 403 });
  const { data: roleAssignments } = await supabase.from('bm_identity_roles').select('role_id').eq('identity_id', identity.id);
  const roleIds = (roleAssignments || []).map(row => row.role_id);
  if (!roleIds.length) return NextResponse.json({ message: 'BM Academy access has not been assigned.' }, { status: 403 });
  const { data: permissionLinks } = await supabase.from('bm_role_permissions').select('permission_id').in('role_id', roleIds);
  const permissionIds = (permissionLinks || []).map(row => row.permission_id);
  const { data: academyPermission } = permissionIds.length
    ? await supabase.from('bm_permissions').select('id').in('id', permissionIds).eq('code', 'academy.learn').limit(1).maybeSingle()
    : { data: null };
  if (!academyPermission) return NextResponse.json({ message: 'BM Academy access has not been assigned.' }, { status: 403 });
  const relationName = (value: any) => Array.isArray(value) ? value[0]?.name || '' : value?.name || '';
  const token = createAcademySession({
    employeeId: employee.id,
    name: `${employee.first_name} ${employee.last_name}`,
    jobTitleId: employee.job_title_id,
    jobTitle: relationName(employee.time_job_titles),
    location: relationName(employee.time_locations),
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(academySessionCookie.name, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: academySessionCookie.maxAge });
  return response;
}

export async function GET(request: NextRequest) {
  const session = readAcademySession(request.cookies.get(academySessionCookie.name)?.value);
  if (!session) return NextResponse.json({ message: 'Sign in with your employee PIN.' }, { status: 401 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  const [assignmentsResult, completionsResult] = await Promise.all([
    session.jobTitleId ? supabase.from('academy_job_title_modules').select('module_code').eq('job_title_id', session.jobTitleId).eq('required', true) : Promise.resolve({ data: [], error: null }),
    supabase.from('academy_completions').select('module_code,latest_score,completed_at').eq('employee_id', session.employeeId),
  ]);
  const firstError = assignmentsResult.error || completionsResult.error;
  if (firstError) return NextResponse.json({ message: firstError.message }, { status: 500 });
  const assigned = new Set((assignmentsResult.data || []).map(row => row.module_code));
  return NextResponse.json({
    user: { name: session.name, jobTitle: session.jobTitle, location: session.location },
    modules: academyCatalog.filter(module => assigned.has(module.code)).map(publicAcademyModule),
    completions: completionsResult.data || [],
  });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(academySessionCookie.name, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
