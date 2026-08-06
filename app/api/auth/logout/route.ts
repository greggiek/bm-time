import { NextResponse } from 'next/server';
import { sessionCookie } from '@/lib/auth-session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie.name, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
