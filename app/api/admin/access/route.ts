import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

type Assignment = { identity_id: string; role_id: string; scope_type: string; scope_ids: string[] | null };

export async function GET(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session) return NextResponse.json({ message: 'Sign in with your manager PIN.' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ message: 'Company administrator access is required.' }, { status: 403 });
  }

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });

  const [identitiesResult, employeesResult, assignmentsResult, rolesResult, permissionsResult, rolePermissionsResult, locationsResult] = await Promise.all([
    supabase.from('bm_identities').select('id,employee_id,display_name,google_email,active').order('display_name'),
    supabase.from('time_employees').select('id,employee_number,first_name,last_name,primary_location_id,job_title_id,active'),
    supabase.from('bm_identity_roles').select('identity_id,role_id,scope_type,scope_ids'),
    supabase.from('bm_roles').select('id,code,name').eq('active', true),
    supabase.from('bm_permissions').select('id,code'),
    supabase.from('bm_role_permissions').select('role_id,permission_id'),
    supabase.from('time_locations').select('id,name'),
  ]);

  const firstError = [identitiesResult, employeesResult, assignmentsResult, rolesResult, permissionsResult, rolePermissionsResult, locationsResult]
    .find((result) => result.error)?.error;
  if (firstError) return NextResponse.json({ message: firstError.message }, { status: 500 });

  const employees = new Map((employeesResult.data || []).map((employee) => [employee.id, employee]));
  const roles = new Map((rolesResult.data || []).map((role) => [role.id, role]));
  const permissions = new Map((permissionsResult.data || []).map((permission) => [permission.id, permission.code]));
  const locations = new Map((locationsResult.data || []).map((location) => [location.id, location.name]));
  const permissionsByRole = new Map<string, string[]>();
  for (const link of rolePermissionsResult.data || []) {
    const permission = permissions.get(link.permission_id);
    if (!permission) continue;
    permissionsByRole.set(link.role_id, [...(permissionsByRole.get(link.role_id) || []), permission]);
  }

  const assignmentsByIdentity = new Map<string, Assignment[]>();
  for (const assignment of (assignmentsResult.data || []) as Assignment[]) {
    assignmentsByIdentity.set(assignment.identity_id, [...(assignmentsByIdentity.get(assignment.identity_id) || []), assignment]);
  }

  const rows = (identitiesResult.data || []).map((identity) => {
    const employee = identity.employee_id ? employees.get(identity.employee_id) : null;
    const assignments = assignmentsByIdentity.get(identity.id) || [];
    const roleNames = assignments
      .map((assignment) => roles.get(assignment.role_id)?.name)
      .filter((name): name is string => Boolean(name));
    const effectivePermissions = Array.from(new Set(assignments.flatMap((assignment) => permissionsByRole.get(assignment.role_id) || []))).sort();
    const scopes = Array.from(new Set(assignments.map((assignment) => {
      if (assignment.scope_type === 'company') return 'Company-wide';
      if (assignment.scope_type === 'self') return 'Self';
      const names = (assignment.scope_ids || []).map((id: string) => locations.get(id)).filter(Boolean);
      return names.length ? names.join(', ') : 'Location';
    })));
    const loginMethod = employee && identity.google_email ? 'Google + PIN' : employee ? 'PIN' : identity.google_email ? 'Google' : 'None';

    return {
      id: identity.id,
      displayName: identity.display_name,
      googleEmail: identity.google_email,
      employeeNumber: employee?.employee_number || null,
      location: employee ? locations.get(employee.primary_location_id) || null : null,
      loginMethod,
      active: identity.active && (employee ? employee.active : true),
      roles: Array.from(new Set(roleNames)).sort(),
      scopes,
      permissions: effectivePermissions,
    };
  });

  return NextResponse.json({
    rows,
    summary: {
      identities: rows.length,
      pinUsers: rows.filter((row) => row.loginMethod.includes('PIN')).length,
      googleUsers: rows.filter((row) => row.loginMethod.includes('Google')).length,
      administrators: rows.filter((row) => row.roles.includes('Company Administrator')).length,
    },
  });
}
