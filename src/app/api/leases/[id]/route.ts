import { api, HttpError, intParam } from '@/lib/api';
import { query, queryOne } from '@/lib/db';
import { assertUnitAccess } from '@/lib/scope';

export const GET = api<{ id: string }>({}, async ({ user, params }) => {
  const id = intParam(params.id);
  const lease = await queryOne(
    `SELECT l.*, au.full_name AS tenant_name, au.email AS tenant_email, au.phone AS tenant_phone, t.user_id AS tenant_user_id,
            d.complex_name, d.block_name, d.unit_number, d.owner_names
       FROM lease l JOIN tenant_profile t USING (tenant_id) JOIN app_user au ON au.user_id = t.user_id
       JOIN v_unit_directory d ON d.unit_id = l.unit_id
      WHERE l.lease_id = $1`, [id]);
  if (!lease) throw new HttpError(404, 'Lease not found');
  // the tenant on the lease, staff for that complex, or the flat's current owner
  if (lease.tenant_user_id !== user.id) {
    if (user.role === 'TENANT') throw new HttpError(403, 'No access to this lease');
    await assertUnitAccess(user, lease.unit_id);
  }
  const invoices = await query(
    `SELECT invoice_id, billing_month, amount, amount_paid, status, due_date, notes
       FROM invoice WHERE lease_id = $1 ORDER BY billing_month DESC`, [id]);
  return { lease, invoices };
});
