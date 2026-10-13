import { api, isStaff, optInt } from '@/lib/api';
import { query, queryOne } from '@/lib/db';
import { assertComplexVisible, visibleComplexIds } from '@/lib/scope';

export const GET = api({}, async ({ req, user }) => {
  if (!isStaff(user)) return residentDashboard(user.id);

  const complexId = optInt(req.nextUrl.searchParams.get('complexId'));
  if (complexId) await assertComplexVisible(user, complexId);
  const ids = complexId ? [complexId] : await visibleComplexIds(user);

  const [kpis, occupancy, collections, byCategory, overdue, sla, leaseExpiring] = await Promise.all([
    query(`SELECT * FROM mv_complex_kpis WHERE complex_id = ANY($1) ORDER BY complex_name`, [ids]),
    query(`SELECT * FROM v_complex_occupancy WHERE complex_id = ANY($1) ORDER BY complex_name`, [ids]),
    query(`SELECT to_char(billing_month, 'Mon YY') AS month, billing_month,
                  sum(billed)::float AS billed, sum(collected)::float AS collected,
                  round(100.0 * sum(collected) / nullif(sum(billed), 0), 1)::float AS collection_pct
             FROM v_monthly_collections
            WHERE complex_id = ANY($1)
              AND billing_month >= date_trunc('month', current_date) - interval '11 months'
            GROUP BY billing_month ORDER BY billing_month`, [ids]),
    query(`SELECT mr.category,
                  count(*) FILTER (WHERE mr.status IN ('OPEN','ASSIGNED','IN_PROGRESS'))::int AS open,
                  count(*) FILTER (WHERE mr.status IN ('RESOLVED','CLOSED'))::int         AS resolved
             FROM maintenance_request mr JOIN unit u USING (unit_id) JOIN block b USING (block_id)
            WHERE b.complex_id = ANY($1) AND mr.created_at >= now() - interval '90 days'
            GROUP BY mr.category ORDER BY count(*) DESC`, [ids]),
    query(`SELECT invoice_id, invoice_type, billing_month, balance, days_overdue,
                  billed_to_name, complex_name, block_name, unit_number
             FROM v_invoice_balance
            WHERE complex_id = ANY($1) AND days_overdue > 0
            ORDER BY days_overdue * balance DESC LIMIT 8`, [ids]),
    query(`SELECT category, sum(total_requests)::int AS total,
                  round(avg(avg_hours_to_resolve), 1)::float AS avg_hours,
                  round(avg(within_sla_pct), 1)::float AS within_sla_pct
             FROM v_maintenance_sla WHERE complex_id = ANY($1)
            GROUP BY category ORDER BY total DESC`, [ids]),
    queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM lease l JOIN unit u USING (unit_id) JOIN block b USING (block_id)
            WHERE b.complex_id = ANY($1) AND l.status = 'ACTIVE' AND l.end_date <= current_date + 60`, [ids]),
  ]);
  return { scope: 'staff', kpis, occupancy, collections, byCategory, overdue, sla, leasesExpiring60d: leaseExpiring?.n ?? 0 };
});

async function residentDashboard(userId: number) {
  const [units, dues, requests, invoices] = await Promise.all([
    query(`SELECT d.*, CASE WHEN $1 = ANY(d.owner_user_ids) THEN 'OWNER' ELSE 'TENANT' END AS relation
             FROM v_unit_directory d
            WHERE $1 = ANY(d.owner_user_ids) OR d.tenant_user_id = $1
            ORDER BY d.complex_name, d.block_name, d.unit_number`, [userId]),
    queryOne(`SELECT coalesce(sum(balance), 0)::float AS outstanding,
                     count(*) FILTER (WHERE days_overdue > 0)::int AS overdue_count,
                     min(due_date) FILTER (WHERE status IN ('UNPAID','PARTIAL')) AS next_due
                FROM v_invoice_balance WHERE billed_to = $1 AND status IN ('UNPAID','PARTIAL')`, [userId]),
    query(`SELECT request_id, title, status, priority, created_at FROM maintenance_request
            WHERE raised_by = $1 ORDER BY created_at DESC LIMIT 5`, [userId]),
    query(`SELECT to_char(billing_month, 'Mon YY') AS month, sum(amount)::float AS billed, sum(amount_paid)::float AS paid
             FROM invoice WHERE billed_to = $1 AND status <> 'VOID'
              AND billing_month >= date_trunc('month', current_date) - interval '11 months'
            GROUP BY billing_month ORDER BY billing_month`, [userId]),
  ]);
  return { scope: 'resident', units, dues, requests, invoices };
}
