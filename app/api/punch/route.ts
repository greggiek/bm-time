import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { addDemoPunch, currentDemoStatus, findDemoEmployee } from '@/lib/demo-store';
import { getAdminClient } from '@/lib/supabase-server';

const RequestSchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  action: z.enum(['identify', 'clock_in', 'clock_out']),
  employeeId: z.string().optional(),
  kioskToken: z.string().min(8),
});

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Enter a valid 4-digit PIN.' }, { status: 400 });

  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  if (demo) {
    const employee = findDemoEmployee(parsed.data.pin);
    if (!employee) return NextResponse.json({ message: 'PIN not recognized.' }, { status: 404 });
    const status = currentDemoStatus(employee.id);
    if (parsed.data.action === 'identify') return NextResponse.json({ employeeId: employee.id, firstName: employee.firstName, status });
    const expected = status === 'clocked_in' ? 'clock_out' : 'clock_in';
    if (parsed.data.action !== expected) return NextResponse.json({ message: `You are already ${status === 'clocked_in' ? 'clocked in' : 'clocked out'}.` }, { status: 409 });
    const punch = addDemoPunch(employee.id, parsed.data.action, 'Demo');
    return NextResponse.json({ ok: true, firstName: employee.firstName, action: punch.action, occurredAt: punch.occurredAt });
  }

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });

  const { data: kiosk, error: kioskError } = await supabase
    .from('time_kiosks')
    .select('id,location_id,time_locations!time_kiosks_location_id_fkey(name)')
    .eq('token', parsed.data.kioskToken)
    .eq('active', true)
    .maybeSingle();

  if (kioskError || !kiosk) return NextResponse.json({ message: 'This kiosk is not registered.' }, { status: 401 });

  const { data: employees, error } = await supabase
    .from('time_employees')
    .select('id,first_name,pin_hash,active')
    .eq('active', true);

  if (error) return NextResponse.json({ message: 'Unable to read employees.' }, { status: 500 });
  const employee = await findMatchingEmployee(employees ?? [], parsed.data.pin);
  if (!employee) return NextResponse.json({ message: 'PIN not recognized.' }, { status: 404 });

  const { data: latest } = await supabase
    .from('time_punch_events')
    .select('action')
    .eq('employee_id', employee.id)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const status = latest?.action === 'clock_in' ? 'clocked_in' : 'clocked_out';
  if (parsed.data.action === 'identify') {
    return NextResponse.json({ employeeId: employee.id, firstName: employee.first_name, status, location: (kiosk as any).time_locations?.name || '' });
  }

  const expected = status === 'clocked_in' ? 'clock_out' : 'clock_in';
  if (parsed.data.action !== expected) return NextResponse.json({ message: `You are already ${status === 'clocked_in' ? 'clocked in' : 'clocked out'}.` }, { status: 409 });

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

  if (punchError) return NextResponse.json({ message: 'Punch could not be saved.' }, { status: 500 });
  return NextResponse.json({ ok: true, firstName: employee.first_name, action: parsed.data.action, occurredAt: punch.occurred_at });
}

async function findMatchingEmployee(
  employees: Array<{ id: string; first_name: string; pin_hash: string; active: boolean }>,
  pin: string,
) {
  for (const employee of employees) {
    if (await bcrypt.compare(pin, employee.pin_hash)) return employee;
  }
  return null;
}
