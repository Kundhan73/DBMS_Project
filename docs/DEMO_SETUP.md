# Running the demo without a local database

The database runs on **Neon** (free hosted PostgreSQL with pgvector). The app runs either on your laptop or on **Render** (free hosting), so nothing database-related is installed on your machine.

| Option | What runs where | Best for |
|---|---|---|
| A. Neon + laptop | Database on Neon, app with `npm run dev` on your laptop | The demo itself: fast, you control everything |
| B. Neon + Render | Database on Neon, app on Render | A public link you can share or open on any computer |

Set up option A first (you need it to load the data anyway). Option B is optional.

You need Node.js 20 or newer and Git on the laptop. Check with `node -v`.

---

## Step 1. Create the database on Neon (5 minutes, one time)

1. Go to https://neon.tech and sign up (GitHub login works).
2. Create a project: name `aptmgr`, Postgres version **16**, region **AWS Asia Pacific (Singapore)** (closest to Bengaluru).
3. On the project dashboard click **Connect**. Turn **Connection pooling off** and copy the connection string. It looks like:
   ```
   postgresql://neondb_owner:xxxxxxxx@ep-something-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   Keep `?sslmode=require` at the end.

The extensions the project needs (`vector`, `btree_gist`, `pg_trgm`) are all available on Neon. The setup script creates them for you.

## Step 2. Load the schema and data from your laptop (one time)

```bash
git clone https://github.com/Kundhan73/DBMS_Project.git
cd DBMS_Project
npm install
```

Create `.env.local` (copy `.env.example`) and set two values:

```
DATABASE_URL=postgresql://neondb_owner:xxxxxxxx@ep-something-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
JWT_SECRET=any-random-string-at-least-32-characters-long-1234
```

Then:

```bash
npm run db:reset
```

This creates every table, trigger, view and procedure on Neon, loads 18 months of data and computes the 340 embeddings. The first run also downloads the embedding model (about 90 MB), so give it 2 to 4 minutes. It finishes with the demo logins.

You can check the data in Neon's **SQL Editor**, e.g. `SELECT * FROM v_complex_occupancy;`. This is also a good way to show the teacher the database directly.

## Step 3A. Run the app on your laptop

```bash
npm run dev
```

Open http://localhost:3000 and sign in with a demo account (the login page has buttons that fill them in).

For a smoother demo, use the production build instead (pages load instantly instead of compiling on first visit):

```bash
npm run build
npm start
```

## Step 3B (optional). Put the app online with Render

1. Push any changes to GitHub (the repo is already there).
2. Go to https://render.com, sign up with GitHub, click **New → Web Service** and pick `DBMS_Project`.
3. Settings:
   | Field | Value |
   |---|---|
   | Runtime | Node |
   | Build command | `npm ci --include=dev && npm run build` |
   | Start command | `npm start` |
   | Instance type | Free |
4. Under **Environment**, add:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string |
   | `JWT_SECRET` | the same random string |
   | `ONNXRUNTIME_NODE_INSTALL_CUDA` | `skip` |
5. Deploy. You get a URL like `https://dbms-project.onrender.com`.

**Free instances sleep after 15 minutes of no traffic** and take about a minute to wake up. Open the site and run one semantic search **5 minutes before the demo** so the server is awake and the embedding model is loaded.

Vercel is not used because the embedding model runs inside the server (ONNX Runtime), which is too large for Vercel's serverless functions. Render runs a normal Node server, so it works unchanged.

---

## Before the demo: checklist

- [ ] College Wi-Fi sometimes blocks outgoing database connections (port 5432). Test from campus the day before. If it fails, use your phone's hotspot, or use option B (Render talks to Neon, your laptop only needs normal web access).
- [ ] Run `npm run db:reset` the night before so the data looks fresh. Dashboards show "the last 18 months" relative to the day you seed.
- [ ] Neon's free database pauses after 5 minutes idle and wakes on the first query (about 1 second). Nothing to do, just expect the first page to be slightly slower.
- [ ] Keep `docs/screenshots/` open in another tab as a fallback if the network fails completely.

## Suggested demo flow (about 10 minutes)

1. **Login page**, then sign in as **Admin**. Dashboard: occupancy, billed vs collected, SLA table, most overdue invoices.
2. **Complexes → Lakeview Residency**: floor-by-floor map, colour shows occupancy (driven by a trigger on leases).
3. **Leases**: terminate an active lease and show the unit turning vacant and later rent invoices voided (stored procedure `sp_terminate_lease`). Then create a new lease on that vacant unit with **New lease**; the unit turns Leased again.
4. **Billing → Run monthly billing** for the current month: it creates 0 invoices because billing is idempotent. Record a payment larger than the balance: rejected by the payment trigger.
5. **Maintenance**: search "water dripping from the roof" in **Keyword** mode (no results), then **Semantic** (ceiling-leak requests). Open one request to show "Similar past requests".
6. **Reports**: open a report, click **Show SQL**.
7. **Audit log**: every change you just made, written by triggers.
8. Sign out and sign in as **Tenant**: they only see their own flat, invoices and requests. Pay an invoice.
9. Sign in as the **Palm Grove manager** (`priya.manager@aptmgr.in`): dashboard is limited to one complex.
10. In Neon's SQL Editor, show the database rejecting bad data directly, for example a second overlapping lease on an occupied unit:
    ```sql
    INSERT INTO lease (unit_id, tenant_id, start_date, end_date, monthly_rent)
    SELECT unit_id, tenant_id, current_date, current_date + 300, 30000
      FROM lease WHERE status = 'ACTIVE' LIMIT 1;
    -- ERROR: conflicting key value violates exclusion constraint "ex_lease_no_overlap"
    ```
    and `EXPLAIN SELECT * FROM invoice WHERE status IN ('UNPAID','PARTIAL') AND due_date < current_date;` to show the partial index being used.

Run `npm run db:reset` again after the demo if you want clean data back.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm install` hangs or fails in `onnxruntime-node` | Run it with `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` (PowerShell: `$env:ONNXRUNTIME_NODE_INSTALL_CUDA="skip"; npm install`) |
| `getaddrinfo ENOTFOUND` or timeout connecting | Network blocks port 5432; switch network or use Render |
| `password authentication failed` | Copy the connection string again from Neon (passwords are shown once) |
| `JWT_SECRET must be set` | `.env.local` is missing or the secret is shorter than 32 characters |
| Login works locally but not on Render | Check both environment variables are set on Render and redeploy |
