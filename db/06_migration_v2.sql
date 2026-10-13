-- =====================================================================
-- 06_migration_v2.sql
-- Schema evolution after the first release (ALTER / DROP in practice).
-- Written to be re-runnable.
-- =====================================================================

-- 1. Units: record which way the flat faces (buyers and tenants ask)
ALTER TABLE unit ADD COLUMN IF NOT EXISTS facing varchar(2);
ALTER TABLE unit DROP CONSTRAINT IF EXISTS chk_unit_facing;
ALTER TABLE unit ADD CONSTRAINT chk_unit_facing
    CHECK (facing IS NULL OR facing IN ('N','S','E','W','NE','NW','SE','SW'));

-- 2. Complexes: amenities list, used as filter chips in the UI
ALTER TABLE complex ADD COLUMN IF NOT EXISTS amenities text[] NOT NULL DEFAULT '{}';

-- 3. Maintenance: distinguish common-area issues (lift, lobby, gym) from
--    in-flat issues; common-area costs are not charged to the flat owner
ALTER TABLE maintenance_request ADD COLUMN IF NOT EXISTS is_common_area boolean NOT NULL DEFAULT false;

-- 4. Vendors default to a neutral rating instead of NULL
ALTER TABLE vendor ALTER COLUMN rating SET DEFAULT 3.5;

-- 5. One-off bulk import of units from the builder's spreadsheet goes
--    through a staging table, validated into `unit`, then the staging
--    table is dropped.
DROP TABLE IF EXISTS staging_unit_import;
CREATE TABLE staging_unit_import (
    complex_name  text,
    block_name    text,
    unit_number   text,
    floor_no      int,
    unit_type     text,
    area_sqft     numeric,
    facing        text
);
-- (COPY staging_unit_import FROM '/path/units.csv' CSV HEADER; then
--  INSERT INTO unit ... SELECT ... FROM staging_unit_import JOIN block ...)
DROP TABLE staging_unit_import;

-- 6. An early prototype view replaced by v_unit_directory
DROP VIEW IF EXISTS v_units_basic;
