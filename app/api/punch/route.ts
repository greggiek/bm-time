import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { addDemoPunch, currentDemoStatus, findDemoEmployee } from '@/lib/demo-store';
import { getAdminClient } from '@/lib/supabase-server';

const RequestSchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  action: z.enum(['identify', 'clock_in', 'clock_out', 'start_break', 'end_break']),
  employeeId: z.string().optional(),
  kioskToken: z.string().min(8),
  kioskId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: 'Enter a valid 4-digit PIN.' }, { status: 400 });
  }

  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  console.info('[api/punch] request', { action: parsed.data.action, kioskId: parsed.data.kioskId || null, demo });
  if (demo) {
    const employee = findDemoEmployee(parsed.data.pin);
    if (!employee) return NextResponse.json({ message: 'PIN not recognized.' }, { status: 404 });
    const location = employee.location;
    const status = currentDemoStatus(employee.id);
    if (parsed.data.action === 'identify') {
      return NextResponse.json({
        employeeId: employee.id,
        firstName: employee.firstName,
        status,
        location,
      });
    }

    if (parsed.data.action === 'start_break' || parsed.data.action === 'end_break') {
      return NextResponse.json({ message: 'Breaks are unavailable in demo mode.' }, { status: 409 });
    }
    const expected = status === 'clocked_in' ? 'clock_out' : 'clock_in';
    if (parsed.data.action !== expected) {
      return NextResponse.json({
        message: `You are already ${status === 'clocked_in' ? 'clocked in' : 'clocked out'}.`,
      }, { status: 409 });
    }

    const punch = addDemoPunch(employee.id, parsed.data.action, location);
    return NextResponse.json({
      ok: true,
      firstName: employee.firstName,
      action: punch.action,
      occurredAt: punch.occurredAt,
    });
  }

  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  }

  const { data: authorizedKiosk, error: authorizationError } = await supabase
    .from('time_kiosks')
    .select('id,location_id,time_locations!time_kiosks_location_id_fkey(name)')
    .eq('token', parsed.data.kioskToken)
    .eq('active', true)
    .maybeSingle();

  if (authorizationError || !authorizedKiosk) {
    return NextResponse.json({ message: 'This kiosk is not registered.' }, { status: 401 });
  }

  const { data: employees, error } = await supabase
    .from('time_employees')
    .select('id,first_name,pin_hash,active,primary_location_id')
    .eq('active', true);

  if (error) {
    return NextResponse.json({ message: 'Unable to read employees.' }, { status: 500 });
  }

  const employee = await findMatchingEmployee(employees ?? [], parsed.data.pin);
  if (!employee) return NextResponse.json({ message: 'PIN not recognized.' }, { status: 404 });

  if (!employee.primary_location_id) {
    return NextResponse.json({ message: 'No primary location is assigned. Ask a manager for help.' }, { status: 409 });
  }

  const { data: kiosk, error: kioskError } = await supabase
    .from('time_kiosks')
    .select('id,location_id,time_locations!time_kiosks_location_id_fkey(name)')
    .eq('location_id', employee.primary_location_id)
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (kioskError || !kiosk) {
    return NextResponse.json({ message: 'Your assigned location does not have an active kiosk.' }, { status: 409 });
  }

  const { data: latest } = await supabase
    .from('time_punch_events')
    .select('action')
    .eq('employee_id', employee.id)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const status = latest?.action === 'clock_in' ? 'clocked_in' : 'clocked_out';
  const { data: openBreak, error: breakReadError } = await supabase
    .from('time_breaks')
    .select('id,started_at')
    .eq('employee_id', employee.id)
    .is('ended_at', null)
    .maybeSingle();

  if (breakReadError) {
    return NextResponse.json({ message: 'Unable to read break status.' }, { status: 500 });
  }

  if (parsed.data.action === 'identify') {
    return NextResponse.json({
      employeeId: employee.id,
      firstName: employee.first_name,
      status,
      breakStartedAt: openBreak?.started_at ?? null,
      location: (kiosk as any).time_locations?.name || '',
    });
  }

  if (parsed.data.action === 'start_break') {
    if (status !== 'clocked_in') {
      return NextResponse.json({ message: 'Clock in before starting a break.' }, { status: 409 });
    }
    if (openBreak) {
      return NextResponse.json({ message: 'You are already on break.' }, { status: 409 });
    }
    const { data: newBreak, error: breakError } = await supabase
      .from('time_breaks')
      .insert({ employee_id: employee.id, location_id: kiosk.location_id, kiosk_id: kiosk.id })
      .select('started_at')
      .single();
    if (breakError) {
      console.error('[api/punch] start break failed', { employeeId: employee.id, code: breakError.code, message: breakError.message });
      return NextResponse.json({ message: 'Break could not be started.' }, { status: 500 });
    }
    console.info('[api/punch] break started', { employeeId: employee.id, startedAt: newBreak.started_at });
    return NextResponse.json({ ok: true, firstName: employee.first_name, action: 'start_break', occurredAt: newBreak.started_at, breakStartedAt: newBreak.started_at });
  }

  if (parsed.data.action === 'end_break') {
    if (!openBreak) {
      return NextResponse.json({ message: 'You do not have an active break.' }, { status: 409 });
    }
    const endedAt = new Date().toISOString();
    const { data: endedBreak, error: breakError } = await supabase
      .from('time_breaks')
      .update({ ended_at: endedAt })
      .eq('id', openBreak.id)
      .is('ended_at', null)
      .select('ended_at')
      .single();
    if (breakError || !endedBreak) {
      console.error('[api/punch] end break failed', { employeeId: employee.id, code: breakError?.code, message: breakError?.message });
      return NextResponse.json({ message: 'Break could not be ended.' }, { status: 500 });
    }
    console.info('[api/punch] break ended', { employeeId: employee.id, endedAt: endedBreak.ended_at });
    return NextResponse.json({ ok: true, firstName: employee.first_name, action: 'end_break', occurredAt: endedBreak.ended_at });
  }

  if (openBreak) {
    return NextResponse.json({ message: 'End your break before clocking out.' }, { status: 409 });
  }

  const expected = status === 'clocked_in' ? 'clock_out' : 'clock_in';
  if (parsed.data.action !== expected) {
    return NextResponse.json({
      message: `You are already ${status === 'clocked_in' ? 'clocked in' : 'clocked out'}.`,
    }, { status: 409 });
  }

  const { data: punch, error: punchError } = await supabase
    .from('time_punch_events')
    .insert({
      employee_id: employee.id,
      location_id: kiosk.location_id,
      kiosk_id: kiosk.id,
      action: parsed.data.action,
    })
    .select('occurred_at')
    .single();

  if (punchError) {
    return NextResponse.json({ message: 'Punch could not be saved.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    firstName: employee.first_name,
    action: parsed.data.action,
    occurredAt: punch.occurred_at,
    location: (kiosk as any).time_locations?.name || '',
  });
}

async function findMatchingEmployee(
  employees: Array<{ id: string; first_name: string; pin_hash: string; active: boolean; primary_location_id: string | null }>,
  pin: string,
) {
  for (const employee of employees) {
    if (await bcrypt.compare(pin, employee.pin_hash)) return employee;
  }
  return null;
}
