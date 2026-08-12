import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, sessionCookie, TimeUserSession } from '@/lib/auth-session';
import { getDemoRows } from '@/lib/demo-store';
import { getAdminClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  const body = await request.json().catch(() => ({}));
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.MANAGER_PASSWORD;
  const legacyAdmin = !session && Boolean(adminPassword && body.password === adminPassword);

  if (!session && !legacyAdmin) {
    return NextResponse.json({ message: 'Sign in with your manager PIN.' }, { status: 401 });
  }

  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    const demoRows = getDemoRows()
      .filter((row) => canAccessLocation(session, row.employee.location))
      .map((row) => ({
        id: row.employee.id,
        name: `${row.employee.firstName} ${row.employee.lastName}`,
        location: row.employee.location,
        jobTitle: row.employee.jobTitle,
        status: row.status,
        latest: row.latest?.occurredAt || null,
      }));

    return NextResponse.json({
      rows: demoRows,
      payPeriod: currentPayPeriod(),
      overtimeWatch: [],
      hoursByBranchPosition: [],
      user: session ? sessionUser(session) : legacyAdminUser(),
    });
  }

  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  }

  let query = supabase
    .from('time_employees')
    .select('id,first_name,last_name,primary_location_id,time_locations!time_employees_primary_location_id_fkey(name),time_job_titles(name),time_punch_events(action,occurred_at)')
    .eq('active', true)
    .order('last_name');

  if (session?.role === 'manager' && !session.allLocations && session.locationId) {
    query = query.eq('primary_location_id', session.locationId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const rows = (data || []).map((employee: any) => {
    const events = [...(employee.time_punch_events || [])].sort((a: any, b: any) =>
      b.occurred_at.localeCompare(a.occurred_at),
    );
    const location = Array.isArray(employee.time_locations)
      ? employee.time_locations[0]?.name || ''
      : employee.time_locations?.name || '';
    const jobTitle = Array.isArray(employee.time_job_titles)
      ? employee.time_job_titles[0]?.name || ''
      : employee.time_job_titles?.name || '';

    return {
      id: employee.id,
      name: `${employee.first_name} ${employee.last_name}`,
      location,
      jobTitle,
      status: events[0]?.action === 'clock_in' ? 'clocked_in' : 'clocked_out',
      latest: events[0]?.occurred_at || null,
    };
  });

  const payPeriod = currentPayPeriod();
  const periodStart = new Date(`${payPeriod.start}T00:00:00-04:00`);
  const periodEnd = new Date(`${payPeriod.end}T23:59:59.999-04:00`);
  const now = new Date();
  const hoursByBranchPositionMap = new Map<string, { location: string; jobTitle: string; totalHours: number; employeeIds: Set<string> }>();
  const overtimeWatch: Array<{ id: string; name: string; location: string; jobTitle: string; totalHours: number }> = [];

  for (const employee of data || []) {
    const location = relationName(employee.time_locations) || 'Unassigned';
    const jobTitle = relationName(employee.time_job_titles) || 'No Position';
    const events = [...(employee.time_punch_events || [])]
      .filter((event: any) => {
        const occurredAt = new Date(event.occurred_at);
        return occurredAt >= periodStart && occurredAt <= periodEnd;
      })
      .sort((a: any, b: any) => a.occurred_at.localeCompare(b.occurred_at));
    const totalHours = calculateHours(events, now);
    if (totalHours > 0) {
      const key = `${location}\u0000${jobTitle}`;
      const group = hoursByBranchPositionMap.get(key) || { location, jobTitle, totalHours: 0, employeeIds: new Set<string>() };
      group.totalHours += totalHours;
      group.employeeIds.add(employee.id);
      hoursByBranchPositionMap.set(key, group);
    }
    if (totalHours >= 35) overtimeWatch.push({ id: employee.id, name: `${employee.first_name} ${employee.last_name}`, location, jobTitle, totalHours });
  }

  const hoursByBranchPosition = Array.from(hoursByBranchPositionMap.values())
    .filter((group) => group.totalHours > 0)
    .map((group) => ({ location: group.location, jobTitle: group.jobTitle, totalHours: roundHours(group.totalHours), employeeCount: group.employeeIds.size }))
    .sort((a, b) => a.location.localeCompare(b.location) || b.totalHours - a.totalHours);

  return NextResponse.json({
    rows,
    payPeriod,
    overtimeWatch: overtimeWatch.map((employee) => ({ ...employee, totalHours: roundHours(employee.totalHours) })).sort((a, b) => b.totalHours - a.totalHours),
    hoursByBranchPosition,
    user: session ? sessionUser(session) : legacyAdminUser(),
  });
}

function relationName(relation: any) {
  return Array.isArray(relation) ? relation[0]?.name || '' : relation?.name || '';
}

function calculateHours(events: Array<{ action: string; occurred_at: string }>, now: Date) {
  let totalMs = 0;
  let clockIn: Date | null = null;
  for (const event of events) {
    if (event.action === 'clock_in') clockIn = new Date(event.occurred_at);
    else if (event.action === 'clock_out' && clockIn) { totalMs += new Date(event.occurred_at).getTime() - clockIn.getTime(); clockIn = null; }
  }
  if (clockIn && now > clockIn) totalMs += now.getTime() - clockIn.getTime();
  return totalMs / 36e5;
}

function roundHours(hours: number) { return Math.round(hours * 100) / 100; }

function currentPayPeriod() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const today = new Date(value('year'), value('month') - 1, value('day'), 12);
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 3) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { start: format(start), end: format(end) };
}

function canAccessLocation(session: TimeUserSession | null, locationName: string) {
  if (!session || session.role === 'admin' || session.allLocations) return true;
  return session.locationName === locationName;
}

function sessionUser(session: TimeUserSession) {
  return {
    name: session.name,
    role: session.role,
    locationName: session.locationName,
    allLocations: session.allLocations,
    canManageEmployees: session.canManageEmployees,
  };
}

function legacyAdminUser() {
  return {
    name: 'Administrator',
    role: 'admin' as const,
    locationName: null,
    allLocations: true,
    canManageEmployees: true,
  };
}
