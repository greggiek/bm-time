import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminClient } from '@/lib/supabase-server';

const RequestSchema = z.object({
  password: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function isAuthorized(password: string) {
  const expected = process.env.ADMIN_PASSWORD || process.env.MANAGER_PASSWORD;
  return Boolean(expected && password === expected);
}

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isAuthorized(parsed.data.password)) {
    return NextResponse.json({ message: 'Incorrect admin password.' }, { status: 401 });
  }

  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  }

  const start = new Date(`${parsed.data.weekStart}T00:00:00-04:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const { data, error } = await supabase
    .from('time_punch_events')
    .select('id,action,occurred_at,time_employees!time_punch_events_employee_id_fkey(id,employee_number,first_name,last_name),time_locations!time_punch_events_location_id_fkey(name)')
    .gte('occurred_at', start.toISOString())
    .lt('occurred_at', end.toISOString())
    .order('occurred_at', { ascending: true });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

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
    weekStart: parsed.data.weekStart,
    weekEnd: end.toISOString().slice(0, 10),
    punches,
    summaries,
  });
}
