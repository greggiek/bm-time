import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

type Assignment = { identity_id: string; role_id: string; scope_type: string; scope_ids: string[] | null };

type SystemAccess = {
  enabled: boolean;
  level: string;
  scope: string;
  accessLevel: string;
  scopeType: string;
  scopeIds: string[];
};

const systemCodes = ['time', 'academy', 'warehouse', 'sales', 'prospecting'] as const;
const systemCodeSet = new Set<string>(systemCodes);
const accessUpdateSchema = z.object({
  identityId: z.string().uuid(),
  systems: z.array(z.object({
    systemCode: z.enum(systemCodes),
    enabled: z.boolean(),
    accessLevel: z.enum(['user', 'location_manager', 'company_manager', 'administrator']),
    scopeType: z.enum(['self', 'location', 'company']),
    scopeIds: z.array(z.string().uuid()).max(20),
  })).length(systemCodes.length),
}).superRefine((value, context) => {
  const codes = new Set(value.systems.map((system) => system.systemCode));
  if (codes.size !== systemCodes.length || systemCodes.some((code) => !codes.has(code))) {
    context.addIssue({ code: 'custom', path: ['systems'], message: 'Every BM OS system must be supplied exactly once.' });
  }
  value.systems.forEach((system, index) => {
    if (system.enabled && system.scopeType === 'location' && system.scopeIds.length === 0) {
      context.addIssue({ code: 'custom', path: ['systems', index, 'scopeIds'], message: 'Choose at least one location.' });
    }
  });
});

const systemAccessRoleByNamespace: Record<string, string> = {
  warehouse: 'warehouse_access',
  sales: 'sales_access',
  prospecting: 'prospecting_access',
};

function isPermissionAllowedByRoster(permission: string, assignedRoleCodes: Set<string>) {
  const namespace = permission.split('.', 1)[0];
  const requiredAccessRole = systemAccessRoleByNamespace[namespace];
  return !requiredAccessRole || assignedRoleCodes.has(requiredAccessRole);
}

function getScope(assignments: Assignment[], locations: Map<string, string>, roleIds?: Set<string>) {
  const relevant = roleIds
    ? assignments.filter((assignment) => roleIds.has(assignment.role_id))
    : assignments;

  if (relevant.some((assignment) => assignment.scope_type === 'company')) return 'Company';
  const locationNames = Array.from(new Set(
    relevant
      .filter((assignment) => assignment.scope_type === 'location')
      .flatMap((assignment) => assignment.scope_ids || [])
      .map((id) => locations.get(id))
      .filter((name): name is string => Boolean(name)),
  ));
  if (locationNames.length) return locationNames.join(', ');
  return relevant.length ? 'Self' : '—';
}

function getSystemAccess(
  enabled: boolean,
  permissions: Set<string>,
  scope: string,
  levels: Array<{ permission: string; label: string }>,
): SystemAccess {
  if (!enabled) return { enabled: false, level: 'No access', scope: '—', accessLevel: 'user', scopeType: 'self', scopeIds: [] };
  const level = levels.find(({ permission }) => permissions.has(permission))?.label || 'User';
  return { enabled: true, level, scope, accessLevel: 'user', scopeType: 'self', scopeIds: [] };
}

export async function GET(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session) return NextResponse.json({ message: 'Sign in with your manager PIN.' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ message: 'Company administrator access is required.' }, { status: 403 });
  }

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });

  const [identitiesResult, employeesResult, assignmentsResult, rolesResult, permissionsResult, rolePermissionsResult, locationsResult, explicitAccessResult] = await Promise.all([
    supabase.from('bm_identities').select('id,employee_id,display_name,google_email,active').order('display_name'),
    supabase.from('time_employees').select('id,employee_number,first_name,last_name,primary_location_id,job_title_id,active'),
    supabase.from('bm_identity_roles').select('identity_id,role_id,scope_type,scope_ids'),
    supabase.from('bm_roles').select('id,code,name').eq('active', true),
    supabase.from('bm_permissions').select('id,code'),
    supabase.from('bm_role_permissions').select('role_id,permission_id'),
    supabase.from('time_locations').select('id,name'),
    supabase.from('bm_identity_system_access').select('identity_id,system_code,access_level,scope_type,scope_ids'),
  ]);

  const firstError = [identitiesResult, employeesResult, assignmentsResult, rolesResult, permissionsResult, rolePermissionsResult, locationsResult, explicitAccessResult]
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
  const explicitByIdentity = new Map<string, Array<{ system_code: string; access_level: string; scope_type: string; scope_ids: string[] }>>();
  for (const access of explicitAccessResult.data || []) {
    explicitByIdentity.set(access.identity_id, [...(explicitByIdentity.get(access.identity_id) || []), access]);
  }

  const rows = (identitiesResult.data || []).map((identity) => {
    const employee = identity.employee_id ? employees.get(identity.employee_id) : null;
    const assignments = assignmentsByIdentity.get(identity.id) || [];
    const assignedRoleCodes = new Set(assignments
      .map((assignment) => roles.get(assignment.role_id)?.code)
      .filter((code): code is string => Boolean(code)));
    const effectivePermissions = new Set(
      assignments
        .flatMap((assignment) => permissionsByRole.get(assignment.role_id) || [])
        .filter((permission) => isPermissionAllowedByRoster(permission, assignedRoleCodes)),
    );
    const accessRoleIds = new Map(
      assignments
        .map((assignment) => [roles.get(assignment.role_id)?.code, assignment.role_id] as const)
        .filter(([code]) => code?.endsWith('_access')),
    );
    const loginMethod = employee && identity.google_email ? 'Google + PIN' : employee ? 'PIN' : identity.google_email ? 'Google' : 'None';
    const defaultScope = getScope(assignments, locations);
    const accessScope = (roleCode: string) => {
      const roleId = accessRoleIds.get(roleCode);
      return roleId ? getScope(assignments, locations, new Set([roleId])) : '—';
    };

    const legacySystems = {
      time: getSystemAccess(
        assignedRoleCodes.has('time_clock_user') || Array.from(effectivePermissions).some((permission) => permission.startsWith('time.')),
        effectivePermissions,
        defaultScope,
        [
          { permission: 'time.manage_company', label: 'Company admin' },
          { permission: 'time.manage_location', label: 'Location manager' },
          { permission: 'time.clock', label: 'Employee' },
        ],
      ),
      academy: getSystemAccess(
        Array.from(effectivePermissions).some((permission) => permission.startsWith('academy.')),
        effectivePermissions,
        defaultScope,
        [
          { permission: 'academy.manage', label: 'Company admin' },
          { permission: 'academy.assign_location', label: 'Location manager' },
          { permission: 'academy.learn', label: 'Learner' },
        ],
      ),
      warehouse: getSystemAccess(
        assignedRoleCodes.has('warehouse_access'),
        effectivePermissions,
        accessScope('warehouse_access'),
        [
          { permission: 'warehouse.manage_company', label: 'Company manager' },
          { permission: 'warehouse.manage_location', label: 'Location manager' },
          { permission: 'warehouse.delivery', label: 'Driver' },
          { permission: 'warehouse.manufacturing', label: 'Door shop' },
          { permission: 'warehouse.use', label: 'User' },
        ],
      ),
      sales: getSystemAccess(
        assignedRoleCodes.has('sales_access'),
        effectivePermissions,
        accessScope('sales_access'),
        [
          { permission: 'sales.manage_company', label: 'Company manager' },
          { permission: 'sales.manage_location', label: 'Location manager' },
          { permission: 'sales.use', label: 'User' },
        ],
      ),
      prospecting: getSystemAccess(
        assignedRoleCodes.has('prospecting_access'),
        effectivePermissions,
        accessScope('prospecting_access'),
        [
          { permission: 'prospecting.manage', label: 'Manager' },
          { permission: 'prospecting.use', label: 'User' },
        ],
      ),
    };
    const explicitSystems = explicitByIdentity.get(identity.id) || [];
    const explicit = (systemCode: string): SystemAccess => {
      const access = explicitSystems.find((item) => item.system_code === systemCode);
      if (!access) return { enabled: false, level: 'No access', scope: '—', accessLevel: 'user', scopeType: 'self', scopeIds: [] };
      const levelLabels: Record<string, string> = {
        user: systemCode === 'academy' ? 'Learner' : systemCode === 'time' ? 'Employee' : 'User',
        location_manager: 'Location manager',
        company_manager: 'Company manager',
        administrator: 'Administrator',
      };
      const scope = access.scope_type === 'company'
        ? 'Company'
        : access.scope_type === 'location'
          ? (access.scope_ids.map((id) => locations.get(id)).filter(Boolean).join(', ')
            || (employee ? locations.get(employee.primary_location_id) : null)
            || 'Location')
          : 'Self';
      return {
        enabled: true,
        level: levelLabels[access.access_level] || access.access_level,
        scope,
        accessLevel: access.access_level,
        scopeType: access.scope_type,
        scopeIds: access.scope_ids || [],
      };
    };
    const systems = {
      time: explicit('time'),
      academy: explicit('academy'),
      warehouse: explicit('warehouse'),
      sales: explicit('sales'),
      prospecting: explicit('prospecting'),
    };

    return {
      id: identity.id,
      displayName: identity.display_name,
      googleEmail: identity.google_email,
      employeeNumber: employee?.employee_number || null,
      location: employee ? locations.get(employee.primary_location_id) || null : null,
      loginMethod,
      active: identity.active && (employee ? employee.active : true),
      systems,
      legacySystems,
    };
  });

  return NextResponse.json({
    rows,
    locations: (locationsResult.data || []).map((location) => ({ id: location.id, name: location.name })),
    summary: {
      identities: rows.length,
      warehouseUsers: rows.filter((row) => row.systems.warehouse.enabled).length,
      salesUsers: rows.filter((row) => row.systems.sales.enabled).length,
      prospectingUsers: rows.filter((row) => row.systems.prospecting.enabled).length,
    },
  });
}

export async function PUT(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session) return NextResponse.json({ message: 'Sign in with your manager PIN.' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ message: 'Company administrator access is required.' }, { status: 403 });
  }

  const parsed = accessUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || 'Invalid access settings.' }, { status: 400 });
  }

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });

  const { identityId, systems } = parsed.data;
  if (systems.some((system) => !systemCodeSet.has(system.systemCode))) {
    return NextResponse.json({ message: 'Unknown BM OS system.' }, { status: 400 });
  }

  const [identityResult, locationResult] = await Promise.all([
    supabase.from('bm_identities').select('id').eq('id', identityId).maybeSingle(),
    supabase.from('time_locations').select('id'),
  ]);
  if (identityResult.error || locationResult.error) {
    return NextResponse.json({ message: identityResult.error?.message || locationResult.error?.message || 'Unable to validate access.' }, { status: 500 });
  }
  if (!identityResult.data) return NextResponse.json({ message: 'Identity not found.' }, { status: 404 });

  const validLocationIds = new Set((locationResult.data || []).map((location) => location.id));
  const invalidLocation = systems.some((system) => system.scopeIds.some((id) => !validLocationIds.has(id)));
  if (invalidLocation) return NextResponse.json({ message: 'One or more selected locations are invalid.' }, { status: 400 });

  const enabledRows = systems.filter((system) => system.enabled).map((system) => ({
    identity_id: identityId,
    system_code: system.systemCode,
    access_level: system.accessLevel,
    scope_type: system.scopeType,
    scope_ids: system.scopeType === 'location' ? system.scopeIds : [],
    updated_at: new Date().toISOString(),
  }));
  const disabledCodes = systems.filter((system) => !system.enabled).map((system) => system.systemCode);

  // Grant/update first. If it fails, no existing access is removed.
  if (enabledRows.length) {
    const { error } = await supabase.from('bm_identity_system_access').upsert(enabledRows, { onConflict: 'identity_id,system_code' });
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }
  if (disabledCodes.length) {
    const { error } = await supabase.from('bm_identity_system_access').delete().eq('identity_id', identityId).in('system_code', disabledCodes);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
