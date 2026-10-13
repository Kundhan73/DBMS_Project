// Rebuilds the schema from scratch: teardown, then every DDL file in order.
//   npm run db:setup
// Uses the `pg` driver directly, so it works against a local server or a
// hosted one (Neon, Supabase, ...) with no psql client installed.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pool } from '../src/lib/db';

const FILES = ['99_teardown', '00_extensions', '01_schema', '02_indexes', '03_functions_triggers',
  '04_procedures', '05_views', '06_migration_v2', '07_comments'];

async function main() {
  const client = await pool.connect();
  try {
    for (const f of FILES) {
      process.stdout.write(`-> db/${f}.sql\n`);
      const sql = readFileSync(path.join(__dirname, '..', 'db', `${f}.sql`), 'utf8');
      await client.query(sql); // simple-query protocol: runs every statement in the file
    }
    console.log('schema ready');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(`\nSchema setup failed: ${e.message}`);
  if (/permission denied to create extension/.test(e.message))
    console.error('Create the extensions once as a superuser, or enable "vector" in your hosting dashboard.');
  process.exit(1);
});
