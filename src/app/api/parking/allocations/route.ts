import { z } from 'zod';
import { api, body } from '@/lib/api';
import { withTransaction } from '@/lib/db';
import { assertUnitAccess } from '@/lib/scope';

const schema = z.object({
  slot_id: z.number().int().positive(),
  unit_id: z.number().int().positive(),
  vehicle_id: z.number().int().positive(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monthly_charge: z.number().min(0).max(20_000),
});

// Slot/vehicle compatibility, same-complex and resident checks run in the
// parking_allocation trigger; double-booking is blocked by EXCLUDE constraints.
export const POST = api({ roles: ['ADMIN', 'MANAGER'] }, async ({ req, user }) => {
  const input = await body(req, schema);
  await assertUnitAccess(user, input.unit_id);
  return withTransaction(user.id, async (c) => {
    const r = await c.query(
      `INSERT INTO parking_allocation (slot_id, unit_id, vehicle_id, start_date, monthly_charge)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [input.slot_id, input.unit_id, input.vehicle_id, input.start_date, input.monthly_charge]);
    return r.rows[0];
  });
});
