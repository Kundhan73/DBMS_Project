-- =====================================================================
-- 03_functions_triggers.sql
-- Business rules that must hold no matter which client writes the data.
-- The web app sets `app.user_id` per transaction (SET LOCAL via
-- set_config) so triggers can record who made each change.
-- =====================================================================

-- Who is acting? NULL when the change comes from psql / seed scripts.
CREATE OR REPLACE FUNCTION fn_current_app_user() RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('app.user_id', true), '')::bigint
$$;

-- ---------------------------------------------------------------------
-- 1. Role checks on specialisation tables
--    owner_profile rows must belong to OWNER users, tenant_profile to
--    TENANT users, complex_manager to MANAGER users.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_check_user_role() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_required text := TG_ARGV[0];
    v_user     bigint;
    v_role     text;
BEGIN
    -- to_jsonb lets one function serve tables whose user column has different names
    v_user := (to_jsonb(NEW) ->> CASE TG_TABLE_NAME WHEN 'complex_manager' THEN 'manager_user_id' ELSE 'user_id' END)::bigint;
    SELECT role INTO v_role FROM app_user WHERE user_id = v_user;
    IF v_role IS DISTINCT FROM v_required THEN
        RAISE EXCEPTION 'User % has role %, expected % for %', v_user, v_role, v_required, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER owner_profile_role   BEFORE INSERT OR UPDATE ON owner_profile
    FOR EACH ROW EXECUTE FUNCTION trg_check_user_role('OWNER');
CREATE TRIGGER tenant_profile_role  BEFORE INSERT OR UPDATE ON tenant_profile
    FOR EACH ROW EXECUTE FUNCTION trg_check_user_role('TENANT');
CREATE TRIGGER complex_manager_role BEFORE INSERT OR UPDATE ON complex_manager
    FOR EACH ROW EXECUTE FUNCTION trg_check_user_role('MANAGER');

-- ---------------------------------------------------------------------
-- 2. A unit's floor cannot exceed its block's floor count
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_unit_floor_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_floors smallint;
BEGIN
    SELECT total_floors INTO v_floors FROM block WHERE block_id = NEW.block_id;
    IF NEW.floor_no > v_floors THEN
        RAISE EXCEPTION 'Unit % is on floor % but its block only has % floors',
            NEW.unit_number, NEW.floor_no, v_floors USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER unit_floor_check BEFORE INSERT OR UPDATE OF floor_no, block_id ON unit
    FOR EACH ROW EXECUTE FUNCTION trg_unit_floor_check();

-- ---------------------------------------------------------------------
-- 3. Joint ownership: live shares on a unit may not exceed 100%
--    The unit row is locked so two concurrent inserts cannot both pass.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_ownership_share_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_total numeric;
BEGIN
    PERFORM 1 FROM unit WHERE unit_id = NEW.unit_id FOR UPDATE;
    SELECT coalesce(sum(share_pct), 0) INTO v_total
      FROM ownership
     WHERE unit_id = NEW.unit_id
       AND ownership_id IS DISTINCT FROM NEW.ownership_id
       AND daterange(owned_from, owned_until, '[)') && daterange(NEW.owned_from, NEW.owned_until, '[)');
    IF v_total + NEW.share_pct > 100 THEN
        RAISE EXCEPTION 'Ownership shares for unit % would total %%% (max 100)',
            NEW.unit_id, v_total + NEW.share_pct USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER ownership_share_check BEFORE INSERT OR UPDATE ON ownership
    FOR EACH ROW EXECUTE FUNCTION trg_ownership_share_check();

-- ---------------------------------------------------------------------
-- 4. Leases
--    (a) only an owned unit can be leased
--    (b) the unit's occupancy_status is derived from its leases
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_lease_validate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ownership o
                    WHERE o.unit_id = NEW.unit_id
                      AND o.owned_from <= NEW.start_date
                      AND (o.owned_until IS NULL OR o.owned_until > NEW.start_date)) THEN
        RAISE EXCEPTION 'Unit % has no owner on %; it cannot be leased', NEW.unit_id, NEW.start_date
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('ENDED','TERMINATED') AND NEW.status IN ('PENDING','ACTIVE') THEN
        RAISE EXCEPTION 'Lease % is closed and cannot be reactivated', NEW.lease_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER lease_validate BEFORE INSERT OR UPDATE ON lease
    FOR EACH ROW EXECUTE FUNCTION trg_lease_validate();

CREATE OR REPLACE FUNCTION fn_refresh_unit_status(p_unit_id int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
    SELECT occupancy_status INTO v_status FROM unit WHERE unit_id = p_unit_id;
    IF EXISTS (SELECT 1 FROM lease
                WHERE unit_id = p_unit_id AND status = 'ACTIVE'
                  AND current_date >= start_date AND current_date < end_date) THEN
        UPDATE unit SET occupancy_status = 'LEASED'
         WHERE unit_id = p_unit_id AND occupancy_status <> 'LEASED';
    ELSIF v_status = 'LEASED' THEN
        UPDATE unit SET occupancy_status = 'VACANT' WHERE unit_id = p_unit_id;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION trg_lease_sync_unit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM fn_refresh_unit_status(NEW.unit_id);
    IF TG_OP = 'UPDATE' AND OLD.unit_id <> NEW.unit_id THEN
        PERFORM fn_refresh_unit_status(OLD.unit_id);
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER lease_sync_unit AFTER INSERT OR UPDATE OF status, unit_id, start_date, end_date ON lease
    FOR EACH ROW EXECUTE FUNCTION trg_lease_sync_unit();

-- ---------------------------------------------------------------------
-- 5. Payments
--    BEFORE INSERT: lock the invoice, reject overpayment and payments on
--                   void invoices.
--    AFTER  INSERT/DELETE: recompute amount_paid and status.
--    Payments are immutable once written (corrections = delete + re-insert
--    by an admin, both audited).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_payment_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE inv invoice%ROWTYPE;
BEGIN
    SELECT * INTO inv FROM invoice WHERE invoice_id = NEW.invoice_id FOR UPDATE;
    IF inv.status = 'VOID' THEN
        RAISE EXCEPTION 'Invoice % is void; payments are not accepted', inv.invoice_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.amount > inv.amount - inv.amount_paid THEN
        RAISE EXCEPTION 'Payment of % exceeds outstanding balance % on invoice %',
            NEW.amount, inv.amount - inv.amount_paid, inv.invoice_id
            USING ERRCODE = 'check_violation';
    END IF;
    NEW.recorded_by := coalesce(NEW.recorded_by, fn_current_app_user());
    RETURN NEW;
END $$;

CREATE TRIGGER payment_before_insert BEFORE INSERT ON payment
    FOR EACH ROW EXECUTE FUNCTION trg_payment_before_insert();

CREATE OR REPLACE FUNCTION trg_payment_block_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Payments are immutable; delete and re-record instead'
        USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER payment_block_update BEFORE UPDATE ON payment
    FOR EACH ROW EXECUTE FUNCTION trg_payment_block_update();

CREATE OR REPLACE FUNCTION fn_recalc_invoice(p_invoice_id bigint) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_paid numeric; v_amount numeric; v_status text;
BEGIN
    SELECT amount, status INTO v_amount, v_status FROM invoice WHERE invoice_id = p_invoice_id;
    SELECT coalesce(sum(amount), 0) INTO v_paid FROM payment WHERE invoice_id = p_invoice_id;
    UPDATE invoice
       SET amount_paid = v_paid,
           status = CASE WHEN v_status = 'VOID' THEN 'VOID'
                         WHEN v_paid = 0 THEN 'UNPAID'
                         WHEN v_paid < v_amount THEN 'PARTIAL'
                         ELSE 'PAID' END
     WHERE invoice_id = p_invoice_id;
END $$;

CREATE OR REPLACE FUNCTION trg_payment_after_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM fn_recalc_invoice(CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END);
    RETURN NULL;
END $$;

CREATE TRIGGER payment_after_change AFTER INSERT OR DELETE ON payment
    FOR EACH ROW EXECUTE FUNCTION trg_payment_after_change();

-- An invoice that has received money cannot be voided or have its amount cut below what was paid
CREATE OR REPLACE FUNCTION trg_invoice_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'VOID' AND OLD.status <> 'VOID' AND OLD.amount_paid > 0 THEN
        RAISE EXCEPTION 'Invoice % has payments of % and cannot be voided',
            OLD.invoice_id, OLD.amount_paid USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status = 'VOID' AND NEW.status <> 'VOID' THEN
        RAISE EXCEPTION 'Void invoice % cannot be reopened', OLD.invoice_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER invoice_guard BEFORE UPDATE ON invoice
    FOR EACH ROW EXECUTE FUNCTION trg_invoice_guard();

-- ---------------------------------------------------------------------
-- 6. Parking allocation rules
--    * slot and unit must be in the same complex
--    * BIKE slots take bikes, CAR slots take cars, EV slots take electric cars
--    * the vehicle must belong to the unit's current owner or tenant
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_parking_allocation_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    s          parking_slot%ROWTYPE;
    v          vehicle%ROWTYPE;
    v_unit_cx  int;
BEGIN
    SELECT * INTO s FROM parking_slot WHERE slot_id = NEW.slot_id;
    SELECT * INTO v FROM vehicle WHERE vehicle_id = NEW.vehicle_id;
    SELECT b.complex_id INTO v_unit_cx
      FROM unit u JOIN block b USING (block_id) WHERE u.unit_id = NEW.unit_id;

    IF s.complex_id <> v_unit_cx THEN
        RAISE EXCEPTION 'Slot % is in a different complex from unit %', s.slot_code, NEW.unit_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF (s.slot_type = 'BIKE' AND v.vehicle_type <> 'BIKE')
       OR (s.slot_type = 'CAR' AND v.vehicle_type <> 'CAR')
       OR (s.slot_type = 'EV'  AND NOT (v.vehicle_type = 'CAR' AND v.is_electric)) THEN
        RAISE EXCEPTION '% slot % cannot hold % %', s.slot_type, s.slot_code,
            CASE WHEN v.is_electric THEN 'electric' ELSE 'non-electric' END, lower(v.vehicle_type)
            USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM lease l JOIN tenant_profile t USING (tenant_id)
         WHERE l.unit_id = NEW.unit_id AND t.user_id = v.owner_user_id
           AND l.status IN ('ACTIVE','PENDING')
        UNION ALL
        SELECT 1 FROM ownership o JOIN owner_profile op USING (owner_id)
         WHERE o.unit_id = NEW.unit_id AND op.user_id = v.owner_user_id
           AND o.owned_until IS NULL) THEN
        RAISE EXCEPTION 'Vehicle % does not belong to a resident or owner of unit %',
            v.registration_no, NEW.unit_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER parking_allocation_check BEFORE INSERT OR UPDATE OF slot_id, vehicle_id, unit_id ON parking_allocation
    FOR EACH ROW EXECUTE FUNCTION trg_parking_allocation_check();

-- ---------------------------------------------------------------------
-- 7. Maintenance request workflow
--    Allowed transitions:
--      OPEN        -> ASSIGNED | CANCELLED
--      ASSIGNED    -> IN_PROGRESS | OPEN | CANCELLED
--      IN_PROGRESS -> RESOLVED | ASSIGNED
--      RESOLVED    -> CLOSED | IN_PROGRESS (reopened)
--    Timestamps are stamped here so clients cannot forge them.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_mr_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- the person raising it must be connected to the unit (or be staff)
        IF NOT EXISTS (SELECT 1 FROM app_user WHERE user_id = NEW.raised_by AND role IN ('ADMIN','MANAGER'))
           AND NOT EXISTS (SELECT 1 FROM lease l JOIN tenant_profile t USING (tenant_id)
                            WHERE l.unit_id = NEW.unit_id AND t.user_id = NEW.raised_by
                              AND l.status IN ('ACTIVE','ENDED','TERMINATED')
                              AND NEW.created_at::date >= l.start_date
                              AND NEW.created_at::date <= coalesce(l.terminated_on, l.end_date))
           AND NOT EXISTS (SELECT 1 FROM ownership o JOIN owner_profile op USING (owner_id)
                            WHERE o.unit_id = NEW.unit_id AND op.user_id = NEW.raised_by
                              AND NEW.created_at::date >= o.owned_from
                              AND (o.owned_until IS NULL OR NEW.created_at::date < o.owned_until)) THEN
            RAISE EXCEPTION 'User % is not a resident, owner or staff member for unit %', NEW.raised_by, NEW.unit_id
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.status = 'ASSIGNED' AND NEW.assigned_at IS NULL THEN NEW.assigned_at := NEW.created_at; END IF;
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT (
            (OLD.status = 'OPEN'        AND NEW.status IN ('ASSIGNED','CANCELLED')) OR
            (OLD.status = 'ASSIGNED'    AND NEW.status IN ('IN_PROGRESS','OPEN','CANCELLED')) OR
            (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('RESOLVED','ASSIGNED')) OR
            (OLD.status = 'RESOLVED'    AND NEW.status IN ('CLOSED','IN_PROGRESS'))) THEN
            RAISE EXCEPTION 'Invalid status change % -> % for request %', OLD.status, NEW.status, OLD.request_id
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.status = 'ASSIGNED' THEN NEW.assigned_at := coalesce(NEW.assigned_at, now()); END IF;
        IF NEW.status = 'OPEN'     THEN NEW.vendor_id := NULL; NEW.assigned_at := NULL; END IF;
        IF NEW.status = 'RESOLVED' THEN NEW.resolved_at := coalesce(NEW.resolved_at, now()); END IF;
        IF NEW.status = 'IN_PROGRESS' AND OLD.status = 'RESOLVED' THEN
            NEW.resolved_at := NULL; NEW.tenant_rating := NULL;
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER mr_before_write BEFORE INSERT OR UPDATE ON maintenance_request
    FOR EACH ROW EXECUTE FUNCTION trg_mr_before_write();

-- Every status change is recorded in maintenance_status_history
CREATE OR REPLACE FUNCTION trg_mr_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO maintenance_status_history (request_id, old_status, new_status, changed_by, changed_at)
        VALUES (NEW.request_id,
                CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
                NEW.status,
                coalesce(fn_current_app_user(), CASE WHEN TG_OP = 'INSERT' THEN NEW.raised_by END),
                CASE WHEN TG_OP = 'INSERT' THEN NEW.created_at
                     WHEN NEW.status = 'RESOLVED' THEN NEW.resolved_at
                     WHEN NEW.status = 'ASSIGNED' THEN NEW.assigned_at
                     -- data imports may back-date events via app.event_time
                     ELSE coalesce(nullif(current_setting('app.event_time', true), '')::timestamptz, now()) END);
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER mr_history AFTER INSERT OR UPDATE OF status ON maintenance_request
    FOR EACH ROW EXECUTE FUNCTION trg_mr_history();

-- If the text of a request changes, its embedding is stale: drop it so the
-- app re-embeds (the vector store never disagrees with the SQL row).
CREATE OR REPLACE FUNCTION trg_mr_invalidate_embedding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description THEN
        DELETE FROM request_embedding WHERE request_id = NEW.request_id;
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER mr_invalidate_embedding AFTER UPDATE OF title, description ON maintenance_request
    FOR EACH ROW EXECUTE FUNCTION trg_mr_invalidate_embedding();

-- ---------------------------------------------------------------------
-- 8. Generic audit trigger (password hashes are never copied into the log)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_old jsonb;
    v_new jsonb;
    v_pk  text := TG_ARGV[0];
BEGIN
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD) - 'password_hash'; END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW) - 'password_hash'; END IF;
    -- record *that* a password changed, never the hash itself
    IF TG_OP = 'UPDATE' AND to_jsonb(OLD) ->> 'password_hash' IS DISTINCT FROM to_jsonb(NEW) ->> 'password_hash' THEN
        v_new := v_new || '{"password_changed": true}';
    END IF;
    IF TG_OP = 'UPDATE' AND v_old = v_new THEN RETURN NULL; END IF;
    INSERT INTO audit_log (table_name, row_pk, action, changed_by, old_data, new_data)
    VALUES (TG_TABLE_NAME, coalesce(v_new, v_old) ->> v_pk, left(TG_OP, 1), fn_current_app_user(), v_old, v_new);
    RETURN NULL;
END $$;

CREATE TRIGGER audit_lease     AFTER INSERT OR UPDATE OR DELETE ON lease     FOR EACH ROW EXECUTE FUNCTION trg_audit('lease_id');
CREATE TRIGGER audit_payment   AFTER INSERT OR DELETE           ON payment   FOR EACH ROW EXECUTE FUNCTION trg_audit('payment_id');
CREATE TRIGGER audit_ownership AFTER INSERT OR UPDATE OR DELETE ON ownership FOR EACH ROW EXECUTE FUNCTION trg_audit('ownership_id');
CREATE TRIGGER audit_unit      AFTER UPDATE OR DELETE           ON unit      FOR EACH ROW EXECUTE FUNCTION trg_audit('unit_id');
-- last_login_at changes on every login, so only identity/permission columns are audited
CREATE TRIGGER audit_app_user  AFTER INSERT OR DELETE OR UPDATE OF email, full_name, phone, role, is_active, password_hash
    ON app_user FOR EACH ROW EXECUTE FUNCTION trg_audit('user_id');
CREATE TRIGGER audit_invoice_void AFTER UPDATE OF status ON invoice
    FOR EACH ROW WHEN (NEW.status = 'VOID') EXECUTE FUNCTION trg_audit('invoice_id');
