import { api } from '@/lib/api';
import { query } from '@/lib/db';

// CONCURRENTLY keeps the dashboard readable while the snapshot rebuilds
export const POST = api({ roles: ['ADMIN', 'MANAGER'] }, async () => {
  await query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_complex_kpis');
  return { ok: true, refreshedAt: new Date().toISOString() };
});
