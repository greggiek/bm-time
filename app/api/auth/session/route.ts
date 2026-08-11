import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, sessionCookie } from '@/lib/auth-session';

export async function GET(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 });
  return NextResponse.json({ user: { name: session.name, role: session.role, locationName: session.locationName, allLocations: session.allLocations, canManageEmployees: session.canManageEmployees } });
}
