// PostgreSQL access layer. Connection settings come only from the
// environment (DATABASE_URL); nothing is hard-coded.
import pg, { Pool, type PoolClient, type QueryResultRow } from 'pg';

declare global {
  var __pgPool: Pool | undefined;
}

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return new Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    // Hosted databases (Neon, Supabase) put ?sslmode=require in the URL and the
    // driver handles it. PGSSL=require forces TLS for URLs that do not say so.
    ssl: process.env.PGSSL === 'require' && !/sslmode=/.test(url) ? { rejectUnauthorized: false } : undefined,
  });
}

// Reuse one pool across hot reloads in development
export const pool: Pool = globalThis.__pgPool ?? createPool();
if (process.env.NODE_ENV !== 'production') globalThis.__pgPool = pool;

// NUMERIC -> JS number (amounts fit comfortably in a double at this scale)
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // bigint ids
pg.types.setTypeParser(1082, (v) => v); // DATE stays 'YYYY-MM-DD'

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Run `fn` inside a transaction. `app.user_id` is set for the transaction
 * only (set_config(..., true) == SET LOCAL) so audit and history triggers
 * know who made the change. Any error rolls everything back.
 */
export async function withTransaction<T>(userId: number | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (userId != null) await client.query(`SELECT set_config('app.user_id', $1, true)`, [String(userId)]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
