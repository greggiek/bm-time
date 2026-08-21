import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

const Schema = z.object({ accessToken: z.string().min(20) });

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Invalid Google session.' }, { status: 400 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  const { data: authData, error: authError } = await supabase.auth.getUser(parsed.data.accessToken);
  const email = authData.user?.email?.trim().toLowerCase();
  if (authError || !email || !email.endsWith('@bargainmoulding.com')) return NextResponse.json({ message: 'Use an approved Bargain Moulding Google account.' }, { status: 403 });
  const { data: identity } = await supabase.from('bm_identities').select('id,display_name,active').eq('google_email', email).eq('active', true).maybeSingle();
  if (!identity) return NextResponse.json({ message: 'This email is not active in the BM OS identity roster.' }, { status: 403 });
  const { data: user } = await supabase.from('time_users').select('id,name,role,location_id,all_locations,can_manage_employees,active,time_locations(name)').ilike('name', identity.display_name).eq('active', true).maybeSingle();
  if (!user) return NextResponse.json({ message: 'Your email is approved, but no BM OS management access is assigned.' }, { status: 403 });
  const locationName = Array.isArray(user.time_locations) ? user.time_locations[0]?.name || null : null;
  const token = createSessionToken({ userId: user.id, name: user.name, role: user.role, locationId: user.location_id, locationName, allLocations: Boolean(user.all_locations), canManageEmployees: Boolean(user.can_manage_employees) });
  const response = NextResponse.json({ ok: true, redirectTo: user.role === 'admin' ? '/admin' : '/manager' });
  response.cookies.set(sessionCookie.name, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: sessionCookie.maxAge });
  return response;
}
