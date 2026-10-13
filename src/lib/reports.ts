// Analytical queries shown on the Reports page. Each takes $1 = the array of
// complex ids the viewer may see. These double as the "important queries"
// section of the project report.

export type Report = { key: string; title: string; description: string; concepts: string[]; sql: string };

export const REPORTS: Report[] = [
  {
    key: 'defaulters',
    title: 'Repeat defaulters',
    description: 'Residents with two or more overdue invoices, ranked by the amount outstanding.',
    concepts: ['JOIN', 'GROUP BY', 'HAVING', 'aggregate', 'ORDER BY'],
    sql: `SELECT ib.billed_to_name              AS resident,
       ib.billed_to_role              AS role,
       ib.complex_name                AS complex,
       string_agg(DISTINCT ib.block_name || '-' || ib.unit_number, ', ') AS units,
       count(*)                       AS overdue_invoices,
       sum(ib.balance)                AS outstanding,
       max(ib.days_overdue)           AS oldest_days_overdue
  FROM v_invoice_balance ib
 WHERE ib.complex_id = ANY($1)
   AND ib.days_overdue > 0
 GROUP BY ib.billed_to, ib.billed_to_name, ib.billed_to_role, ib.complex_name
HAVING count(*) >= 2
 ORDER BY outstanding DESC
 LIMIT 20`,
  },
  {
    key: 'below_market_rent',
    title: 'Leases below market rent',
    description: 'Active leases paying less than 90% of the average current rent for the same flat type in the same complex (correlated subquery).',
    concepts: ['correlated subquery', 'JOIN', 'arithmetic'],
    sql: `SELECT d.complex_name AS complex, d.block_name || '-' || d.unit_number AS unit, d.unit_type,
       l.monthly_rent AS current_rent,
       round((SELECT avg(l2.monthly_rent)
                FROM lease l2 JOIN v_unit_directory d2 ON d2.unit_id = l2.unit_id
               WHERE l2.status = 'ACTIVE' AND d2.complex_id = d.complex_id AND d2.unit_type = d.unit_type), 0) AS avg_rent_same_type,
       l.end_date AS renews_on
  FROM lease l JOIN v_unit_directory d ON d.unit_id = l.unit_id
 WHERE l.status = 'ACTIVE' AND d.complex_id = ANY($1)
   AND l.monthly_rent < 0.9 * (SELECT avg(l2.monthly_rent)
                                 FROM lease l2 JOIN v_unit_directory d2 ON d2.unit_id = l2.unit_id
                                WHERE l2.status = 'ACTIVE' AND d2.complex_id = d.complex_id AND d2.unit_type = d.unit_type)
 ORDER BY l.end_date`,
  },
  {
    key: 'expiring_no_renewal',
    title: 'Leases expiring in 60 days with no renewal lined up',
    description: 'Active leases ending soon where no PENDING lease exists for the same unit (NOT EXISTS).',
    concepts: ['NOT EXISTS subquery', 'date arithmetic'],
    sql: `SELECT d.complex_name AS complex, d.block_name || '-' || d.unit_number AS unit,
       au.full_name AS tenant, au.phone, l.end_date, l.end_date - current_date AS days_left, l.monthly_rent
  FROM lease l
  JOIN tenant_profile t   USING (tenant_id)
  JOIN app_user au        ON au.user_id = t.user_id
  JOIN v_unit_directory d ON d.unit_id = l.unit_id
 WHERE l.status = 'ACTIVE' AND d.complex_id = ANY($1)
   AND l.end_date <= current_date + 60
   AND NOT EXISTS (SELECT 1 FROM lease nxt
                    WHERE nxt.unit_id = l.unit_id AND nxt.status = 'PENDING')
 ORDER BY l.end_date`,
  },
  {
    key: 'revenue_rollup',
    title: 'Revenue by complex and invoice type (last 6 months)',
    description: 'Billed and collected amounts with subtotals per complex and a grand total, using GROUP BY ROLLUP.',
    concepts: ['GROUP BY ROLLUP', 'GROUPING()', 'aggregate', 'FILTER'],
    sql: `SELECT CASE WHEN GROUPING(c.name) = 1 THEN 'ALL COMPLEXES' ELSE c.name END AS complex,
       CASE WHEN GROUPING(i.invoice_type) = 1 THEN 'SUBTOTAL' ELSE i.invoice_type END AS invoice_type,
       count(*)                                  AS invoices,
       sum(i.amount)                             AS billed,
       sum(i.amount_paid)                        AS collected,
       round(100.0 * sum(i.amount_paid) / sum(i.amount), 1) AS collection_pct
  FROM invoice i JOIN unit u USING (unit_id) JOIN block b USING (block_id) JOIN complex c USING (complex_id)
 WHERE i.status <> 'VOID' AND c.complex_id = ANY($1)
   AND i.billing_month >= date_trunc('month', current_date) - interval '5 months'
 GROUP BY ROLLUP (c.name, i.invoice_type)
 ORDER BY GROUPING(c.name), c.name, GROUPING(i.invoice_type), billed DESC`,
  },
  {
    key: 'collection_rank',
    title: 'Monthly collection-rate ranking',
    description: 'Each complex ranked by collection rate every month, with the change from the previous month (window functions).',
    concepts: ['window functions', 'RANK()', 'LAG()', 'CTE'],
    sql: `WITH m AS (
  SELECT complex_name, billing_month, collection_pct
    FROM v_monthly_collections
   WHERE complex_id = ANY($1)
     AND billing_month >= date_trunc('month', current_date) - interval '5 months')
SELECT to_char(billing_month, 'Mon YYYY') AS month, complex_name AS complex, collection_pct,
       RANK() OVER (PARTITION BY billing_month ORDER BY collection_pct DESC) AS rank_in_month,
       collection_pct - LAG(collection_pct) OVER (PARTITION BY complex_name ORDER BY billing_month) AS change_vs_prev_month
  FROM m
 ORDER BY billing_month DESC, rank_in_month`,
  },
  {
    key: 'repeat_issues',
    title: 'Units with recurring problems',
    description: 'Units with three or more requests in the same category in the last 12 months: candidates for a root-cause fix.',
    concepts: ['GROUP BY', 'HAVING', 'aggregate', 'JOIN'],
    sql: `SELECT d.complex_name AS complex, d.block_name || '-' || d.unit_number AS unit, mr.category,
       count(*)                   AS requests,
       sum(mr.actual_cost)        AS total_cost,
       min(mr.created_at)::date   AS first_reported,
       max(mr.created_at)::date   AS last_reported
  FROM maintenance_request mr JOIN v_unit_directory d ON d.unit_id = mr.unit_id
 WHERE d.complex_id = ANY($1) AND mr.created_at >= now() - interval '12 months'
   AND mr.status <> 'CANCELLED'
 GROUP BY d.complex_name, d.block_name, d.unit_number, mr.category
HAVING count(*) >= 3
 ORDER BY requests DESC, total_cost DESC NULLS LAST`,
  },
  {
    key: 'vendor_scorecard',
    title: 'Vendor scorecard',
    description: 'Jobs, average cost, resident rating and turnaround per vendor, from the v_vendor_performance view.',
    concepts: ['VIEW', 'LEFT JOIN', 'aggregate'],
    sql: `SELECT name AS vendor, service_category, jobs, completed, avg_cost,
       avg_resident_rating, avg_hours_on_job
  FROM v_vendor_performance
 WHERE vendor_id IN (SELECT DISTINCT mr.vendor_id
                       FROM maintenance_request mr JOIN v_unit_directory d ON d.unit_id = mr.unit_id
                      WHERE d.complex_id = ANY($1))
 ORDER BY avg_resident_rating DESC NULLS LAST, jobs DESC`,
  },
  {
    key: 'portfolio_owners',
    title: 'Owners with multiple flats',
    description: 'Investors owning more than one unit, with the rent their flats currently earn.',
    concepts: ['JOIN', 'GROUP BY', 'HAVING', 'LEFT JOIN', 'COALESCE'],
    sql: `SELECT au.full_name AS owner, au.email,
       count(DISTINCT o.unit_id)                     AS units_owned,
       string_agg(DISTINCT d.complex_name, ', ')     AS complexes,
       count(l.lease_id)                             AS units_leased,
       coalesce(sum(l.monthly_rent), 0)              AS monthly_rent_income
  FROM ownership o
  JOIN owner_profile op   USING (owner_id)
  JOIN app_user au        ON au.user_id = op.user_id
  JOIN v_unit_directory d ON d.unit_id = o.unit_id
  LEFT JOIN lease l       ON l.unit_id = o.unit_id AND l.status = 'ACTIVE'
 WHERE o.owned_until IS NULL AND d.complex_id = ANY($1)
 GROUP BY au.user_id, au.full_name, au.email
HAVING count(DISTINCT o.unit_id) > 1
 ORDER BY units_owned DESC, monthly_rent_income DESC`,
  },
  {
    key: 'parking_utilisation',
    title: 'Parking utilisation',
    description: 'Slots, occupancy and monthly parking revenue by complex and slot type.',
    concepts: ['LEFT JOIN', 'FILTER', 'aggregate', 'GROUP BY'],
    sql: `SELECT c.name AS complex, ps.slot_type,
       count(DISTINCT ps.slot_id)                                   AS slots,
       count(DISTINCT pa.allocation_id)                             AS occupied,
       round(100.0 * count(DISTINCT pa.allocation_id) / count(DISTINCT ps.slot_id), 1) AS utilisation_pct,
       coalesce(sum(pa.monthly_charge), 0)                          AS monthly_revenue
  FROM parking_slot ps
  JOIN complex c USING (complex_id)
  LEFT JOIN parking_allocation pa ON pa.slot_id = ps.slot_id
        AND pa.start_date <= current_date AND (pa.end_date IS NULL OR pa.end_date > current_date)
 WHERE c.complex_id = ANY($1)
 GROUP BY c.name, ps.slot_type
 ORDER BY c.name, ps.slot_type`,
  },
];
