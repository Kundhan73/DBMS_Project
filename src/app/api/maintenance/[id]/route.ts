import { z } from 'zod';
import { api, body, HttpError, intParam, isStaff } from '@/lib/api';
import { query, queryOne, withTransaction } from '@/lib/db';
import { EMBEDDING_MODEL, embedOne, requestText, textHash, toPgVector } from '@/lib/embeddings';
import { assertUnitAccess } from '@/lib/scope';

async function load(id: number) {
  const r = await queryOne(
    `SELECT mr.*, d.complex_id, d.complex_name, d.block_name, d.unit_number, au.full_name AS raised_by_name,
            au.phone AS raised_by_phone, v.name AS vendor_name, v.phone AS vendor_phone,
            (e.request_id IS NOT NULL) AS has_embedding
       FROM maintenance_request mr
       JOIN v_unit_directory d ON d.unit_id = mr.unit_id
       JOIN app_user au ON au.user_id = mr.raised_by
       LEFT JOIN vendor v ON v.vendor_id = mr.vendor_id
       LEFT JOIN request_embedding e ON e.request_id = mr.request_id
      WHERE mr.request_id = $1`, [id]);
  if (!r) throw new HttpError(404, 'Request not found');
  return r;
}

export const GET = api<{ id: string }>({}, async ({ user, params }) => {
  const id = intParam(params.id);
  const request = await load(id);
  await assertUnitAccess(user, request.unit_id);
  const [history, similar, vendors] = await Promise.all([
    query(`SELECT h.*, au.full_name AS changed_by_name FROM maintenance_status_history h
             LEFT JOIN app_user au ON au.user_id = h.changed_by WHERE h.request_id = $1 ORDER BY h.changed_at, h.history_id`, [id]),
    // "How were similar problems fixed before?" - nearest neighbours by stored vector
    isStaff(user) ? query('SELECT * FROM fn_similar_requests($1, 5)', [id]) : Promise.resolve([]),
    isStaff(user)
      ? query(`SELECT vp.vendor_id, vp.name, vp.service_category, vp.jobs, vp.avg_resident_rating, vp.avg_cost
                 FROM v_vendor_performance vp JOIN vendor v USING (vendor_id)
                WHERE v.is_active ORDER BY (vp.service_category = $1) DESC, vp.avg_resident_rating DESC NULLS LAST`, [request.category])
      : Promise.resolve([]),
  ]);
  return { request, history, similar, vendors };
});

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assign'), vendor_id: z.number().int().positive(), estimated_cost: z.number().min(0).max(1_000_000).optional() }),
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('resolve'), actual_cost: z.number().min(0).max(1_000_000), resolution_notes: z.string().trim().min(5).max(1000) }),
  z.object({ action: z.literal('reopen') }),
  z.object({ action: z.literal('unassign') }),
  z.object({ action: z.literal('close'), rating: z.number().int().min(1).max(5).optional() }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('edit'), title: z.string().trim().min(5).max(120), description: z.string().trim().min(15).max(2000) }),
]);

const STAFF_ACTIONS = new Set(['assign', 'start', 'resolve', 'reopen', 'unassign', 'cancel', 'close']);
const RESIDENT_ACTIONS = new Set(['cancel', 'close', 'reopen', 'edit']);

// Workflow transitions. Which transitions are legal is decided by the
// mr_before_write trigger; this layer only decides *who* may ask.
export const PATCH = api<{ id: string }>({}, async ({ req, user, params }) => {
  const id = intParam(params.id);
  const input = await body(req, schema);
  const cur = await load(id);
  await assertUnitAccess(user, cur.unit_id);
  const staff = isStaff(user);
  if (staff ? !STAFF_ACTIONS.has(input.action) : !RESIDENT_ACTIONS.has(input.action))
    throw new HttpError(403, `You cannot ${input.action} this request.`);
  if (!staff && cur.raised_by !== user.id) throw new HttpError(403, 'Only the person who raised the request can change it.');
  if (input.action === 'close' && !staff && input.rating == null) throw new HttpError(422, 'Please rate the work before closing.');
  if (input.action === 'edit' && cur.status !== 'OPEN') throw new HttpError(409, 'Only open requests can be edited.');
  if (!staff && input.action === 'cancel' && cur.status !== 'OPEN') throw new HttpError(409, 'Once assigned, only the office can cancel.');

  // re-embedding happens outside the transaction; the trigger drops the old vector on edit
  const newVector = input.action === 'edit' ? toPgVector(await embedOne(requestText(input.title, input.description))) : null;

  await withTransaction(user.id, async (c) => {
    switch (input.action) {
      case 'assign':
        await c.query(`UPDATE maintenance_request SET status = 'ASSIGNED', vendor_id = $2, estimated_cost = coalesce($3, estimated_cost),
                       assigned_at = now() WHERE request_id = $1`, [id, input.vendor_id, input.estimated_cost ?? null]);
        break;
      case 'start':
        await c.query(`UPDATE maintenance_request SET status = 'IN_PROGRESS' WHERE request_id = $1`, [id]); break;
      case 'resolve':
        await c.query(`UPDATE maintenance_request SET status = 'RESOLVED', actual_cost = $2, resolution_notes = $3 WHERE request_id = $1`,
          [id, input.actual_cost, input.resolution_notes]); break;
      case 'reopen':
        await c.query(`UPDATE maintenance_request SET status = 'IN_PROGRESS' WHERE request_id = $1`, [id]); break;
      case 'unassign':
        await c.query(`UPDATE maintenance_request SET status = 'OPEN' WHERE request_id = $1`, [id]); break;
      case 'close':
        await c.query(`UPDATE maintenance_request SET status = 'CLOSED', tenant_rating = coalesce($2, tenant_rating) WHERE request_id = $1`, [id, input.rating ?? null]); break;
      case 'cancel':
        await c.query(`UPDATE maintenance_request SET status = 'CANCELLED' WHERE request_id = $1`, [id]); break;
      case 'edit': {
        const text = requestText(input.title, input.description);
        await c.query(`UPDATE maintenance_request SET title = $2, description = $3 WHERE request_id = $1`, [id, input.title, input.description]);
        await c.query(`INSERT INTO request_embedding (request_id, model, source_hash, embedding) VALUES ($1,$2,$3,$4::vector)`,
          [id, EMBEDDING_MODEL, textHash(text), newVector]);
        break;
      }
    }
  });
  return load(id);
});
