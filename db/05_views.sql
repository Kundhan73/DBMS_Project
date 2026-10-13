-- =====================================================================
-- 05_views.sql
-- Read models used by the dashboards and list screens. Keeping the joins
-- here means the API layer queries one view instead of repeating 5-way
-- joins, and the logic is testable in psql.
-- =====================================================================

-- Which complexes each user may see (drives row-level scoping in the API)
--   ADMIN   : all complexes
--   MANAGER : complexes assigned to them
--   OWNER   : complexes where they currently own a unit
--   TENANT  : complexes where they hold an active lease
CREATE OR REPLACE VIEW v_user_complex_scope AS
SELECT u.user_id, c.complex_id
  FROM app_user u CROSS JOIN complex c
 WHERE u.role = 'ADMIN'
UNION
SELECT cm.manager_user_id, cm.complex_id FROM complex_manager cm
UNION
SELECT op.user_id, b.complex_id
  FROM ownership o
  JOIN owner_profile op USING (owner_id)
  JOIN unit un          USING (unit_id)
  JOIN block b          USING (block_id)
 WHERE o.owned_until IS NULL
UNION
SELECT t.user_id, b.complex_id
  FROM lease l
  JOIN tenant_profile t USING (tenant_id)
  JOIN unit un          USING (unit_id)
  JOIN block b          USING (block_id)
 WHERE l.status IN ('ACTIVE','PENDING');

-- One row per unit with its location, current owner(s) and current tenant
CREATE OR REPLACE VIEW v_unit_directory AS
SELECT u.unit_id,
       c.complex_id, c.name AS complex_name,
       b.block_id,   b.name AS block_name,
       u.unit_number, u.floor_no, u.unit_type, u.carpet_area_sqft,
       u.base_rent, u.monthly_maintenance, u.occupancy_status,
       own.owner_names, own.owner_user_ids,
       cur.lease_id, cur.tenant_name, cur.tenant_user_id,
       cur.monthly_rent, cur.lease_end
  FROM unit u
  JOIN block b   USING (block_id)
  JOIN complex c USING (complex_id)
  LEFT JOIN LATERAL (
        SELECT string_agg(au.full_name, ', ' ORDER BY o.share_pct DESC) AS owner_names,
               array_agg(au.user_id::int ORDER BY o.share_pct DESC)     AS owner_user_ids
          FROM ownership o
          JOIN owner_profile op USING (owner_id)
          JOIN app_user au      ON au.user_id = op.user_id
         WHERE o.unit_id = u.unit_id AND o.owned_until IS NULL) own ON true
  LEFT JOIN LATERAL (
        SELECT l.lease_id, au.full_name AS tenant_name, au.user_id AS tenant_user_id,
               l.monthly_rent, l.end_date AS lease_end
          FROM lease l
          JOIN tenant_profile t USING (tenant_id)
          JOIN app_user au      ON au.user_id = t.user_id
         WHERE l.unit_id = u.unit_id AND l.status = 'ACTIVE'
         ORDER BY l.start_date DESC
         LIMIT 1) cur ON true;

-- Occupancy per complex
CREATE OR REPLACE VIEW v_complex_occupancy AS
SELECT c.complex_id, c.name AS complex_name, c.locality,
       count(u.unit_id)                                                  AS total_units,
       count(*) FILTER (WHERE u.occupancy_status = 'LEASED')             AS leased,
       count(*) FILTER (WHERE u.occupancy_status = 'OWNER_OCCUPIED')     AS owner_occupied,
       count(*) FILTER (WHERE u.occupancy_status = 'VACANT')             AS vacant,
       count(*) FILTER (WHERE u.occupancy_status = 'UNDER_MAINTENANCE')  AS under_maintenance,
       round(100.0 * count(*) FILTER (WHERE u.occupancy_status IN ('LEASED','OWNER_OCCUPIED'))
             / nullif(count(u.unit_id), 0), 1)                          AS occupancy_pct
  FROM complex c
  JOIN block b     ON b.complex_id = c.complex_id
  LEFT JOIN unit u ON u.block_id = b.block_id
 GROUP BY c.complex_id, c.name, c.locality;

-- Invoice with outstanding balance and ageing
CREATE OR REPLACE VIEW v_invoice_balance AS
SELECT i.invoice_id, i.invoice_type, i.billing_month, i.amount, i.amount_paid,
       (i.amount - i.amount_paid)                                   AS balance,
       i.due_date, i.status, i.issued_on, i.notes,
       CASE WHEN i.status IN ('UNPAID','PARTIAL') AND i.due_date < current_date
            THEN current_date - i.due_date ELSE 0 END               AS days_overdue,
       i.unit_id, d.unit_number, d.block_name, d.complex_id, d.complex_name,
       i.billed_to, au.full_name AS billed_to_name, au.role AS billed_to_role
  FROM invoice i
  JOIN v_unit_directory d ON d.unit_id = i.unit_id
  JOIN app_user au        ON au.user_id = i.billed_to;

-- Billed vs collected per complex per month
CREATE OR REPLACE VIEW v_monthly_collections AS
SELECT c.complex_id, c.name AS complex_name, i.billing_month,
       sum(i.amount)                                       AS billed,
       sum(i.amount_paid)                                  AS collected,
       sum(i.amount - i.amount_paid)                       AS outstanding,
       round(100.0 * sum(i.amount_paid) / nullif(sum(i.amount), 0), 1) AS collection_pct
  FROM invoice i
  JOIN unit u    USING (unit_id)
  JOIN block b   USING (block_id)
  JOIN complex c USING (complex_id)
 WHERE i.status <> 'VOID'
 GROUP BY c.complex_id, c.name, i.billing_month;

-- Maintenance SLA per complex and category.
-- Targets: URGENT 24h, HIGH 72h, MEDIUM 7 days, LOW 14 days.
CREATE OR REPLACE VIEW v_maintenance_sla AS
WITH r AS (
    SELECT b.complex_id, mr.category, mr.priority, mr.status,
           extract(epoch FROM (mr.resolved_at - mr.created_at)) / 3600.0 AS hours_to_resolve,
           CASE mr.priority WHEN 'URGENT' THEN 24 WHEN 'HIGH' THEN 72
                            WHEN 'MEDIUM' THEN 168 ELSE 336 END           AS sla_hours
      FROM maintenance_request mr
      JOIN unit u  USING (unit_id)
      JOIN block b USING (block_id))
SELECT c.complex_id, c.name AS complex_name, r.category,
       count(*)                                                          AS total_requests,
       count(*) FILTER (WHERE r.status IN ('OPEN','ASSIGNED','IN_PROGRESS')) AS open_requests,
       round(avg(r.hours_to_resolve)::numeric, 1)                        AS avg_hours_to_resolve,
       round(100.0 * count(*) FILTER (WHERE r.hours_to_resolve <= r.sla_hours)
             / nullif(count(r.hours_to_resolve), 0), 1)                  AS within_sla_pct
  FROM r JOIN complex c USING (complex_id)
 GROUP BY c.complex_id, c.name, r.category;

-- Vendor scorecard
CREATE OR REPLACE VIEW v_vendor_performance AS
SELECT v.vendor_id, v.name, v.service_category, v.rating AS listed_rating,
       count(mr.request_id)                                               AS jobs,
       count(*) FILTER (WHERE mr.status IN ('RESOLVED','CLOSED'))         AS completed,
       round(avg(mr.actual_cost), 0)                                      AS avg_cost,
       round(avg(mr.tenant_rating), 2)                                    AS avg_resident_rating,
       round(avg(extract(epoch FROM (mr.resolved_at - mr.assigned_at)) / 3600.0)::numeric, 1)
                                                                          AS avg_hours_on_job
  FROM vendor v
  LEFT JOIN maintenance_request mr ON mr.vendor_id = v.vendor_id
 GROUP BY v.vendor_id, v.name, v.service_category, v.rating;

-- ---------------------------------------------------------------------
-- Materialized view for the admin dashboard KPI strip. Aggregating every
-- invoice and request on each page load is wasteful, so the snapshot is
-- refreshed after billing runs and on demand
-- (REFRESH MATERIALIZED VIEW CONCURRENTLY needs the unique index below).
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_complex_kpis AS
SELECT c.complex_id, c.name AS complex_name,
       o.total_units, o.occupancy_pct,
       coalesce(f.billed_12m, 0)       AS billed_12m,
       coalesce(f.collected_12m, 0)    AS collected_12m,
       coalesce(d.outstanding, 0)      AS outstanding_now,
       coalesce(d.overdue_invoices, 0) AS overdue_invoices,
       coalesce(m.open_requests, 0)    AS open_requests,
       now()                           AS refreshed_at
  FROM complex c
  JOIN v_complex_occupancy o USING (complex_id)
  LEFT JOIN (SELECT complex_id, sum(billed) AS billed_12m, sum(collected) AS collected_12m
               FROM v_monthly_collections
              WHERE billing_month >= date_trunc('month', current_date) - interval '11 months'
              GROUP BY complex_id) f USING (complex_id)
  LEFT JOIN (SELECT complex_id, sum(balance) AS outstanding,
                    count(*) FILTER (WHERE days_overdue > 0) AS overdue_invoices
               FROM v_invoice_balance WHERE status IN ('UNPAID','PARTIAL')
              GROUP BY complex_id) d USING (complex_id)
  LEFT JOIN (SELECT b.complex_id, count(*) AS open_requests
               FROM maintenance_request mr JOIN unit u USING (unit_id) JOIN block b USING (block_id)
              WHERE mr.status IN ('OPEN','ASSIGNED','IN_PROGRESS')
              GROUP BY b.complex_id) m USING (complex_id);

CREATE UNIQUE INDEX uq_mv_complex_kpis ON mv_complex_kpis (complex_id);
