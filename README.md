# AptManager: Multi-Complex Apartment Management and Analytics System

A database-driven web application for managing apartments, owners, tenants, leases, payments, parking and maintenance across multiple apartment complexes, with dashboards for occupancy and financial analysis and semantic search over maintenance requests.

DBMS Level 3 project (PES University). **PostgreSQL 16 + pgvector** for data, **Next.js 16** for the web app.

- Project report: [docs/REPORT.md](docs/REPORT.md) · Word version for submission: [docs/DBMS_Project_Report.docx](docs/DBMS_Project_Report.docx)
- Data dictionary: [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) · Relational schema: [docs/RELATIONAL_SCHEMA.md](docs/RELATIONAL_SCHEMA.md)
- Test results: [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) · ER diagrams and architecture: [docs/diagrams](docs/diagrams)
- Running with a hosted database (no local PostgreSQL) and the demo script: [docs/DEMO_SETUP.md](docs/DEMO_SETUP.md)

![Dashboard](docs/screenshots/02-admin-dashboard.png)

## Features

| Area | What it does |
|---|---|
| Property | Complexes → blocks → units, floor-by-floor occupancy map, joint ownership and resale history |
| Leasing | Create leases (overlaps blocked by an `EXCLUDE` constraint), early termination through a stored procedure |
| Billing | Idempotent monthly billing run (rent prorated, maintenance, parking), late fees, part payments, admin payment reversal |
| Parking | CAR / BIKE / EV slot map, allocation rules enforced by trigger, vehicle registration by residents |
| Maintenance | Request workflow enforced by trigger, vendor assignment, costs, ratings, status history |
| Semantic search | Hybrid (keyword + vector, RRF), pure semantic, pure keyword; similar past requests; duplicate detection on creation |
| Analytics | Occupancy, billed vs collected, dues ageing, SLA compliance, 9 SQL reports that display their own SQL |
| Security | 4 roles (Admin, Manager, Owner, Tenant), row-level scoping, bcrypt, HttpOnly JWT cookie, audit log written by triggers |

## Tech stack

| Layer | Choice |
|---|---|
| Database | PostgreSQL 16, extensions `vector` (pgvector ≥ 0.5), `btree_gist`, `pg_trgm` |
| Embeddings | `Xenova/all-MiniLM-L6-v2` (384-d) via `@huggingface/transformers`, run locally in Node |
| Backend | Next.js Route Handlers (`src/app/api`), `pg`, `zod`, `jose`, `bcryptjs` |
| Frontend | Next.js App Router, React 19, Tailwind CSS 4 (design tokens in `src/app/globals.css`, apple.com-inspired styling), Recharts |
| Tests | Vitest (database, vector and API suites) |

## Setup

### 1. Database

Any PostgreSQL 16 with pgvector works. Pick one:

**Docker (easiest)**
```bash
docker compose up -d          # pgvector/pgvector:pg16 on localhost:5432, user/password aptmgr / change-me
```

**Local install (Ubuntu)**
```bash
sudo apt install postgresql-16 postgresql-16-pgvector
sudo -u postgres psql -c "CREATE ROLE aptmgr LOGIN PASSWORD 'change-me';" -c "CREATE DATABASE aptmgr OWNER aptmgr;"
sudo -u postgres psql -d aptmgr -c "CREATE EXTENSION vector; CREATE EXTENSION btree_gist; CREATE EXTENSION pg_trgm;"
```

**Hosted (no local install)**: create a free Neon project and use its connection string (keep `?sslmode=require`). Step-by-step guide, including free app hosting on Render: [docs/DEMO_SETUP.md](docs/DEMO_SETUP.md).

### 2. App

Requires Node.js 20+. No `psql` client is needed; the setup script talks to the database through the Node driver.

```bash
npm install
cp .env.example .env.local       # then edit DATABASE_URL and JWT_SECRET
npm run db:reset                 # builds the schema and loads seed data (~15 s)
npm run dev                      # http://localhost:3000
```

The first semantic search or seed run downloads the embedding model (~90 MB) from Hugging Face and caches it.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@aptmgr.in | Admin@123 |
| Manager (Lakeview + Sunrise) | ravi.manager@aptmgr.in | Password@123 |
| Manager (Palm Grove only) | priya.manager@aptmgr.in | Password@123 |
| Owner (2 flats) | owner@example.com | Password@123 |
| Tenant | tenant@example.com | Password@123 |

Every seeded owner and tenant also uses `Password@123`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run db:setup` | Drop and recreate all database objects from `db/*.sql` |
| `npm run db:seed` | Load 18 months of realistic data and compute embeddings |
| `npm run db:reset` | Both of the above |
| `npm run db:embed` | Embed any maintenance request whose vector is missing or stale |
| `npm run dev` / `npm run build && npm start` | Run the app |
| `npm test` | Database + vector suites, then API suite (API suite needs the app running on port 3000; set `API_BASE_URL` otherwise) |
| `python3 scripts/gen-data-dictionary.py` | Regenerate `docs/DATA_DICTIONARY.md` and `docs/RELATIONAL_SCHEMA.md` from the live catalogue |
| `python3 docs/diagrams/gen_er.py && dot -Tpng docs/diagrams/er_diagram.dot -o docs/diagrams/er_diagram.png` | Regenerate the ER diagram |

The API tests write data (payments, a lease, a request). Run `npm run db:reset` afterwards for a clean demo.

## Project structure

```
db/
  00_extensions.sql          pgvector, btree_gist, pg_trgm
  01_schema.sql              domains, 19 tables, keys, CHECK and EXCLUDE constraints
  02_indexes.sql             B-tree, partial, expression, GIN, trigram, HNSW
  03_functions_triggers.sql  business-rule triggers, history and audit triggers
  04_procedures.sql          billing, late fees, payments, sp_terminate_lease, vector search functions
  05_views.sql               7 views + materialized view for dashboard KPIs
  06_migration_v2.sql        ALTER / DROP schema evolution
  07_comments.sql            COMMENT ON documentation
  99_teardown.sql            DROP everything
scripts/
  seed.ts, embed.ts          seed data and embedding backfill
  db-setup.ts                applies db/*.sql in order
src/
  proxy.ts                   redirects signed-out page requests
  lib/                       db pool + transactions, auth, API wrapper, scoping, embeddings, reports
  app/api/                   REST endpoints (the only code that talks to the database)
  app/(app)/                 pages: dashboard, complexes, units, leases, billing, parking,
                             maintenance, people, reports, audit
  components/                app shell and UI primitives
tests/
  db/                        integrity + vector tests (run in rolled-back transactions)
  api/                       end-to-end API tests
docs/                        report, data dictionary, schema, diagrams, screenshots, test results
```

## Troubleshooting

- **`permission denied to create extension "vector"`**: create the extensions once as a superuser (see Local install), then rerun `npm run db:setup`.
- **`npm install` fails in `onnxruntime-node` trying to reach `api.nuget.org`**: it is fetching optional GPU libraries. Install with `ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm install`.
- **No internet on the server**: place the model files under `<dir>/Xenova/all-MiniLM-L6-v2/` (`config.json`, `tokenizer.json`, `tokenizer_config.json`, `onnx/model.onnx`) and set `TRANSFORMERS_LOCAL_MODEL_PATH=<dir>/`.
