import { z } from 'zod';
import { api, body, HttpError, intParam, isStaff } from '@/lib/api';
import { query, queryOne, withTransaction } from '@/lib/db';
import { assertUnitAccess } from '@/lib/scope';

export const GET = api<{ id: string }>({}, async ({ user, params }) => {
  const id = intParam(params.id);
  await assertUnitAccess(user, id);
  const unit = await queryOne('SELECT * FROM v_unit_directory WHERE unit_id = $1', [id]);
  if (!unit) throw new HttpError(404, 'Unit not found');
  const staffOrOwner = isStaff(user) || (unit.owner_user_ids as number[] | null)?.includes(user.id);

  const [owners, leases, parking, requests, invoices] = await Promise.all([
    query(`SELECT o.ownership_id, au.full_name, au.email, au.phone, o.share_pct, o.owned_from, o.owned_until
             FROM ownership o JOIN owner_profile op USING (owner_id) JOIN app_user au ON au.user_id = op.user_id
            WHERE o.unit_id = $1 ORDER BY o.owned_until NULLS FIRST, o.share_pct DESC`, [id]),
    staffOrOwner
      ? query(`SELECT l.lease_id, au.full_name AS tenant_name, l.start_date, l.end_date, l.monthly_rent,
                      l.security_deposit, l.status, l.terminated_on
                 FROM lease l JOIN tenant_profile t USING (tenant_id) JOIN app_user au ON au.user_id = t.user_id
                WHERE l.unit_id = $1 ORDER BY l.start_date DESC`, [id])
      : query(`SELECT l.lease_id, au.full_name AS tenant_name, l.start_date, l.end_date, l.monthly_rent,
                      l.security_deposit, l.status, l.terminated_on
                 FROM lease l JOIN tenant_profile t USING (tenant_id) JOIN app_user au ON au.user_id = t.user_id
                WHERE l.unit_id = $1 AND t.user_id = $2 ORDER BY l.start_date DESC`, [id, user.id]),
    query(`SELECT pa.allocation_id, ps.slot_code, ps.level, ps.slot_type, v.registration_no, v.make_model,
                  pa.start_date, pa.end_date, pa.monthly_charge
             FROM parking_allocation pa JOIN parking_slot ps USING (slot_id) JOIN vehicle v USING (vehicle_id)
            WHERE pa.unit_id = $1 AND (pa.end_date IS NULL OR pa.end_date > current_date)`, [id]),
    query(`SELECT request_id, title, category, priority, status, created_at FROM maintenance_request
            WHERE unit_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
    staffOrOwner
      ? query(`SELECT invoice_type, count(*)::int AS invoices, sum(amount)::float AS billed,
                      sum(amount_paid)::float AS paid, sum(amount - amount_paid)::float AS outstanding
                 FROM invoice WHERE unit_id = $1 AND status <> 'VOID' GROUP BY invoice_type ORDER BY invoice_type`, [id])
      : Promise.resolve([]),
  ]);
  return { unit, owners, leases, parking, requests, invoices };
});

const patchSchema = z.object({
  occupancy_status: z.enum(['VACANT', 'OWNER_OCCUPIED', 'UNDER_MAINTENANCE']).optional(),
  base_rent: z.number().positive().max(1_000_000).optional(),
  monthly_maintenance: z.number().min(0).max(100_000).optional(),
}).refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const PATCH = api<{ id: string }>({ roles: ['ADMIN', 'MANAGER'] }, async ({ req, user, params }) => {
  const id = intParam(params.id);
  const input = await body(req, patchSchema);
  await assertUnitAccess(user, id);
  return withTransaction(user.id, async (c) => {
    if (input.occupancy_status) {
      const active = await c.query(`SELECT 1 FROM lease WHERE unit_id = $1 AND status = 'ACTIVE'`, [id]);
      if (active.rowCount) throw new HttpError(409, 'Unit has an active lease; terminate it before changing status.');
    }
    const r = await c.query(
      `UPDATE unit SET occupancy_status = coalesce($2, occupancy_status),
                       base_rent = coalesce($3, base_rent),
                       monthly_maintenance = coalesce($4, monthly_maintenance)
        WHERE unit_id = $1 RETURNING *`,
      [id, input.occupancy_status ?? null, input.base_rent ?? null, input.monthly_maintenance ?? null]);
    return r.rows[0];
  });
});
