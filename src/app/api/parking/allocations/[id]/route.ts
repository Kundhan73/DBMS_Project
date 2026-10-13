import { z } from 'zod';
import { api, body, HttpError, intParam } from '@/lib/api';
import { queryOne, withTransaction } from '@/lib/db';
import { assertUnitAccess } from '@/lib/scope';

async function load(id: number) {
  const a = await queryOne<{ unit_id: number }>('SELECT unit_id FROM parking_allocation WHERE allocation_id = $1', [id]);
  if (!a) throw new HttpError(404, 'Allocation not found');
  return a;
}

// Release a slot from a date (keeps history for billing)
export const PATCH = api<{ id: string }>({ roles: ['ADMIN', 'MANAGER'] }, async ({ req, user, params }) => {
  const id = intParam(params.id);
  const { end_date } = await body(req, z.object({ end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }));
  await assertUnitAccess(user, (await load(id)).unit_id);
  return withTransaction(user.id, async (c) =>
    (await c.query('UPDATE parking_allocation SET end_date = $2 WHERE allocation_id = $1 RETURNING *', [id, end_date])).rows[0]);
});

// Delete an allocation entered by mistake. If it has already been billed the
// invoice foreign key (ON DELETE RESTRICT) blocks this and the API returns 409.
export const DELETE = api<{ id: string }>({ roles: ['ADMIN', 'MANAGER'] }, async ({ user, params }) => {
  const id = intParam(params.id);
  await assertUnitAccess(user, (await load(id)).unit_id);
  return withTransaction(user.id, async (c) => {
    await c.query('DELETE FROM parking_allocation WHERE allocation_id = $1', [id]);
    return { deleted: id };
  });
});
