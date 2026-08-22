import { createHash, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session?.identityId) return NextResponse.redirect(new URL('/manager', request.url));
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'BM OS is not configured.' }, { status: 503 });

  const { data: access } = await supabase
    .from('bm_identity_system_access')
    .select('identity_id')
    .eq('identity_id', session.identityId)
    .eq('system_code', 'warehouse')
    .maybeSingle();
  if (!access) return NextResponse.json({ message: 'BM Warehouse access has not been assigned.' }, { status: 403 });

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const { error } = await supabase.from('bm_sso_handoffs').insert({
    token_hash: tokenHash,
    identity_id: session.identityId,
    target_system: 'warehouse',
    expires_at: expiresAt,
  });
  if (error) return NextResponse.json({ message: 'Unable to open BM Warehouse.' }, { status: 500 });
  return NextResponse.redirect(`https://bargain-warehouse-v2.vercel.app/api/auth/bmos-session?token=${encodeURIComponent(token)}`);
}
