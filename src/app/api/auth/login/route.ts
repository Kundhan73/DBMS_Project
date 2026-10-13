import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, HttpError } from '@/lib/api';
import { query, queryOne } from '@/lib/db';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, type Role } from '@/lib/session';

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(1).max(200),
});

// Simple in-memory throttle: 5 failed attempts per email per 15 minutes
const failures = new Map<string, { count: number; until: number }>();
// Compared against when the email is unknown, so timing does not reveal which emails exist
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.hTa/GC5Ma1xw0t0Mx8hO4Ez0Uv0C';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = schema.parse(await req.json().catch(() => ({})));
    const f = failures.get(email);
    if (f && f.count >= 5 && f.until > Date.now()) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');

    const user = await queryOne<{ user_id: number; password_hash: string; role: Role; full_name: string; email: string; is_active: boolean }>(
      'SELECT user_id, password_hash, role, full_name, email, is_active FROM app_user WHERE lower(email) = $1', [email]);
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok || !user.is_active) {
      const cur = failures.get(email);
      failures.set(email, { count: (cur && cur.until > Date.now() ? cur.count : 0) + 1, until: Date.now() + 15 * 60_000 });
      throw new HttpError(401, 'Invalid email or password.');
    }
    failures.delete(email);
    await query('UPDATE app_user SET last_login_at = now() WHERE user_id = $1', [user.user_id]);

    const token = await signSession({ id: user.user_id, role: user.role, name: user.full_name, email: user.email });
    const res = Response.json({ user: { id: user.user_id, role: user.role, name: user.full_name, email: user.email } });
    res.headers.append('Set-Cookie',
      `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}` +
      (process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1' ? '; Secure' : ''));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
