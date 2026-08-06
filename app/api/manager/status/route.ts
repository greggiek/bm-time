import { NextResponse } from 'next/server';
import { getDemoRows } from '@/lib/demo-store';
import { getAdminClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({}));
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.MANAGER_PASSWORD;

  if (!adminPassword || password !== adminPassword) {
    return NextResponse.json({ message: 'Incorrect admin password.' }, { status: 401 });
  }

  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return NextResponse.json({
      rows: getDemoRows().map((row) => ({
        id: row.employee.id,
        name: `${row.employee.firstName} ${row.employee.lastName}`,
        location: row.employee.location,
        jobTitle: row.employee.jobTitle,
        status: row.status,
        latest: row.latest?.occurredAt || null,
      })),
    });
  }

  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('time_employees')
    .select('id,first_name,last_name,time_locations!time_employees_primary_location_id_fkey(name),time_job_titles(name),time_punch_events(action,occurred_at)')
    .eq('active', true)
    .order('last_name');

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const rows = (data || []).map((employee: any) => {
    const events = [...(employee.time_punch_events || [])].sort((a: any, b: any) =>
      b.occurred_at.localeCompare(a.occurred_at),
    );

    return {
      id: employee.id,
      name: `${employee.first_name} ${employee.last_name}`,
      location: employee.time_locations?.name || '',
      jobTitle: employee.time_job_titles?.name || '',
      status: events[0]?.action === 'clock_in' ? 'clocked_in' : 'clocked_out',
      latest: events[0]?.occurred_at || null,
    };
  });

  return NextResponse.json({ rows });
}
