import { createHmac, timingSafeEqual } from 'crypto';

export type AcademySession = {
  employeeId: string;
  name: string;
  jobTitleId: string | null;
  jobTitle: string;
  location: string;
  expiresAt: number;
};

const COOKIE_NAME = 'bm_academy_session';
const SESSION_SECONDS = 60 * 60 * 12;
const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const decode = (value: string) => Buffer.from(value, 'base64url').toString('utf8');
const secret = () => {
  if (!process.env.AUTH_SECRET) throw new Error('AUTH_SECRET is not configured.');
  return process.env.AUTH_SECRET;
};
const signature = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function createAcademySession(input: Omit<AcademySession, 'expiresAt'>) {
  const payload = encode(JSON.stringify({ ...input, expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
  return `${payload}.${signature(payload)}`;
}

export function readAcademySession(token?: string | null): AcademySession | null {
  if (!token) return null;
  const [payload, supplied] = token.split('.');
  if (!payload || !supplied) return null;
  const expected = signature(payload);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(decode(payload)) as AcademySession;
    return session.expiresAt > Math.floor(Date.now() / 1000) ? session : null;
  } catch { return null; }
}

export const academySessionCookie = { name: COOKIE_NAME, maxAge: SESSION_SECONDS };
