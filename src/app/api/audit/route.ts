import { api, optInt, Where } from '@/lib/api';
import { query } from '@/lib/db';

export const GET = api({ roles: ['ADMIN'] }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const w = new Where();
  if (sp.get('table')) w.add((p) => `a.table_name = ${p}`, sp.get('table'));
  const page = Math.max(1, optInt(sp.get('page')) ?? 1);
  const rows = await query(
    `SELECT a.*, au.full_name AS changed_by_name, count(*) OVER ()::int AS total_count
       FROM audit_log a LEFT JOIN app_user au ON au.user_id = a.changed_by
      WHERE ${w} ORDER BY a.changed_at DESC, a.audit_id DESC LIMIT 30 OFFSET ${(page - 1) * 30}`, w.args);
  return { rows, total: rows[0]?.total_count ?? 0, page, pageSize: 30 };
});
