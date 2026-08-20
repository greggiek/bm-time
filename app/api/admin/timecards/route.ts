import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionToken, sessionCookie, TimeUserSession } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

const BaseSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const UpdateSchema = BaseSchema.extend({
  action: z.literal('update_punch'),
  punchId: z.string().uuid(),
  occurredAt: z.string().datetime(),
});

const DeleteSchema = BaseSchema.extend({
  action: z.literal('delete_punch'),
  punchId: z.string().uuid(),
});

const CreateSchema = BaseSchema.extend({
  action: z.literal('create_punch'),
  employeeId: z.string().uuid(),
  punchAction: z.enum(['clock_in', 'clock_out']),
  occurredAt: z.string().datetime(),
});

const PaidTimeOffSchema = BaseSchema.extend({
  action: z.literal('create_paid_time_off'),
  employeeId: z.string().uuid(),
  entryType: z.enum(['vacation', 'sick']),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.coerce.number().positive().max(24),
  note: z.string().trim().max(250).optional().default(''),
});

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session) return NextResponse.json({ message: 'Please sign in with your manager PIN.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const base = BaseSchema.safeParse(body);
  if (!base.success) return NextResponse.json({ message: base.error.issues[0]?.message || 'Choose a valid date range.' }, { status: 400 });
  if (base.data.endDate < base.data.startDate) return NextResponse.json({ message: 'End date must be on or after start date.' }, { status: 400 });

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });

  if (body?.action === 'update_punch') {
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: 'Invalid punch update.' }, { status: 400 });

    const { data: existing } = await supabase
      .from('time_punch_events')
      .select('location_id')
      .eq('id', parsed.data.punchId)
      .maybeSingle();

    if (!existing || !canAccessLocation(session, existing.location_id)) {
      return NextResponse.json({ message: 'You do not have access to this punch.' }, { status: 403 });
    }

    const { error } = await supabase
      .from('time_punch_events')
      .update({ occurred_at: parsed.data.occurredAt })
      .eq('id', parsed.data.punchId);

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  if (body?.action === 'delete_punch') {
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: 'Invalid punch deletion.' }, { status: 400 });

    const { data: existing } = await supabase.from('time_punch_events').select('location_id').eq('id', parsed.data.punchId).maybeSingle();
    if (!existing || !canAccessLocation(session, existing.location_id)) {
      return NextResponse.json({ message: 'You do not have access to this punch.' }, { status: 403 });
    }

    const { error } = await supabase.from('time_punch_events').delete().eq('id', parsed.data.punchId).eq('location_id', existing.location_id);
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

    if (employeeError || !employee) return NextResponse.json({ message: 'Employee was not found.' }, { status: 404 });
    if (!canAccessLocation(session, employee.primary_location_id)) {
      return NextResponse.json({ message: 'You do not have access to this employee.' }, { status: 403 });
    }

    const { data: kiosk } = await supabase
      .from('time_kiosks')
      .select('id')
      .eq('location_id', employee.primary_location_id)
      .eq('active', true)
      .limit(1)
      .maybeSingle();

    if (!kiosk) return NextResponse.json({ message: 'No active kiosk exists for this employee location.' }, { status: 400 });

    const { error } = await supabase.from('time_punch_events').insert({
      employee_id: parsed.data.employeeId,
      location_id: employee.primary_location_id,
      kiosk_id: kiosk.id,
      action: parsed.data.punchAction,
      occurred_at: parsed.data.occurredAt,
    });

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  if (body?.action === 'create_paid_time_off') {
    const parsed = PaidTimeOffSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: 'Enter a valid time-off date and number of hours.' }, { status: 400 });
    const { data: employee, error: employeeError } = await supabase.from('time_employees').select('primary_location_id').eq('id', parsed.data.employeeId).single();
    if (employeeError || !employee) return NextResponse.json({ message: 'Employee was not found.' }, { status: 404 });
    if (!canAccessLocation(session, employee.primary_location_id)) return NextResponse.json({ message: 'You do not have access to this employee.' }, { status: 403 });
    const { error } = await supabase.from('time_paid_time_off').insert({ employee_id: parsed.data.employeeId, location_id: employee.primary_location_id, entry_type: parsed.data.entryType, entry_date: parsed.data.entryDate, hours: parsed.data.hours, note: parsed.data.note, created_by: session.userId });
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return loadRange(supabase, base.data.startDate, base.data.endDate, session);
}

function canAccessLocation(session: TimeUserSession, locationId: string) {
  return session.role === 'admin' || session.allLocations || session.locationId === locationId;
}

async function loadRange(supabase: NonNullable<ReturnType<typeof getAdminClient>>, startDate: string, endDate: string, session: TimeUserSession) {
  const start = new Date(`${startDate}T00:00:00-04:00`);
  const end = new Date(`${endDate}T00:00:00-04:00`);
  end.setDate(end.getDate() + 1);

  let punchQuery = supabase
    .from('time_punch_events')
    .select('id,action,occurred_at,location_id,time_employees!time_punch_events_employee_id_fkey(id,employee_number,first_name,last_name),time_locations!time_punch_events_location_id_fkey(name)')
    .gte('occurred_at', start.toISOString())
    .lt('occurred_at', end.toISOString())
    .order('occurred_at', { ascending: true });

  let employeeQuery = supabase
    .from('time_employees')
    .select('id,employee_number,first_name,last_name,primary_location_id')
    .eq('active', true)
    .order('last_name');
  let paidTimeOffQuery = supabase.from('time_paid_time_off').select('id,entry_type,entry_date,hours,note,location_id,time_employees(id,employee_number,first_name,last_name),time_locations(name)').gte('entry_date', startDate).lte('entry_date', endDate).order('entry_date', { ascending: true });
  let breakQuery = supabase
    .from('time_breaks')
    .select('id,employee_id,location_id,started_at,ended_at')
    .lt('started_at', end.toISOString())
    .or(`ended_at.is.null,ended_at.gte.${start.toISOString()}`)
    .order('started_at', { ascending: true });

  if (session.role !== 'admin' && !session.allLocations && session.locationId) {
    punchQuery = punchQuery.eq('location_id', session.locationId);
    employeeQuery = employeeQuery.eq('primary_location_id', session.locationId);
    paidTimeOffQuery = paidTimeOffQuery.eq('location_id', session.locationId);
    breakQuery = breakQuery.eq('location_id', session.locationId);
  }

  const [
    { data, error },
    { data: employees, error: employeesError },
    { data: paidTimeOff, error: paidTimeOffError },
    { data: breakRows, error: breaksError },
  ] = await Promise.all([punchQuery, employeeQuery, paidTimeOffQuery, breakQuery]);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  if (employeesError) return NextResponse.json({ message: employeesError.message }, { status: 500 });
  if (paidTimeOffError) return NextResponse.json({ message: paidTimeOffError.message }, { status: 500 });
  if (breaksError) return NextResponse.json({ message: breaksError.message }, { status: 500 });

  const breaks = (breakRows || []).map((entry: any) => ({
    id: entry.id,
    employeeId: entry.employee_id,
    locationId: entry.location_id,
    startedAt: entry.started_at,
    endedAt: entry.ended_at,
  }));

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

  const now = new Date();
  const summaries = Array.from(grouped.values()).map((employeePunches) => {
    const intervals: Array<{ start: Date; end: Date }> = [];
    let openClockIn: Date | null = null;
    for (const punch of employeePunches) {
      if (punch.action === 'clock_in') openClockIn = new Date(punch.occurredAt);
      else if (punch.action === 'clock_out' && openClockIn) {
        intervals.push({ start: openClockIn, end: new Date(punch.occurredAt) });
        openClockIn = null;
      }
    }

    let totalMs = intervals.reduce((sum, interval) => sum + Math.max(0, interval.end.getTime() - interval.start.getTime()), 0);
    let breakMs = 0;
    for (const entry of breaks.filter((item) => item.employeeId === employeePunches[0].employeeId)) {
      const breakStart = new Date(entry.startedAt);
      const breakEnd = entry.endedAt ? new Date(entry.endedAt) : now;
      for (const interval of intervals) {
        const overlapStart = Math.max(interval.start.getTime(), breakStart.getTime());
        const overlapEnd = Math.min(interval.end.getTime(), breakEnd.getTime());
        if (overlapEnd > overlapStart) breakMs += overlapEnd - overlapStart;
      }
    }
    totalMs = Math.max(0, totalMs - breakMs);

    const first = employeePunches[0];
    return {
      employeeId: first.employeeId,
      employeeNumber: first.employeeNumber,
      employeeName: first.employeeName,
      location: first.location,
      totalHours: Math.round((totalMs / 36e5) * 100) / 100,
      breakHours: Math.round((breakMs / 36e5) * 100) / 100,
      incomplete: Boolean(openClockIn),
    };
  });

  return NextResponse.json({
    startDate,
    endDate,
    punches,
    breaks,
    summaries,
    paidTimeOff: (paidTimeOff || []).map((entry: any) => ({ id: entry.id, employeeId: entry.time_employees?.id || '', employeeNumber: entry.time_employees?.employee_number || '', employeeName: `${entry.time_employees?.first_name || ''} ${entry.time_employees?.last_name || ''}`.trim(), location: entry.time_locations?.name || '', entryType: entry.entry_type, entryDate: entry.entry_date, hours: Number(entry.hours), note: entry.note || '' })),
    user: {
      name: session.name,
      role: session.role,
      locationName: session.locationName,
      allLocations: session.allLocations,
    },
    employees: (employees || []).map((employee: any) => ({
      id: employee.id,
      employeeNumber: employee.employee_number,
      name: `${employee.first_name} ${employee.last_name}`,
    })),
  });
}
