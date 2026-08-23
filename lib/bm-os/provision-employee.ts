type AdminClient = any;

type AccessGrant = {
  system_code: 'time' | 'academy' | 'warehouse' | 'sales' | 'prospecting';
  access_level: 'user' | 'location_manager' | 'company_manager' | 'administrator';
  scope_type: 'self' | 'location' | 'company';
  scope_ids: string[];
};

const roleCodeByJobTitle: Record<string, string> = {
  Administration: 'administration',
  'Branch Manager': 'branch_manager',
  'Door Shop Manager': 'door_shop_manager',
  'Door Shop Worker': 'door_shop_worker',
  Driver: 'driver',
  'Sales Inside': 'sales_inside',
  'Sales Manager': 'sales_manager',
  'Sales Outside': 'sales_outside',
  'Warehouse Manager': 'warehouse_manager',
  'Warehouse Worker': 'warehouse_worker',
};

function grantsFor(jobTitle: string, locationId: string): AccessGrant[] {
  const self = (system_code: 'time' | 'academy'): AccessGrant => ({ system_code, access_level: 'user', scope_type: 'self', scope_ids: [] });
  const location = (system_code: AccessGrant['system_code'], access_level: AccessGrant['access_level'] = 'user'): AccessGrant => ({
    system_code, access_level, scope_type: 'location', scope_ids: [locationId],
  });
  const base = [self('time'), self('academy')];
  switch (jobTitle) {
    case 'Warehouse Worker': return [...base, location('warehouse')];
    case 'Warehouse Manager': return [location('time', 'location_manager'), location('academy', 'location_manager'), location('warehouse', 'location_manager')];
    case 'Door Shop Worker': return [...base, location('warehouse')];
    case 'Door Shop Manager': return [location('time', 'location_manager'), location('academy', 'location_manager'), location('warehouse', 'location_manager')];
    case 'Driver': return [...base, location('warehouse')];
    case 'Sales Inside': return [...base, location('sales')];
    case 'Sales Outside': return [...base, location('sales'), location('prospecting')];
    case 'Sales Manager': return [location('time', 'location_manager'), location('academy', 'location_manager'), location('sales', 'location_manager'), location('prospecting', 'location_manager')];
    case 'Branch Manager': return [location('time', 'location_manager'), location('academy', 'location_manager'), location('warehouse', 'location_manager'), location('sales', 'location_manager'), location('prospecting', 'location_manager')];
    default: return base;
  }
}

export async function provisionEmployeeAccess(input: {
  supabase: AdminClient;
  employeeId: string;
  displayName: string;
  jobTitle: string;
  locationId: string;
  actorName: string;
}) {
  const { supabase, employeeId, displayName, jobTitle, locationId, actorName } = input;
  const expectedRoleCodes = ['staff_member', 'time_clock_user', roleCodeByJobTitle[jobTitle]].filter(Boolean) as string[];
  if (jobTitle.includes('Warehouse') || jobTitle.includes('Door Shop') || jobTitle === 'Driver' || jobTitle === 'Branch Manager') expectedRoleCodes.push('warehouse_access');
  if (jobTitle.includes('Sales') || jobTitle === 'Branch Manager') expectedRoleCodes.push('sales_access');
  if (jobTitle === 'Sales Outside' || jobTitle === 'Sales Manager' || jobTitle === 'Branch Manager') expectedRoleCodes.push('prospecting_access');

  const { data: roles, error: rolesError } = await supabase.from('bm_roles').select('id,code').in('code', expectedRoleCodes).eq('active', true);
  if (rolesError) throw new Error(rolesError.message);
  const foundCodes = new Set((roles || []).map((role: { code: string }) => role.code));
  const missing = expectedRoleCodes.filter(code => !foundCodes.has(code));
  if (missing.length) throw new Error(`BM OS roles are not configured: ${missing.join(', ')}`);

  const { data: identity, error: identityError } = await supabase.from('bm_identities').insert({
    employee_id: employeeId,
    display_name: displayName,
    active: true,
  }).select('id').single();
  if (identityError || !identity) throw new Error(identityError?.message || 'Unable to create BM OS identity.');

  try {
    const { error: roleError } = await supabase.from('bm_identity_roles').insert((roles || []).map((role: { id: string; code: string }) => ({
      identity_id: identity.id,
      role_id: role.id,
      scope_type: role.code === 'staff_member' || role.code === 'time_clock_user' ? 'self' : 'location',
      scope_ids: role.code === 'staff_member' || role.code === 'time_clock_user' ? [] : [locationId],
      reason: `Automatic onboarding access for ${jobTitle}`,
    })));
    if (roleError) throw new Error(roleError.message);

    const { error: accessError } = await supabase.from('bm_identity_system_access').insert(grantsFor(jobTitle, locationId).map(grant => ({
      identity_id: identity.id,
      ...grant,
    })));
    if (accessError) throw new Error(accessError.message);

    await supabase.from('bm_audit_events').insert({
      action: 'employee.provisioned',
      resource_type: 'bm_identity',
      resource_id: identity.id,
      location_id: locationId,
      reason: `Onboarded by ${actorName}`,
      after_data: { employee_id: employeeId, job_title: jobTitle, systems: grantsFor(jobTitle, locationId).map(grant => grant.system_code) },
    });
    return identity.id as string;
  } catch (error) {
    await supabase.from('bm_identities').delete().eq('id', identity.id);
    throw error;
  }
}
