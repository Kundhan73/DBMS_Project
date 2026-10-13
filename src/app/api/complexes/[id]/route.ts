import { api, HttpError, intParam, isStaff } from '@/lib/api';
import { query, queryOne } from '@/lib/db';
import { assertComplexVisible } from '@/lib/scope';

export const GET = api<{ id: string }>({}, async ({ user, params }) => {
  const id = intParam(params.id);
  if (!isStaff(user)) throw new HttpError(403, 'Only staff can view the full complex layout.');
  await assertComplexVisible(user, id);
  const complex = await queryOne(
    `SELECT c.*, o.total_units, o.leased, o.owner_occupied, o.vacant, o.under_maintenance, o.occupancy_pct
       FROM complex c JOIN v_complex_occupancy o USING (complex_id) WHERE c.complex_id = $1`, [id]);
  if (!complex) throw new HttpError(404, 'Complex not found');
  const units = await query(
    `SELECT unit_id, block_name, unit_number, floor_no, unit_type, occupancy_status, owner_names, tenant_name, lease_end
       FROM v_unit_directory WHERE complex_id = $1 ORDER BY block_name, floor_no DESC, unit_number`, [id]);
  return { complex, units };
});
