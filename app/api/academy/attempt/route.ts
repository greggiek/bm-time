import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { academyModuleByCode } from '@/lib/academy/catalog';
import { academySessionCookie, readAcademySession } from '@/lib/academy/session';
import { getAdminClient } from '@/lib/supabase-server';

const AttemptSchema = z.object({ moduleCode: z.string().min(1), answers: z.array(z.number().int().min(0).max(10)).length(5) });

export async function POST(request: NextRequest) {
  const session = readAcademySession(request.cookies.get(academySessionCookie.name)?.value);
  if (!session) return NextResponse.json({ message: 'Sign in with your employee PIN.' }, { status: 401 });
  const parsed = AttemptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Answer all five questions.' }, { status: 400 });
  const module = academyModuleByCode.get(parsed.data.moduleCode);
  if (!module) return NextResponse.json({ message: 'Training module not found.' }, { status: 404 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  if (!session.jobTitleId) return NextResponse.json({ message: 'No job title is assigned to this employee.' }, { status: 403 });
  const { data: assignment } = await supabase.from('academy_job_title_modules').select('module_code').eq('job_title_id', session.jobTitleId).eq('module_code', module.code).eq('required', true).maybeSingle();
  if (!assignment) return NextResponse.json({ message: 'This module is not assigned to your job title.' }, { status: 403 });
  const score = module.quiz.reduce((total, question, index) => total + (parsed.data.answers[index] === question.correct ? 1 : 0), 0);
  const passed = score >= 4;
  const { error: attemptError } = await supabase.from('academy_attempts').insert({ employee_id: session.employeeId, module_code: module.code, score, passed });
  if (attemptError) return NextResponse.json({ message: attemptError.message }, { status: 500 });
  if (passed) {
    const { error } = await supabase.from('academy_completions').upsert({ employee_id: session.employeeId, module_code: module.code, latest_score: score, completed_at: new Date().toISOString() }, { onConflict: 'employee_id,module_code' });
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ score, passed, message: passed ? `Passed: ${score}/5.` : `Not yet: ${score}/5. Review and try again.` });
}
