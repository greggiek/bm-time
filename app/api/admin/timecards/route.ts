import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminClient } from '@/lib/supabase-server';

const BaseSchema = z.object({
  password: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const UpdateSchema = BaseSchema.extend({
  action: z.literal('update_punch'),
  punchId: z.string().uuid(),
  occurredAt: z.string().datetime(),
});

const CreateSchema = BaseSchema.extend({
  action: z.literal('create_punch'),
  employeeId: z.string().uuid(),
  punchAction: z.enum(['clock_in', 'clock_out']),
  occurredAt: z.string().datetime(),
});

function isAuthorized(password: string) {
  const expected = process.env.ADMIN_PASSWORD || process.env.MANAGER_PASSWORD;
  return Boolean(expected && password === expected);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const base = BaseSchema.safeParse(body);
  if (!base.success || !isAuthorized(base.data.password)) {
    return NextResponse.json({ message: 'Incorrect admin password.' }, { status: 401 });
  }

  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  }

  if (body?.action === 'update_punch') {
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: 'Invalid punch update.' }, { status: 400 });

    const { error } = await supabase
      .from('time_punch_events')
      .update({ occurred_at: parsed.data.occurredAt })
      .eq('id', parsed.data.punchId);

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  if (body?.action === 'create_punch') {
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: 'Invalid manual punch.' }, { status: 400 });

    const { data: employee, error: employeeError } = await supabase
      .from('time_employees')
      .select('primary_location_id')
      .eq('id', parsed.data.employeeId)
      .single();

    if (employeeError || !employee) {
      return NextResponse.json({ message: 'Employee was not found.' }, { status: 404 });
    }

    const { data: kiosk, error: kioskError } = await supabase
      .from('time_kiosks')
      .select('id')
      .eq('location_id', employee.primary_location_id)
      .eq('active', true)
      .limit(1)
      .maybeSingle();

    if (kioskError || !kiosk) {
      return NextResponse.json({ message: 'No active kiosk exists for this employee location.' }, { status: 400 });
    }

    const { error } = await supabase.from('time_punch_events').insert({
      employee_id: parsed.data.employeeId,
      location_id: employee.primary_location_id,
      kiosk_id: kiosk.id,
      action: parsed.data.punchAction,
      occurred_at: parsed.data.occurredAt,
    });

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return loadWeek(supabase, base.data.weekStart);
}

async function loadWeek(supabase: ReturnType<typeof getAdminClient>, weekStart: string) {
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });

  const start = new Date(`${weekStart}T00:00:00-04:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const [{ data, error }, { data: employees, error: employeesError }] = await Promise.all([
    supabase
      .from('time_punch_events')
      .select('id,action,occurred_at,time_employees!time_punch_events_employee_id_fkey(id,employee_number,first_name,last_name),time_locations!time_punch_events_location_id_fkey(name)')
      .gte('occurred_at', start.toISOString())
      .lt('occurred_at', end.toISOString())
      .order('occurred_at', { ascending: true }),
    supabase
      .from('time_employees')
      .select('id,employee_number,first_name,last_name')
      .eq('active', true)
      .order('last_name'),
  ]);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  if (employeesError) return NextResponse.json({ message: employeesError.message }, { status: 500 });

  const punches = (data || []).map((row: any) => ({
    id: row.id,
    employeeId: row.time_employees?.id || '',
    employeeNumber: row.time_employees?.employee_number || '',
    employeeName: `${row.time_employees?.first_name || ''} ${row.time_employees?.last_name || ''}`.trim(),
    location: row.time_locations?.name || '',
    action: row.action,
    occurredAt: row.occurred_at,
  }));

  const grouped = new Map<string, typeof punches>();
  for (const punch of punches) {
    const list = grouped.get(punch.employeeId) || [];
    list.push(punch);
    grouped.set(punch.employeeId, list);
  }

  const summaries = Array.from(grouped.values()).map((employeePunches) => {
    let totalMs = 0;
    let openClockIn: Date | null = null;

    for (const punch of employeePunches) {
      if (punch.action === 'clock_in') {
        openClockIn = new Date(punch.occurredAt);
      } else if (punch.action === 'clock_out' && openClockIn) {
        totalMs += new Date(punch.occurredAt).getTime() - openClockIn.getTime();
        openClockIn = null;
      }
    }

    const first = employeePunches[0];
    return {
      employeeId: first.employeeId,
      employeeNumber: first.employeeNumber,
      employeeName: first.employeeName,
      location: first.location,
      totalHours: Math.round((totalMs / 36e5) * 100) / 100,
      incomplete: Boolean(openClockIn),
    };
  });

  return NextResponse.json({
    weekStart,
    weekEnd: end.toISOString().slice(0, 10),
    punches,
    summaries,
    employees: (employees || []).map((employee: any) => ({
      id: employee.id,
      employeeNumber: employee.employee_number,
      name: `${employee.first_name} ${employee.last_name}`,
    })),
  });
}
