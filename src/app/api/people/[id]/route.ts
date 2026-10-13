import { z } from 'zod';
import { api, body, HttpError, intParam } from '@/lib/api';
import { withTransaction } from '@/lib/db';

const schema = z.object({
  is_active: z.boolean().optional(),
  phone: z.string().regex(/^[6-9][0-9]{9}$/).optional(),
  full_name: z.string().trim().min(2).max(100).optional(),
}).refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const PATCH = api<{ id: string }>({ roles: ['ADMIN'] }, async ({ req, user, params }) => {
  const id = intParam(params.id);
  const input = await body(req, schema);
  if (id === user.id && input.is_active === false) throw new HttpError(400, 'You cannot deactivate your own account.');
  return withTransaction(user.id, async (c) => {
    const r = await c.query(
      `UPDATE app_user SET is_active = coalesce($2, is_active), phone = coalesce($3, phone), full_name = coalesce($4, full_name)
        WHERE user_id = $1 RETURNING user_id, full_name, email, phone, role, is_active`,
      [id, input.is_active ?? null, input.phone ?? null, input.full_name ?? null]);
    if (!r.rowCount) throw new HttpError(404, 'User not found');
    return r.rows[0];
  });
});
