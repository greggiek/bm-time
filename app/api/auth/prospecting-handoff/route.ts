import { createHash, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

const prospectingUrl = process.env.BM_PROSPECTING_URL || 'https://greg-playground.vercel.app';

export async function GET(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session?.identityId) return NextResponse.redirect(new URL('/manager', request.url));

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'BM OS is not configured.' }, { status: 503 });

  const { data: access } = await supabase
    .from('bm_identity_system_access')
    .select('identity_id')
    .eq('identity_id', session.identityId)
    .eq('system_code', 'prospecting')
    .maybeSingle();
  if (!access) return NextResponse.json({ message: 'BM Prospecting access has not been assigned.' }, { status: 403 });

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { error } = await supabase.from('bm_sso_handoffs').insert({
    token_hash: tokenHash,
    identity_id: session.identityId,
    target_system: 'prospecting',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  if (error) return NextResponse.json({ message: 'Unable to open BM Prospecting.' }, { status: 500 });

  const destination = new URL('/api/auth/bmos-session', prospectingUrl);
  destination.searchParams.set('token', token);
  return NextResponse.redirect(destination);
}

