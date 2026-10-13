-- =====================================================================
-- 00_extensions.sql
-- Extensions required by the schema.
--   vector      : pgvector, stores 384-dim embeddings of maintenance requests
--   btree_gist  : lets EXCLUDE constraints mix equality (unit_id) with
--                 range overlap (lease period), used to block double leasing
--   pg_trgm     : trigram similarity for fuzzy name / unit-number lookups
-- Run as a superuser (or a role allowed to create these extensions).
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
