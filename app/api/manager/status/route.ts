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

  return NextResponse.json({
    rows,
    user: session ? sessionUser(session) : legacyAdminUser(),
  });
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
  };
}

function legacyAdminUser() {
  return {
    name: 'Administrator',
    role: 'admin' as const,
    locationName: null,
    allLocations: true,
  };
}
