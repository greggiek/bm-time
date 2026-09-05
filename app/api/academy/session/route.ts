import { NextRequest, NextResponse } from 'next/server';
import { academyCatalog, publicAcademyModule } from '@/lib/academy/catalog';
import { academySessionCookie, readAcademySession } from '@/lib/academy/session';
import { getAdminClient } from '@/lib/supabase-server';

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
