import { createHmac, timingSafeEqual } from 'crypto';

export type TimeUserSession = {
  userId: string;
  name: string;
  role: 'admin' | 'manager';
  locationId: string | null;
  locationName: string | null;
  allLocations: boolean;
  canManageEmployees: boolean;
  expiresAt: number;
};

const COOKIE_NAME = 'bm_time_session';
const SESSION_SECONDS = 60 * 60 * 12;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('AUTH_SECRET is not configured.');
  return value;
}

function encode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signature(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionToken(input: Omit<TimeUserSession, 'expiresAt'>) {
  const session: TimeUserSession = {
    ...input,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  const payload = encode(JSON.stringify(session));
  return `${payload}.${signature(payload)}`;
}

export function readSessionToken(token?: string | null): TimeUserSession | null {
  if (!token) return null;
  const [payload, suppliedSignature] = token.split('.');
  if (!payload || !suppliedSignature) return null;

  const expected = signature(payload);
  const a = Buffer.from(suppliedSignature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const session = JSON.parse(decode(payload)) as TimeUserSession;
    if (!session.expiresAt || session.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: COOKIE_NAME,
  maxAge: SESSION_SECONDS,
};
