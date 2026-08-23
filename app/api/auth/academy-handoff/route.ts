import { NextRequest, NextResponse } from 'next/server';
import { academySessionCookie, createAcademySession } from '@/lib/academy/session';
import { readSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session || session.role !== 'employee' || !session.identityId) {
    return NextResponse.redirect(new URL('/manager', request.url));
  }

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'BM OS is not configured.' }, { status: 503 });

  const [{ data: access }, { data: employee, error: employeeError }] = await Promise.all([
    supabase
      .from('bm_identity_system_access')
      .select('identity_id')
      .eq('identity_id', session.identityId)
      .eq('system_code', 'academy')
      .maybeSingle(),
    supabase
      .from('time_employees')
      .select('id,first_name,last_name,job_title_id,active,time_job_titles(name),time_locations!time_employees_primary_location_id_fkey(name)')
      .eq('id', session.userId)
      .eq('active', true)
      .maybeSingle(),
  ]);

  if (!access) return NextResponse.json({ message: 'BM Academy access has not been assigned.' }, { status: 403 });
  if (employeeError || !employee) return NextResponse.json({ message: 'Your employee record is not active.' }, { status: 403 });

  const relationName = (value: unknown) => {
    if (Array.isArray(value)) return (value[0] as { name?: string } | undefined)?.name || '';
    return (value as { name?: string } | null)?.name || '';
  };
  const token = createAcademySession({
    employeeId: employee.id,
    name: `${employee.first_name || ''} ${employee.last_name || ''}`.trim(),
    jobTitleId: employee.job_title_id,
    jobTitle: relationName(employee.time_job_titles),
    location: relationName(employee.time_locations),
  });

  const response = NextResponse.redirect(new URL('/academy', request.url));
  response.cookies.set(academySessionCookie.name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: academySessionCookie.maxAge,
  });
  return response;
}
