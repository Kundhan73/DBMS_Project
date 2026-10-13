# Data dictionary

Generated from the PostgreSQL catalogue by `scripts/gen-data-dictionary.py`. Types shown are the declared types; `email_address`, `phone_in` and `money_inr` are validating domains (see `db/01_schema.sql`).

## app_user

Login accounts for every role (ADMIN, MANAGER, OWNER, TENANT). Passwords stored only as bcrypt hashes.

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| user_id | bigint |  | PK | identity |
| email | email_address |  |  |  |
| password_hash | text |  |  | bcrypt hash (cost 10); CHECK rejects anything else |
| full_name | character varying(100) |  |  |  |
| phone | phone_in | yes |  |  |
| role | character varying(10) |  |  |  |
| is_active | boolean |  |  | default true |
| created_at | timestamp with time zone |  |  | default now() |
| last_login_at | timestamp with time zone | yes |  |  |

**Constraints**

- `chk_password_bcrypt` (CHECK): `CHECK ((password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'::text))`
- `chk_user_name` (CHECK): `CHECK ((length(btrim((full_name)::text)) >= 2))`
- `chk_user_role` (CHECK): `CHECK (((role)::text = ANY ((ARRAY['ADMIN'::character varying, 'MANAGER'::character varying, 'OWNER'::character varying, 'TENANT'::character varying])::text[])))`

**Indexes**

- `idx_app_user_name_trgm`: `gin (full_name gin_trgm_ops)`
- `idx_app_user_role`: `btree (role) WHERE is_active`
- `uq_app_user_email_lower`: `btree (lower((email)::text))`

**Triggers**: `audit_app_user`

## complex

An apartment complex (gated community) managed by the system.

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| complex_id | integer |  | PK | identity |
| name | character varying(80) |  |  |  |
| address_line | character varying(200) |  |  |  |
| locality | character varying(80) |  |  |  |
| city | character varying(60) |  |  | default 'Bengaluru'::character varying |
| pincode | character(6) |  |  |  |
| established_year | smallint |  |  |  |
| created_at | timestamp with time zone |  |  | default now() |
| amenities | text[] |  |  | default '{}'::text[] |

**Constraints**

- `chk_complex_pincode` (CHECK): `CHECK ((pincode ~ '^[1-9][0-9]{5}$'::text))`
- `chk_complex_year` (CHECK): `CHECK (((established_year >= 1950) AND (established_year <= 2100)))`
- `complex_name_key` (UNIQUE): `UNIQUE (name)`

**Indexes**

- `complex_name_key`: `btree (name)`

## complex_manager

M:N assignment of MANAGER users to complexes; drives data scoping for staff.

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| complex_id | integer |  | PK FK→complex |  |
| manager_user_id | bigint |  | PK FK→app_user |  |
| assigned_on | date |  |  | default CURRENT_DATE |

**Triggers**: `complex_manager_role`

## block

A tower/block inside a complex.

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| block_id | integer |  | PK | identity |
| complex_id | integer |  | FK→complex |  |
| name | character varying(20) |  |  |  |
| total_floors | smallint |  |  |  |

**Constraints**

- `chk_block_floors` (CHECK): `CHECK (((total_floors >= 1) AND (total_floors <= 60)))`
- `uq_block_name` (UNIQUE): `UNIQUE (complex_id, name)`

**Indexes**

- `idx_block_complex`: `btree (complex_id)`
- `uq_block_name`: `btree (complex_id, name)`

## unit

A flat. occupancy_status is maintained by triggers from leases.

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| unit_id | integer |  | PK | identity |
| block_id | integer |  | FK→block |  |
| unit_number | character varying(10) |  |  |  |
| floor_no | smallint |  |  |  |
| unit_type | character varying(6) |  |  |  |
| carpet_area_sqft | numeric(7,1) |  |  |  |
| base_rent | money_inr |  |  |  |
| monthly_maintenance | money_inr |  |  |  |
| occupancy_status | character varying(20) |  |  | default 'VACANT'::character varying; VACANT | OWNER_OCCUPIED | LEASED | UNDER_MAINTENANCE; LEASED is derived from active leases |
| facing | character varying(2) | yes |  |  |

**Constraints**

- `chk_unit_area` (CHECK): `CHECK (((carpet_area_sqft >= (200)::numeric) AND (carpet_area_sqft <= (10000)::numeric)))`
- `chk_unit_facing` (CHECK): `CHECK (((facing IS NULL) OR ((facing)::text = ANY ((ARRAY['N'::character varying, 'S'::character varying, 'E'::character varying, 'W'::character varying, 'NE'::character varying, 'NW'::character varying, 'SE'::character varying, 'SW'::character varying])::text[]))))`
- `chk_unit_floor` (CHECK): `CHECK ((floor_no >= 0))`
- `chk_unit_status` (CHECK): `CHECK (((occupancy_status)::text = ANY ((ARRAY['VACANT'::character varying, 'OWNER_OCCUPIED'::character varying, 'LEASED'::character varying, 'UNDER_MAINTENANCE'::character varying])::text[])))`
- `chk_unit_type` (CHECK): `CHECK (((unit_type)::text = ANY ((ARRAY['STUDIO'::character varying, '1BHK'::character varying, '2BHK'::character varying, '3BHK'::character varying, '4BHK'::character varying])::text[])))`
- `uq_unit_number` (UNIQUE): `UNIQUE (block_id, unit_number)`

**Indexes**

- `idx_unit_block`: `btree (block_id)`
- `idx_unit_status`: `btree (occupancy_status)`
- `uq_unit_number`: `btree (block_id, unit_number)`

**Triggers**: `audit_unit`, `unit_floor_check`

## owner_profile

Owner-specific attributes (ISA specialisation of app_user).

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| owner_id | integer |  | PK | identity |
| user_id | bigint |  | FK→app_user |  |
| mailing_address | character varying(200) |  |  |  |
| is_nri | boolean |  |  | default false |

**Constraints**

- `owner_profile_user_id_key` (UNIQUE): `UNIQUE (user_id)`

**Indexes**

- `owner_profile_user_id_key`: `btree (user_id)`

**Triggers**: `owner_profile_role`

## tenant_profile

Tenant-specific attributes (ISA specialisation of app_user).

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| tenant_id | integer |  | PK | identity |
| user_id | bigint |  | FK→app_user |  |
| occupation | character varying(80) | yes |  |  |
| employer | character varying(100) | yes |  |  |
| family_size | smallint |  |  | default 1 |
| emergency_contact_name | character varying(100) |  |  |  |
| emergency_contact_phone | phone_in |  |  |  |

**Constraints**

- `chk_tenant_family` (CHECK): `CHECK (((family_size >= 1) AND (family_size <= 15)))`
- `tenant_profile_user_id_key` (UNIQUE): `UNIQUE (user_id)`

**Indexes**

- `tenant_profile_user_id_key`: `btree (user_id)`

**Triggers**: `tenant_profile_role`

## ownership

M:N owners-units with share_pct and ownership period (supports joint ownership and resale history).

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| ownership_id | integer |  | PK | identity |
| unit_id | integer |  | FK→unit |  |
| owner_id | integer |  | FK→owner_profile |  |
| share_pct | numeric(5,2) |  |  | default 100 |
| owned_from | date |  |  |  |
| owned_until | date | yes |  |  |

**Constraints**

- `chk_ownership_dates` (CHECK): `CHECK (((owned_until IS NULL) OR (owned_until > owned_from)))`
- `chk_ownership_share` (CHECK): `CHECK (((share_pct > (0)::numeric) AND (share_pct <= (100)::numeric)))`
- `ex_ownership_overlap` (EXCLUDE): `EXCLUDE USING gist (unit_id WITH =, owner_id WITH =, daterange(owned_from, owned_until, '[)'::text) WITH &&)`

**Indexes**

- `ex_ownership_overlap`: `gist (unit_id, owner_id, daterange(owned_from, owned_until, '[)'::text))`
- `idx_ownership_owner`: `btree (owner_id)`
- `idx_ownership_unit_live`: `btree (unit_id) WHERE (owned_until IS NULL)`

**Triggers**: `audit_ownership`, `ownership_share_check`

## lease

Rental agreement between a tenant and a unit; no two live leases may overlap on a unit.

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| lease_id | integer |  | PK | identity |
| unit_id | integer |  | FK→unit |  |
| tenant_id | integer |  | FK→tenant_profile |  |
| start_date | date |  |  |  |
| end_date | date |  |  |  |
| monthly_rent | money_inr |  |  |  |
| security_deposit | money_inr |  |  | default 0 |
| rent_due_day | smallint |  |  | default 5; Day of month rent falls due (1-28) |
| status | character varying(10) |  |  | default 'ACTIVE'::character varying |
| terminated_on | date | yes |  |  |
| termination_reason | character varying(300) | yes |  |  |
| created_by | bigint | yes | FK→app_user |  |
| created_at | timestamp with time zone |  |  | default now() |

**Constraints**

- `chk_lease_dates` (CHECK): `CHECK ((end_date > start_date))`
- `chk_lease_deposit` (CHECK): `CHECK (((security_deposit)::numeric <= ((monthly_rent)::numeric * (10)::numeric)))`
- `chk_lease_due_day` (CHECK): `CHECK (((rent_due_day >= 1) AND (rent_due_day <= 28)))`
- `chk_lease_rent` (CHECK): `CHECK (((monthly_rent)::numeric > (0)::numeric))`
- `chk_lease_status` (CHECK): `CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACTIVE'::character varying, 'ENDED'::character varying, 'TERMINATED'::character varying])::text[])))`
- `chk_lease_termination` (CHECK): `CHECK (((((status)::text = 'TERMINATED'::text) = (terminated_on IS NOT NULL)) AND ((terminated_on IS NULL) OR ((terminated_on >= start_date) AND (terminated_on <= end_date)))))`
- `ex_lease_no_overlap` (EXCLUDE): `EXCLUDE USING gist (unit_id WITH =, daterange(start_date, end_date, '[)'::text) WITH &&) WHERE (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACTIVE'::character varying])::text[])))`

**Indexes**

- `ex_lease_no_overlap`: `gist (unit_id, daterange(start_date, end_date, '[)'::text)) WHERE ((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACTIVE'::character varying])::text[]))`
- `idx_lease_tenant`: `btree (tenant_id)`
- `idx_lease_unit_status`: `btree (unit_id, status)`

**Triggers**: `audit_lease`, `lease_sync_unit`, `lease_validate`

## invoice

A bill: RENT, MAINTENANCE, PARKING or LATE_FEE. amount_paid/status kept in sync by payment triggers.

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| invoice_id | bigint |  | PK | identity |
| unit_id | integer |  | FK→unit |  |
| billed_to | bigint |  | FK→app_user |  |
| invoice_type | character varying(12) |  |  |  |
| lease_id | integer | yes | FK→lease |  |
| parking_allocation_id | integer | yes | FK→parking_allocation |  |
| source_invoice_id | bigint | yes | FK→invoice | For LATE_FEE: the overdue invoice it penalises |
| billing_month | date |  |  | First day of the month being billed |
| amount | money_inr |  |  |  |
| amount_paid | money_inr |  |  | default 0 |
| issued_on | date |  |  | default CURRENT_DATE |
| due_date | date |  |  |  |
| status | character varying(8) |  |  | default 'UNPAID'::character varying |
| notes | character varying(200) | yes |  |  |

**Constraints**

- `chk_inv_amount` (CHECK): `CHECK ((((amount)::numeric > (0)::numeric) AND ((amount_paid)::numeric <= (amount)::numeric)))`
- `chk_inv_due` (CHECK): `CHECK ((due_date >= billing_month))`
- `chk_inv_links` (CHECK): `CHECK (((((invoice_type)::text = 'RENT'::text) AND (lease_id IS NOT NULL) AND (parking_allocation_id IS NULL) AND (source_invoice_id IS NULL)) OR (((invoice_type)::text = 'MAINTENANCE'::text) AND (lease_id IS NULL) AND (parking_allocation_id IS NULL) AND (source_invoice_id IS NULL)) OR (((invoice_type)::text = 'PARKING'::text) AND (parking_allocation_id IS NOT NULL) AND (source_invoice_id IS NULL)) OR (((invoice_type)::text = 'LATE_FEE'::text) AND (source_invoice_id IS NOT NULL))))`
- `chk_inv_month` (CHECK): `CHECK ((billing_month = (date_trunc('month'::text, (billing_month)::timestamp with time zone))::date))`
- `chk_inv_status` (CHECK): `CHECK (((status)::text = ANY ((ARRAY['UNPAID'::character varying, 'PARTIAL'::character varying, 'PAID'::character varying, 'VOID'::character varying])::text[])))`
- `chk_inv_status_paid` (CHECK): `CHECK ((((status)::text = 'VOID'::text) OR (((status)::text = 'UNPAID'::text) AND ((amount_paid)::numeric = (0)::numeric)) OR (((status)::text = 'PARTIAL'::text) AND ((amount_paid)::numeric > (0)::numeric) AND ((amount_paid)::numeric < (amount)::numeric)) OR (((status)::text = 'PAID'::text) AND ((amount_paid)::numeric = (amount)::numeric))))`
- `chk_inv_type` (CHECK): `CHECK (((invoice_type)::text = ANY ((ARRAY['RENT'::character varying, 'MAINTENANCE'::character varying, 'PARKING'::character varying, 'LATE_FEE'::character varying])::text[])))`

**Indexes**

- `idx_invoice_billed_to`: `btree (billed_to, billing_month DESC)`
- `idx_invoice_open_due`: `btree (due_date) WHERE ((status)::text = ANY ((ARRAY['UNPAID'::character varying, 'PARTIAL'::character varying])::text[]))`
- `idx_invoice_unit_month`: `btree (unit_id, billing_month)`
- `uq_invoice_late_fee`: `btree (source_invoice_id) WHERE (((invoice_type)::text = 'LATE_FEE'::text) AND ((status)::text <> 'VOID'::text))`
- `uq_invoice_maint`: `btree (unit_id, billing_month) WHERE (((invoice_type)::text = 'MAINTENANCE'::text) AND ((status)::text <> 'VOID'::text))`
- `uq_invoice_parking`: `btree (parking_allocation_id, billing_month) WHERE (((invoice_type)::text = 'PARKING'::text) AND ((status)::text <> 'VOID'::text))`
- `uq_invoice_rent`: `btree (lease_id, billing_month) WHERE (((invoice_type)::text = 'RENT'::text) AND ((status)::text <> 'VOID'::text))`

**Triggers**: `audit_invoice_void`, `invoice_guard`

## payment

Money received against an invoice. Immutable; reversal = delete (audited).

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| payment_id | bigint |  | PK | identity |
| invoice_id | bigint |  | FK→invoice |  |
| amount | money_inr |  |  |  |
| paid_at | timestamp with time zone |  |  | default now() |
| method | character varying(13) |  |  |  |
| reference_no | character varying(40) |  |  |  |
| recorded_by | bigint | yes | FK→app_user |  |

**Constraints**

- `chk_pay_amount` (CHECK): `CHECK (((amount)::numeric > (0)::numeric))`
- `chk_pay_method` (CHECK): `CHECK (((method)::text = ANY ((ARRAY['UPI'::character varying, 'CARD'::character varying, 'BANK_TRANSFER'::character varying, 'CASH'::character varying, 'CHEQUE'::character varying])::text[])))`
- `payment_reference_no_key` (UNIQUE): `UNIQUE (reference_no)`

**Indexes**

- `idx_payment_invoice`: `btree (invoice_id)`
- `idx_payment_paid_at`: `btree (paid_at)`
- `payment_reference_no_key`: `btree (reference_no)`

**Triggers**: `audit_payment`, `payment_after_change`, `payment_before_insert`, `payment_block_update`

## parking_slot

A parking slot in a complex (CAR, BIKE or EV charging).

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| slot_id | integer |  | PK | identity |
| complex_id | integer |  | FK→complex |  |
| slot_code | character varying(10) |  |  |  |
| level | character varying(4) |  |  |  |
| slot_type | character varying(4) |  |  |  |
| is_covered | boolean |  |  | default true |

**Constraints**

- `chk_slot_level` (CHECK): `CHECK (((level)::text = ANY ((ARRAY['B2'::character varying, 'B1'::character varying, 'G'::character varying, 'OPEN'::character varying])::text[])))`
- `chk_slot_type` (CHECK): `CHECK (((slot_type)::text = ANY ((ARRAY['CAR'::character varying, 'BIKE'::character varying, 'EV'::character varying])::text[])))`
- `uq_slot_code` (UNIQUE): `UNIQUE (complex_id, slot_code)`

**Indexes**

- `idx_parking_slot_complex`: `btree (complex_id, slot_type)`
- `uq_slot_code`: `btree (complex_id, slot_code)`

## vehicle

A vehicle registered by an owner or tenant.

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| vehicle_id | integer |  | PK | identity |
| owner_user_id | bigint |  | FK→app_user |  |
| registration_no | character varying(12) |  |  |  |
| vehicle_type | character varying(4) |  |  |  |
| is_electric | boolean |  |  | default false |
| make_model | character varying(60) | yes |  |  |

**Constraints**

- `chk_vehicle_reg` (CHECK): `CHECK (((registration_no)::text ~ '^[A-Z]{2}[0-9]{2}[A-Z]{0,3}[0-9]{4}$'::text))`
- `chk_vehicle_type` (CHECK): `CHECK (((vehicle_type)::text = ANY ((ARRAY['CAR'::character varying, 'BIKE'::character varying])::text[])))`
- `vehicle_registration_no_key` (UNIQUE): `UNIQUE (registration_no)`

**Indexes**

- `idx_vehicle_owner`: `btree (owner_user_id)`
- `vehicle_registration_no_key`: `btree (registration_no)`

## parking_allocation

Assignment of a slot to a vehicle of a unit for a period, with a monthly charge.

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| allocation_id | integer |  | PK | identity |
| slot_id | integer |  | FK→parking_slot |  |
| unit_id | integer |  | FK→unit |  |
| vehicle_id | integer |  | FK→vehicle |  |
| start_date | date |  |  |  |
| end_date | date | yes |  |  |
| monthly_charge | money_inr |  |  | default 0 |

**Constraints**

- `chk_alloc_dates` (CHECK): `CHECK (((end_date IS NULL) OR (end_date > start_date)))`
- `ex_slot_overlap` (EXCLUDE): `EXCLUDE USING gist (slot_id WITH =, daterange(start_date, end_date, '[)'::text) WITH &&)`
- `ex_vehicle_overlap` (EXCLUDE): `EXCLUDE USING gist (vehicle_id WITH =, daterange(start_date, end_date, '[)'::text) WITH &&)`

**Indexes**

- `ex_slot_overlap`: `gist (slot_id, daterange(start_date, end_date, '[)'::text))`
- `ex_vehicle_overlap`: `gist (vehicle_id, daterange(start_date, end_date, '[)'::text))`
- `idx_alloc_unit`: `btree (unit_id)`

**Triggers**: `parking_allocation_check`

## vendor

Service provider (plumber, electrician, lift AMC, ...).

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| vendor_id | integer |  | PK | identity |
| name | character varying(100) |  |  |  |
| service_category | character varying(14) |  |  |  |
| phone | phone_in |  |  |  |
| email | email_address | yes |  |  |
| rating | numeric(2,1) | yes |  | default 3.5 |
| is_active | boolean |  |  | default true |

**Constraints**

- `chk_vendor_rating` (CHECK): `CHECK (((rating IS NULL) OR ((rating >= (0)::numeric) AND (rating <= (5)::numeric))))`
- `vendor_name_key` (UNIQUE): `UNIQUE (name)`

**Indexes**

- `vendor_name_key`: `btree (name)`

## maintenance_request

A complaint/work order raised for a unit, with workflow status and costs. search_tsv powers full-text search.

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| request_id | bigint |  | PK | identity |
| unit_id | integer |  | FK→unit |  |
| raised_by | bigint |  | FK→app_user |  |
| category | character varying(14) |  |  |  |
| title | character varying(120) |  |  |  |
| description | text |  |  |  |
| priority | character varying(6) |  |  | default 'MEDIUM'::character varying |
| status | character varying(11) |  |  | default 'OPEN'::character varying |
| vendor_id | integer | yes | FK→vendor |  |
| estimated_cost | money_inr | yes |  |  |
| actual_cost | money_inr | yes |  |  |
| created_at | timestamp with time zone |  |  | default now() |
| assigned_at | timestamp with time zone | yes |  |  |
| resolved_at | timestamp with time zone | yes |  |  |
| resolution_notes | text | yes |  |  |
| tenant_rating | smallint | yes |  |  |
| search_tsv | tsvector | yes |  | generated (stored); Generated tsvector: title weight A, description weight B |
| is_common_area | boolean |  |  | default false |

**Constraints**

- `chk_mr_category` (CHECK): `CHECK (((category)::text = ANY ((ARRAY['PLUMBING'::character varying, 'ELECTRICAL'::character varying, 'CARPENTRY'::character varying, 'APPLIANCE'::character varying, 'PEST_CONTROL'::character varying, 'LIFT'::character varying, 'SECURITY'::character varying, 'CLEANING'::character varying, 'PAINTING'::character varying, 'INTERNET'::character varying, 'OTHER'::character varying])::text[])))`
- `chk_mr_desc` (CHECK): `CHECK ((length(btrim(description)) >= 15))`
- `chk_mr_priority` (CHECK): `CHECK (((priority)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'URGENT'::character varying])::text[])))`
- `chk_mr_rating` (CHECK): `CHECK (((tenant_rating IS NULL) OR (((tenant_rating >= 1) AND (tenant_rating <= 5)) AND ((status)::text = ANY ((ARRAY['RESOLVED'::character varying, 'CLOSED'::character varying])::text[])))))`
- `chk_mr_resolved` (CHECK): `CHECK ((((status)::text = ANY ((ARRAY['RESOLVED'::character varying, 'CLOSED'::character varying])::text[])) = (resolved_at IS NOT NULL)))`
- `chk_mr_status` (CHECK): `CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'ASSIGNED'::character varying, 'IN_PROGRESS'::character varying, 'RESOLVED'::character varying, 'CLOSED'::character varying, 'CANCELLED'::character varying])::text[])))`
- `chk_mr_times` (CHECK): `CHECK (((resolved_at IS NULL) OR (resolved_at >= created_at)))`
- `chk_mr_title` (CHECK): `CHECK ((length(btrim((title)::text)) >= 5))`
- `chk_mr_vendor` (CHECK): `CHECK ((((status)::text <> ALL ((ARRAY['ASSIGNED'::character varying, 'IN_PROGRESS'::character varying, 'RESOLVED'::character varying, 'CLOSED'::character varying])::text[])) OR (vendor_id IS NOT NULL)))`

**Indexes**

- `idx_mr_raised_by`: `btree (raised_by)`
- `idx_mr_search_tsv`: `gin (search_tsv)`
- `idx_mr_status_created`: `btree (status, created_at DESC)`
- `idx_mr_unit`: `btree (unit_id)`
- `idx_mr_vendor`: `btree (vendor_id)`

**Triggers**: `mr_before_write`, `mr_history`, `mr_invalidate_embedding`

## request_embedding

Vector store: 384-d MiniLM embedding of each request's title + description (pgvector, HNSW cosine index).

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| request_id | bigint |  | PK FK→maintenance_request |  |
| model | character varying(80) |  |  |  |
| source_hash | character(32) |  |  | md5 of the embedded text; a mismatch means the vector is stale |
| embedding | vector(384) |  |  | L2-normalised 384-d vector (sentence-transformers/all-MiniLM-L6-v2) |
| embedded_at | timestamp with time zone |  |  | default now() |

**Indexes**

- `idx_request_embedding_hnsw`: `hnsw (embedding vector_cosine_ops) WITH (m='16', ef_construction='64')`

## maintenance_status_history

Every status change of a request, written by trigger.

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| history_id | bigint |  | PK | identity |
| request_id | bigint |  | FK→maintenance_request |  |
| old_status | character varying(11) | yes |  |  |
| new_status | character varying(11) |  |  |  |
| changed_by | bigint | yes | FK→app_user |  |
| changed_at | timestamp with time zone |  |  | default now() |

**Indexes**

- `idx_mr_history_request`: `btree (request_id, changed_at)`

## audit_log

Generic change log written by triggers (who, when, old/new row as JSONB).

| Column | Type | Null | Key | Default / notes |
|---|---|---|---|---|
| audit_id | bigint |  | PK | identity |
| table_name | character varying(40) |  |  |  |
| row_pk | text |  |  |  |
| action | character(1) |  |  |  |
| changed_by | bigint | yes |  |  |
| changed_at | timestamp with time zone |  |  | default now() |
| old_data | jsonb | yes |  |  |
| new_data | jsonb | yes |  |  |

**Constraints**

- `chk_audit_action` (CHECK): `CHECK ((action = ANY (ARRAY['I'::bpchar, 'U'::bpchar, 'D'::bpchar])))`

**Indexes**

- `idx_audit_table_time`: `btree (table_name, changed_at DESC)`

