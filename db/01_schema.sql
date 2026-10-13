-- =====================================================================
-- 01_schema.sql
-- Multi-Complex Apartment Management and Analytics System
-- Core relational schema (PostgreSQL 16).
--
-- Design notes
--   * Surrogate identity keys everywhere; natural keys enforced with UNIQUE.
--   * Enumerations are CHECK constraints so they can be extended with ALTER.
--   * Reusable validation lives in DOMAINs (email, phone, money).
--   * Rules that span rows or tables (no double-leasing, ownership shares
--     <= 100%, payment <= balance) are enforced by EXCLUDE constraints and
--     triggers in 03_functions_triggers.sql, never only in the app.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Domains: validation that is reused across tables
-- ---------------------------------------------------------------------
CREATE DOMAIN email_address AS varchar(120)
    CHECK (VALUE ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');

-- Indian mobile number, 10 digits starting 6-9
CREATE DOMAIN phone_in AS varchar(10)
    CHECK (VALUE ~ '^[6-9][0-9]{9}$');

-- Rupee amounts, never negative, two decimals
CREATE DOMAIN money_inr AS numeric(12,2)
    CHECK (VALUE >= 0);

-- ---------------------------------------------------------------------
-- Users and roles
-- ---------------------------------------------------------------------
CREATE TABLE app_user (
    user_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email          email_address NOT NULL,
    password_hash  text          NOT NULL,
    full_name      varchar(100)  NOT NULL,
    phone          phone_in,
    role           varchar(10)   NOT NULL,
    is_active      boolean       NOT NULL DEFAULT true,
    created_at     timestamptz   NOT NULL DEFAULT now(),
    last_login_at  timestamptz,
    CONSTRAINT chk_user_role      CHECK (role IN ('ADMIN','MANAGER','OWNER','TENANT')),
    CONSTRAINT chk_user_name      CHECK (length(btrim(full_name)) >= 2),
    -- Only bcrypt hashes are accepted: a plain-text password can never be stored.
    CONSTRAINT chk_password_bcrypt CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$')
);

-- ---------------------------------------------------------------------
-- Physical property hierarchy: complex -> block -> unit
-- ---------------------------------------------------------------------
CREATE TABLE complex (
    complex_id       int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name             varchar(80)  NOT NULL UNIQUE,
    address_line     varchar(200) NOT NULL,
    locality         varchar(80)  NOT NULL,
    city             varchar(60)  NOT NULL DEFAULT 'Bengaluru',
    pincode          char(6)      NOT NULL,
    established_year smallint     NOT NULL,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT chk_complex_pincode CHECK (pincode ~ '^[1-9][0-9]{5}$'),
    CONSTRAINT chk_complex_year    CHECK (established_year BETWEEN 1950 AND 2100)
);

-- Managers (staff) are assigned to one or more complexes: M:N
CREATE TABLE complex_manager (
    complex_id       int    NOT NULL REFERENCES complex(complex_id) ON DELETE CASCADE,
    manager_user_id  bigint NOT NULL REFERENCES app_user(user_id)   ON DELETE CASCADE,
    assigned_on      date   NOT NULL DEFAULT current_date,
    PRIMARY KEY (complex_id, manager_user_id)
);

CREATE TABLE block (
    block_id     int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    complex_id   int         NOT NULL REFERENCES complex(complex_id) ON DELETE CASCADE,
    name         varchar(20) NOT NULL,
    total_floors smallint    NOT NULL,
    CONSTRAINT uq_block_name   UNIQUE (complex_id, name),
    CONSTRAINT chk_block_floors CHECK (total_floors BETWEEN 1 AND 60)
);

CREATE TABLE unit (
    unit_id             int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    block_id            int          NOT NULL REFERENCES block(block_id) ON DELETE CASCADE,
    unit_number         varchar(10)  NOT NULL,
    floor_no            smallint     NOT NULL,
    unit_type           varchar(6)   NOT NULL,
    carpet_area_sqft    numeric(7,1) NOT NULL,
    base_rent           money_inr    NOT NULL,
    monthly_maintenance money_inr    NOT NULL,
    occupancy_status    varchar(20)  NOT NULL DEFAULT 'VACANT',
    CONSTRAINT uq_unit_number    UNIQUE (block_id, unit_number),
    CONSTRAINT chk_unit_floor    CHECK (floor_no >= 0),
    CONSTRAINT chk_unit_type     CHECK (unit_type IN ('STUDIO','1BHK','2BHK','3BHK','4BHK')),
    CONSTRAINT chk_unit_area     CHECK (carpet_area_sqft BETWEEN 200 AND 10000),
    CONSTRAINT chk_unit_status   CHECK (occupancy_status IN ('VACANT','OWNER_OCCUPIED','LEASED','UNDER_MAINTENANCE'))
);

-- ---------------------------------------------------------------------
-- People: role-specific profiles (ISA specialisation of app_user)
-- ---------------------------------------------------------------------
CREATE TABLE owner_profile (
    owner_id         int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          bigint       NOT NULL UNIQUE REFERENCES app_user(user_id) ON DELETE CASCADE,
    mailing_address  varchar(200) NOT NULL,
    is_nri           boolean      NOT NULL DEFAULT false
);

CREATE TABLE tenant_profile (
    tenant_id               int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                 bigint       NOT NULL UNIQUE REFERENCES app_user(user_id) ON DELETE CASCADE,
    occupation              varchar(80),
    employer                varchar(100),
    family_size             smallint     NOT NULL DEFAULT 1,
    emergency_contact_name  varchar(100) NOT NULL,
    emergency_contact_phone phone_in     NOT NULL,
    CONSTRAINT chk_tenant_family CHECK (family_size BETWEEN 1 AND 15)
);

-- An owner can hold many units and a unit can be jointly owned: M:N with attributes
CREATE TABLE ownership (
    ownership_id  int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unit_id       int          NOT NULL REFERENCES unit(unit_id) ON DELETE CASCADE,
    owner_id      int          NOT NULL REFERENCES owner_profile(owner_id) ON DELETE RESTRICT,
    share_pct     numeric(5,2) NOT NULL DEFAULT 100,
    owned_from    date         NOT NULL,
    owned_until   date,
    CONSTRAINT chk_ownership_share CHECK (share_pct > 0 AND share_pct <= 100),
    CONSTRAINT chk_ownership_dates CHECK (owned_until IS NULL OR owned_until > owned_from),
    -- the same owner cannot hold two overlapping ownership records on one unit
    CONSTRAINT ex_ownership_overlap EXCLUDE USING gist (
        unit_id  WITH =,
        owner_id WITH =,
        daterange(owned_from, owned_until, '[)') WITH &&)
);

-- ---------------------------------------------------------------------
-- Leases
-- ---------------------------------------------------------------------
CREATE TABLE lease (
    lease_id           int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unit_id            int         NOT NULL REFERENCES unit(unit_id)            ON DELETE RESTRICT,
    tenant_id          int         NOT NULL REFERENCES tenant_profile(tenant_id) ON DELETE RESTRICT,
    start_date         date        NOT NULL,
    end_date           date        NOT NULL,
    monthly_rent       money_inr   NOT NULL,
    security_deposit   money_inr   NOT NULL DEFAULT 0,
    rent_due_day       smallint    NOT NULL DEFAULT 5,
    status             varchar(10) NOT NULL DEFAULT 'ACTIVE',
    terminated_on      date,
    termination_reason varchar(300),
    created_by         bigint      REFERENCES app_user(user_id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_lease_dates     CHECK (end_date > start_date),
    CONSTRAINT chk_lease_rent      CHECK (monthly_rent > 0),
    -- Karnataka practice caps deposits at 10 months of rent
    CONSTRAINT chk_lease_deposit   CHECK (security_deposit <= monthly_rent * 10),
    CONSTRAINT chk_lease_due_day   CHECK (rent_due_day BETWEEN 1 AND 28),
    CONSTRAINT chk_lease_status    CHECK (status IN ('PENDING','ACTIVE','ENDED','TERMINATED')),
    CONSTRAINT chk_lease_termination CHECK (
        (status = 'TERMINATED') = (terminated_on IS NOT NULL)
        AND (terminated_on IS NULL OR terminated_on BETWEEN start_date AND end_date)),
    -- A unit can never have two live leases whose periods overlap
    CONSTRAINT ex_lease_no_overlap EXCLUDE USING gist (
        unit_id WITH =,
        daterange(start_date, end_date, '[)') WITH &&)
        WHERE (status IN ('PENDING','ACTIVE'))
);

-- ---------------------------------------------------------------------
-- Parking
-- ---------------------------------------------------------------------
CREATE TABLE parking_slot (
    slot_id     int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    complex_id  int         NOT NULL REFERENCES complex(complex_id) ON DELETE CASCADE,
    slot_code   varchar(10) NOT NULL,
    level       varchar(4)  NOT NULL,
    slot_type   varchar(4)  NOT NULL,
    is_covered  boolean     NOT NULL DEFAULT true,
    CONSTRAINT uq_slot_code   UNIQUE (complex_id, slot_code),
    CONSTRAINT chk_slot_type  CHECK (slot_type IN ('CAR','BIKE','EV')),
    CONSTRAINT chk_slot_level CHECK (level IN ('B2','B1','G','OPEN'))
);

CREATE TABLE vehicle (
    vehicle_id       int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_user_id    bigint      NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    registration_no  varchar(12) NOT NULL UNIQUE,
    vehicle_type     varchar(4)  NOT NULL,
    is_electric      boolean     NOT NULL DEFAULT false,
    make_model       varchar(60),
    -- Indian registration format, e.g. KA01AB1234 / KA05M1234
    CONSTRAINT chk_vehicle_reg  CHECK (registration_no ~ '^[A-Z]{2}[0-9]{2}[A-Z]{0,3}[0-9]{4}$'),
    CONSTRAINT chk_vehicle_type CHECK (vehicle_type IN ('CAR','BIKE'))
);

CREATE TABLE parking_allocation (
    allocation_id   int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slot_id         int       NOT NULL REFERENCES parking_slot(slot_id) ON DELETE RESTRICT,
    unit_id         int       NOT NULL REFERENCES unit(unit_id)         ON DELETE CASCADE,
    vehicle_id      int       NOT NULL REFERENCES vehicle(vehicle_id)   ON DELETE RESTRICT,
    start_date      date      NOT NULL,
    end_date        date,
    monthly_charge  money_inr NOT NULL DEFAULT 0,
    CONSTRAINT chk_alloc_dates CHECK (end_date IS NULL OR end_date > start_date),
    -- one vehicle per slot at a time, and one slot per vehicle at a time
    CONSTRAINT ex_slot_overlap EXCLUDE USING gist (
        slot_id WITH =, daterange(start_date, end_date, '[)') WITH &&),
    CONSTRAINT ex_vehicle_overlap EXCLUDE USING gist (
        vehicle_id WITH =, daterange(start_date, end_date, '[)') WITH &&)
);

-- ---------------------------------------------------------------------
-- Billing: invoices and payments
-- ---------------------------------------------------------------------
CREATE TABLE invoice (
    invoice_id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unit_id                int         NOT NULL REFERENCES unit(unit_id) ON DELETE RESTRICT,
    billed_to              bigint      NOT NULL REFERENCES app_user(user_id) ON DELETE RESTRICT,
    invoice_type           varchar(12) NOT NULL,
    lease_id               int         REFERENCES lease(lease_id) ON DELETE RESTRICT,
    parking_allocation_id  int         REFERENCES parking_allocation(allocation_id) ON DELETE RESTRICT,
    source_invoice_id      bigint      REFERENCES invoice(invoice_id) ON DELETE RESTRICT,
    billing_month          date        NOT NULL,
    amount                 money_inr   NOT NULL,
    amount_paid            money_inr   NOT NULL DEFAULT 0,
    issued_on              date        NOT NULL DEFAULT current_date,
    due_date               date        NOT NULL,
    status                 varchar(8)  NOT NULL DEFAULT 'UNPAID',
    notes                  varchar(200),
    CONSTRAINT chk_inv_type    CHECK (invoice_type IN ('RENT','MAINTENANCE','PARKING','LATE_FEE')),
    CONSTRAINT chk_inv_status  CHECK (status IN ('UNPAID','PARTIAL','PAID','VOID')),
    CONSTRAINT chk_inv_month   CHECK (billing_month = date_trunc('month', billing_month)::date),
    CONSTRAINT chk_inv_amount  CHECK (amount > 0 AND amount_paid <= amount),
    CONSTRAINT chk_inv_due     CHECK (due_date >= billing_month),
    -- each invoice type must point at the thing it bills for
    CONSTRAINT chk_inv_links CHECK (
        (invoice_type = 'RENT'        AND lease_id IS NOT NULL AND parking_allocation_id IS NULL AND source_invoice_id IS NULL) OR
        (invoice_type = 'MAINTENANCE' AND lease_id IS NULL     AND parking_allocation_id IS NULL AND source_invoice_id IS NULL) OR
        (invoice_type = 'PARKING'     AND parking_allocation_id IS NOT NULL AND source_invoice_id IS NULL) OR
        (invoice_type = 'LATE_FEE'    AND source_invoice_id IS NOT NULL)),
    -- status must agree with the running paid total
    CONSTRAINT chk_inv_status_paid CHECK (
        status = 'VOID'
        OR (status = 'UNPAID'  AND amount_paid = 0)
        OR (status = 'PARTIAL' AND amount_paid > 0 AND amount_paid < amount)
        OR (status = 'PAID'    AND amount_paid = amount))
);

CREATE TABLE payment (
    payment_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id    bigint      NOT NULL REFERENCES invoice(invoice_id) ON DELETE RESTRICT,
    amount        money_inr   NOT NULL,
    paid_at       timestamptz NOT NULL DEFAULT now(),
    method        varchar(13) NOT NULL,
    reference_no  varchar(40) NOT NULL UNIQUE,
    recorded_by   bigint      REFERENCES app_user(user_id) ON DELETE SET NULL,
    CONSTRAINT chk_pay_amount CHECK (amount > 0),
    CONSTRAINT chk_pay_method CHECK (method IN ('UPI','CARD','BANK_TRANSFER','CASH','CHEQUE'))
);

-- ---------------------------------------------------------------------
-- Maintenance
-- ---------------------------------------------------------------------
CREATE TABLE vendor (
    vendor_id         int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name              varchar(100) NOT NULL UNIQUE,
    service_category  varchar(14)  NOT NULL,
    phone             phone_in     NOT NULL,
    email             email_address,
    rating            numeric(2,1),
    is_active         boolean      NOT NULL DEFAULT true,
    CONSTRAINT chk_vendor_rating CHECK (rating IS NULL OR rating BETWEEN 0 AND 5)
);

CREATE TABLE maintenance_request (
    request_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unit_id           int          NOT NULL REFERENCES unit(unit_id) ON DELETE CASCADE,
    raised_by         bigint       NOT NULL REFERENCES app_user(user_id) ON DELETE RESTRICT,
    category          varchar(14)  NOT NULL,
    title             varchar(120) NOT NULL,
    description       text         NOT NULL,
    priority          varchar(6)   NOT NULL DEFAULT 'MEDIUM',
    status            varchar(11)  NOT NULL DEFAULT 'OPEN',
    vendor_id         int          REFERENCES vendor(vendor_id) ON DELETE SET NULL,
    estimated_cost    money_inr,
    actual_cost       money_inr,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    assigned_at       timestamptz,
    resolved_at       timestamptz,
    resolution_notes  text,
    tenant_rating     smallint,
    -- weighted full-text vector (title ranks higher than description)
    search_tsv tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
        setweight(to_tsvector('english', coalesce(description,'')), 'B')) STORED,
    CONSTRAINT chk_mr_category CHECK (category IN
        ('PLUMBING','ELECTRICAL','CARPENTRY','APPLIANCE','PEST_CONTROL','LIFT',
         'SECURITY','CLEANING','PAINTING','INTERNET','OTHER')),
    CONSTRAINT chk_mr_priority CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
    CONSTRAINT chk_mr_status   CHECK (status IN ('OPEN','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED')),
    CONSTRAINT chk_mr_title    CHECK (length(btrim(title)) >= 5),
    CONSTRAINT chk_mr_desc     CHECK (length(btrim(description)) >= 15),
    CONSTRAINT chk_mr_vendor   CHECK (status NOT IN ('ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED') OR vendor_id IS NOT NULL),
    CONSTRAINT chk_mr_resolved CHECK ((status IN ('RESOLVED','CLOSED')) = (resolved_at IS NOT NULL)),
    CONSTRAINT chk_mr_times    CHECK (resolved_at IS NULL OR resolved_at >= created_at),
    CONSTRAINT chk_mr_rating   CHECK (tenant_rating IS NULL OR (tenant_rating BETWEEN 1 AND 5 AND status IN ('RESOLVED','CLOSED')))
);

-- Vector side of the design: one 384-dim embedding per request.
-- Kept in its own table so the embedding model can change (re-embed)
-- without touching the transactional row, and so stale vectors can be
-- detected via source_hash.
CREATE TABLE request_embedding (
    request_id   bigint       PRIMARY KEY REFERENCES maintenance_request(request_id) ON DELETE CASCADE,
    model        varchar(80)  NOT NULL,
    source_hash  char(32)     NOT NULL,
    embedding    vector(384)  NOT NULL,
    embedded_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_status_history (
    history_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id   bigint      NOT NULL REFERENCES maintenance_request(request_id) ON DELETE CASCADE,
    old_status   varchar(11),
    new_status   varchar(11) NOT NULL,
    changed_by   bigint      REFERENCES app_user(user_id) ON DELETE SET NULL,
    changed_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Audit trail (filled by a generic trigger)
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    audit_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name  varchar(40) NOT NULL,
    row_pk      text        NOT NULL,
    action      char(1)     NOT NULL,
    changed_by  bigint,
    changed_at  timestamptz NOT NULL DEFAULT now(),
    old_data    jsonb,
    new_data    jsonb,
    CONSTRAINT chk_audit_action CHECK (action IN ('I','U','D'))
);
