-- =====================================================================
-- 99_teardown.sql
-- Drops every application object so the schema can be rebuilt from
-- scratch. Order matters: views before tables, children before parents.
-- =====================================================================
DROP MATERIALIZED VIEW IF EXISTS mv_complex_kpis;
DROP VIEW IF EXISTS v_vendor_performance, v_maintenance_sla, v_monthly_collections,
                    v_invoice_balance, v_complex_occupancy, v_unit_directory,
                    v_user_complex_scope;

DROP TABLE IF EXISTS audit_log, maintenance_status_history, request_embedding,
                     maintenance_request, vendor, payment, invoice,
                     parking_allocation, vehicle, parking_slot, lease, ownership,
                     tenant_profile, owner_profile, unit, block, complex_manager,
                     complex, app_user CASCADE;

DROP FUNCTION IF EXISTS fn_hybrid_search(text, vector, int, int);
DROP FUNCTION IF EXISTS fn_similar_requests(bigint, int);
DROP FUNCTION IF EXISTS fn_close_expired_leases(date);
DROP PROCEDURE IF EXISTS sp_terminate_lease(int, date, text);
DROP FUNCTION IF EXISTS fn_record_payment(bigint, numeric, text, text, timestamptz);
DROP FUNCTION IF EXISTS fn_apply_late_fees(date, numeric, int);
DROP FUNCTION IF EXISTS fn_generate_monthly_invoices(date);
DROP FUNCTION IF EXISTS fn_refresh_unit_status(int), fn_recalc_invoice(bigint),
                        fn_current_app_user() CASCADE;
DROP FUNCTION IF EXISTS trg_check_user_role(), trg_unit_floor_check(), trg_ownership_share_check(),
                        trg_lease_validate(), trg_lease_sync_unit(), trg_payment_before_insert(),
                        trg_payment_block_update(), trg_payment_after_change(), trg_invoice_guard(),
                        trg_parking_allocation_check(), trg_mr_before_write(), trg_mr_history(),
                        trg_mr_invalidate_embedding(), trg_audit() CASCADE;

DROP DOMAIN IF EXISTS email_address, phone_in, money_inr CASCADE;
