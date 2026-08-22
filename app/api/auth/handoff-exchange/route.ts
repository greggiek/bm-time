import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminClient } from '@/lib/supabase-server';

const Schema = z.object({ token: z.string().min(30), targetSystem: z.literal('warehouse') });

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Invalid handoff.' }, { status: 400 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'BM OS is not configured.' }, { status: 503 });
  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const { data: handoff } = await supabase
    .from('bm_sso_handoffs')
    .update({ consumed_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .eq('target_system', parsed.data.targetSystem)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('identity_id')
    .maybeSingle();
  if (!handoff) return NextResponse.json({ message: 'Handoff expired or already used.' }, { status: 401 });

  const [{ data: identity }, { data: access }] = await Promise.all([
    supabase.from('bm_identities').select('id,display_name,google_email,employee_id,active').eq('id', handoff.identity_id).eq('active', true).maybeSingle(),
    supabase.from('bm_identity_system_access').select('access_level,scope_type,scope_ids').eq('identity_id', handoff.identity_id).eq('system_code', 'warehouse').maybeSingle(),
  ]);
  if (!identity || !access) return NextResponse.json({ message: 'Warehouse access is no longer active.' }, { status: 403 });
  const { data: employee } = identity.employee_id
    ? await supabase.from('time_employees').select('first_name,last_name,primary_location_id,time_locations!time_employees_primary_location_id_fkey(name)').eq('id', identity.employee_id).maybeSingle()
    : { data: null };
  const location: any = Array.isArray(employee?.time_locations) ? employee.time_locations[0] : employee?.time_locations;
  return NextResponse.json({
    identityId: identity.id,
    displayName: identity.display_name,
    email: identity.google_email || `employee-${identity.employee_id}@bmos.internal`,
    accessLevel: access.access_level,
    scopeType: access.scope_type,
    locationName: location?.name || null,
  });
}
