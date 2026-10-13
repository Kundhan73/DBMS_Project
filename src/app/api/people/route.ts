import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { api, body, optInt, Where } from '@/lib/api';
import { query, withTransaction } from '@/lib/db';

// Owners and tenants directory (staff only). Managers see people connected to
// their complexes plus people not yet linked to any unit.
export const GET = api({ roles: ['ADMIN', 'MANAGER'] }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const role = sp.get('role') === 'TENANT' ? 'TENANT' : 'OWNER';
  const w = new Where([user.id, role]).raw('au.role = $2');
  const q = sp.get('q')?.trim();
  if (q) {
    // trigram similarity catches typos ("sharmaa"); ILIKE catches prefixes and emails
    w.add((p) => `(au.full_name % ${p} OR au.full_name ILIKE '%' || ${p} || '%' OR au.email ILIKE '%' || ${p} || '%' OR au.phone LIKE ${p} || '%')`, q);
  }
  if (sp.get('active') === '1') w.raw('au.is_active');
  const page = Math.max(1, optInt(sp.get('page')) ?? 1);

  const rows = await query(
    `WITH linked AS (
        SELECT op.user_id, b.complex_id, count(DISTINCT o.unit_id) AS units
          FROM ownership o JOIN owner_profile op USING (owner_id) JOIN unit u USING (unit_id) JOIN block b USING (block_id)
         WHERE o.owned_until IS NULL GROUP BY op.user_id, b.complex_id
        UNION ALL
        SELECT t.user_id, b.complex_id, count(DISTINCT l.unit_id)
          FROM lease l JOIN tenant_profile t USING (tenant_id) JOIN unit u USING (unit_id) JOIN block b USING (block_id)
         WHERE l.status IN ('ACTIVE','PENDING') GROUP BY t.user_id, b.complex_id)
     SELECT au.user_id, au.full_name, au.email, au.phone, au.role, au.is_active, au.created_at, au.last_login_at,
            tp.occupation, tp.employer, tp.family_size, op.is_nri,
            coalesce(sum(lk.units), 0)::int AS current_units,
            string_agg(DISTINCT c.name, ', ') AS complexes,
            count(*) OVER ()::int AS total_count
       FROM app_user au
       LEFT JOIN tenant_profile tp ON tp.user_id = au.user_id
       LEFT JOIN owner_profile op  ON op.user_id = au.user_id
       LEFT JOIN linked lk ON lk.user_id = au.user_id
       LEFT JOIN complex c ON c.complex_id = lk.complex_id
      WHERE ${w}
        AND (lk.complex_id IS NULL OR lk.complex_id IN (SELECT complex_id FROM v_user_complex_scope WHERE user_id = $1))
      GROUP BY au.user_id, tp.tenant_id, op.owner_id
      ORDER BY ${q ? `similarity(au.full_name, $3) DESC,` : ''} au.full_name
      LIMIT 25 OFFSET ${(page - 1) * 25}`, w.args);
  return { rows, total: rows[0]?.total_count ?? 0, page, pageSize: 25 };
});

const phone = z.string().regex(/^[6-9][0-9]{9}$/, '10-digit Indian mobile number');
const createSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('OWNER'),
    full_name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(120),
    phone,
    password: z.string().min(8).max(100),
    mailing_address: z.string().trim().min(5).max(200),
    is_nri: z.boolean().default(false),
  }),
  z.object({
    role: z.literal('TENANT'),
    full_name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(120),
    phone,
    password: z.string().min(8).max(100),
    occupation: z.string().trim().max(80).optional(),
    employer: z.string().trim().max(100).optional(),
    family_size: z.number().int().min(1).max(15).default(1),
    emergency_contact_name: z.string().trim().min(2).max(100),
    emergency_contact_phone: phone,
  }),
]);

// Creates the login and the role profile atomically: if the profile insert
// fails, the user row is rolled back too.
export const POST = api({ roles: ['ADMIN', 'MANAGER'] }, async ({ req, user }) => {
  const input = await body(req, createSchema);
  const hash = await bcrypt.hash(input.password, 10);
  return withTransaction(user.id, async (c) => {
    const u = (await c.query(
      `INSERT INTO app_user (email, password_hash, full_name, phone, role) VALUES ($1,$2,$3,$4,$5)
       RETURNING user_id, email, full_name, role`, [input.email, hash, input.full_name, input.phone, input.role])).rows[0];
    if (input.role === 'OWNER') {
      await c.query(`INSERT INTO owner_profile (user_id, mailing_address, is_nri) VALUES ($1,$2,$3)`,
        [u.user_id, input.mailing_address, input.is_nri]);
    } else {
      await c.query(
        `INSERT INTO tenant_profile (user_id, occupation, employer, family_size, emergency_contact_name, emergency_contact_phone)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [u.user_id, input.occupation ?? null, input.employer ?? null, input.family_size, input.emergency_contact_name, input.emergency_contact_phone]);
    }
    return u;
  });
});
