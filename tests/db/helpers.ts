import { Pool, type PoolClient } from 'pg';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

/**
 * Runs a test body inside a transaction that is always rolled back, so the
 * seeded database is left exactly as it was.
 */
export async function inTx(fn: (c: PoolClient) => Promise<void>) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await fn(c);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
}

/** Expect a statement to fail with a given SQLSTATE; uses a savepoint so the transaction survives. */
export async function expectPgError(c: PoolClient, sql: string, params: unknown[], code: string, msg?: RegExp) {
  await c.query('SAVEPOINT sp');
  let err: any = null;
  try { await c.query(sql, params); } catch (e) { err = e; }
  await c.query('ROLLBACK TO SAVEPOINT sp');
  if (!err) throw new Error(`Expected SQLSTATE ${code} but statement succeeded: ${sql}`);
  if (err.code !== code) throw new Error(`Expected SQLSTATE ${code}, got ${err.code}: ${err.message}`);
  if (msg && !msg.test(err.message)) throw new Error(`Error message "${err.message}" does not match ${msg}`);
  return err;
}

export const one = async (c: PoolClient, sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows[0];

export const BCRYPT = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.hTa/GC5Ma1xw0t0Mx8hO4Ez0Uv0C';

/** Creates an owned, vacant unit with an owner and a tenant, returning their ids. */
export async function fixture(c: PoolClient) {
  const block = await one(c, `SELECT b.block_id, b.complex_id FROM block b WHERE b.name = 'A' LIMIT 1`);
  const unit = await one(c, `INSERT INTO unit (block_id, unit_number, floor_no, unit_type, carpet_area_sqft, base_rent, monthly_maintenance)
                             VALUES ($1, 'T999', 2, '2BHK', 1100, 30000, 3500) RETURNING unit_id`, [block.block_id]);
  const ou = await one(c, `INSERT INTO app_user (email, password_hash, full_name, phone, role) VALUES ('fx.owner@test.in',$1,'Fixture Owner','9000000001','OWNER') RETURNING user_id`, [BCRYPT]);
  const op = await one(c, `INSERT INTO owner_profile (user_id, mailing_address) VALUES ($1, 'Test address, Bengaluru') RETURNING owner_id`, [ou.user_id]);
  await c.query(`INSERT INTO ownership (unit_id, owner_id, share_pct, owned_from) VALUES ($1,$2,100,'2020-01-01')`, [unit.unit_id, op.owner_id]);
  const tu = await one(c, `INSERT INTO app_user (email, password_hash, full_name, phone, role) VALUES ('fx.tenant@test.in',$1,'Fixture Tenant','9000000002','TENANT') RETURNING user_id`, [BCRYPT]);
  const tp = await one(c, `INSERT INTO tenant_profile (user_id, emergency_contact_name, emergency_contact_phone) VALUES ($1,'Someone','9000000003') RETURNING tenant_id`, [tu.user_id]);
  return { unitId: unit.unit_id as number, complexId: block.complex_id as number, ownerId: op.owner_id as number, ownerUser: ou.user_id as number,
           tenantId: tp.tenant_id as number, tenantUser: tu.user_id as number };
}
