import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

const LoginSchema = z.object({ pin: z.string().regex(/^\d{4}$/) });

export async function POST(request: Request) {
  const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: 'Enter a valid 4-digit PIN.' }, { status: 400 });
  }

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });

  const { data: users, error } = await supabase
    .from('time_users')
    .select('id,name,pin_hash,role,location_id,all_locations,can_manage_employees,active,time_locations(name)')
    .eq('active', true);

  if (error) return NextResponse.json({ message: 'Unable to read manager accounts.' }, { status: 500 });

  let matched: any = null;
  for (const user of users || []) {
    if (await bcrypt.compare(parsed.data.pin, user.pin_hash)) {
      matched = user;
      break;
    }
  }

  if (!matched) {
    const { data: employees, error: employeeError } = await supabase
      .from('time_employees')
      .select('id,first_name,last_name,pin_hash,primary_location_id,active,time_locations!time_employees_primary_location_id_fkey(name)')
      .eq('active', true);
    if (employeeError) return NextResponse.json({ message: 'Unable to read employee accounts.' }, { status: 500 });

    const employee = await findEmployeeByPin(employees || [], parsed.data.pin);
    if (!employee) return NextResponse.json({ message: 'PIN not recognized.' }, { status: 401 });

    const { data: identity } = await supabase
      .from('bm_identities')
      .select('id,display_name,active')
      .eq('employee_id', employee.id)
      .eq('active', true)
      .maybeSingle();
    if (!identity) return NextResponse.json({ message: 'BM OS access has not been assigned.' }, { status: 403 });

    const { data: assignments } = await supabase.from('bm_identity_roles').select('role_id').eq('identity_id', identity.id);
    const roleIds = (assignments || []).map(row => row.role_id);
    const { data: links } = roleIds.length
      ? await supabase.from('bm_role_permissions').select('permission_id').in('role_id', roleIds)
      : { data: [] as Array<{ permission_id: string }> };
    const permissionIds = (links || []).map(row => row.permission_id);
    const { data: osAccess } = permissionIds.length
      ? await supabase.from('bm_permissions').select('id').in('id', permissionIds).eq('code', 'os.access').limit(1).maybeSingle()
      : { data: null };
    if (!osAccess) return NextResponse.json({ message: 'BM OS access has not been assigned.' }, { status: 403 });

    const locationName = Array.isArray(employee.time_locations)
      ? employee.time_locations[0]?.name || null
      : employee.time_locations?.name || null;
    const name = `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || identity.display_name;
    const token = createSessionToken({
      userId: employee.id,
      identityId: identity.id,
      name,
      role: 'employee',
      locationId: employee.primary_location_id,
      locationName,
      allLocations: false,
      canManageEmployees: false,
    });
    const response = NextResponse.json({
      ok: true,
      redirectTo: '/portal',
      user: { name, role: 'employee', locationName, allLocations: false, canManageEmployees: false },
    });
    setSessionCookie(response, token);
    return response;
  }

  const locationName = Array.isArray(matched.time_locations)
    ? matched.time_locations[0]?.name || null
    : matched.time_locations?.name || null;

  const token = createSessionToken({
    userId: matched.id,
    name: matched.name,
    role: matched.role,
    locationId: matched.location_id,
    locationName,
    allLocations: Boolean(matched.all_locations),
    canManageEmployees: Boolean(matched.can_manage_employees),
  });

  const response = NextResponse.json({
    ok: true,
    user: {
      name: matched.name,
      role: matched.role,
      locationName,
      allLocations: Boolean(matched.all_locations),
      canManageEmployees: Boolean(matched.can_manage_employees),
    },
  });

  setSessionCookie(response, token);
  return response;
}

async function findEmployeeByPin(employees: any[], pin: string) {
  for (const employee of employees) {
    if (await bcrypt.compare(pin, employee.pin_hash)) return employee;
  }
  return null;
}

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(sessionCookie.name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: sessionCookie.maxAge,
  });

}
