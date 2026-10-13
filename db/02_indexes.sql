-- =====================================================================
-- 02_indexes.sql
-- Every index here backs a specific query path in the app; the comment
-- next to each one names it. (PK / UNIQUE / EXCLUDE constraints already
-- create their own indexes.)
-- =====================================================================

-- Case-insensitive unique login: 'A@x.com' and 'a@x.com' are the same user
CREATE UNIQUE INDEX uq_app_user_email_lower ON app_user (lower(email));
CREATE INDEX idx_app_user_role ON app_user (role) WHERE is_active;

-- Foreign-key lookups used by joins in views and dashboards
CREATE INDEX idx_block_complex        ON block (complex_id);
CREATE INDEX idx_unit_block           ON unit (block_id);
CREATE INDEX idx_unit_status          ON unit (occupancy_status);
CREATE INDEX idx_ownership_owner      ON ownership (owner_id);
CREATE INDEX idx_ownership_unit_live  ON ownership (unit_id) WHERE owned_until IS NULL;
CREATE INDEX idx_lease_tenant         ON lease (tenant_id);
CREATE INDEX idx_lease_unit_status    ON lease (unit_id, status);
CREATE INDEX idx_parking_slot_complex ON parking_slot (complex_id, slot_type);
CREATE INDEX idx_alloc_unit           ON parking_allocation (unit_id);
CREATE INDEX idx_vehicle_owner        ON vehicle (owner_user_id);

-- Billing: "my invoices", monthly collection reports, dues lists
CREATE INDEX idx_invoice_billed_to    ON invoice (billed_to, billing_month DESC);
CREATE INDEX idx_invoice_unit_month   ON invoice (unit_id, billing_month);
-- Partial index: the dues screen only ever scans open invoices, which are a
-- small fraction of the table once history accumulates
CREATE INDEX idx_invoice_open_due     ON invoice (due_date) WHERE status IN ('UNPAID','PARTIAL');
CREATE INDEX idx_payment_invoice      ON payment (invoice_id);
CREATE INDEX idx_payment_paid_at      ON payment (paid_at);

-- Idempotent billing: the monthly generator relies on these to skip
-- invoices that already exist (INSERT ... ON CONFLICT DO NOTHING)
CREATE UNIQUE INDEX uq_invoice_rent     ON invoice (lease_id, billing_month)
    WHERE invoice_type = 'RENT' AND status <> 'VOID';
CREATE UNIQUE INDEX uq_invoice_maint    ON invoice (unit_id, billing_month)
    WHERE invoice_type = 'MAINTENANCE' AND status <> 'VOID';
CREATE UNIQUE INDEX uq_invoice_parking  ON invoice (parking_allocation_id, billing_month)
    WHERE invoice_type = 'PARKING' AND status <> 'VOID';
CREATE UNIQUE INDEX uq_invoice_late_fee ON invoice (source_invoice_id)
    WHERE invoice_type = 'LATE_FEE' AND status <> 'VOID';

-- Maintenance queue filters (complex/status/priority come via unit join)
CREATE INDEX idx_mr_unit              ON maintenance_request (unit_id);
CREATE INDEX idx_mr_status_created    ON maintenance_request (status, created_at DESC);
CREATE INDEX idx_mr_vendor            ON maintenance_request (vendor_id);
CREATE INDEX idx_mr_raised_by         ON maintenance_request (raised_by);
CREATE INDEX idx_mr_history_request   ON maintenance_status_history (request_id, changed_at);

-- Full-text search over request title + description (GIN on tsvector)
CREATE INDEX idx_mr_search_tsv        ON maintenance_request USING gin (search_tsv);

-- Approximate nearest-neighbour search on embeddings (HNSW, cosine distance)
CREATE INDEX idx_request_embedding_hnsw ON request_embedding
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Fuzzy people search on the admin screens ("sharm" finds "Sharma")
CREATE INDEX idx_app_user_name_trgm   ON app_user USING gin (full_name gin_trgm_ops);

-- Audit browsing
CREATE INDEX idx_audit_table_time     ON audit_log (table_name, changed_at DESC);
