import { api } from '@/lib/api';
import { query, withTransaction } from '@/lib/db';

export const POST = api({ roles: ['ADMIN'] }, async ({ user }) => {
  const n = await withTransaction(user.id, (c) =>
    c.query('SELECT fn_apply_late_fees(current_date) AS n').then((r) => r.rows[0].n as number));
  await query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_complex_kpis');
  return { lateFeesCreated: n };
});
