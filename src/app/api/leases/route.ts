import { z } from 'zod';
import { api, body, HttpError, isStaff, optInt, Where } from '@/lib/api';
import { query, withTransaction } from '@/lib/db';
import { assertUnitAccess, unitAccess } from '@/lib/scope';

export const GET = api({}, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const w = new Where([user.id]);
  if (isStaff(user)) w.raw(unitAccess('l.unit_id', 1));
  else w.raw(`(t.user_id = $1 OR EXISTS (SELECT 1 FROM ownership o JOIN owner_profile op USING (owner_id)
                                          WHERE o.unit_id = l.unit_id AND op.user_id = $1 AND o.owned_until IS NULL))`);
  if (sp.get('status')) w.add((p) => `l.status = ${p}`, sp.get('status'));
  const complexId = optInt(sp.get('complexId'));
  if (complexId) w.add((p) => `d.complex_id = ${p}`, complexId);
  const exp = optInt(sp.get('expiringWithin'));
  if (exp) w.add((p) => `l.status = 'ACTIVE' AND l.end_date <= current_date + ${p}::int`, exp);
  if (sp.get('q')) w.add((p) => `(au.full_name ILIKE ${p} OR d.unit_number ILIKE ${p})`, `%${sp.get('q')}%`);
  const page = Math.max(1, optInt(sp.get('page')) ?? 1);

  const rows = await query(
    `SELECT l.lease_id, l.unit_id, d.complex_name, d.block_name, d.unit_number, d.unit_type,
            au.full_name AS tenant_name, au.user_id AS tenant_user_id,
            l.start_date, l.end_date, l.monthly_rent, l.security_deposit, l.rent_due_day, l.status,
            l.terminated_on, l.termination_reason,
            (l.end_date - current_date) AS days_left,
            count(*) OVER ()::int AS total_count
       FROM lease l
       JOIN tenant_profile t   USING (tenant_id)
       JOIN app_user au        ON au.user_id = t.user_id
       JOIN v_unit_directory d ON d.unit_id = l.unit_id
      WHERE ${w}
      ORDER BY CASE l.status WHEN 'ACTIVE' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END, l.end_date
      LIMIT 25 OFFSET ${(page - 1) * 25}`, w.args);
  return { rows, total: rows[0]?.total_count ?? 0, page, pageSize: 25 };
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const createSchema = z.object({
  unit_id: z.number().int().positive(),
  tenant_user_id: z.number().int().positive(),
  start_date: isoDate,
  end_date: isoDate,
  monthly_rent: z.number().positive().max(1_000_000),
  security_deposit: z.number().min(0),
  rent_due_day: z.number().int().min(1).max(28).default(5),
});

export const POST = api({ roles: ['ADMIN', 'MANAGER'] }, async ({ req, user }) => {
  const input = await body(req, createSchema);
  await assertUnitAccess(user, input.unit_id);
  return withTransaction(user.id, async (c) => {
    const t = (await c.query(`SELECT tenant_id FROM tenant_profile WHERE user_id = $1`, [input.tenant_user_id])).rows[0];
    if (!t) throw new HttpError(422, 'Selected person is not a registered tenant.');
    const u = (await c.query(`SELECT occupancy_status FROM unit WHERE unit_id = $1 FOR UPDATE`, [input.unit_id])).rows[0];
    if (u.occupancy_status === 'UNDER_MAINTENANCE') throw new HttpError(409, 'Unit is under maintenance and cannot be leased.');
    // Remaining rules (dates, deposit cap, no overlap, unit has an owner) are enforced by the database
    const r = await c.query(
      `INSERT INTO lease (unit_id, tenant_id, start_date, end_date, monthly_rent, security_deposit, rent_due_day, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $3::date > current_date THEN 'PENDING' ELSE 'ACTIVE' END, $8)
       RETURNING *`,
      [input.unit_id, t.tenant_id, input.start_date, input.end_date, input.monthly_rent,
       input.security_deposit, input.rent_due_day, user.id]);
    return r.rows[0];
  });
});
