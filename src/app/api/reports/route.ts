import { api, HttpError } from '@/lib/api';
import { query } from '@/lib/db';
import { REPORTS } from '@/lib/reports';
import { visibleComplexIds } from '@/lib/scope';

// Named analytical queries. The SQL text is returned with the result so the
// Reports page can show exactly what ran.
export const GET = api({ roles: ['ADMIN', 'MANAGER'] }, async ({ req, user }) => {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return REPORTS.map(({ key, title, description, concepts }) => ({ key, title, description, concepts }));
  const r = REPORTS.find((x) => x.key === name);
  if (!r) throw new HttpError(404, 'Unknown report');
  const ids = await visibleComplexIds(user);
  const t0 = performance.now();
  const rows = await query(r.sql, [ids]);
  return { ...r, took_ms: Math.round(performance.now() - t0), rows };
});
