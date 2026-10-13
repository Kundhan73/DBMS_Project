import { api, HttpError, optInt } from '@/lib/api';
import { query } from '@/lib/db';
import { embedOne, toPgVector } from '@/lib/embeddings';
import { assertComplexVisible, unitAccess } from '@/lib/scope';

// Semantic search over maintenance requests.
//   mode=hybrid (default): keyword + vector ranks fused with RRF (fn_hybrid_search)
//   mode=vector          : cosine similarity only (pgvector HNSW index)
//   mode=text            : PostgreSQL full-text search only (GIN index)
export const GET = api({}, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').trim();
  if (q.length < 3) throw new HttpError(400, 'Search query must be at least 3 characters.');
  if (q.length > 300) throw new HttpError(400, 'Search query is too long.');
  const mode = (sp.get('mode') ?? 'hybrid') as 'hybrid' | 'vector' | 'text';
  const k = Math.min(30, Math.max(1, optInt(sp.get('k')) ?? 10));
  const complexId = optInt(sp.get('complexId'));
  if (complexId) await assertComplexVisible(user, complexId);

  const t0 = performance.now();
  let hits: { request_id: number; similarity: number | null; vector_rank: number | null; text_rank: number | null; score: number }[];
  if (mode === 'text') {
    hits = await query(
      `SELECT mr.request_id, NULL::float AS similarity, NULL::int AS vector_rank,
              row_number() OVER (ORDER BY ts_rank_cd(mr.search_tsv, q) DESC)::int AS text_rank,
              ts_rank_cd(mr.search_tsv, q)::float AS score
         FROM maintenance_request mr
         JOIN unit u USING (unit_id) JOIN block b USING (block_id),
              websearch_to_tsquery('english', $1) q
        WHERE mr.search_tsv @@ q AND ($2::int IS NULL OR b.complex_id = $2) AND ${unitAccess('mr.unit_id', 4)}
        ORDER BY score DESC LIMIT $3`, [q, complexId, k, user.id]);
  } else {
    const vec = toPgVector(await embedOne(q));
    if (mode === 'vector') {
      hits = await query(
        `SELECT e.request_id, round((1 - (e.embedding <=> $1::vector))::numeric, 4)::float AS similarity,
                row_number() OVER (ORDER BY e.embedding <=> $1::vector)::int AS vector_rank,
                NULL::int AS text_rank, round((1 - (e.embedding <=> $1::vector))::numeric, 4)::float AS score
           FROM request_embedding e
           JOIN maintenance_request mr USING (request_id)
           JOIN unit u USING (unit_id) JOIN block b USING (block_id)
          WHERE ($2::int IS NULL OR b.complex_id = $2) AND ${unitAccess('mr.unit_id', 4)}
          ORDER BY e.embedding <=> $1::vector LIMIT $3`, [vec, complexId, k, user.id]);
    } else {
      // over-fetch, then drop rows the user may not see
      hits = await query(
        `SELECT h.request_id, h.similarity::float, h.vector_rank, h.text_rank, h.rrf_score::float AS score
           FROM fn_hybrid_search($1, $2::vector, $3, $4 * 3) h
          WHERE EXISTS (SELECT 1 FROM maintenance_request mr WHERE mr.request_id = h.request_id AND ${unitAccess('mr.unit_id', 5)})
          ORDER BY h.rrf_score DESC LIMIT $4`, [q, vec, complexId, k, user.id]);
    }
  }
  const ms = Math.round(performance.now() - t0);

  const details = hits.length
    ? await query(
        `SELECT mr.request_id, mr.title, mr.description, mr.category, mr.priority, mr.status, mr.created_at,
                mr.actual_cost, mr.resolution_notes, v.name AS vendor_name, d.complex_name, d.block_name, d.unit_number
           FROM maintenance_request mr JOIN v_unit_directory d ON d.unit_id = mr.unit_id
           LEFT JOIN vendor v ON v.vendor_id = mr.vendor_id
          WHERE mr.request_id = ANY($1)`, [hits.map((h) => h.request_id)])
    : [];
  const byId = new Map(details.map((d) => [d.request_id, d]));
  return { query: q, mode, took_ms: ms, results: hits.map((h) => ({ ...h, ...byId.get(h.request_id) })) };
});
