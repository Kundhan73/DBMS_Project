import { z } from 'zod';
import { api, body, optInt, Where } from '@/lib/api';
import { CATEGORIES } from '@/lib/constants';
import { query, withTransaction } from '@/lib/db';
import { EMBEDDING_MODEL, embedOne, requestText, textHash, toPgVector } from '@/lib/embeddings';
import { assertUnitAccess, unitAccess } from '@/lib/scope';


export const GET = api({}, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const w = new Where([user.id]).raw(unitAccess('mr.unit_id', 1));
  if (sp.get('status') === 'ACTIVE') w.raw(`mr.status IN ('OPEN','ASSIGNED','IN_PROGRESS')`);
  else if (sp.get('status')) w.add((p) => `mr.status = ${p}`, sp.get('status'));
  if (sp.get('category')) w.add((p) => `mr.category = ${p}`, sp.get('category'));
  if (sp.get('priority')) w.add((p) => `mr.priority = ${p}`, sp.get('priority'));
  const complexId = optInt(sp.get('complexId'));
  if (complexId) w.add((p) => `d.complex_id = ${p}`, complexId);
  if (sp.get('mine') === '1') w.raw('mr.raised_by = $1');
  const page = Math.max(1, optInt(sp.get('page')) ?? 1);

  const rows = await query(
    `SELECT mr.request_id, mr.title, mr.category, mr.priority, mr.status, mr.created_at, mr.resolved_at,
            mr.estimated_cost, mr.actual_cost, mr.is_common_area,
            d.complex_name, d.block_name, d.unit_number, au.full_name AS raised_by_name, v.name AS vendor_name,
            round(extract(epoch FROM (coalesce(mr.resolved_at, now()) - mr.created_at)) / 3600.0)::int AS age_hours,
            count(*) OVER ()::int AS total_count
       FROM maintenance_request mr
       JOIN v_unit_directory d ON d.unit_id = mr.unit_id
       JOIN app_user au        ON au.user_id = mr.raised_by
       LEFT JOIN vendor v      ON v.vendor_id = mr.vendor_id
      WHERE ${w}
      ORDER BY CASE WHEN mr.status IN ('OPEN','ASSIGNED','IN_PROGRESS') THEN 0 ELSE 1 END,
               CASE mr.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
               mr.created_at DESC
      LIMIT 25 OFFSET ${(page - 1) * 25}`, w.args);
  return { rows, total: rows[0]?.total_count ?? 0, page, pageSize: 25 };
});

const createSchema = z.object({
  unit_id: z.number().int().positive(),
  category: z.enum(CATEGORIES),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(15).max(2000),
});

// New request: the SQL row and its embedding are written in ONE transaction,
// so a request never exists without its vector (and vice versa). The
// response includes the most similar existing requests in the same complex
// so the resident / manager can spot duplicates.
export const POST = api({}, async ({ req, user }) => {
  const input = await body(req, createSchema);
  await assertUnitAccess(user, input.unit_id);
  const text = requestText(input.title, input.description);
  const vector = toPgVector(await embedOne(text)); // computed before the transaction to keep it short

  const created = await withTransaction(user.id, async (c) => {
    const r = await c.query(
      `INSERT INTO maintenance_request (unit_id, raised_by, category, title, description, priority, is_common_area)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [input.unit_id, user.id, input.category, input.title, input.description, input.priority,
       ['LIFT', 'SECURITY', 'CLEANING'].includes(input.category)]);
    await c.query(
      `INSERT INTO request_embedding (request_id, model, source_hash, embedding) VALUES ($1,$2,$3,$4::vector)`,
      [r.rows[0].request_id, EMBEDDING_MODEL, textHash(text), vector]);
    return r.rows[0];
  });

  const possibleDuplicates = await query(
    `SELECT mr.request_id, mr.title, mr.status, d.block_name, d.unit_number,
            round((1 - (e.embedding <=> $2::vector))::numeric, 3)::float AS similarity
       FROM request_embedding e
       JOIN maintenance_request mr ON mr.request_id = e.request_id
       JOIN v_unit_directory d     ON d.unit_id = mr.unit_id
      WHERE mr.request_id <> $1
        AND mr.status IN ('OPEN','ASSIGNED','IN_PROGRESS')
        AND d.complex_id = (SELECT complex_id FROM v_unit_directory WHERE unit_id = $3)
        AND 1 - (e.embedding <=> $2::vector) > 0.6
      ORDER BY e.embedding <=> $2::vector LIMIT 3`, [created.request_id, vector, input.unit_id]);
  return { request: created, possibleDuplicates };
});
