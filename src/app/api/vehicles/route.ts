import { z } from 'zod';
import { api, body, isStaff, optInt } from '@/lib/api';
import { query, withTransaction } from '@/lib/db';
import { assertUnitAccess } from '@/lib/scope';

// Staff: vehicles belonging to a unit's residents (for the allocation form).
// Residents: their own vehicles.
export const GET = api({}, async ({ req, user }) => {
  const unitId = optInt(req.nextUrl.searchParams.get('unitId'));
  if (isStaff(user) && unitId) {
    await assertUnitAccess(user, unitId);
    return query(
      `SELECT v.*, au.full_name AS owner_name FROM vehicle v JOIN app_user au ON au.user_id = v.owner_user_id
        WHERE v.owner_user_id IN (
              SELECT t.user_id FROM lease l JOIN tenant_profile t USING (tenant_id)
               WHERE l.unit_id = $1 AND l.status IN ('ACTIVE','PENDING')
              UNION
              SELECT op.user_id FROM ownership o JOIN owner_profile op USING (owner_id)
               WHERE o.unit_id = $1 AND o.owned_until IS NULL)
        ORDER BY v.vehicle_type, v.registration_no`, [unitId]);
  }
  return query('SELECT * FROM vehicle WHERE owner_user_id = $1 ORDER BY vehicle_id', [user.id]);
});

const schema = z.object({
  registration_no: z.string().trim().toUpperCase().transform((s) => s.replace(/[\s-]/g, '')),
  vehicle_type: z.enum(['CAR', 'BIKE']),
  is_electric: z.boolean().default(false),
  make_model: z.string().trim().max(60).optional(),
});

export const POST = api({ roles: ['OWNER', 'TENANT'] }, async ({ req, user }) => {
  const input = await body(req, schema);
  return withTransaction(user.id, async (c) =>
    (await c.query(
      `INSERT INTO vehicle (owner_user_id, registration_no, vehicle_type, is_electric, make_model)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [user.id, input.registration_no, input.vehicle_type, input.is_electric, input.make_model ?? null])).rows[0]);
});
