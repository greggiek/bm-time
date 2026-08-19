export const BM_PERMISSIONS = [
  'time.punch.self',
  'time.break.self',
  'time.timecards.view',
  'time.timecards.edit',
  'time.paid_time_off.create',
  'people.view',
  'people.manage',
  'roles.view',
  'roles.manage',
  'warehouse.inventory.view',
  'warehouse.inventory.adjust',
  'warehouse.purchase_orders.receive',
  'warehouse.transfers.create',
  'warehouse.transfers.fulfill',
  'warehouse.will_calls.fulfill',
  'warehouse.deliveries.stage',
  'warehouse.production.execute',
  'academy.content.view',
  'academy.content.manage',
  'academy.training.assign',
  'prospecting.prospects.manage',
  'prospecting.quotes.create',
  'sales.customers.view',
  'sales.quotes.create',
  'sales.orders.create',
  'sales.discounts.approve',
  'sales.refunds.approve',
] as const;

export type BmPermission = (typeof BM_PERMISSIONS)[number];

export type AccessScope =
  | { type: 'self' }
  | { type: 'location'; locationIds: string[] }
  | { type: 'department'; departmentIds: string[] }
  | { type: 'company' };

export type PermissionGrant = {
  permission: BmPermission;
  scope: AccessScope;
  expiresAt?: string | null;
};

export type BmIdentityAuthorization = {
  identityId: string;
  active: boolean;
  grants: PermissionGrant[];
};

export function hasPermission(
  authorization: BmIdentityAuthorization,
  permission: BmPermission,
  context: { identityId?: string; locationId?: string; departmentId?: string } = {},
) {
  if (!authorization.active) return false;

  return authorization.grants.some((grant) => {
    if (grant.permission !== permission) return false;
    if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= Date.now()) return false;

    if (grant.scope.type === 'company') return true;
    if (grant.scope.type === 'self') return context.identityId === authorization.identityId;
    if (grant.scope.type === 'location') {
      return Boolean(context.locationId && grant.scope.locationIds.includes(context.locationId));
    }
    return Boolean(
      context.departmentId && grant.scope.departmentIds.includes(context.departmentId),
    );
  });
}
