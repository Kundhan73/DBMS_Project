# Multi-Complex Apartment Management and Analytics System

DBMS Experiential Learning, Level 3 Project ·
| | |
|---|---|
| Team | Kundhan Vudutha (PES1UG24AM327) · _Tejas Shetty (PES1UG24AM305)_ |
| Section | F |
| Stack | PostgreSQL 16 + pgvector 0.6 · Next.js 16 (App Router, Route Handlers) · Node.js 22 |
| Database paradigms | Relational (SQL) + Vector (pgvector) + PostgreSQL full-text search |

---

## Contents

1. [Problem statement](#1-problem-statement)
2. [Objectives](#2-objectives)
3. [Scope](#3-scope)
4. [Functional requirements](#4-functional-requirements)
5. [ER diagram](#5-er-diagram)
6. [Relational schema](#6-relational-schema)
7. [Database choice and justification](#7-database-choice-and-justification)
8. [Data dictionary](#8-data-dictionary)
9. [SQL and vector database implementation](#9-sql-and-vector-database-implementation)
10. [Important queries](#10-important-queries)
11. [System architecture](#11-system-architecture)
12. [Application screenshots](#12-application-screenshots)
13. [Testing results](#13-testing-results)
14. [Conclusion and future enhancements](#14-conclusion-and-future-enhancements)
15. [Requirement checklist](#15-requirement-checklist)
16. [Individual contributions](#16-individual-contributions)

---

## 1. Problem statement

Property management firms and resident welfare associations in Bengaluru commonly run several apartment complexes at once. Each complex has blocks and flats; each flat has one or more owners, may be rented to a tenant under an 11-month lease, may hold parking slots, and generates rent, maintenance and parking bills every month. Residents raise a steady stream of repair complaints written in free text.

In practice this information is spread across spreadsheets, WhatsApp groups and paper registers. The consequences are familiar:

- the same flat gets leased twice for overlapping periods, or a parking slot is promised to two cars;
- nobody can say quickly how much rent is overdue in which complex, or which tenants pay late every month;
- a manager handling a new complaint ("water dripping from the roof") cannot find how the same problem was fixed last month, because it was written differently ("seepage from the bathroom ceiling") and keyword search misses it;
- there is no record of who changed a lease or reversed a payment.

The system built here replaces those registers with a single database-backed web application that enforces the rules in the database itself, gives managers occupancy and collection analytics across complexes, gives owners and tenants a self-service portal, and lets staff search maintenance history by meaning rather than by exact words.

## 2. Objectives

1. Model complexes, blocks, units, owners, tenants, leases, invoices, payments, parking and maintenance in a normalised relational schema (3NF).
2. Enforce business rules at the database level: no overlapping leases or slot bookings, joint-ownership shares that never exceed 100%, payments that never exceed the balance, a valid maintenance workflow, and bcrypt-only password storage.
3. Automate recurring operations with stored procedures and functions: monthly billing (idempotent, with proration), late fees, lease termination.
4. Provide dashboards for occupancy, billed vs collected revenue, overdue dues and maintenance SLA compliance, scoped to what each user is allowed to see.
5. Store vector embeddings of maintenance requests and support semantic, keyword and hybrid search, plus "similar past requests" for staff.
6. Provide role-based access for four roles (Admin, Manager, Owner, Tenant) through a Next.js interface that talks to the database only through an API layer.
7. Keep a complete audit trail of sensitive changes.

## 3. Scope

**In scope**

- Multiple complexes, each with blocks, floors and units (seed data: 3 complexes, 7 blocks, 160 units).
- Owner and tenant records, joint ownership and resale history.
- Lease lifecycle: pending, active, ended, early termination.
- Billing: rent (prorated), society maintenance, parking and late fees; part payments; payment reversal by an admin.
- Parking: CAR, BIKE and EV-charging slots, vehicle registration, allocation with monthly charges.
- Maintenance: request creation, vendor assignment, status workflow, costs, resident rating, status history.
- Semantic, keyword and hybrid search over maintenance requests; similar-request recommendations.
- Dashboards, nine analytical reports, audit log.
- Authentication and role-based authorisation.

**Out of scope**

- Real payment gateway integration (payments by residents are simulated and recorded as UPI/card/bank transfer).
- Email/SMS notifications, visitor management, amenity booking.
- Accounting ledgers and GST invoicing.

## 4. Functional requirements

| # | Requirement | Roles |
|---|---|---|
| FR1 | Sign in with email and password; sessions expire after 8 hours; sign out | All |
| FR2 | View a dashboard of occupancy, billed vs collected (12 months), outstanding dues, open requests, SLA compliance and most overdue invoices, filterable by complex | Admin, Manager |
| FR3 | View a personal dashboard of own units, dues, billing history and requests | Owner, Tenant |
| FR4 | Browse complexes and a floor-by-floor unit map with occupancy colours | Admin, Manager |
| FR5 | Search and filter units by complex, status, type, owner or tenant; view unit detail (ownership, leases, parking, billing summary, requests) | All (scoped) |
| FR6 | Change a unit's status (vacant, owner-occupied, under maintenance) | Admin, Manager |
| FR7 | Create a lease for a vacant unit; terminate an active lease early | Admin, Manager |
| FR8 | Run the monthly billing job and apply late fees | Admin |
| FR9 | View invoices with filters (status, type, month, overdue); record cash/cheque payments | Admin, Manager |
| FR10 | Pay own invoices (simulated online payment, part payments allowed) | Owner, Tenant |
| FR11 | Reverse a wrongly recorded payment | Admin |
| FR12 | View parking slot map, allocate and release slots | Admin, Manager |
| FR13 | Register and remove own vehicles; view own slots | Owner, Tenant |
| FR14 | Raise a maintenance request; see possible duplicates immediately | All |
| FR15 | Assign vendor, start, resolve, reopen, cancel requests | Admin, Manager |
| FR16 | Confirm a fix and rate it; cancel an unassigned request; edit an open request | Raiser |
| FR17 | Search requests by meaning (hybrid, semantic, keyword) | All (scoped) |
| FR18 | See similar past requests and how they were fixed | Admin, Manager |
| FR19 | Manage owners and tenants (create, search with typo tolerance, deactivate) | Admin, Manager (deactivate: Admin) |
| FR20 | Run analytical reports and view their SQL | Admin, Manager |
| FR21 | View the audit log | Admin |

Visibility rules: an admin sees everything; a manager sees only the complexes assigned in `complex_manager`; an owner sees units they currently own and invoices billed to them; a tenant sees the units they lease and invoices billed to them.

## 5. ER diagram

### 5.1 Conceptual ER (Chen notation)

Entities are rectangles, relationships are diamonds, cardinalities are on the edges. `OWNER` and `TENANT` are specialisations (ISA) of `APP_USER`. `REQUEST_EMBEDDING` (double border) is the vector-side entity with a 1:1 relationship to `MAINTENANCE_REQUEST`.

![Conceptual ER diagram](diagrams/er_conceptual.png)

Key design decisions visible here:

- **OWNS** is M:N with attributes (`share_pct`, period), so it becomes the `ownership` table. This supports joint ownership and resale history.
- **MANAGES** is M:N (one manager can run two complexes, one complex can have two managers), so it becomes `complex_manager`.
- **ALLOCATED** is a ternary-style relationship between slot, vehicle and unit with a period and a charge, so it becomes `parking_allocation`.
- A lease belongs to exactly one unit and one tenant (1:N from each side).

### 5.2 Logical ER (crow's-foot, generated from the live schema)

Every table with its columns, keys and nullability. Generated by `docs/diagrams/gen_er.py` from `information_schema`, so it always matches the database. SVG version: [er_diagram.svg](diagrams/er_diagram.svg).

![Logical ER diagram](diagrams/er_diagram.png)

## 6. Relational schema

The conversion from the ER model follows the standard rules:

| ER construct | Mapping |
|---|---|
| Strong entity | Table with a surrogate identity primary key (`GENERATED ALWAYS AS IDENTITY`); natural keys kept as `UNIQUE` (e.g. `(block_id, unit_number)`, `registration_no`, `lower(email)`) |
| 1:N relationship | Foreign key on the N side (`block.complex_id`, `unit.block_id`, `lease.unit_id`, `invoice.lease_id`, `payment.invoice_id` ...) |
| M:N relationship with attributes | Separate table (`ownership`, `complex_manager`, `parking_allocation`) |
| ISA specialisation | `app_user` holds common attributes and `role`; `owner_profile` / `tenant_profile` hold role-specific attributes with a `UNIQUE` FK to `app_user` (1:1). A trigger checks the user's role matches the profile table |
| 1:1 weak-ish dependent | `request_embedding.request_id` is both PK and FK to `maintenance_request` |
| Multivalued attribute | `complex.amenities` as `text[]` (display-only list, never queried relationally) |
| Derived attribute | `invoice.amount_paid` and `invoice.status` are maintained by triggers from `payment` (controlled redundancy for fast dues queries); `maintenance_request.search_tsv` is a stored generated column |

Full relational schema (generated): **[RELATIONAL_SCHEMA.md](RELATIONAL_SCHEMA.md)**. Summary:

```
app_user(user_id PK, email, password_hash, full_name, phone, role, is_active, created_at, last_login_at)
complex(complex_id PK, name, address_line, locality, city, pincode, established_year, created_at, amenities)
complex_manager(complex_id PK/FK→complex, manager_user_id PK/FK→app_user, assigned_on)
block(block_id PK, complex_id FK→complex, name, total_floors)
unit(unit_id PK, block_id FK→block, unit_number, floor_no, unit_type, carpet_area_sqft, base_rent,
     monthly_maintenance, occupancy_status, facing)
owner_profile(owner_id PK, user_id FK→app_user UNIQUE, mailing_address, is_nri)
tenant_profile(tenant_id PK, user_id FK→app_user UNIQUE, occupation, employer, family_size,
     emergency_contact_name, emergency_contact_phone)
ownership(ownership_id PK, unit_id FK→unit, owner_id FK→owner_profile, share_pct, owned_from, owned_until)
lease(lease_id PK, unit_id FK→unit, tenant_id FK→tenant_profile, start_date, end_date, monthly_rent,
     security_deposit, rent_due_day, status, terminated_on, termination_reason, created_by FK→app_user, created_at)
parking_slot(slot_id PK, complex_id FK→complex, slot_code, level, slot_type, is_covered)
vehicle(vehicle_id PK, owner_user_id FK→app_user, registration_no UNIQUE, vehicle_type, is_electric, make_model)
parking_allocation(allocation_id PK, slot_id FK→parking_slot, unit_id FK→unit, vehicle_id FK→vehicle,
     start_date, end_date, monthly_charge)
invoice(invoice_id PK, unit_id FK→unit, billed_to FK→app_user, invoice_type, lease_id FK→lease,
     parking_allocation_id FK→parking_allocation, source_invoice_id FK→invoice, billing_month, amount,
     amount_paid, issued_on, due_date, status, notes)
payment(payment_id PK, invoice_id FK→invoice, amount, paid_at, method, reference_no UNIQUE, recorded_by FK→app_user)
vendor(vendor_id PK, name UNIQUE, service_category, phone, email, rating, is_active)
maintenance_request(request_id PK, unit_id FK→unit, raised_by FK→app_user, category, title, description,
     priority, status, vendor_id FK→vendor, estimated_cost, actual_cost, created_at, assigned_at,
     resolved_at, resolution_notes, tenant_rating, search_tsv, is_common_area)
request_embedding(request_id PK/FK→maintenance_request, model, source_hash, embedding vector(384), embedded_at)
maintenance_status_history(history_id PK, request_id FK→maintenance_request, old_status, new_status,
     changed_by FK→app_user, changed_at)
audit_log(audit_id PK, table_name, row_pk, action, changed_by, changed_at, old_data jsonb, new_data jsonb)
```

**Normalisation.** Every non-key attribute depends on the whole key and nothing but the key. Examples of decisions made to reach 3NF:

- Complex and block names are not repeated on `unit`; they are reached through `block_id`.
- Owner and tenant attributes are not columns on `unit` or `lease`; a unit's owners are rows in `ownership`, so joint ownership needs no repeated columns.
- Tenant-specific fields (employer, emergency contact) live in `tenant_profile`, not as nullable columns on `app_user`.
- The one deliberate denormalisation is `invoice.amount_paid`/`status`, which could be derived from `SUM(payment.amount)`. It is kept because the dues screens filter on it constantly, and it cannot drift: only the payment trigger writes it, and a CHECK (`chk_inv_status_paid`) rejects any row where status and paid amount disagree.

## 7. Database choice and justification

The guideline for this project asks that each database be chosen for the nature of the data. The data in this system falls into three kinds.

| Data | Nature | Store | Why |
|---|---|---|---|
| Units, people, ownership, leases, invoices, payments, parking | Highly structured, heavily related, money involved, rules span rows and tables | **PostgreSQL (relational)** | Needs ACID transactions (a payment and its invoice update must succeed together), foreign keys, CHECK and EXCLUDE constraints (no overlapping leases), triggers and joins for reporting. A document store would push these rules into application code. |
| Maintenance request text (title + description) | Unstructured, short free text written by residents in their own words | **pgvector (vector)** | The useful question is "have we seen this problem before?". Residents describe the same fault in different words ("lift not moving" vs "elevator stuck between floors"). Keyword search cannot match those; vector similarity on sentence embeddings can. |
| Same text, exact terms | Keywords, part names, codes ("MCB", "RO membrane") | **PostgreSQL full-text search** (tsvector + GIN) | Embeddings are weaker on exact rare terms. Combining both (hybrid search) gives the best ranking. |

**Why pgvector rather than a separate vector database (Qdrant, Pinecone, Chroma).** The vectors describe rows that already live in PostgreSQL. Keeping them in the same database means:

- the embedding row has a real foreign key with `ON DELETE CASCADE`, so a deleted request can never leave an orphan vector;
- a new request and its embedding are inserted in **one transaction**, so the vector store is never ahead of or behind the relational data;
- a trigger drops the vector when the request text is edited, so stale vectors are impossible;
- a single query can combine vector distance with relational filters (complex, status, the user's access rights) and full-text rank.

With a few thousand requests per year per complex, an HNSW index inside PostgreSQL is far below the scale where a dedicated vector service would pay for its extra operational cost and the two-phase consistency problem it introduces.

**Why MiniLM embeddings computed locally.** `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions) is a small general-purpose sentence model that runs on CPU in the Node.js server through transformers.js and ONNX Runtime. No external API key is needed and residents' complaint text never leaves the server.

## 8. Data dictionary

The complete data dictionary (every column with type, nullability, key, default, and every constraint, index and trigger per table) is generated from the PostgreSQL catalogue: **[DATA_DICTIONARY.md](DATA_DICTIONARY.md)**.

Table summary:

| Table | Purpose | Rows in seed |
|---|---|---|
| app_user | Accounts for all four roles, bcrypt hashes only | 412 |
| complex / block / unit | Property hierarchy | 3 / 7 / 160 |
| complex_manager | Which manager runs which complex | 4 |
| owner_profile / tenant_profile | Role-specific attributes | 156 / 252 |
| ownership | Owners per unit with share and period | 180 |
| lease | Rental agreements | 315 |
| invoice / payment | Billing history for 18 months | ~6,800 / ~6,700 |
| parking_slot / vehicle / parking_allocation | Parking | 258 / 166 / 166 |
| vendor | Service providers | 13 |
| maintenance_request | Complaints and work orders | 340 |
| request_embedding | 384-d vectors (vector side) | 340 |
| maintenance_status_history | Workflow trail | ~1,500 |
| audit_log | Change log | grows with use |

Reusable validation domains:

| Domain | Base type | Rule |
|---|---|---|
| `email_address` | varchar(120) | case-insensitive email pattern |
| `phone_in` | varchar(10) | Indian mobile: `^[6-9][0-9]{9}$` |
| `money_inr` | numeric(12,2) | `>= 0` |

## 9. SQL and vector database implementation

All DDL is in `db/`, applied in order by `npm run db:setup`:

| File | Contents |
|---|---|
| `00_extensions.sql` | `vector` (pgvector), `btree_gist` (for EXCLUDE with `=` and `&&`), `pg_trgm` (fuzzy name search) |
| `01_schema.sql` | Domains, 19 tables, PK/FK/UNIQUE/CHECK/EXCLUDE constraints |
| `02_indexes.sql` | 30 indexes including partial, expression, GIN (tsvector, trigram) and HNSW (vector) |
| `03_functions_triggers.sql` | 14 trigger functions, 21 triggers |
| `04_procedures.sql` | Billing, late fees, payment, termination procedure, expiry job, vector search functions |
| `05_views.sql` | 7 views and 1 materialized view |
| `06_migration_v2.sql` | Schema evolution with `ALTER TABLE ... ADD COLUMN / ADD CONSTRAINT / ALTER COLUMN`, `DROP TABLE`, `DROP VIEW` |
| `07_comments.sql` | `COMMENT ON` catalogue documentation |
| `99_teardown.sql` | `DROP` of every object in dependency order |

### 9.1 CREATE, ALTER, DROP

- `CREATE DOMAIN`, `CREATE TABLE`, `CREATE INDEX`, `CREATE VIEW`, `CREATE MATERIALIZED VIEW`, `CREATE FUNCTION`, `CREATE PROCEDURE`, `CREATE TRIGGER`.
- `06_migration_v2.sql` is a realistic "version 2" migration: it adds `unit.facing` with a new CHECK constraint, `complex.amenities`, `maintenance_request.is_common_area`, changes a column default, creates a staging table for a bulk unit import and drops it afterwards, and drops a superseded view. It is written to be re-runnable (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`).
- `99_teardown.sql` drops materialized views, views, tables, functions, procedures and domains in dependency order.

### 9.2 Constraints (data validation at the database level)

| Rule | Mechanism |
|---|---|
| Valid email, Indian phone number, non-negative money | Domains |
| Passwords must be bcrypt hashes; plain text is impossible | `CHECK (password_hash ~ '^\$2[aby]\$...')` |
| Case-insensitive unique email | Unique expression index on `lower(email)` |
| No two live leases on a unit with overlapping dates | `EXCLUDE USING gist (unit_id WITH =, daterange(start_date, end_date) WITH &&) WHERE status IN ('PENDING','ACTIVE')` |
| No double-booked parking slot, no car in two slots | Two EXCLUDE constraints on `parking_allocation` |
| Deposit at most 10 months' rent; due day 1 to 28; end after start | CHECK on `lease` |
| Each invoice type references the right parent (rent → lease, parking → allocation, late fee → source invoice) | Multi-branch CHECK `chk_inv_links` |
| Invoice status agrees with the paid amount | CHECK `chk_inv_status_paid` |
| Vendor required once a request is assigned; `resolved_at` set iff resolved/closed; rating only after resolution | CHECKs on `maintenance_request` |
| Vehicle registration format (`KA01AB1234`) | CHECK regex |
| One rent invoice per lease per month, etc. (idempotent billing) | Partial unique indexes |

### 9.3 Triggers

| Trigger | Table | What it enforces or maintains |
|---|---|---|
| `owner_profile_role`, `tenant_profile_role`, `complex_manager_role` | profiles | The linked user has the matching role |
| `unit_floor_check` | unit | Floor number is within the block's floor count |
| `ownership_share_check` | ownership | Live shares on a unit total at most 100% (locks the unit row to prevent races) |
| `lease_validate` | lease | Only an owned unit can be leased; closed leases cannot be reactivated |
| `lease_sync_unit` | lease | Keeps `unit.occupancy_status` in step with leases |
| `payment_before_insert` | payment | Locks the invoice (`SELECT ... FOR UPDATE`), rejects overpayment and payments on void invoices |
| `payment_after_change` | payment | Recomputes `invoice.amount_paid` and `status` on insert and delete |
| `payment_block_update` | payment | Payments are immutable |
| `invoice_guard` | invoice | An invoice with payments cannot be voided; a void invoice cannot be reopened |
| `parking_allocation_check` | parking_allocation | Same complex; slot type matches vehicle (EV slots only for electric cars); vehicle belongs to a resident or owner of the unit |
| `mr_before_write` | maintenance_request | Raiser must be connected to the unit; only legal status transitions; timestamps stamped by the database |
| `mr_history` | maintenance_request | Writes every status change to `maintenance_status_history` with the acting user |
| `mr_invalidate_embedding` | maintenance_request | Deletes the stored vector when title or description changes |
| `audit_*` | lease, payment, ownership, unit, app_user, invoice | Generic JSONB audit (password hashes stripped, password changes flagged) |

The acting user is passed from the application with `set_config('app.user_id', $1, true)` at the start of each transaction (equivalent to `SET LOCAL`), so triggers know who made each change without trusting any client-supplied column.

### 9.4 Stored procedures and functions

| Routine | Type | Purpose |
|---|---|---|
| `fn_generate_monthly_invoices(month)` | function | Creates RENT (prorated for partial months), MAINTENANCE (to the majority owner) and PARKING invoices. Idempotent via `ON CONFLICT DO NOTHING` against partial unique indexes; refuses future months |
| `fn_apply_late_fees(as_of, rate, grace)` | function | 2% of the balance (minimum Rs 100) on rent/maintenance invoices overdue beyond the grace period; one per invoice |
| `fn_record_payment(...)` | function | Records a payment and generates a reference; balance checks happen in the trigger |
| `sp_terminate_lease(lease, date, reason)` | **procedure** (`CALL`) | Locks the lease, validates, marks it TERMINATED, voids later unpaid rent, releases the tenant's parking; unit status follows through the lease trigger. All or nothing |
| `fn_close_expired_leases(as_of)` | function | Nightly job: ACTIVE leases past their end date become ENDED |
| `fn_refresh_unit_status(unit)` | function | Derives unit status from leases |
| `fn_recalc_invoice(invoice)` | function | Recomputes paid amount and status |
| `fn_similar_requests(request, k)` | SQL function | k nearest requests by stored embedding |
| `fn_hybrid_search(text, vector, complex, k)` | SQL function | Reciprocal Rank Fusion of vector and full-text rankings |

### 9.5 Transactions

- Every write from the API goes through `withTransaction()` (`src/lib/db.ts`): `BEGIN`, set `app.user_id`, run statements, `COMMIT`, or `ROLLBACK` on any error.
- Creating a maintenance request inserts the request **and** its embedding in one transaction.
- Creating a person inserts `app_user` and the profile in one transaction; a failing profile insert rolls back the user.
- `sp_terminate_lease` performs four dependent updates atomically.
- Concurrency: the payment trigger row-locks the invoice, and the ownership trigger row-locks the unit, so two concurrent requests cannot both pass a balance or share check.

### 9.6 Views and materialized view

| View | Used by |
|---|---|
| `v_user_complex_scope` | Row-level scoping: which complexes each user may see (admin: all; manager: assigned; owner: owned; tenant: leased) |
| `v_unit_directory` | Unit lists and details: location, current owners (LATERAL + `string_agg`), current tenant (LATERAL + `LIMIT 1`) |
| `v_complex_occupancy` | Occupancy counts and percentage per complex (`count(*) FILTER`) |
| `v_invoice_balance` | Balance and days overdue per invoice |
| `v_monthly_collections` | Billed vs collected per complex per month |
| `v_maintenance_sla` | Average resolution time and % within SLA (24h / 72h / 7d / 14d by priority) |
| `v_vendor_performance` | Jobs, average cost, resident rating, turnaround per vendor |
| `mv_complex_kpis` (materialized) | Dashboard KPI strip; refreshed with `REFRESH MATERIALIZED VIEW CONCURRENTLY` (needs its unique index) after billing runs and on demand |

### 9.7 Indexes

Each index backs a specific query (full list in the data dictionary):

- **B-tree** on every foreign key used in joins.
- **Partial**: `idx_invoice_open_due ON invoice(due_date) WHERE status IN ('UNPAID','PARTIAL')`. The dues screen reads only open invoices, a small fraction of the table. Verified with `EXPLAIN`: *Bitmap Index Scan on idx_invoice_open_due*.
- **Partial unique** indexes that make billing idempotent.
- **Expression**: `lower(email)` for case-insensitive login.
- **GIN** on `search_tsv` for full-text search; **GIN trigram** on `full_name` for typo-tolerant people search.
- **HNSW** on `request_embedding.embedding` with `vector_cosine_ops` (m = 16, ef_construction = 64) for nearest-neighbour search. A test asserts the planner uses it.

### 9.8 Vector database / semantic search

| Question from the guidelines | Answer |
|---|---|
| What data is converted into embeddings | Each maintenance request's `title + ". " + description` (for example "Water seeping through bathroom ceiling. There is a wet patch on the ceiling..."). Search queries typed by users are embedded the same way at query time |
| Embedding model | `sentence-transformers/all-MiniLM-L6-v2` (ONNX build `Xenova/all-MiniLM-L6-v2`), run in-process with transformers.js on ONNX Runtime; mean pooling, L2-normalised, 384 dimensions |
| How vectors are stored | `request_embedding(request_id PK/FK, model, source_hash, embedding vector(384), embedded_at)`. `source_hash` is the md5 of the embedded text so stale vectors are detectable; `model` records which model produced it so the store can be re-embedded after a model change (`npm run db:embed` re-embeds anything missing or stale) |
| Index | HNSW, `vector_cosine_ops` |
| Similarity metric | Cosine distance `<=>`; similarity shown to users as `1 - distance`. Vectors are normalised, so cosine and inner product rank identically |
| Retrieval | Three modes. **Semantic**: `ORDER BY embedding <=> $query LIMIT k` with relational filters (complex, user access). **Keyword**: `tsvector @@ tsquery` ranked by `ts_rank_cd`. **Hybrid** (default): `fn_hybrid_search` takes the top 50 from each, fuses them with Reciprocal Rank Fusion (`score = Σ 1/(60 + rank)`), so a request ranked well by both signals rises to the top. Results the user may not see are filtered by the same access predicate as every other endpoint |
| Where it is used | (1) the search box on the Maintenance page; (2) "Similar past requests" on a request's detail page (`fn_similar_requests`, uses the stored vector, no model call); (3) duplicate detection when a request is created (open requests in the same complex with similarity above 0.6 are shown straight away) |

Example that motivates the design (from the tests): the query *"water dripping from the roof"* matches **zero** requests with PostgreSQL full-text search, because no request uses those words together. Semantic search returns five plumbing requests ("Water seeping through bathroom ceiling", "Damp patch spreading on ceiling below toilet", ...). *"insects in the kitchen"* returns "Cockroaches in kitchen cabinets" first although "insect" and "cockroach" share no characters.

## 10. Important queries

Nine analytical queries are available on the Reports page, which shows the SQL beside the result (`src/lib/reports.ts`). A selection:

**Repeat defaulters** (JOIN via view, GROUP BY, HAVING, aggregates)

```sql
SELECT ib.billed_to_name AS resident, ib.complex_name AS complex,
       count(*) AS overdue_invoices, sum(ib.balance) AS outstanding,
       max(ib.days_overdue) AS oldest_days_overdue
  FROM v_invoice_balance ib
 WHERE ib.complex_id = ANY($1) AND ib.days_overdue > 0
 GROUP BY ib.billed_to, ib.billed_to_name, ib.complex_name
HAVING count(*) >= 2
 ORDER BY outstanding DESC;
```

**Leases below market rent** (correlated subquery)

```sql
SELECT d.complex_name, d.block_name || '-' || d.unit_number AS unit, d.unit_type, l.monthly_rent
  FROM lease l JOIN v_unit_directory d ON d.unit_id = l.unit_id
 WHERE l.status = 'ACTIVE'
   AND l.monthly_rent < 0.9 * (SELECT avg(l2.monthly_rent)
                                 FROM lease l2 JOIN v_unit_directory d2 ON d2.unit_id = l2.unit_id
                                WHERE l2.status = 'ACTIVE'
                                  AND d2.complex_id = d.complex_id AND d2.unit_type = d.unit_type);
```

**Leases expiring with no renewal lined up** (NOT EXISTS)

```sql
SELECT d.complex_name, d.unit_number, au.full_name, l.end_date, l.end_date - current_date AS days_left
  FROM lease l JOIN tenant_profile t USING (tenant_id) JOIN app_user au ON au.user_id = t.user_id
  JOIN v_unit_directory d ON d.unit_id = l.unit_id
 WHERE l.status = 'ACTIVE' AND l.end_date <= current_date + 60
   AND NOT EXISTS (SELECT 1 FROM lease nxt WHERE nxt.unit_id = l.unit_id AND nxt.status = 'PENDING')
 ORDER BY l.end_date;
```

**Revenue with subtotals** (GROUP BY ROLLUP, GROUPING())

```sql
SELECT CASE WHEN GROUPING(c.name) = 1 THEN 'ALL COMPLEXES' ELSE c.name END AS complex,
       CASE WHEN GROUPING(i.invoice_type) = 1 THEN 'SUBTOTAL' ELSE i.invoice_type END AS invoice_type,
       sum(i.amount) AS billed, sum(i.amount_paid) AS collected
  FROM invoice i JOIN unit u USING (unit_id) JOIN block b USING (block_id) JOIN complex c USING (complex_id)
 WHERE i.status <> 'VOID' AND i.billing_month >= date_trunc('month', current_date) - interval '5 months'
 GROUP BY ROLLUP (c.name, i.invoice_type);
```

**Collection-rate ranking** (CTE, window functions RANK and LAG)

```sql
WITH m AS (SELECT complex_name, billing_month, collection_pct FROM v_monthly_collections)
SELECT billing_month, complex_name, collection_pct,
       RANK() OVER (PARTITION BY billing_month ORDER BY collection_pct DESC) AS rank_in_month,
       collection_pct - LAG(collection_pct) OVER (PARTITION BY complex_name ORDER BY billing_month) AS change
  FROM m ORDER BY billing_month DESC, rank_in_month;
```

**Hybrid semantic search** (vector + full-text, RRF)

```sql
SELECT * FROM fn_hybrid_search('MCB tripping when geyser is on', $embedding::vector, NULL, 10);
```

Other reports: units with recurring problems (HAVING count >= 3), vendor scorecard (view), owners with multiple flats (GROUP BY/HAVING with LEFT JOIN), parking utilisation (LEFT JOIN + FILTER).

DML used by the application:

| Statement | Where |
|---|---|
| INSERT | users + profiles, leases, payments, vehicles, parking allocations, maintenance requests + embeddings, invoices (billing function) |
| UPDATE | unit status/rent, lease termination, request workflow, invoice status (trigger), user activation |
| DELETE | payment reversal (admin), vehicle removal, erroneous parking allocation, stale embeddings (trigger) |
| SELECT | every list, dashboard and report; JOIN / GROUP BY / HAVING / ORDER BY / subqueries / window functions throughout |

## 11. System architecture

![Architecture](diagrams/architecture.png)

- **Browser**: Next.js client pages. They never touch the database; they call `/api/*` with `fetch`.
- **Next.js server**:
  - `src/proxy.ts` redirects unauthenticated page requests to `/login`.
  - Route handlers under `src/app/api/` form the backend API (30 route files, 38 handlers). Each is wrapped by `api()` in `src/lib/api.ts`, which verifies the session JWT from an HttpOnly cookie, re-checks the account is active, enforces allowed roles, parses input with zod, and turns PostgreSQL errors into HTTP responses (unique violation → 409, EXCLUDE violation → 409, CHECK/trigger violation → 422 with the database's message).
  - `src/lib/scope.ts` holds the row-visibility predicate used by every list query.
  - `src/lib/embeddings.ts` computes embeddings in-process.
  - `src/lib/db.ts` holds the connection pool and the transaction helper. All SQL is parameterised (`$1, $2, ...`); dynamic filters are built with a small `Where` helper that only ever appends placeholders.
- **PostgreSQL 16** holds relational data, vectors and full-text indexes.

**Interface design**

The UI follows the visual language of apple.com, driven by a design-token set (colour ramps, spacing, type scale and hairline shadow) declared in `src/app/globals.css` with Tailwind v4 `@theme`: a light `#f5f5f7` canvas, white tiles with 18px corners, a translucent 48px top navigation bar, pill-shaped buttons in action blue (`#0071e3`), iOS-style segmented controls for filters, large tightly tracked headlines, and the system SF Pro font (Inter is self-hosted as the fallback on non-Apple devices). Chart and status colours come from the same tokens (`src/lib/palette.tsx`). The product mark is an original building glyph; no Apple logos or assets are used.

**Configuration and security**

| Practice | Implementation |
|---|---|
| No hard-coded credentials | `DATABASE_URL`, `JWT_SECRET` read from environment (`.env.local`, git-ignored); `.env.example` documents them |
| Passwords | bcrypt (cost 10); database CHECK rejects non-bcrypt values; audit log never stores hashes |
| Sessions | HS256 JWT, 8-hour expiry, `HttpOnly; SameSite=Lax` cookie (`Secure` in production) |
| Brute force | 5 failed logins per email per 15 minutes; unknown emails take the same time as wrong passwords |
| SQL injection | Parameterised queries only (tested with `'; DROP TABLE unit; --`) |
| CSRF | SameSite cookie plus JSON-only content type for state-changing requests (form posts get 415) |
| Authorisation | Role check per endpoint plus row-level scoping in SQL; deactivated accounts are rejected even with a valid token |
| Headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` |

**Deployment.** The same code runs against a local PostgreSQL 16 or a hosted one. For the demo the database is hosted on Neon (managed PostgreSQL with pgvector) and the app runs either locally or on Render; schema setup and seeding go through the Node `pg` driver, so no database software is installed on the presenting laptop. Steps: `docs/DEMO_SETUP.md`.

## 12. Application screenshots

All screenshots are from the running application on the seed data (`docs/screenshots/`).

| | |
|---|---|
| **Login** with demo accounts ![](screenshots/01-login.png) | **Admin dashboard**: KPIs, billed vs collected, occupancy, maintenance by category, SLA, most overdue ![](screenshots/02-admin-dashboard.png) |
| **Complexes** ![](screenshots/03-complexes.png) | **Floor-by-floor unit map** ![](screenshots/04-complex-layout.png) |
| **Units** with filters ![](screenshots/05-units.png) | **Unit detail** ![](screenshots/06-unit-detail.png) |
| **Leases** ![](screenshots/07-leases.png) | **New lease** form ![](screenshots/08-new-lease-modal.png) |
| **Invoices** with totals and filters ![](screenshots/09-billing-invoices.png) | **Monthly billing run** (stored function) ![](screenshots/10-billing-run-modal.png) |
| **Parking** slot map and utilisation ![](screenshots/11-parking.png) | **Hybrid search**: "water dripping from the roof" ![](screenshots/12-semantic-search.png) |
| **Semantic search**: "lift is not moving" ![](screenshots/12b-semantic-search-lift.png) | **Request detail** with similar past requests and status history ![](screenshots/13-request-detail-similar.png) |
| **People** (typo-tolerant search) ![](screenshots/14-people.png) | **Reports** with SQL shown ![](screenshots/15-reports-defaulters.png) |
| **ROLLUP report** ![](screenshots/16-reports-rollup.png) | **Audit log** written by triggers ![](screenshots/17-audit-log.png) |
| **Tenant dashboard** ![](screenshots/18-tenant-dashboard.png) | **Tenant paying an invoice** ![](screenshots/19-tenant-pay-modal.png) |
| **Tenant raising a request** ![](screenshots/20-tenant-new-request.png) | **Tenant parking** ![](screenshots/21-tenant-parking.png) |
| **Owner dashboard** ![](screenshots/22-owner-dashboard.png) | **Manager dashboard** scoped to one complex ![](screenshots/23-manager-dashboard-scoped.png) |

## 13. Testing results

75 automated tests, all passing. Full list: **[TEST_RESULTS.md](TEST_RESULTS.md)**.

| Suite | What it covers | Tests |
|---|---|---|
| `tests/db/integrity.test.ts` | Domains, CHECK, EXCLUDE, role triggers, ownership shares, lease rules, termination procedure, billing idempotency and proration, payment triggers, late fees, parking rules, maintenance workflow, audit trail, views, materialized view refresh | 37 |
| `tests/db/vector.test.ts` | Every request has a fresh embedding; 384 dimensions and unit norm; wrong dimension rejected; HNSW index used; paraphrase retrieval ("lift is not moving" → LIFT, "insects in the kitchen" → PEST_CONTROL, "cupboard door came off" → CARPENTRY); keyword search misses a paraphrase that vector search finds; hybrid fusion; complex filter; similar-request lookup | 12 |
| `tests/api/api.test.ts` | Login, cookie flags, forged token, page redirect, role denial (403), manager scoping, tenant data isolation, zod validation (400), CSRF (415), SQL injection, constraint errors mapped to 409/422, part payment and overpayment, paying others' invoices, idempotent billing, payment reversal with audit, request lifecycle with embedding and semantic retrieval, illegal transition, lease create/terminate, all reports | 26 |

Database tests run inside transactions that are always rolled back, so they never change the seed data. Expected failures use savepoints and assert the exact SQLSTATE (`23514` check violation, `23P01` exclusion violation, `23505` unique violation, `22000` wrong vector dimension).

Representative test cases:

| ID | Input | Expected | Result |
|---|---|---|---|
| T1 | Insert a lease overlapping an active lease on the same unit | Rejected by `ex_lease_no_overlap` (23P01); API returns 409 "overlaps" | Pass |
| T2 | Pay Rs 1 more than the invoice balance | Rejected by payment trigger; API 422 "exceeds outstanding balance" | Pass |
| T3 | Store password "hunter2" | Rejected by `chk_password_bcrypt` | Pass |
| T4 | Put a bike in a CAR slot | Rejected by parking trigger "cannot hold" | Pass |
| T5 | Move a request OPEN → RESOLVED | Rejected "Invalid status change" | Pass |
| T6 | Run billing for the current month twice | Second run creates 0 invoices | Pass |
| T7 | Lease starting on the 16th of a 30-day month | Rent invoice for 15 days, note "Prorated: 15 of 30 days" | Pass |
| T8 | Terminate a lease on 31 Aug | Lease TERMINATED, Sep rent VOID, parking released, unit VACANT | Pass |
| T9 | Tenant calls `/api/reports` | 403 | Pass |
| T10 | Search "leak from the ceiling in the washroom" | Returns the just-created "Bathroom ceiling is dripping" request | Pass |

## 14. Conclusion and future enhancements

The project shows a working link between database concepts and a usable application. The database is not a passive store: it refuses overlapping leases and double-booked slots, keeps invoice balances consistent under concurrent payments, drives unit status from leases, records every status change and sensitive edit, and makes the monthly billing run safe to repeat. The vector side is justified by a concrete failure of keyword search on resident-written text, and it is kept consistent with the relational data by living in the same database, inside the same transactions.

Future enhancements:

1. **PostgreSQL row-level security** policies keyed on `app.user_id`, so scoping is enforced even for ad-hoc SQL clients.
2. **Scheduled jobs** with `pg_cron` for `fn_generate_monthly_invoices`, `fn_apply_late_fees` and `fn_close_expired_leases`.
3. **Payment gateway** (UPI intent / Razorpay test mode) with webhooks writing to `payment`.
4. **Automatic category and priority suggestion** for new requests from their nearest neighbours' labels (k-NN classification over the existing vectors).
5. **Notifications** (email/WhatsApp) for dues and request updates.
6. **Table partitioning** of `invoice` and `payment` by billing month once history grows to several years.
7. **Multilingual embeddings** (e.g. a Kannada/Hindi capable model) so residents can write complaints in their own language.

## 15. Requirement checklist

| Guideline requirement | Where it is met |
|---|---|
| Unique, non-CRUD real-world problem | Sections 1 and 2; billing engine, analytics, semantic search |
| 2-member team with defined responsibilities | Section 16 |
| SQL (mandatory) + second paradigm | PostgreSQL + pgvector (Option 2), plus full-text search |
| ER diagram → relational schema; entities, attributes, PK, FK, relationships, constraints | Sections 5, 6, 8 |
| Vector component: data model, indexes, embeddings, metadata, retrieval strategy | Section 9.8 |
| DDL: CREATE, ALTER, DROP, keys, constraints, indexes, views | Section 9.1 to 9.7; `db/` |
| DML: INSERT, UPDATE, DELETE, SELECT with JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | Section 10 |
| At least four advanced concepts | Transactions, views + materialized view, stored procedures/functions, triggers, indexing (partial, GIN, HNSW), full-text search, vector similarity search, window functions, ROLLUP, EXCLUDE constraints |
| Next.js web interface with forms, tables, search, filtering, dashboards | Section 12 |
| Backend/API layer; no hard-coded credentials; environment variables | Section 11; `src/app/api`, `.env.example` |
| Authentication, at least 2 roles | 4 roles: Admin, Manager, Owner, Tenant |
| Validation at database level; consistency and integrity | Sections 9.2, 9.3, 9.5 |
| Security; no plain-text passwords or credentials | Section 11 |
| Documentation sections | This report (14 sections) plus data dictionary, schema, test results |
| Git/GitHub with README | Repository root `README.md` |
| Test cases | Section 13 |
| Justification of database choice per data type | Section 7 |

## 16. Individual contributions

| Area | Kundhan Vudutha | _Tejas Shetty_ |
|---|---|---|
| Database design | ER model, property / leasing / billing tables, domains and constraints | Parking, people and maintenance tables, indexes |
| Database logic | Billing function, late fees, payment triggers, `sp_terminate_lease` | Parking and maintenance triggers, audit trigger, views and materialized view |
| Vector search | Embedding pipeline, `request_embedding`, hybrid search function | Similar-request lookup, duplicate detection, search evaluation tests |
| Application | API layer, auth and role scoping, dashboard, billing and maintenance pages | Units, leases, parking, people, reports and audit pages |
| Testing and docs | Database integrity tests, report sections 5 to 10 | API tests, screenshots, report sections 1 to 4 and 11 to 14 |
