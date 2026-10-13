import { api, optInt, Where } from '@/lib/api';
import { query } from '@/lib/db';
import { unitAccess } from '@/lib/scope';

// Unit directory with filtering, search and pagination
export const GET = api({}, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const w = new Where([user.id]).raw(unitAccess('d.unit_id', 1));
  const complexId = optInt(sp.get('complexId'));
  if (complexId) w.add((p) => `d.complex_id = ${p}`, complexId);
  if (sp.get('status')) w.add((p) => `d.occupancy_status = ${p}`, sp.get('status'));
  if (sp.get('type')) w.add((p) => `d.unit_type = ${p}`, sp.get('type'));
  if (sp.get('q')) w.add((p) => `(d.unit_number ILIKE ${p} OR d.owner_names ILIKE ${p} OR d.tenant_name ILIKE ${p}
                                  OR (d.block_name || '-' || d.unit_number) ILIKE ${p})`, `%${sp.get('q')}%`);
  const page = Math.max(1, optInt(sp.get('page')) ?? 1);
  const pageSize = 25;

  const rows = await query(
    `SELECT d.*, count(*) OVER ()::int AS total_count
       FROM v_unit_directory d
      WHERE ${w}
      ORDER BY d.complex_name, d.block_name, d.unit_number
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, w.args);
  return { rows, total: rows[0]?.total_count ?? 0, page, pageSize };
});
