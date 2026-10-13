// Vector side: storage, similarity search and hybrid search quality.
import { afterAll, describe, expect, it } from 'vitest';
import { embedOne, toPgVector } from '@/lib/embeddings';
import { expectPgError, inTx, pool } from './helpers';

afterAll(() => pool.end());

const topCategories = async (q: string, k = 5) => {
  const v = toPgVector(await embedOne(q));
  const r = await pool.query(
    `SELECT mr.category, 1 - (e.embedding <=> $1::vector) AS sim
       FROM request_embedding e JOIN maintenance_request mr USING (request_id)
      ORDER BY e.embedding <=> $1::vector LIMIT $2`, [v, k]);
  return r.rows;
};

describe('Embeddings storage', () => {
  it('every maintenance request has an up-to-date embedding', async () => {
    const r = await pool.query(`SELECT count(*)::int AS missing FROM maintenance_request mr
                                  LEFT JOIN request_embedding e USING (request_id)
                                 WHERE e.request_id IS NULL OR e.source_hash <> md5(mr.title || '. ' || mr.description)`);
    expect(r.rows[0].missing).toBe(0);
  });

  it('vectors are 384-dimensional and unit length (normalised for cosine)', async () => {
    const r = await pool.query(`SELECT vector_dims(embedding) AS d, round(vector_norm(embedding)::numeric, 3) AS n FROM request_embedding LIMIT 20`);
    for (const row of r.rows) { expect(row.d).toBe(384); expect(Number(row.n)).toBeCloseTo(1, 2); }
  });

  it('rejects a vector with the wrong dimension', () => inTx(async (c) => {
    await c.query('DELETE FROM request_embedding WHERE request_id = 1');
    await expectPgError(c, `INSERT INTO request_embedding (request_id, model, source_hash, embedding) VALUES (1,'x',repeat('0',32),'[1,2,3]')`, [], '22000');
  }));

  it('query plan uses the HNSW index for nearest-neighbour search', async () => {
    const v = toPgVector(await embedOne('lift stuck'));
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL enable_seqscan = off'); // tiny table: force the planner to show the index path
      const plan = (await c.query(`EXPLAIN SELECT request_id FROM request_embedding ORDER BY embedding <=> $1::vector LIMIT 5`, [v])).rows.map((r) => r['QUERY PLAN']).join('\n');
      await c.query('ROLLBACK');
      expect(plan).toMatch(/idx_request_embedding_hnsw/);
    } finally { c.release(); }
  });
});

describe('Semantic search finds paraphrases that share no keywords', () => {
  it('"lift is not moving" -> LIFT requests', async () => {
    const top = await topCategories('lift is not moving');
    expect(top[0].category).toBe('LIFT');
    expect(top.filter((r) => r.category === 'LIFT').length).toBeGreaterThanOrEqual(3);
  });

  it('"insects in the kitchen" -> PEST_CONTROL requests (no shared words with "cockroaches")', async () => {
    const top = await topCategories('insects in the kitchen');
    expect(top[0].category).toBe('PEST_CONTROL');
  });

  it('"electricity keeps going off" -> ELECTRICAL requests', async () => {
    const top = await topCategories('electricity keeps going off');
    expect(top.slice(0, 3).every((r) => r.category === 'ELECTRICAL')).toBe(true);
  });

  it('"cupboard door came off" -> CARPENTRY requests', async () => {
    const top = await topCategories('cupboard door came off');
    expect(top[0].category).toBe('CARPENTRY');
  });

  it('keyword search alone misses "water dripping from the roof"; vector search finds leak requests', async () => {
    const kw = await pool.query(`SELECT count(*)::int AS n FROM maintenance_request WHERE search_tsv @@ websearch_to_tsquery('english', 'water dripping from the roof')`);
    expect(kw.rows[0].n).toBe(0);
    const top = await topCategories('water dripping from the roof');
    expect(top.every((r) => r.category === 'PLUMBING')).toBe(true);
  });
});

describe('Hybrid search and similar-request lookup', () => {
  it('fn_hybrid_search fuses keyword and vector ranks', async () => {
    const q = 'MCB tripping when geyser switched on';
    const v = toPgVector(await embedOne(q));
    const r = await pool.query(`SELECT h.*, mr.category FROM fn_hybrid_search($1, $2::vector, NULL, 5) h JOIN maintenance_request mr USING (request_id)`, [q, v]);
    expect(r.rows.length).toBe(5);
    expect(r.rows[0].category).toBe('ELECTRICAL');
    expect(r.rows[0].vector_rank).not.toBeNull();
    expect(r.rows[0].text_rank).not.toBeNull(); // top hit matched on both signals
    const scores = r.rows.map((x) => Number(x.rrf_score));
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('fn_hybrid_search respects the complex filter', async () => {
    const q = 'lift stuck';
    const v = toPgVector(await embedOne(q));
    const r = await pool.query(
      `SELECT DISTINCT b.complex_id FROM fn_hybrid_search($1, $2::vector, 2, 10) h
         JOIN maintenance_request mr USING (request_id) JOIN unit u USING (unit_id) JOIN block b USING (block_id)`, [q, v]);
    expect(r.rows.map((x) => x.complex_id)).toEqual([2]);
  });

  it('fn_similar_requests returns neighbours in descending similarity, excluding itself', async () => {
    const id = (await pool.query(`SELECT request_id FROM maintenance_request WHERE category = 'LIFT' LIMIT 1`)).rows[0].request_id;
    const r = await pool.query(`SELECT * FROM fn_similar_requests($1, 5)`, [id]);
    expect(r.rows.length).toBe(5);
    expect(r.rows.some((x) => String(x.request_id) === String(id))).toBe(false);
    const sims = r.rows.map((x) => Number(x.similarity));
    expect([...sims].sort((a, b) => b - a)).toEqual(sims);
    expect(r.rows[0].category).toBe('LIFT');
  });
});
