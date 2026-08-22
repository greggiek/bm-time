import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

const DateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session || session.role !== 'employee' || !session.identityId) {
    return NextResponse.json({ message: 'Employee sign-in is required.' }, { status: 401 });
  }

  const parsed = DateRangeSchema.safeParse({
    startDate: request.nextUrl.searchParams.get('startDate'),
    endDate: request.nextUrl.searchParams.get('endDate'),
  });
  if (!parsed.success || parsed.data.endDate < parsed.data.startDate) {
    return NextResponse.json({ message: 'Choose a valid date range.' }, { status: 400 });
  }

  const start = new Date(`${parsed.data.startDate}T00:00:00-04:00`);
  const end = new Date(`${parsed.data.endDate}T00:00:00-04:00`);
  end.setDate(end.getDate() + 1);
  if (end.getTime() - start.getTime() > 32 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ message: 'Timecard ranges are limited to 31 days.' }, { status: 400 });
  }

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'BM OS is not configured.' }, { status: 503 });

  const [punchResult, breakResult, paidTimeOffResult] = await Promise.all([
    supabase
      .from('time_punch_events')
      .select('id,action,occurred_at')
      .eq('employee_id', session.userId)
      .gte('occurred_at', start.toISOString())
      .lt('occurred_at', end.toISOString())
      .order('occurred_at', { ascending: true }),
    supabase
      .from('time_breaks')
      .select('id,started_at,ended_at')
      .eq('employee_id', session.userId)
      .lt('started_at', end.toISOString())
      .or(`ended_at.is.null,ended_at.gte.${start.toISOString()}`)
      .order('started_at', { ascending: true }),
    supabase
      .from('time_paid_time_off')
      .select('id,entry_type,entry_date,hours,note')
      .eq('employee_id', session.userId)
      .gte('entry_date', parsed.data.startDate)
      .lte('entry_date', parsed.data.endDate)
      .order('entry_date', { ascending: true }),
  ]);

  const error = punchResult.error || breakResult.error || paidTimeOffResult.error;
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  const punches = (punchResult.data || []).map(row => ({
    id: row.id,
    action: row.action as 'clock_in' | 'clock_out',
    occurredAt: row.occurred_at,
  }));
  const intervals: Array<{ start: Date; end: Date }> = [];
  let openClockIn: Date | null = null;
  for (const punch of punches) {
    if (punch.action === 'clock_in') openClockIn = new Date(punch.occurredAt);
    if (punch.action === 'clock_out' && openClockIn) {
      intervals.push({ start: openClockIn, end: new Date(punch.occurredAt) });
      openClockIn = null;
    }
  }

  const now = new Date();
  let breakMs = 0;
  for (const entry of breakResult.data || []) {
    const breakStart = new Date(entry.started_at);
    const breakEnd = entry.ended_at ? new Date(entry.ended_at) : now;
    for (const interval of intervals) {
      const overlapStart = Math.max(interval.start.getTime(), breakStart.getTime());
      const overlapEnd = Math.min(interval.end.getTime(), breakEnd.getTime());
      if (overlapEnd > overlapStart) breakMs += overlapEnd - overlapStart;
    }
  }
  const grossMs = intervals.reduce(
    (total, interval) => total + Math.max(0, interval.end.getTime() - interval.start.getTime()),
    0,
  );
  const paidTimeOff = (paidTimeOffResult.data || []).map(row => ({
    id: row.id,
    entryType: row.entry_type as 'vacation' | 'sick',
    entryDate: row.entry_date,
    hours: Number(row.hours),
    note: row.note || '',
  }));

  return NextResponse.json({
    range: parsed.data,
    summary: {
      workedHours: roundHours(Math.max(0, grossMs - breakMs)),
      breakHours: roundHours(breakMs),
      paidTimeOffHours: roundHours(paidTimeOff.reduce((total, entry) => total + entry.hours, 0) * 36e5),
      incomplete: Boolean(openClockIn),
    },
    punches,
    paidTimeOff,
  });
}

function roundHours(milliseconds: number) {
  return Math.round((milliseconds / 36e5) * 100) / 100;
}
