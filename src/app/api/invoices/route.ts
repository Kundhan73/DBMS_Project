import { api, isStaff, optInt, Where } from '@/lib/api';
import { query, queryOne } from '@/lib/db';

// Staff see invoices for their complexes; owners and tenants see only
// invoices billed to them.
export const GET = api({}, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const w = new Where([user.id]);
  if (isStaff(user)) w.raw('ib.complex_id IN (SELECT complex_id FROM v_user_complex_scope WHERE user_id = $1)');
  else w.raw('ib.billed_to = $1');
  const complexId = optInt(sp.get('complexId'));
  if (complexId) w.add((p) => `ib.complex_id = ${p}`, complexId);
  if (sp.get('status') === 'OPEN') w.raw(`ib.status IN ('UNPAID','PARTIAL')`);
  else if (sp.get('status')) w.add((p) => `ib.status = ${p}`, sp.get('status'));
  if (sp.get('type')) w.add((p) => `ib.invoice_type = ${p}`, sp.get('type'));
  if (sp.get('month')) w.add((p) => `ib.billing_month = (${p} || '-01')::date`, sp.get('month'));
  if (sp.get('overdue') === '1') w.raw('ib.days_overdue > 0');
  if (sp.get('q')) w.add((p) => `(ib.billed_to_name ILIKE ${p} OR ib.unit_number ILIKE ${p} OR ib.invoice_id::text = btrim(${p}, '%'))`, `%${sp.get('q')}%`);
  const page = Math.max(1, optInt(sp.get('page')) ?? 1);

  const [rows, totals] = await Promise.all([
    query(`SELECT ib.*, count(*) OVER ()::int AS total_count FROM v_invoice_balance ib
            WHERE ${w} ORDER BY ib.billing_month DESC, ib.days_overdue DESC, ib.invoice_id DESC
            LIMIT 25 OFFSET ${(page - 1) * 25}`, w.args),
    queryOne(`SELECT coalesce(sum(amount), 0)::float AS billed, coalesce(sum(amount_paid), 0)::float AS paid,
                     coalesce(sum(balance) FILTER (WHERE status IN ('UNPAID','PARTIAL')), 0)::float AS outstanding,
                     count(*) FILTER (WHERE days_overdue > 0)::int AS overdue
                FROM v_invoice_balance ib WHERE ${w} AND ib.status <> 'VOID'`, w.args),
  ]);
  return { rows, totals, total: rows[0]?.total_count ?? 0, page, pageSize: 25 };
});
