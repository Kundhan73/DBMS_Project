import { z } from 'zod';
import { api, body, HttpError, intParam } from '@/lib/api';
import { queryOne, withTransaction } from '@/lib/db';
import { assertUnitAccess } from '@/lib/scope';

const schema = z.object({
  terminated_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(5).max(300),
});

// Early termination runs the sp_terminate_lease stored procedure inside one
// transaction: lease closed, future rent voided, parking released, unit freed.
export const POST = api<{ id: string }>({ roles: ['ADMIN', 'MANAGER'] }, async ({ req, user, params }) => {
  const id = intParam(params.id);
  const input = await body(req, schema);
  const lease = await queryOne<{ unit_id: number }>('SELECT unit_id FROM lease WHERE lease_id = $1', [id]);
  if (!lease) throw new HttpError(404, 'Lease not found');
  await assertUnitAccess(user, lease.unit_id);
  return withTransaction(user.id, async (c) => {
    await c.query('CALL sp_terminate_lease($1, $2, $3)', [id, input.terminated_on, input.reason]);
    const voided = await c.query(
      `SELECT count(*)::int AS n FROM invoice WHERE lease_id = $1 AND status = 'VOID'`, [id]);
    const l = await c.query('SELECT * FROM lease WHERE lease_id = $1', [id]);
    return { lease: l.rows[0], voidedInvoices: voided.rows[0].n };
  });
});
