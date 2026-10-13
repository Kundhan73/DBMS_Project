// End-to-end API tests against a running server (npm run build && npm start).
//   API_BASE_URL defaults to http://localhost:3000
// These create data (payments, requests, a lease); run `npm run db:reset` for a clean slate.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const BASE = process.env.API_BASE_URL ?? 'http://localhost:3000';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
afterAll(() => pool.end());

type Session = { cookie: string; user: { id: number; role: string } };

async function login(email: string, password: string): Promise<Session> {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  expect(r.status).toBe(200);
  const setCookie = r.headers.get('set-cookie') ?? '';
  return { cookie: setCookie.split(';')[0], user: (await r.json()).user };
}

async function call(s: Session | null, method: string, path: string, body?: unknown, contentType = 'application/json') {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(s ? { cookie: s.cookie } : {}), ...(body !== undefined ? { 'content-type': contentType } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

let admin: Session, manager: Session, palmManager: Session, owner: Session, tenant: Session;

beforeAll(async () => {
  admin = await login('admin@aptmgr.in', 'Admin@123');
  manager = await login('ravi.manager@aptmgr.in', 'Password@123');
  palmManager = await login('priya.manager@aptmgr.in', 'Password@123');
  owner = await login('owner@example.com', 'Password@123');
  tenant = await login('tenant@example.com', 'Password@123');
});

describe('Authentication', () => {
  it('rejects a wrong password with 401', async () => {
    const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@aptmgr.in', password: 'wrong' }) });
    expect(r.status).toBe(401);
  });

  it('issues an HttpOnly, SameSite session cookie', async () => {
    const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'tenant@example.com', password: 'Password@123' }) });
    const c = r.headers.get('set-cookie') ?? '';
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
  });

  it('requires a session for API calls', async () => {
    expect((await call(null, 'GET', '/api/units')).status).toBe(401);
  });

  it('rejects a forged token', async () => {
    const forged = { cookie: 'aptmgr_session=eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiQURNSU4iLCJzdWIiOiIxIn0.bad', user: { id: 1, role: 'ADMIN' } };
    expect((await call(forged, 'GET', '/api/units')).status).toBe(401);
  });

  it('redirects page requests without a session to /login', async () => {
    const r = await fetch(`${BASE}/dashboard`, { redirect: 'manual' });
    expect(r.status).toBe(307);
    expect(r.headers.get('location')).toMatch(/\/login/);
  });
});

describe('Role-based access', () => {
  it('tenants cannot open staff-only endpoints', async () => {
    expect((await call(tenant, 'GET', '/api/people?role=TENANT')).status).toBe(403);
    expect((await call(tenant, 'GET', '/api/reports')).status).toBe(403);
    expect((await call(tenant, 'GET', '/api/audit')).status).toBe(403);
    expect((await call(tenant, 'POST', '/api/invoices/generate', { month: '2026-09' })).status).toBe(403);
  });

  it('managers cannot run admin-only actions', async () => {
    expect((await call(manager, 'POST', '/api/invoices/generate', { month: '2026-09' })).status).toBe(403);
    expect((await call(manager, 'GET', '/api/audit')).status).toBe(403);
  });

  it('a manager only sees the complexes assigned to them', async () => {
    const r = await call(palmManager, 'GET', '/api/complexes');
    expect(r.body.map((c: any) => c.name)).toEqual(['Palm Grove Towers']);
    expect((await call(palmManager, 'GET', '/api/complexes/1')).status).toBe(403);
    const d = await call(palmManager, 'GET', '/api/dashboard');
    expect(d.body.kpis.map((k: any) => k.complex_name)).toEqual(['Palm Grove Towers']);
  });

  it('a tenant only sees invoices billed to them', async () => {
    const r = await call(tenant, 'GET', '/api/invoices?status=');
    expect(r.body.rows.length).toBeGreaterThan(0);
    expect(r.body.rows.every((i: any) => i.billed_to === tenant.user.id)).toBe(true);
  });

  it('a tenant cannot view another unit', async () => {
    const other = (await pool.query(`SELECT unit_id FROM unit WHERE unit_id NOT IN (
        SELECT l.unit_id FROM lease l JOIN tenant_profile t USING (tenant_id) WHERE t.user_id = $1) LIMIT 1`, [tenant.user.id])).rows[0];
    expect((await call(tenant, 'GET', `/api/units/${other.unit_id}`)).status).toBe(403);
  });

  it('an owner sees only units they own', async () => {
    const r = await call(owner, 'GET', '/api/units');
    expect(r.body.rows.length).toBe(2);
    expect(r.body.rows.every((u: any) => u.owner_user_ids.includes(owner.user.id))).toBe(true);
  });
});

describe('Validation and security', () => {
  it('returns 400 with a readable message for invalid input', async () => {
    const r = await call(manager, 'POST', '/api/leases', { unit_id: 'abc' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/unit_id/);
  });

  it('rejects state-changing requests that are not JSON (CSRF defence)', async () => {
    const r = await call(tenant, 'POST', '/api/payments', 'invoice_id=1&amount=1', 'application/x-www-form-urlencoded');
    expect(r.status).toBe(415);
  });

  it('treats SQL in search parameters as data', async () => {
    const r = await call(admin, 'GET', `/api/units?q=${encodeURIComponent("'; DROP TABLE unit; --")}`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
    const still = await pool.query('SELECT count(*)::int AS n FROM unit');
    expect(still.rows[0].n).toBeGreaterThan(0);
  });

  it('surfaces database constraint violations as 409/422 with the rule explained', async () => {
    const active = (await pool.query(`SELECT l.unit_id, t.user_id FROM lease l JOIN tenant_profile t USING (tenant_id)
       JOIN unit u USING (unit_id) JOIN block b USING (block_id) WHERE l.status = 'ACTIVE' AND b.complex_id = 1 LIMIT 1`)).rows[0];
    const overlap = await call(manager, 'POST', '/api/leases', { unit_id: active.unit_id, tenant_user_id: Number(active.user_id),
      start_date: '2026-10-01', end_date: '2027-09-01', monthly_rent: 30000, security_deposit: 60000 });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error).toMatch(/overlaps/);
  });
});

describe('Billing flow', () => {
  it('a tenant pays part of an invoice, then the rest', async () => {
    const inv = (await call(tenant, 'GET', '/api/invoices?status=OPEN')).body.rows[0];
    expect(inv).toBeTruthy();
    const half = Math.round(inv.balance / 2);
    const p1 = await call(tenant, 'POST', '/api/payments', { invoice_id: inv.invoice_id, amount: half, method: 'UPI' });
    expect(p1.status).toBe(200);
    expect(p1.body.invoice_status).toBe('PARTIAL');
    const over = await call(tenant, 'POST', '/api/payments', { invoice_id: inv.invoice_id, amount: inv.balance, method: 'UPI' });
    expect(over.status).toBe(422);
    expect(over.body.error).toMatch(/exceeds outstanding balance/);
    const p2 = await call(tenant, 'POST', '/api/payments', { invoice_id: inv.invoice_id, amount: inv.balance - half, method: 'CARD' });
    expect(p2.body.invoice_status).toBe('PAID');
  });

  it('a tenant cannot pay someone else\'s invoice, or pay in cash', async () => {
    const other = (await pool.query(`SELECT invoice_id FROM invoice WHERE billed_to <> $1 AND status = 'UNPAID' LIMIT 1`, [tenant.user.id])).rows[0];
    expect((await call(tenant, 'POST', '/api/payments', { invoice_id: Number(other.invoice_id), amount: 10, method: 'UPI' })).status).toBe(403);
    const mine = (await pool.query(`SELECT invoice_id FROM invoice WHERE billed_to = $1 AND status IN ('UNPAID','PARTIAL') LIMIT 1`, [tenant.user.id])).rows[0];
    if (mine) expect((await call(tenant, 'POST', '/api/payments', { invoice_id: Number(mine.invoice_id), amount: 10, method: 'CASH' })).status).toBe(422);
  });

  it('the admin billing run is idempotent', async () => {
    const month = new Date().toLocaleDateString('en-CA').slice(0, 7);
    const r = await call(admin, 'POST', '/api/invoices/generate', { month });
    expect(r.status).toBe(200);
    expect(r.body.created.every((x: any) => x.invoices_created === 0)).toBe(true);
  });

  it('an admin can reverse a payment and the invoice reopens', async () => {
    const pay = (await pool.query(`SELECT p.payment_id, p.invoice_id FROM payment p WHERE (SELECT count(*) FROM payment x WHERE x.invoice_id = p.invoice_id) = 1 ORDER BY p.payment_id LIMIT 1`)).rows[0];
    const r = await call(admin, 'DELETE', `/api/payments/${pay.payment_id}`);
    expect(r.status).toBe(200);
    expect(r.body.invoice.status).toBe('UNPAID');
    const audit = await pool.query(`SELECT changed_by FROM audit_log WHERE table_name = 'payment' AND row_pk = $1 AND action = 'D'`, [String(pay.payment_id)]);
    expect(Number(audit.rows[0].changed_by)).toBe(admin.user.id);
  });
});

describe('Maintenance flow with semantic search', () => {
  let requestId: number;

  it('a tenant raises a request; it is stored together with its embedding', async () => {
    const unit = (await call(tenant, 'GET', '/api/units')).body.rows[0];
    const r = await call(tenant, 'POST', '/api/maintenance', {
      unit_id: unit.unit_id, category: 'PLUMBING', priority: 'HIGH',
      title: 'Bathroom ceiling is dripping', description: 'Drops of water are falling from the bathroom roof near the exhaust fan since last night.' });
    expect(r.status).toBe(200);
    requestId = r.body.request.request_id;
    const e = await pool.query('SELECT vector_dims(embedding) AS d FROM request_embedding WHERE request_id = $1', [requestId]);
    expect(e.rows[0].d).toBe(384);
  });

  it('staff can find it with a paraphrase that shares almost no words', async () => {
    const r = await call(manager, 'GET', `/api/maintenance/search?mode=vector&k=10&q=${encodeURIComponent('leak from the ceiling in the washroom')}`);
    expect(r.status).toBe(200);
    expect(r.body.results.map((x: any) => x.request_id)).toContain(requestId);
    expect(r.body.results[0].category).toBe('PLUMBING');
  });

  it('staff move it through the workflow and residents rate it', async () => {
    const vendor = (await pool.query(`SELECT vendor_id FROM vendor WHERE service_category = 'PLUMBING' LIMIT 1`)).rows[0].vendor_id;
    expect((await call(manager, 'PATCH', `/api/maintenance/${requestId}`, { action: 'assign', vendor_id: vendor, estimated_cost: 1500 })).body.status).toBe('ASSIGNED');
    expect((await call(manager, 'PATCH', `/api/maintenance/${requestId}`, { action: 'start' })).body.status).toBe('IN_PROGRESS');
    // a tenant may not resolve their own request
    expect((await call(tenant, 'PATCH', `/api/maintenance/${requestId}`, { action: 'resolve', actual_cost: 1, resolution_notes: 'fixed it' })).status).toBe(403);
    expect((await call(manager, 'PATCH', `/api/maintenance/${requestId}`, { action: 'resolve', actual_cost: 1800, resolution_notes: 'Replaced the upstairs shower trap seal.' })).body.status).toBe('RESOLVED');
    const closed = await call(tenant, 'PATCH', `/api/maintenance/${requestId}`, { action: 'close', rating: 5 });
    expect(closed.body.status).toBe('CLOSED');
    expect(closed.body.tenant_rating).toBe(5);
    const h = await pool.query('SELECT new_status FROM maintenance_status_history WHERE request_id = $1 ORDER BY history_id', [requestId]);
    expect(h.rows.map((x) => x.new_status)).toEqual(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
  });

  it('an illegal transition is refused by the database trigger (422)', async () => {
    const r = await call(manager, 'PATCH', `/api/maintenance/${requestId}`, { action: 'start' });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/Invalid status change/);
  });

  it('hybrid search reports both keyword and vector ranks', async () => {
    const r = await call(admin, 'GET', `/api/maintenance/search?q=${encodeURIComponent('MCB tripping when geyser is on')}`);
    expect(r.body.mode).toBe('hybrid');
    expect(r.body.results[0].category).toBe('ELECTRICAL');
    expect(r.body.results[0].vector_rank).not.toBeNull();
    expect(r.body.results[0].text_rank).not.toBeNull();
  });
});

describe('Leases', () => {
  it('a manager creates a lease on a vacant unit and the unit becomes LEASED', async () => {
    const unit = (await pool.query(`SELECT u.unit_id FROM unit u JOIN block b USING (block_id)
        WHERE b.complex_id = 1 AND u.occupancy_status = 'VACANT'
          AND NOT EXISTS (SELECT 1 FROM lease l WHERE l.unit_id = u.unit_id AND l.status IN ('ACTIVE','PENDING')) LIMIT 1`)).rows[0];
    const t = (await pool.query(`SELECT t.user_id FROM tenant_profile t WHERE NOT EXISTS (
        SELECT 1 FROM lease l WHERE l.tenant_id = t.tenant_id AND l.status IN ('ACTIVE','PENDING')) LIMIT 1`)).rows[0];
    const today = new Date().toLocaleDateString('en-CA');
    const r = await call(manager, 'POST', '/api/leases', { unit_id: unit.unit_id, tenant_user_id: Number(t.user_id),
      start_date: today, end_date: '2027-08-31', monthly_rent: 32000, security_deposit: 96000 });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ACTIVE');
    const u = await pool.query('SELECT occupancy_status FROM unit WHERE unit_id = $1', [unit.unit_id]);
    expect(u.rows[0].occupancy_status).toBe('LEASED');

    // and terminating it through the stored procedure frees the unit again
    const term = await call(manager, 'POST', `/api/leases/${r.body.lease_id}/terminate`, { terminated_on: today, reason: 'Created by API test' });
    expect(term.status).toBe(200);
    expect(term.body.lease.status).toBe('TERMINATED');
  });
});

describe('Reports', () => {
  it('every report runs and returns its SQL', async () => {
    const list = (await call(admin, 'GET', '/api/reports')).body;
    expect(list.length).toBeGreaterThanOrEqual(8);
    for (const r of list) {
      const res = await call(admin, 'GET', `/api/reports?name=${r.key}`);
      expect(res.status).toBe(200);
      expect(res.body.sql).toMatch(/SELECT/);
    }
  });
});
