import { api, HttpError, intParam } from '@/lib/api';
import { withTransaction } from '@/lib/db';

// A resident removes a vehicle they sold. Blocked (409) while the vehicle
// still has a parking allocation, because of ON DELETE RESTRICT.
export const DELETE = api<{ id: string }>({ roles: ['OWNER', 'TENANT'] }, async ({ user, params }) => {
  const id = intParam(params.id);
  return withTransaction(user.id, async (c) => {
    const r = await c.query('DELETE FROM vehicle WHERE vehicle_id = $1 AND owner_user_id = $2 RETURNING vehicle_id', [id, user.id]);
    if (!r.rowCount) throw new HttpError(404, 'Vehicle not found');
    return { deleted: id };
  });
});
