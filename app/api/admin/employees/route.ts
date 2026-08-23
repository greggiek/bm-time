import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { readSessionToken, sessionCookie, TimeUserSession } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';
import { canonicalJobTitles } from '@/lib/bm-os/job-titles';

const CreateEmployeeSchema = z.object({
  action: z.literal('create'),
  employeeNumber: z.string().min(1).max(20),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  pin: z.string().regex(/^\d{4}$/),
  locationId: z.string().uuid(),
  jobTitle: z.enum(canonicalJobTitles).nullable().optional(),
});

const UpdateEmployeeSchema = z.object({
  action: z.literal('update'),
  employeeId: z.string().uuid(),
  employeeNumber: z.string().min(1).max(20),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  pin: z.union([z.literal(''), z.string().regex(/^\d{4}$/)]).optional(),
  locationId: z.string().uuid(),
  jobTitle: z.enum(canonicalJobTitles).nullable().optional(),
  active: z.boolean(),
});

const EmployeeActionSchema = z.object({
  action: z.enum(['deactivate', 'delete']),
  employeeId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session) return NextResponse.json({ message: 'Sign in with your manager PIN.' }, { status: 401 });
  if (session.role !== 'admin' && !session.canManageEmployees) {
    return NextResponse.json({ message: 'You do not have permission to manage employees.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });

  if (!body?.action) return loadEmployees(supabase, session);

  if (body.action === 'create') {
    const parsed = CreateEmployeeSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: 'Complete all required employee fields.' }, { status: 400 });
    if (!canAccessLocation(session, parsed.data.locationId)) {
      return NextResponse.json({ message: 'You cannot add employees to that warehouse.' }, { status: 403 });
    }

    const jobTitleId = await resolveJobTitleId(supabase, parsed.data.jobTitle);
    if (parsed.data.jobTitle && !jobTitleId) return NextResponse.json({ message: 'That BM OS job title is unavailable.' }, { status: 400 });
    const pinHash = await bcrypt.hash(parsed.data.pin, 10);
    const { error } = await supabase.from('time_employees').insert({
      employee_number: parsed.data.employeeNumber.trim(),
      first_name: parsed.data.firstName.trim(),
      last_name: parsed.data.lastName.trim(),
      pin_hash: pinHash,
      primary_location_id: parsed.data.locationId,
      job_title_id: jobTitleId,
      active: true,
    });
    if (error) return NextResponse.json({ message: error.code === '23505' ? 'Employee number already exists.' : error.message }, { status: 400 });
  }

  if (body.action === 'update') {
    const parsed = UpdateEmployeeSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: 'Complete all required employee fields.' }, { status: 400 });
    if (!await canAccessEmployee(supabase, session, parsed.data.employeeId) || !canAccessLocation(session, parsed.data.locationId)) {
      return NextResponse.json({ message: 'You do not have access to this employee.' }, { status: 403 });
    }

    const jobTitleId = await resolveJobTitleId(supabase, parsed.data.jobTitle);
    if (parsed.data.jobTitle && !jobTitleId) return NextResponse.json({ message: 'That BM OS job title is unavailable.' }, { status: 400 });
    const updates: Record<string, unknown> = {
      employee_number: parsed.data.employeeNumber.trim(), first_name: parsed.data.firstName.trim(),
      last_name: parsed.data.lastName.trim(), primary_location_id: parsed.data.locationId,
      job_title_id: jobTitleId, active: parsed.data.active,
    };
    if (parsed.data.pin) updates.pin_hash = await bcrypt.hash(parsed.data.pin, 10);
    const { error } = await supabase.from('time_employees').update(updates).eq('id', parsed.data.employeeId);
    if (error) return NextResponse.json({ message: error.code === '23505' ? 'Employee number already exists.' : error.message }, { status: 400 });
  }

  if (body.action === 'deactivate' || body.action === 'delete') {
    const parsed = EmployeeActionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: 'Invalid employee.' }, { status: 400 });
    if (!await canAccessEmployee(supabase, session, parsed.data.employeeId)) {
      return NextResponse.json({ message: 'You do not have access to this employee.' }, { status: 403 });
    }

    if (body.action === 'deactivate') {
      const { error } = await supabase.from('time_employees').update({ active: false }).eq('id', parsed.data.employeeId);
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    } else {
      const { count, error: countError } = await supabase.from('time_punch_events').select('id', { count: 'exact', head: true }).eq('employee_id', parsed.data.employeeId);
      if (countError) return NextResponse.json({ message: countError.message }, { status: 500 });
      if ((count || 0) > 0) return NextResponse.json({ message: 'This employee has punch history and cannot be permanently deleted. Deactivate them instead.' }, { status: 409 });
      const { error } = await supabase.from('time_employees').delete().eq('id', parsed.data.employeeId);
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    }
  }

  return loadEmployees(supabase, session);
}

function canAccessLocation(session: TimeUserSession, locationId: string) {
  return session.role === 'admin' || session.allLocations || session.locationId === locationId;
}

async function canAccessEmployee(supabase: NonNullable<ReturnType<typeof getAdminClient>>, session: TimeUserSession, employeeId: string) {
  const { data } = await supabase.from('time_employees').select('primary_location_id').eq('id', employeeId).maybeSingle();
  return Boolean(data && canAccessLocation(session, data.primary_location_id));
}

async function resolveJobTitleId(supabase: NonNullable<ReturnType<typeof getAdminClient>>, name?: string | null) {
  if (!name) return null;
  const { data } = await supabase.from('time_job_titles').select('id').eq('name', name).eq('active', true).maybeSingle();
  return data?.id || null;
}

async function loadEmployees(supabase: NonNullable<ReturnType<typeof getAdminClient>>, session: TimeUserSession) {
  let employeeQuery = supabase.from('time_employees')
    .select('id,employee_number,first_name,last_name,active,primary_location_id,time_locations!time_employees_primary_location_id_fkey(id,name),time_job_titles(id,name)')
    .order('last_name');
  let locationQuery = supabase.from('time_locations').select('id,name').eq('active', true).order('name');
  if (session.role !== 'admin' && !session.allLocations && session.locationId) {
    employeeQuery = employeeQuery.eq('primary_location_id', session.locationId);
    locationQuery = locationQuery.eq('id', session.locationId);
  }
  const [{ data: employees, error }, { data: locations }, { data: jobTitles, error: jobTitleError }] = await Promise.all([
    employeeQuery, locationQuery, supabase.from('time_job_titles').select('id,name').eq('active', true).order('name'),
  ]);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  if (jobTitleError) console.error('Unable to load BM OS job titles', jobTitleError.message);
  const availableNames = new Set((jobTitles || []).map(title => title.name));
  const visibleJobTitles = canonicalJobTitles.filter(name => availableNames.has(name)).map(name => ({ name }));
  return NextResponse.json({
    employees: employees || [], locations: locations || [],
    jobTitles: visibleJobTitles.length ? visibleJobTitles : canonicalJobTitles.map(name => ({ name })),
  });
}
