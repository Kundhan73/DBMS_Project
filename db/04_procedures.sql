-- =====================================================================
-- 04_procedures.sql
-- Stored functions and procedures for multi-step business operations.
-- Each one runs inside the caller's transaction, so a failure anywhere
-- rolls the whole operation back.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Monthly billing run.
-- Creates RENT (prorated for partial months), MAINTENANCE (to the primary
-- owner) and PARKING invoices for one month. Idempotent: running it twice
-- for the same month creates nothing new, thanks to the partial unique
-- indexes in 02_indexes.sql and ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_generate_monthly_invoices(p_month date)
RETURNS TABLE (invoice_type text, invoices_created int)
LANGUAGE plpgsql AS $$
DECLARE
    v_start date := date_trunc('month', p_month)::date;
    v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;  -- exclusive
    v_days  int  := v_end - v_start;
    n       int;
BEGIN
    IF v_start > date_trunc('month', current_date)::date THEN
        RAISE EXCEPTION 'Cannot bill future month %', v_start USING ERRCODE = 'check_violation';
    END IF;

    -- RENT
    WITH src AS (
        SELECT l.lease_id, l.unit_id, t.user_id, l.monthly_rent, l.rent_due_day,
               greatest(l.start_date, v_start)                       AS s,
               least(coalesce(l.terminated_on, l.end_date), v_end)   AS e
          FROM lease l JOIN tenant_profile t USING (tenant_id)
         WHERE l.status IN ('ACTIVE','ENDED','TERMINATED')
           AND l.start_date < v_end
           AND coalesce(l.terminated_on, l.end_date) > v_start)
    INSERT INTO invoice (unit_id, billed_to, invoice_type, lease_id, billing_month,
                         amount, issued_on, due_date, notes)
    SELECT unit_id, user_id, 'RENT', lease_id, v_start,
           round(monthly_rent * (e - s) / v_days, 2),
           v_start, v_start + (rent_due_day - 1),
           CASE WHEN e - s < v_days THEN format('Prorated: %s of %s days', e - s, v_days) END
      FROM src
     WHERE e > s
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    invoice_type := 'RENT'; invoices_created := n; RETURN NEXT;

    -- MAINTENANCE: billed to the owner with the largest share
    INSERT INTO invoice (unit_id, billed_to, invoice_type, billing_month, amount, issued_on, due_date)
    SELECT DISTINCT ON (o.unit_id)
           o.unit_id, op.user_id, 'MAINTENANCE', v_start, u.monthly_maintenance, v_start, v_start + 9
      FROM ownership o
      JOIN owner_profile op USING (owner_id)
      JOIN unit u           USING (unit_id)
     WHERE o.owned_from < v_end
       AND (o.owned_until IS NULL OR o.owned_until > v_start)
       AND u.monthly_maintenance > 0
     ORDER BY o.unit_id, o.share_pct DESC, o.owner_id
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    invoice_type := 'MAINTENANCE'; invoices_created := n; RETURN NEXT;

    -- PARKING
    INSERT INTO invoice (unit_id, billed_to, invoice_type, parking_allocation_id,
                         billing_month, amount, issued_on, due_date)
    SELECT pa.unit_id, v.owner_user_id, 'PARKING', pa.allocation_id,
           v_start, pa.monthly_charge, v_start, v_start + 9
      FROM parking_allocation pa JOIN vehicle v USING (vehicle_id)
     WHERE pa.monthly_charge > 0
       AND pa.start_date < v_end
       AND (pa.end_date IS NULL OR pa.end_date > v_start)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    invoice_type := 'PARKING'; invoices_created := n; RETURN NEXT;
END $$;

-- ---------------------------------------------------------------------
-- Late fees: 2% of the outstanding balance (minimum Rs 100) on rent and
-- maintenance invoices still open p_grace_days after their due date.
-- At most one late fee per source invoice (partial unique index).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_apply_late_fees(
    p_as_of      date    DEFAULT current_date,
    p_rate       numeric DEFAULT 0.02,
    p_grace_days int     DEFAULT 15)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
    INSERT INTO invoice (unit_id, billed_to, invoice_type, source_invoice_id, billing_month,
                         amount, issued_on, due_date, notes)
    SELECT i.unit_id, i.billed_to, 'LATE_FEE', i.invoice_id,
           date_trunc('month', p_as_of)::date,
           greatest(100, round((i.amount - i.amount_paid) * p_rate, 0)),
           p_as_of, p_as_of + 7,
           format('Late fee on %s invoice #%s (%s)', lower(i.invoice_type), i.invoice_id,
                  to_char(i.billing_month, 'Mon YYYY'))
      FROM invoice i
     WHERE i.invoice_type IN ('RENT','MAINTENANCE')
       AND i.status IN ('UNPAID','PARTIAL')
       AND i.due_date + p_grace_days < p_as_of
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

-- ---------------------------------------------------------------------
-- Record a payment. Balance and void checks happen in the payment
-- trigger (so they also apply to raw INSERTs); this wrapper supplies a
-- reference number and returns the new payment id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_record_payment(
    p_invoice_id bigint,
    p_amount     numeric,
    p_method     text,
    p_reference  text        DEFAULT NULL,
    p_paid_at    timestamptz DEFAULT now())
RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
    INSERT INTO payment (invoice_id, amount, method, reference_no, paid_at)
    VALUES (p_invoice_id, p_amount, p_method,
            coalesce(p_reference,
                     upper(p_method) || '-' || to_char(p_paid_at, 'YYYYMMDD') || '-' ||
                     substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
            p_paid_at)
    RETURNING payment_id INTO v_id;
    RETURN v_id;
END $$;

-- ---------------------------------------------------------------------
-- Early lease termination (PROCEDURE, invoked with CALL).
-- One atomic unit of work:
--   1. lock and validate the lease
--   2. mark it TERMINATED
--   3. void unpaid rent invoices for months after the termination date
--   4. end the tenant's parking allocations on that unit
--   5. unit status is recomputed by the lease trigger
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_terminate_lease(
    p_lease_id int,
    p_on       date,
    p_reason   text)
LANGUAGE plpgsql AS $$
DECLARE l lease%ROWTYPE;
BEGIN
    SELECT * INTO l FROM lease WHERE lease_id = p_lease_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lease % not found', p_lease_id USING ERRCODE = 'no_data_found';
    END IF;
    IF l.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Only ACTIVE leases can be terminated (lease % is %)', p_lease_id, l.status
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_on < l.start_date OR p_on > l.end_date THEN
        RAISE EXCEPTION 'Termination date % is outside the lease period % to %', p_on, l.start_date, l.end_date
            USING ERRCODE = 'check_violation';
    END IF;
    IF length(coalesce(btrim(p_reason), '')) < 5 THEN
        RAISE EXCEPTION 'A termination reason is required' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE lease
       SET status = 'TERMINATED', terminated_on = p_on, termination_reason = p_reason
     WHERE lease_id = p_lease_id;

    UPDATE invoice
       SET status = 'VOID', notes = format('Voided: lease terminated on %s', p_on)
     WHERE lease_id = p_lease_id
       AND invoice_type = 'RENT'
       AND status = 'UNPAID'
       AND billing_month > p_on;

    UPDATE parking_allocation pa
       SET end_date = greatest(p_on, pa.start_date + 1)
      FROM vehicle v
      JOIN tenant_profile t ON t.user_id = v.owner_user_id
     WHERE pa.vehicle_id = v.vehicle_id
       AND t.tenant_id = l.tenant_id
       AND pa.unit_id = l.unit_id
       AND (pa.end_date IS NULL OR pa.end_date > p_on);
END $$;

-- ---------------------------------------------------------------------
-- Nightly housekeeping: leases past their end date become ENDED.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_close_expired_leases(p_as_of date DEFAULT current_date)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
    UPDATE lease SET status = 'ENDED'
     WHERE status = 'ACTIVE' AND end_date <= p_as_of;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

-- ---------------------------------------------------------------------
-- Vector search helpers
-- ---------------------------------------------------------------------

-- Requests most similar to an existing request (uses its stored vector).
-- Used on the request detail page: "how were similar issues fixed?"
CREATE OR REPLACE FUNCTION fn_similar_requests(p_request_id bigint, p_k int DEFAULT 5)
RETURNS TABLE (request_id bigint, title varchar, category varchar, status varchar,
               complex_name varchar, vendor_name varchar, actual_cost numeric,
               resolution_notes text, similarity numeric)
LANGUAGE sql STABLE AS $$
    SELECT mr.request_id, mr.title, mr.category, mr.status, c.name, v.name,
           mr.actual_cost, mr.resolution_notes,
           round((1 - (e.embedding <=> q.embedding))::numeric, 4)
      FROM request_embedding q
      JOIN request_embedding e    ON e.request_id <> q.request_id
      JOIN maintenance_request mr ON mr.request_id = e.request_id
      JOIN unit u                 ON u.unit_id = mr.unit_id
      JOIN block b                ON b.block_id = u.block_id
      JOIN complex c              ON c.complex_id = b.complex_id
      LEFT JOIN vendor v          ON v.vendor_id = mr.vendor_id
     WHERE q.request_id = p_request_id
     ORDER BY e.embedding <=> q.embedding
     LIMIT p_k
$$;

-- Hybrid search: fuses a full-text ranking and a vector ranking with
-- Reciprocal Rank Fusion (score = sum 1/(60 + rank)). Keyword search
-- catches exact terms ("MCB", flat numbers); vector search catches
-- paraphrases ("water dripping from roof" ~ "ceiling seepage").
CREATE OR REPLACE FUNCTION fn_hybrid_search(
    p_query      text,
    p_query_vec  vector(384),
    p_complex_id int DEFAULT NULL,
    p_k          int DEFAULT 10)
RETURNS TABLE (request_id bigint, vector_rank int, text_rank int, rrf_score numeric, similarity numeric)
LANGUAGE sql STABLE AS $$
    WITH scoped AS (
        SELECT mr.request_id
          FROM maintenance_request mr
          JOIN unit u  USING (unit_id)
          JOIN block b USING (block_id)
         WHERE p_complex_id IS NULL OR b.complex_id = p_complex_id),
    vec AS (
        SELECT e.request_id,
               row_number() OVER (ORDER BY e.embedding <=> p_query_vec)::int AS rnk,
               1 - (e.embedding <=> p_query_vec)                           AS sim
          FROM request_embedding e JOIN scoped s USING (request_id)
         ORDER BY e.embedding <=> p_query_vec
         LIMIT 50),
    txt AS (
        SELECT mr.request_id,
               row_number() OVER (ORDER BY ts_rank_cd(mr.search_tsv, q) DESC)::int AS rnk
          FROM maintenance_request mr
          JOIN scoped s USING (request_id),
               -- OR the query's lexemes together: any shared keyword counts,
               -- ts_rank_cd then rewards requests that match more of them
               to_tsquery('english', replace(plainto_tsquery('english', p_query)::text, '&', '|')) q
         WHERE mr.search_tsv @@ q
         ORDER BY ts_rank_cd(mr.search_tsv, q) DESC
         LIMIT 50)
    SELECT coalesce(vec.request_id, txt.request_id),
           vec.rnk, txt.rnk,
           round((coalesce(1.0 / (60 + vec.rnk), 0) + coalesce(1.0 / (60 + txt.rnk), 0))::numeric, 5),
           round(vec.sim::numeric, 4)
      FROM vec FULL OUTER JOIN txt ON txt.request_id = vec.request_id
     ORDER BY 4 DESC
     LIMIT p_k
$$;
