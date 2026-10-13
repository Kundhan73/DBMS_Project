-- =====================================================================
-- 07_comments.sql  -  catalogue documentation (feeds docs/DATA_DICTIONARY.md)
-- =====================================================================
COMMENT ON TABLE app_user IS 'Login accounts for every role (ADMIN, MANAGER, OWNER, TENANT). Passwords stored only as bcrypt hashes.';
COMMENT ON TABLE complex IS 'An apartment complex (gated community) managed by the system.';
COMMENT ON TABLE complex_manager IS 'M:N assignment of MANAGER users to complexes; drives data scoping for staff.';
COMMENT ON TABLE block IS 'A tower/block inside a complex.';
COMMENT ON TABLE unit IS 'A flat. occupancy_status is maintained by triggers from leases.';
COMMENT ON TABLE owner_profile IS 'Owner-specific attributes (ISA specialisation of app_user).';
COMMENT ON TABLE tenant_profile IS 'Tenant-specific attributes (ISA specialisation of app_user).';
COMMENT ON TABLE ownership IS 'M:N owners-units with share_pct and ownership period (supports joint ownership and resale history).';
COMMENT ON TABLE lease IS 'Rental agreement between a tenant and a unit; no two live leases may overlap on a unit.';
COMMENT ON TABLE parking_slot IS 'A parking slot in a complex (CAR, BIKE or EV charging).';
COMMENT ON TABLE vehicle IS 'A vehicle registered by an owner or tenant.';
COMMENT ON TABLE parking_allocation IS 'Assignment of a slot to a vehicle of a unit for a period, with a monthly charge.';
COMMENT ON TABLE invoice IS 'A bill: RENT, MAINTENANCE, PARKING or LATE_FEE. amount_paid/status kept in sync by payment triggers.';
COMMENT ON TABLE payment IS 'Money received against an invoice. Immutable; reversal = delete (audited).';
COMMENT ON TABLE vendor IS 'Service provider (plumber, electrician, lift AMC, ...).';
COMMENT ON TABLE maintenance_request IS 'A complaint/work order raised for a unit, with workflow status and costs. search_tsv powers full-text search.';
COMMENT ON TABLE request_embedding IS 'Vector store: 384-d MiniLM embedding of each request''s title + description (pgvector, HNSW cosine index).';
COMMENT ON TABLE maintenance_status_history IS 'Every status change of a request, written by trigger.';
COMMENT ON TABLE audit_log IS 'Generic change log written by triggers (who, when, old/new row as JSONB).';

COMMENT ON COLUMN unit.occupancy_status IS 'VACANT | OWNER_OCCUPIED | LEASED | UNDER_MAINTENANCE; LEASED is derived from active leases';
COMMENT ON COLUMN lease.rent_due_day IS 'Day of month rent falls due (1-28)';
COMMENT ON COLUMN invoice.billing_month IS 'First day of the month being billed';
COMMENT ON COLUMN invoice.source_invoice_id IS 'For LATE_FEE: the overdue invoice it penalises';
COMMENT ON COLUMN request_embedding.source_hash IS 'md5 of the embedded text; a mismatch means the vector is stale';
COMMENT ON COLUMN request_embedding.embedding IS 'L2-normalised 384-d vector (sentence-transformers/all-MiniLM-L6-v2)';
COMMENT ON COLUMN maintenance_request.search_tsv IS 'Generated tsvector: title weight A, description weight B';
COMMENT ON COLUMN app_user.password_hash IS 'bcrypt hash (cost 10); CHECK rejects anything else';
