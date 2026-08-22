import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session || session.role !== 'employee' || !session.identityId) {
    return NextResponse.json({ message: 'Employee sign-in is required.' }, { status: 401 });
  }
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'BM OS is not configured.' }, { status: 503 });
  const { data, error } = await supabase
    .from('bm_identity_system_access')
    .select('system_code,access_level,scope_type,scope_ids')
    .eq('identity_id', session.identityId);
  if (error) return NextResponse.json({ message: 'Unable to load your BM OS access.' }, { status: 500 });
  return NextResponse.json({
    user: { name: session.name, locationName: session.locationName },
    systems: data || [],
  });
}
