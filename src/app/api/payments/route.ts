import { z } from 'zod';
import { api, body, HttpError, isStaff, optInt, Where } from '@/lib/api';
import { query, withTransaction } from '@/lib/db';

export const GET = api({}, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const w = new Where([user.id]);
  if (isStaff(user)) w.raw('ib.complex_id IN (SELECT complex_id FROM v_user_complex_scope WHERE user_id = $1)');
  else w.raw('ib.billed_to = $1');
  const invoiceId = optInt(sp.get('invoiceId'));
  if (invoiceId) w.add((p) => `p.invoice_id = ${p}`, invoiceId);
  return query(
    `SELECT p.payment_id, p.invoice_id, p.amount, p.paid_at, p.method, p.reference_no,
            ib.invoice_type, ib.billing_month, ib.billed_to_name, ib.complex_name, ib.block_name, ib.unit_number,
            rb.full_name AS recorded_by_name
       FROM payment p
       JOIN v_invoice_balance ib ON ib.invoice_id = p.invoice_id
       LEFT JOIN app_user rb     ON rb.user_id = p.recorded_by
      WHERE ${w}
      ORDER BY p.paid_at DESC LIMIT 50`, w.args);
});

const schema = z.object({
  invoice_id: z.number().int().positive(),
  amount: z.number().positive().max(10_000_000),
  method: z.enum(['UPI', 'CARD', 'BANK_TRANSFER', 'CASH', 'CHEQUE']),
  reference_no: z.string().trim().min(4).max(40).optional(),
});

// Residents pay their own invoices online (UPI/card/bank transfer, simulated);
// staff record cash and cheque payments for invoices in their complexes.
// Overpayment and payments on void invoices are rejected by a trigger that
// row-locks the invoice, so two concurrent payments cannot both succeed.
export const POST = api({}, async ({ req, user }) => {
  const input = await body(req, schema);
  return withTransaction(user.id, async (c) => {
    const inv = (await c.query(
      `SELECT i.billed_to, b.complex_id FROM invoice i JOIN unit u USING (unit_id) JOIN block b USING (block_id)
        WHERE i.invoice_id = $1`, [input.invoice_id])).rows[0];
    if (!inv) throw new HttpError(404, 'Invoice not found');
    if (isStaff(user)) {
      const ok = await c.query('SELECT 1 FROM v_user_complex_scope WHERE user_id = $1 AND complex_id = $2', [user.id, inv.complex_id]);
      if (!ok.rowCount) throw new HttpError(403, 'Invoice is outside your complexes.');
    } else {
      if (inv.billed_to !== user.id) throw new HttpError(403, 'You can only pay your own invoices.');
      if (input.method === 'CASH' || input.method === 'CHEQUE') throw new HttpError(422, 'Cash and cheque payments are recorded by the office.');
    }
    const id = (await c.query('SELECT fn_record_payment($1, $2, $3, $4) AS id',
      [input.invoice_id, input.amount, input.method, input.reference_no ?? null])).rows[0].id;
    const after = (await c.query(
      `SELECT p.*, i.status AS invoice_status, i.amount - i.amount_paid AS invoice_balance
         FROM payment p JOIN invoice i USING (invoice_id) WHERE p.payment_id = $1`, [id])).rows[0];
    return after;
  });
});
