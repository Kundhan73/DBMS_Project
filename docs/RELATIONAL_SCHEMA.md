# Relational schema

Underlined = primary key, *italic* = foreign key (→ referenced table). Generated from the live database.

- **app_user**(<u>user_id</u>, email, password_hash, full_name, phone, role, is_active, created_at, last_login_at)
- **complex**(<u>complex_id</u>, name, address_line, locality, city, pincode, established_year, created_at, amenities)
- **complex_manager**(<u>*complex_id*</u> → complex, <u>*manager_user_id*</u> → app_user, assigned_on)
- **block**(<u>block_id</u>, *complex_id* → complex, name, total_floors)
- **unit**(<u>unit_id</u>, *block_id* → block, unit_number, floor_no, unit_type, carpet_area_sqft, base_rent, monthly_maintenance, occupancy_status, facing)
- **owner_profile**(<u>owner_id</u>, *user_id* → app_user, mailing_address, is_nri)
- **tenant_profile**(<u>tenant_id</u>, *user_id* → app_user, occupation, employer, family_size, emergency_contact_name, emergency_contact_phone)
- **ownership**(<u>ownership_id</u>, *unit_id* → unit, *owner_id* → owner_profile, share_pct, owned_from, owned_until)
- **lease**(<u>lease_id</u>, *unit_id* → unit, *tenant_id* → tenant_profile, start_date, end_date, monthly_rent, security_deposit, rent_due_day, status, terminated_on, termination_reason, *created_by* → app_user, created_at)
- **invoice**(<u>invoice_id</u>, *unit_id* → unit, *billed_to* → app_user, invoice_type, *lease_id* → lease, *parking_allocation_id* → parking_allocation, *source_invoice_id* → invoice, billing_month, amount, amount_paid, issued_on, due_date, status, notes)
- **payment**(<u>payment_id</u>, *invoice_id* → invoice, amount, paid_at, method, reference_no, *recorded_by* → app_user)
- **parking_slot**(<u>slot_id</u>, *complex_id* → complex, slot_code, level, slot_type, is_covered)
- **vehicle**(<u>vehicle_id</u>, *owner_user_id* → app_user, registration_no, vehicle_type, is_electric, make_model)
- **parking_allocation**(<u>allocation_id</u>, *slot_id* → parking_slot, *unit_id* → unit, *vehicle_id* → vehicle, start_date, end_date, monthly_charge)
- **vendor**(<u>vendor_id</u>, name, service_category, phone, email, rating, is_active)
- **maintenance_request**(<u>request_id</u>, *unit_id* → unit, *raised_by* → app_user, category, title, description, priority, status, *vendor_id* → vendor, estimated_cost, actual_cost, created_at, assigned_at, resolved_at, resolution_notes, tenant_rating, search_tsv, is_common_area)
- **request_embedding**(<u>*request_id*</u> → maintenance_request, model, source_hash, embedding, embedded_at)
- **maintenance_status_history**(<u>history_id</u>, *request_id* → maintenance_request, old_status, new_status, *changed_by* → app_user, changed_at)
- **audit_log**(<u>audit_id</u>, table_name, row_pk, action, changed_by, changed_at, old_data, new_data)
