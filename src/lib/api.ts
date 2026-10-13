// Route-handler wrapper: authentication, role checks, JSON body parsing
// with zod, and translation of PostgreSQL errors into HTTP responses.
import type { NextRequest } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { queryOne } from './db';
import { SESSION_COOKIE, verifySession, type Role, type SessionUser } from './session';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Handler<P> = (ctx: { req: NextRequest; user: SessionUser; params: P }) => Promise<unknown>;

// Friendly messages for named constraints (everything else falls back to the
// database's own message, which our triggers already write in plain English)
const CONSTRAINT_MESSAGES: Record<string, string> = {
  ex_lease_no_overlap: 'This unit already has an active or pending lease that overlaps these dates.',
  ex_slot_overlap: 'That parking slot is already allocated for these dates.',
  ex_vehicle_overlap: 'That vehicle already has a parking slot.',
  ex_ownership_overlap: 'This owner already has an ownership record for the unit in that period.',
  uq_app_user_email_lower: 'An account with this email already exists.',
  vehicle_registration_no_key: 'A vehicle with this registration number is already registered.',
  payment_reference_no_key: 'A payment with this reference number already exists.',
  chk_lease_deposit: 'Security deposit cannot exceed 10 months of rent.',
  chk_lease_dates: 'Lease end date must be after the start date.',
  chk_vehicle_reg: 'Registration number must look like KA01AB1234.',
  chk_mr_desc: 'Please describe the problem in at least 15 characters.',
  chk_mr_title: 'Title must be at least 5 characters.',
  chk_mr_vendor: 'Assign a vendor before moving the request forward.',
};

function pgToHttp(e: { code?: string; constraint?: string; message: string }): HttpError | null {
  if (!e.code) return null;
  const friendly = e.constraint ? CONSTRAINT_MESSAGES[e.constraint] : undefined;
  switch (e.code) {
    case '23505': return new HttpError(409, friendly ?? 'Duplicate value: ' + e.message);
    case '23P01': return new HttpError(409, friendly ?? e.message);
    case '23503': return new HttpError(409, friendly ?? 'Referenced record is missing or still in use.');
    case '23514': return new HttpError(422, friendly ?? e.message);  // CHECK and trigger rules
    case '23502': return new HttpError(422, friendly ?? e.message);
    case '22P02': case '22007': case '22008': return new HttpError(400, 'Invalid value: ' + e.message);
    case 'P0002': return new HttpError(404, e.message);
    default: return null;
  }
}

export function api<P = Record<string, string>>(opts: { roles?: Role[] }, fn: Handler<P>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
      if (!user) throw new HttpError(401, 'Please sign in.');
      // the account may have been deactivated after the token was issued
      const live = await queryOne<{ is_active: boolean }>('SELECT is_active FROM app_user WHERE user_id = $1', [user.id]);
      if (!live?.is_active) throw new HttpError(401, 'Account is inactive.');
      if (opts.roles && !opts.roles.includes(user.role)) throw new HttpError(403, 'You do not have access to this action.');
      // basic CSRF defence: state-changing requests must be JSON (not a cross-site form post)
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
        const ct = req.headers.get('content-type') ?? '';
        if (req.headers.get('content-length') !== '0' && req.method !== 'DELETE' && !ct.includes('application/json'))
          throw new HttpError(415, 'Expected application/json');
      }
      const params = (await ctx.params) ?? ({} as P);
      const result = await fn({ req, user, params });
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) {
    return Response.json({
      error: err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '),
      issues: err.issues,
    }, { status: 400 });
  }
  const mapped = pgToHttp(err as { code?: string; constraint?: string; message: string });
  if (mapped) return Response.json({ error: mapped.message }, { status: mapped.status });
  console.error(err);
  return Response.json({ error: 'Unexpected server error' }, { status: 500 });
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try { json = await req.json(); } catch { throw new HttpError(400, 'Request body must be valid JSON'); }
  return schema.parse(json);
}

export function intParam(v: string | null | undefined, name = 'id'): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${name}`);
  return n;
}

export function optInt(v: string | null): number | null {
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new HttpError(400, 'Invalid number in query');
  return n;
}

export const isStaff = (u: SessionUser) => u.role === 'ADMIN' || u.role === 'MANAGER';

/** Builds a parameterised WHERE clause: every value goes through $n placeholders. */
export class Where {
  parts: string[] = [];
  args: unknown[] = [];
  constructor(initial: unknown[] = []) { this.args = [...initial]; }
  /** Add a value and get its placeholder. */
  param(v: unknown): string { this.args.push(v); return `$${this.args.length}`; }
  /** Add a condition; `build` receives the placeholder for `v`. */
  add(build: (p: string) => string, v: unknown) { this.parts.push(build(this.param(v))); return this; }
  raw(sql: string) { this.parts.push(sql); return this; }
  toString() { return this.parts.length ? this.parts.join(' AND ') : 'true'; }
}
