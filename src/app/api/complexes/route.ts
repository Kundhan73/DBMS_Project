import { api } from '@/lib/api';
import { query } from '@/lib/db';

export const GET = api({}, async ({ user }) => {
  return query(
    `SELECT c.complex_id, c.name, c.address_line, c.locality, c.city, c.pincode, c.established_year, c.amenities,
            o.total_units, o.leased, o.owner_occupied, o.vacant, o.under_maintenance, o.occupancy_pct,
            (SELECT count(*)::int FROM block b WHERE b.complex_id = c.complex_id) AS blocks,
            (SELECT string_agg(au.full_name, ', ') FROM complex_manager cm JOIN app_user au ON au.user_id = cm.manager_user_id
              WHERE cm.complex_id = c.complex_id) AS managers
       FROM complex c
       JOIN v_user_complex_scope s ON s.complex_id = c.complex_id AND s.user_id = $1
       JOIN v_complex_occupancy o  ON o.complex_id = c.complex_id
      ORDER BY c.name`, [user.id]);
});
