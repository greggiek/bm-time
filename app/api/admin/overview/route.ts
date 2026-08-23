import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session) return NextResponse.json({ message: 'Sign in with your administrator PIN.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ message: 'Company administrator access is required.' }, { status: 403 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });

  const [identitiesResult, employeesResult, assignmentsResult, rolesResult, permissionsResult, rolePermissionsResult, explicitAccessResult] = await Promise.all([
    supabase.from('bm_identities').select('id,employee_id,active'),
    supabase.from('time_employees').select('id,active,time_punch_events(action,occurred_at),time_breaks(started_at,ended_at)').eq('active', true),
    supabase.from('bm_identity_roles').select('identity_id,role_id'),
    supabase.from('bm_roles').select('id,code').eq('active', true),
    supabase.from('bm_permissions').select('id,code'),
    supabase.from('bm_role_permissions').select('role_id,permission_id'),
    supabase.from('bm_identity_system_access').select('identity_id,system_code'),
  ]);
  const firstError = [identitiesResult, employeesResult, assignmentsResult, rolesResult, permissionsResult, rolePermissionsResult, explicitAccessResult].find(result => result.error)?.error;
  if (firstError) return NextResponse.json({ message: firstError.message }, { status: 500 });

  const roles = new Map((rolesResult.data || []).map(role => [role.id, role.code]));
  const permissions = new Map((permissionsResult.data || []).map(permission => [permission.id, permission.code]));
  const permissionsByRole = new Map<string, string[]>();
  for (const link of rolePermissionsResult.data || []) {
    const permission = permissions.get(link.permission_id);
    if (permission) permissionsByRole.set(link.role_id, [...(permissionsByRole.get(link.role_id) || []), permission]);
  }
  const accessByIdentity = new Map<string, Set<string>>();
  for (const assignment of assignmentsResult.data || []) {
    const access = accessByIdentity.get(assignment.identity_id) || new Set<string>();
    const roleCode = roles.get(assignment.role_id);
    if (roleCode) access.add(roleCode);
    for (const permission of permissionsByRole.get(assignment.role_id) || []) access.add(permission);
    accessByIdentity.set(assignment.identity_id, access);
  }
  const explicitSystemsByIdentity = new Map<string, Set<string>>();
  for (const access of explicitAccessResult.data || []) {
    const systems = explicitSystemsByIdentity.get(access.identity_id) || new Set<string>();
    systems.add(access.system_code);
    explicitSystemsByIdentity.set(access.identity_id, systems);
  }

  const activeIdentities = (identitiesResult.data || []).filter(identity => identity.active);
  const hasAccess = (identityId: string, system: string) => {
    if (explicitSystemsByIdentity.get(identityId)?.has(system)) return true;
    const access = accessByIdentity.get(identityId) || new Set<string>();
    if (system === 'warehouse' || system === 'sales' || system === 'prospecting') return access.has(`${system}_access`);
    return Array.from(access).some(value => value.startsWith(`${system}.`)) || (system === 'time' && access.has('time_clock_user'));
  };
  let clockedIn = 0;
  let onBreak = 0;
  for (const employee of employeesResult.data || []) {
    if (employee.time_breaks?.some((entry: { ended_at: string | null }) => !entry.ended_at)) { onBreak += 1; continue; }
    const latest = [...(employee.time_punch_events || [])].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
    if (latest?.action === 'clock_in') clockedIn += 1;
  }
  return NextResponse.json({
    identities: activeIdentities.length,
    activeEmployees: (employeesResult.data || []).length,
    clockedIn,
    onBreak,
    systems: {
      time: activeIdentities.filter(identity => hasAccess(identity.id, 'time')).length,
      academy: activeIdentities.filter(identity => hasAccess(identity.id, 'academy')).length,
      warehouse: activeIdentities.filter(identity => hasAccess(identity.id, 'warehouse')).length,
      sales: activeIdentities.filter(identity => hasAccess(identity.id, 'sales')).length,
      prospecting: activeIdentities.filter(identity => hasAccess(identity.id, 'prospecting')).length,
    },
  });
}
