// Embeds every maintenance request whose vector is missing or stale.
//   npm run db:embed
import { pool } from '../src/lib/db';
import { EMBEDDING_MODEL, embed, requestText, textHash, toPgVector } from '../src/lib/embeddings';

export async function embedMissing(log: (m: string) => void = () => {}): Promise<number> {
  const rows = (await pool.query(
    `SELECT mr.request_id, mr.title, mr.description
       FROM maintenance_request mr
       LEFT JOIN request_embedding e USING (request_id)
      WHERE e.request_id IS NULL
         OR e.source_hash <> md5(mr.title || '. ' || mr.description)
         OR e.model <> $1
      ORDER BY mr.request_id`, [EMBEDDING_MODEL])).rows;
  const BATCH = 32;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const texts = batch.map((r) => requestText(r.title, r.description));
    const vecs = await embed(texts);
    for (let j = 0; j < batch.length; j++) {
      await pool.query(
        `INSERT INTO request_embedding (request_id, model, source_hash, embedding)
         VALUES ($1,$2,$3,$4::vector)
         ON CONFLICT (request_id) DO UPDATE
           SET model = EXCLUDED.model, source_hash = EXCLUDED.source_hash,
               embedding = EXCLUDED.embedding, embedded_at = now()`,
        [batch[j].request_id, EMBEDDING_MODEL, textHash(texts[j]), toPgVector(vecs[j])]);
    }
    log(`  embedded ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  return rows.length;
}

// Run directly: tsx scripts/embed.ts
if (process.argv[1]?.endsWith('embed.ts')) {
  embedMissing(console.log)
    .then((n) => { console.log(`embedded ${n} requests`); return pool.end(); })
    .catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
}
