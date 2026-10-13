import { api, HttpError, isStaff, optInt } from '@/lib/api';
import { query } from '@/lib/db';
import { assertComplexVisible, visibleComplexIds } from '@/lib/scope';

// Staff: slot map for a complex with current allocations and utilisation.
// Residents: their own vehicles and allocations.
export const GET = api({}, async ({ req, user }) => {
  if (!isStaff(user)) {
    const [vehicles, allocations] = await Promise.all([
      query(`SELECT v.*, (SELECT count(*)::int FROM parking_allocation pa WHERE pa.vehicle_id = v.vehicle_id
                           AND (pa.end_date IS NULL OR pa.end_date > current_date)) AS active_allocations
               FROM vehicle v WHERE v.owner_user_id = $1 ORDER BY v.vehicle_id`, [user.id]),
      query(`SELECT pa.allocation_id, ps.slot_code, ps.level, ps.slot_type, c.name AS complex_name,
                    d.block_name, d.unit_number, v.registration_no, pa.start_date, pa.end_date, pa.monthly_charge
               FROM parking_allocation pa JOIN parking_slot ps USING (slot_id) JOIN complex c USING (complex_id)
               JOIN vehicle v USING (vehicle_id) JOIN v_unit_directory d ON d.unit_id = pa.unit_id
              WHERE v.owner_user_id = $1 ORDER BY pa.start_date DESC`, [user.id]),
    ]);
    return { scope: 'resident', vehicles, allocations };
  }
  const complexId = optInt(req.nextUrl.searchParams.get('complexId')) ?? (await visibleComplexIds(user))[0];
  if (!complexId) throw new HttpError(404, 'No complex available');
  await assertComplexVisible(user, complexId);
  const [slots, summary] = await Promise.all([
    query(`SELECT ps.slot_id, ps.slot_code, ps.level, ps.slot_type, ps.is_covered,
                  cur.allocation_id, cur.registration_no, cur.make_model, cur.is_electric, cur.unit_id,
                  cur.block_name, cur.unit_number, cur.holder, cur.start_date, cur.monthly_charge
             FROM parking_slot ps
             LEFT JOIN LATERAL (
                SELECT pa.allocation_id, v.registration_no, v.make_model, v.is_electric, pa.unit_id,
                       d.block_name, d.unit_number, au.full_name AS holder, pa.start_date, pa.monthly_charge
                  FROM parking_allocation pa
                  JOIN vehicle v          USING (vehicle_id)
                  JOIN app_user au        ON au.user_id = v.owner_user_id
                  JOIN v_unit_directory d ON d.unit_id = pa.unit_id
                 WHERE pa.slot_id = ps.slot_id AND pa.start_date <= current_date
                   AND (pa.end_date IS NULL OR pa.end_date > current_date)) cur ON true
            WHERE ps.complex_id = $1
            ORDER BY ps.slot_type, ps.slot_code`, [complexId]),
    query(`SELECT ps.slot_type, count(*)::int AS total,
                  count(pa.allocation_id)::int AS occupied,
                  round(100.0 * count(pa.allocation_id) / count(*), 1)::float AS utilisation_pct,
                  coalesce(sum(pa.monthly_charge), 0)::float AS monthly_revenue
             FROM parking_slot ps
             LEFT JOIN parking_allocation pa ON pa.slot_id = ps.slot_id
                   AND pa.start_date <= current_date AND (pa.end_date IS NULL OR pa.end_date > current_date)
            WHERE ps.complex_id = $1 GROUP BY ps.slot_type ORDER BY ps.slot_type`, [complexId]),
  ]);
  return { scope: 'staff', complexId, slots, summary };
});
