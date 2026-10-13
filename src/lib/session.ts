// Session tokens: HS256 JWT in an httpOnly cookie. Edge-safe (used by proxy.ts).
import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'aptmgr_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type Role = 'ADMIN' | 'MANAGER' | 'OWNER' | 'TENANT';
export type SessionUser = { id: number; role: Role; name: string; email: string };

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set (32+ characters)');
  return new TextEncoder().encode(s);
}

export async function signSession(u: SessionUser): Promise<string> {
  return new SignJWT({ role: u.role, name: u.name, email: u.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(u.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return { id: Number(payload.sub), role: payload.role as Role, name: String(payload.name), email: String(payload.email) };
  } catch {
    return null;
  }
}
