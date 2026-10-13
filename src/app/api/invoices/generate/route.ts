import { z } from 'zod';
import { api, body } from '@/lib/api';
import { query, withTransaction } from '@/lib/db';

const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM') });

// Monthly billing run (fn_generate_monthly_invoices). Safe to repeat:
// already-billed items are skipped by partial unique indexes.
export const POST = api({ roles: ['ADMIN'] }, async ({ req, user }) => {
  const { month } = await body(req, schema);
  const result = await withTransaction(user.id, (c) =>
    c.query(`SELECT * FROM fn_generate_monthly_invoices(($1 || '-01')::date)`, [month]).then((r) => r.rows));
  await query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_complex_kpis');
  return { month, created: result };
});
