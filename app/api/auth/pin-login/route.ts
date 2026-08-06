import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

const LoginSchema = z.object({ pin: z.string().regex(/^\d{4}$/) });

export async function POST(request: Request) {
  const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: 'Enter a valid 4-digit PIN.' }, { status: 400 });
  }

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });

  const { data: users, error } = await supabase
    .from('time_users')
    .select('id,name,pin_hash,role,location_id,all_locations,active,time_locations(name)')
    .eq('active', true);

  if (error) return NextResponse.json({ message: 'Unable to read manager accounts.' }, { status: 500 });

  let matched: any = null;
  for (const user of users || []) {
    if (await bcrypt.compare(parsed.data.pin, user.pin_hash)) {
      matched = user;
      break;
    }
  }

  if (!matched) return NextResponse.json({ message: 'PIN not recognized.' }, { status: 401 });

  const locationName = Array.isArray(matched.time_locations)
    ? matched.time_locations[0]?.name || null
    : matched.time_locations?.name || null;

  const token = createSessionToken({
    userId: matched.id,
    name: matched.name,
    role: matched.role,
    locationId: matched.location_id,
    locationName,
    allLocations: Boolean(matched.all_locations),
  });

  const response = NextResponse.json({
    ok: true,
    user: {
      name: matched.name,
      role: matched.role,
      locationName,
      allLocations: Boolean(matched.all_locations),
    },
  });

  response.cookies.set(sessionCookie.name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: sessionCookie.maxAge,
  });

  return response;
}
