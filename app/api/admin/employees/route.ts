import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getAdminClient } from '@/lib/supabase-server';

const AdminSchema = z.object({
  password: z.string().min(1),
});

const CreateEmployeeSchema = AdminSchema.extend({
  action: z.literal('create'),
  employeeNumber: z.string().min(1).max(20),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  pin: z.string().regex(/^\d{4}$/),
  locationId: z.string().uuid(),
  jobTitleId: z.string().uuid().nullable().optional(),
});

const DeactivateEmployeeSchema = AdminSchema.extend({
  action: z.literal('deactivate'),
  employeeId: z.string().uuid(),
});

function isAuthorized(password: string) {
  const expected = process.env.ADMIN_PASSWORD || process.env.MANAGER_PASSWORD;
  return Boolean(expected && password === expected);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const auth = AdminSchema.safeParse(body);
  if (!auth.success || !isAuthorized(auth.data.password)) {
    return NextResponse.json({ message: 'Incorrect admin password.' }, { status: 401 });
  }

  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  }

  if (!body?.action) {
    const [{ data: employees, error: employeeError }, { data: locations }, { data: jobTitles }] = await Promise.all([
      supabase
        .from('time_employees')
        .select('id,employee_number,first_name,last_name,active,time_locations!time_employees_primary_location_id_fkey(id,name),time_job_titles(id,name)')
        .order('last_name'),
      supabase.from('time_locations').select('id,name').eq('active', true).order('name'),
      supabase.from('time_job_titles').select('id,name').eq('active', true).order('name'),
    ]);

    if (employeeError) {
      return NextResponse.json({ message: employeeError.message }, { status: 500 });
    }

    return NextResponse.json({ employees: employees || [], locations: locations || [], jobTitles: jobTitles || [] });
  }

  if (body.action === 'create') {
    const parsed = CreateEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: 'Complete all required employee fields.' }, { status: 400 });
    }

    const pinHash = await bcrypt.hash(parsed.data.pin, 10);
    const { error } = await supabase.from('time_employees').insert({
      employee_number: parsed.data.employeeNumber.trim(),
      first_name: parsed.data.firstName.trim(),
      last_name: parsed.data.lastName.trim(),
      pin_hash: pinHash,
      primary_location_id: parsed.data.locationId,
      job_title_id: parsed.data.jobTitleId || null,
      active: true,
    });

    if (error) {
      const message = error.code === '23505' ? 'Employee number already exists.' : error.message;
      return NextResponse.json({ message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  }

  if (body.action === 'deactivate') {
    const parsed = DeactivateEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: 'Invalid employee.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('time_employees')
      .update({ active: false })
      .eq('id', parsed.data.employeeId);

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ message: 'Unsupported action.' }, { status: 400 });
}
