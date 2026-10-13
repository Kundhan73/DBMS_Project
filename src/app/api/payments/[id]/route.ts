import { api, HttpError, intParam } from '@/lib/api';
import { withTransaction } from '@/lib/db';

// Reversal of a wrongly recorded payment (admin only). The payment trigger
// recomputes the invoice balance and status; the audit trigger logs the delete.
export const DELETE = api<{ id: string }>({ roles: ['ADMIN'] }, async ({ user, params }) => {
  const id = intParam(params.id);
  return withTransaction(user.id, async (c) => {
    const r = await c.query('DELETE FROM payment WHERE payment_id = $1 RETURNING invoice_id, amount', [id]);
    if (!r.rowCount) throw new HttpError(404, 'Payment not found');
    const inv = await c.query('SELECT invoice_id, status, amount_paid FROM invoice WHERE invoice_id = $1', [r.rows[0].invoice_id]);
    return { deleted: r.rows[0], invoice: inv.rows[0] };
  });
});
