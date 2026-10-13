import { api } from '@/lib/api';
import { query } from '@/lib/db';

export const GET = api({}, async ({ user }) => {
  const complexes = await query(
    `SELECT c.complex_id, c.name FROM complex c
      JOIN v_user_complex_scope s ON s.complex_id = c.complex_id AND s.user_id = $1
      ORDER BY c.name`, [user.id]);
  return { user, complexes };
});
