# Sushi POS

A modern Point of Sale system built for restaurants, originally inspired by a local all-you-can-eat sushi place in Durham, NC. Started as a personal project to explore full-stack development and build something actually useful — covers menu management, order processing, table tracking, and a full customer-facing ordering UI.

Flexible enough to be used for any restaurant, not just sushi.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI (Python 3.12/3.13), REST API under `/api/v1` |
| Database | PostgreSQL (e.g. **Supabase** in production; configurable via `DATABASE_URL`) |
| ORM | SQLAlchemy (Alembic files exist; see **Database** for current migration policy) |
| Frontend | React + TypeScript, Vite, Tailwind CSS |
| State | TanStack React Query + React contexts |
| Image storage | **AWS S3** (`sushi-pos-uploads` bucket); URLs stored directly in the database |
| Hosting | Frontend **Vercel** (redirects to EC2), backend **AWS EC2** (Docker), database **Supabase** |
| Containers | Docker + Docker Compose; images on DockerHub (`joshuadockerhartlep/sushi-pos-backend`, `joshuadockerhartlep/sushi-pos-frontend`) |
| CI/CD | GitHub Actions — auto-builds and pushes Docker images on every push to `main` |

**Security note:** The manager and customer UIs are **not behind login** in the current codebase—treat deployments accordingly (network restrictions, auth gateway, or future app-level auth).

---

## Database

The database is hosted on **Supabase** (not a local PostgreSQL instance). The connection string is configured in `app/core/config.py` and read from the environment.

**Do not** try to run `alembic upgrade head` from scratch — the existing migration files are out of sync with the actual DB schema. The tables were created directly and the Supabase DB is the source of truth. For schema changes, either:

- Apply DDL directly with a Python script using the SQLAlchemy engine, or
- Use the Supabase dashboard SQL editor

To inspect the live schema:
```python
# run from project root with the venv active
python -c "
import sys; sys.path.insert(0, '.')
from app.core.database import engine
from sqlalchemy import inspect
for table in inspect(engine).get_table_names():
    cols = inspect(engine).get_columns(table)
    print(table, [c['name'] for c in cols])
"
```

Local development typically uses `.venv` (see **Setup**) or `./scripts/start-backend.sh`, which creates `.venv` if missing.

---

## Project Structure

```
app/
  api/          # FastAPI routers (menu, orders, images, dashboard, settings, analytics)
  models/       # SQLAlchemy ORM models
  schemas/      # Pydantic request/response schemas
  core/         # DB config, settings, error handling, logging

frontend/
  src/
    components/ # Shared UI (Layout, sidebar nav, StatusDropdown, ConfirmationModal)
    contexts/   # ThemeContext, MealPeriodContext, RestaurantContext, CustomerOrderContext
    pages/
      customer/ # Customer-facing ordering UI (CustomerApp, MenuItemModal, …)
      ...       # Manager: Dashboard, Menu, Orders, EditOrder, Tables, Modifiers, Settings,
                #   ImageModeration, ReportedImages, Analytics ("The Lens")
    services/   # api.ts — typed Axios client for all endpoints
  vercel.json   # SPA rewrites for React Router (Vercel)

scripts/
  start-backend.sh   # Local backend: venv + deps + uvicorn

# Image assets are stored in AWS S3 (bucket: sushi-pos-uploads)
# and referenced via URL in the database.
```

---

## Setup

### Backend

Requires Python 3.12 or 3.13 (3.14 is not supported by pinned deps).

```bash
# recommended local startup helper
./scripts/start-backend.sh

# OR manual setup
python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend runs at `http://localhost:8000`. Interactive API docs: `/api/docs` (Swagger), `/api/redoc`. JSON routes are under `/api/v1/...`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

**Do not run `npm run dev` if the dev server is already running in an external terminal.**

---

## Routes

| Path | Interface |
|---|---|
| `/customer` | Customer ordering UI (optional query `?table=<id>`, default table `1`) |
| `/` | Manager dashboard (KPIs + recent orders) |
| `/menu` | Menu & categories: CRUD, official item photos, **customer photo gallery** per item |
| `/modifiers` | Modifier management |
| `/orders` | Order list and flows into order detail |
| `/orders/:id/edit` | Order detail: line items, status, totals, discounts when present |
| `/tables` | Table list: status, capacity, party / guest fields |
| `/settings` | Restaurant settings (**General** tab wired to API; see below) |
| `/moderation` | Image moderation: **Pending** queue + **Reported** tab (sidebar nav) |
| `/reported-images` | Reported customer photos (same data as Moderation → Reported; **no sidebar link**—open by URL or bookmark) |
| `/analytics` | **The Lens** — analytics panel (Overview + Signals tabs; see below) |

### Customer flow (high level)

- Table selection via `?table=`; checks table availability (e.g. occupied vs free).
- Onboarding → menu → cart (**My Order**); AYCE vs regular pricing driven by settings and item choice.
- Optional **customer photos** per menu item (upload, report); only **approved** images appear in the public gallery.

### Settings page

- **General** — persisted via API: restaurant name, timezone, lunch/dinner service, AYCE lunch/dinner prices.
- **Notifications, Security, Users, Billing** — **UI placeholders only** (not connected to backend).

---

## Customer Photo Moderation

Customer-uploaded images go through an approval workflow before becoming publicly visible:

1. Customer uploads a photo → stored with `status = pending`
2. Pending images are **not** returned by the customer-facing list endpoint
3. Manager uses **`/moderation`**: **Approve** sets `status = approved`; **reject/remove** uses **delete**, which removes the object from S3 and the DB row
4. **`/reported-images`** lists images with `report_count > 0` for review
5. Public/customer views only show **`approved`** images

---

## Phone / LAN Testing

To open the app on a phone or another device on the same Wi-Fi:

```bash
# 1. find your LAN IP
ipconfig getifaddr en0   # e.g. 10.0.0.42

# 2. set it in the network env file
# frontend/.env.network → VITE_API_URL=http://10.0.0.42:8000

# 3. start frontend in network mode
cd frontend && npm run dev:network
```

Open the Network URL printed by Vite on your phone. The backend already binds to `0.0.0.0:8000`.

> **Note:** University/enterprise Wi-Fi (e.g. DukeBlue) blocks device-to-device traffic. Use a personal hotspot or home Wi-Fi instead.

---

## Environment Files

| File | Used when | Purpose |
|---|---|---|
| `frontend/.env.local` | `npm run dev` | Standard localhost dev |
| `frontend/.env.network` | `npm run dev:network` | LAN / phone testing |

`VITE_API_URL` controls which backend the frontend hits. Falls back to `http://localhost:8000` if unset. Active URL is logged to the browser console on startup.

---

## Deployment (Vercel + AWS EC2 + Docker)

Current production split:

- Frontend (React/Vite) on **Vercel** — redirects all traffic to EC2
- Backend (FastAPI) on **AWS EC2** via Docker Compose
- Database on **Supabase Postgres**
- Container images on **DockerHub** (`joshuadockerhartlep/sushi-pos-backend`, `joshuadockerhartlep/sushi-pos-frontend`)

### CI/CD — GitHub Actions

Every push to `main` automatically builds and pushes both Docker images via `.github/workflows/docker-deploy.yml`.

Required GitHub repository secrets:

| Secret | Value |
|---|---|
| `DOCKERHUB_USERNAME` | `joshuadockerhartlep` |
| `DOCKERHUB_TOKEN` | DockerHub access token (Account Settings → Security → Access Tokens) |

### AWS EC2 Setup

1. Launch an Amazon Linux 2023 instance, open port **80** in the security group inbound rules.
2. SSH in with your key pair:
   ```bash
   ssh -i "Sushi POS Key Pair.pem" ec2-user@<your-ec2-public-ip>
   ```
3. Install Docker and Docker Compose:
   ```bash
   sudo dnf install -y docker
   sudo systemctl start docker && sudo systemctl enable docker
   sudo usermod -aG docker ec2-user
   # log out and back in, then:
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```
4. Upload `ec2setup/docker-compose.yml` and `ec2setup/nginx-ipv4.conf` to the instance.
5. Create `.backend-env` next to `docker-compose.yml`:
   ```env
   DATABASE_URL=postgresql://<supabase-connection-string>
   ENVIRONMENT=production
   SQL_ECHO=False
   AWS_ACCESS_KEY_ID=<aws-access-key-id>
   AWS_SECRET_ACCESS_KEY=<aws-secret-access-key>
   AWS_REGION=us-east-1
   S3_BUCKET_NAME=sushi-pos-uploads
   ```
6. Pull and start:
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

To update after a new Docker image is pushed:
```bash
docker-compose pull && docker-compose up -d
```

### Building Docker Images Locally

Images are built for both `linux/amd64` and `linux/arm64` (Apple Silicon + EC2):

```bash
# one-time buildx setup
docker buildx create --use --name multibuilder
docker buildx inspect --bootstrap

# backend
docker buildx build --platform linux/amd64,linux/arm64 \
  -t joshuadockerhartlep/sushi-pos-backend:latest --push .

# frontend
docker buildx build --platform linux/amd64,linux/arm64 \
  -t joshuadockerhartlep/sushi-pos-frontend:latest --push ./frontend
```

### Vercel (Frontend)

The Vercel project is rooted at `frontend/`. It redirects all traffic to the EC2 instance via `frontend/vercel.json`.

- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Framework Preset:** Vite
- **Environment Variable:** `VITE_API_URL` — leave empty (requests route through Vercel to EC2)

### Important Notes

- Keep secrets (`DATABASE_URL`, DockerHub tokens, etc.) in platform environment variables, not in committed files.
- `VITE_*` variables are public in frontend bundles; never put server secrets there.
- Images are stored in **AWS S3** (`sushi-pos-uploads` bucket). Add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `S3_BUCKET_NAME` to `.backend-env` on EC2.
- The EC2 public IP may change on instance restart unless an Elastic IP is assigned.

---

## Multi-tenant Architecture

The database schema is **multi-tenant ready**, though the system currently runs in **single-tenant mode** (one restaurant per deployment).

### What was added

- **`tenants` table** — each row represents one restaurant installation (`id`, `name`, `created_at`).
- **`tenant_id` FK column** on every business data table: `categories`, `menu_items`, `modifiers`, `tables`, `orders`, `settings`. Every row is scoped to a tenant.
- **`get_tenant_id()` FastAPI dependency** (`app/core/tenant.py`) — all API routes inject the current tenant via `Depends(get_tenant_id)`. In single-tenant mode this always returns `DEFAULT_TENANT_ID` (1). To add real tenant resolution (JWT claim, subdomain, API key), only this file needs to change.
- **Alembic migration** (`14495eb936cc`) applied the schema change safely on a live database using a 3-phase approach: add nullable columns → backfill existing rows with `tenant_id=1` → tighten to `NOT NULL` + FK + index.

### Current behavior

All requests resolve to `tenant_id = 1` ("Default Restaurant"). The app behaves exactly as a single-restaurant POS; the tenant column is set silently on every insert/query.

### Extending to true multi-tenancy

Replace the body of `get_tenant_id()` in `app/core/tenant.py`:

```python
# JWT claim example
def get_tenant_id(token: str = Depends(oauth2_scheme)) -> int:
    payload = decode_jwt(token)
    return payload["tenant_id"]

# Subdomain example
def get_tenant_id(request: Request) -> int:
    host = request.headers.get("host", "")
    return resolve_tenant_by_subdomain(host)
```

No route code changes are needed — every endpoint already passes `tenant_id` through the dependency.

---

## Common Troubleshooting

- **`ModuleNotFoundError: No module named 'pydantic_settings'`** — run `pip install pydantic-settings` in the active venv
- **`Form data requires "python-multipart"`** — run `pip install python-multipart`
- **Alembic `Target database is not up to date`** — ignore Alembic entirely; apply schema changes directly (see Database section above)
- **Images not loading** — check that `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `S3_BUCKET_NAME` are set in `.backend-env` and the S3 bucket policy allows public `s3:GetObject`
- **Vercel `/customer` returns 404** — confirm `frontend/vercel.json` exists and Vercel project Root Directory is `frontend`
- **Mixed content errors on Vercel** — `VITE_API_URL` must be empty in Vercel env vars so requests proxy through Vercel to EC2 rather than calling EC2 directly over HTTP
- **EC2 containers not starting** — run `docker-compose logs backend` / `docker-compose logs frontend` to diagnose; ensure `.backend-env` exists next to `docker-compose.yml`
- **`no matching manifest for linux/amd64`** — images were built on Apple Silicon without `--platform`. Rebuild using `docker buildx build --platform linux/amd64,linux/arm64`
- **GitHub Actions build fails** — confirm `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets are set in repo Settings → Secrets and variables → Actions

---

## Features

- **Dashboard** — order/revenue stats, recent orders with per-order totals
- **Menu management** — categories, items, meal period (lunch/dinner/both), availability, official item images
- **Manager view of customer photos** — per-item gallery on Menu; approve/reject/report moderation flow backed by S3
- **Modifiers** — per-category modifiers and pricing
- **Item-modifier assignment** — assign or replace menu-item modifier sets via dedicated item-modifier endpoints
- **Orders** — list, create/edit flow, status updates, line items, order notes, **AYCE** vs regular orders, discounts (when applied on an order)
- **Tables** — CRUD-style table management, status (available / occupied / …), party size and guest fields
- **Customer ordering UI** — table-aware, onboarding, menu + cart tabs, meal-period-aware item availability, item detail modal, optional customer photos and reporting
- **Customer photo moderation** — pending queue, reported queue, approve (patch status) or delete (reject), fullscreen lightbox
- **Themes** — light / dark / system, persisted (localStorage)
- **Lunch/dinner service** — manager-controlled current period; dinner-only items constrained during lunch
- **Settings (General)** — name, timezone, meal period, AYCE prices
- **Backend extras** — bulk menu operations and bulk order status updates via API (see OpenAPI); not all are exposed in the UI yet
- **The Lens** — manager analytics panel (see below)

---

## The Lens — Analytics Panel (`/analytics`)

A power-user analytics environment built for exploration, not just reporting. Philosophy: observe a number, drill into what drove it, compare it against another period, and let the system surface anomalies automatically.

Built in three phases, all under `app/api/analytics.py` (backend) and `frontend/src/pages/Analytics.tsx` (frontend). No new libraries — raw SQL via SQLAlchemy `text()`, stdlib `statistics` for anomaly detection, SVG bar chart built from scratch.

### API quick reference

All Lens endpoints live under `GET /api/v1/analytics/*` and accept a shared set of query params:

- `start_date`, `end_date` — ISO date strings (`YYYY-MM-DD`)
- Optional filters (depending on UI state): `meal_period`, `order_type`, `category_id`, `item_id`, `table_id`

Lens uses two key concepts:

- **`group_by`** (for `/analytics/summary`): controls time/label breakdown for the bar chart.
- **`dimension`** (for `/analytics/drill` and `/analytics/compare`): controls what the drill table groups by.

**Common values used by the UI:**

- `group_by`: `day`, `week`, `day_of_week`, `hour`, `category`, `item`, `order_type`
- `dimension`: `category`, `item`, `day`, `day_of_week`, `hour`, `order_type`, `table`

### Architecture

All four endpoints share a single filter/SQL translation layer:

- **`AnalyticsFilter`** — unified Pydantic model accepted by every endpoint (`start_date`, `end_date`, `meal_period`, `order_type`, `category_id`, `item_id`, `table_id`)
- **`build_conditions()`** — single source of truth that compiles an `AnalyticsFilter` into `FilterConditions` (pre-built SQL WHERE fragments + bound params). No endpoint builds conditions inline.
- **`_drill_query()`** — core aggregation engine shared by `/drill` and `/compare`. Returns rows with a generic `metadata` dict instead of hardcoded field names, so the frontend can drive drill-down without knowing what dimension was queried.

### Phase 1 — Explore

**`GET /analytics/summary`**
Aggregates revenue, order count, and avg order value for a time window. Optional `group_by` returns a breakdown list (day, week, day_of_week, hour, item, category, order_type) for the bar chart.

**`GET /analytics/drill`**
Returns a metric broken down by a dimension with full filter support. As the user drills, filters accumulate (e.g. category → items within that category → day-of-week for those items). Each row carries a `metadata` dict with drillable IDs.

Frontend: time range selector (7d / 30d / custom), meal period filter, SVG bar chart (click a bar to zoom to that day), sortable drill table showing value, order count, and % of total, breadcrumb trail.

### Phase 2 — Compare and Explain

**`GET /analytics/decompose`**
Breaks revenue down into its component drivers (order count × avg order value) for a given window, plus a full daily timeseries. Answers "why did this number change?" Powered by `_grouped_summary()`.

**`GET /analytics/compare`**
Runs `_drill_query()` twice — once for cohort A and once for cohort B — and merges results by label with delta and % change. Cohorts share dimensional filters so comparisons are apples-to-apples; only time range and meal period differ.

Frontend: **Compare mode** toggle swaps the drill table for a side-by-side A/B table with color-coded delta (positive = tertiary, negative = error) and % change badges. **Explain** button opens an inline DecomposePanel with three mini-cards and a scrollable daily breakdown table. Drill stack is generic — clicking a row pushes a new step using `row.metadata` keys to suggest the next dimension; no hardcoded paths.

### Phase 3 — Signals (Anomaly Detection)

**`GET /analytics/signals`**
Scans daily metrics over a rolling window (default 14 days, configurable via `window_days`) and surfaces days that deviated significantly from expected behavior.

**Method (no black box):**
1. Fetch daily aggregates for `total_revenue`, `order_count`, and `avg_order_value` using `_grouped_summary()` — zero new SQL.
2. For each metric, compute the window mean and standard deviation using Python's `statistics` module (stdlib).
3. Flag any day where `|z_score| > 2` (≈ top/bottom 2.3% of a normal distribution).
4. `z_score = (day_value − window_mean) / window_std`
5. Edge cases: if std == 0 (all days identical), skip — no anomaly is possible. If fewer than 3 data points, return empty.
6. Severity: `medium` when `|z| > 2`, `high` when `|z| > 3`. Results sorted by `|z_score|` descending.

Frontend: **Signals tab** with a live badge showing anomaly count. Each card shows the metric, date, message (e.g. "Revenue dropped 38% below 14-day average"), z-score, and actual vs average values. Clicking a card sets the date range to that specific day, resets the drill stack, and switches back to Overview — dropping the user directly into exploration context for that anomaly. Methodology footnote at the bottom is visible to keep the math transparent.

### Lens troubleshooting notes (things we actually hit)

- **“CORS blocked” in the browser often means the backend threw a 500**: when FastAPI returns an unhandled 500, the response may not include CORS headers, so the browser surfaces it as a CORS/network error. Treat it as “there’s a server-side exception” and check backend logs.
- **Hour-by-hour drilldowns rely on correct SQL grouping**: Lens uses `group_by=hour` for the “click a day → see hour breakdown” flow. Backend grouping must match the selected expression for the hour label, or Postgres will raise a `GROUP BY` error.

### Recent backend fixes that unblocked Lens

These are in `app/api/analytics.py`:

- **Order status enum robustness**: queries that excluded cancelled orders now compare as `LOWER(o.status::text) != 'cancelled'` instead of hardcoding a case-sensitive enum literal. This prevents `invalid input value for enum orderstatus: "cancelled"` errors.
- **Hour grouping correctness**: `group_by=hour` and `dimension=hour` were updated to group/order by the same expression used in `SELECT` (`TO_CHAR(o.created_at, 'HH24')`, ordered numerically). This fixes Postgres `GroupingError` when Lens requests hour-by-hour summaries/drills.

---

## Lens test data (realistic + anomaly-rich)

Lens (especially **Signals**, **Compare**, and deep **Drill**) is only as good as the data distribution. This repo includes seed SQL that was generated specifically to produce visible trends/anomalies over the last ~30 days without overwriting existing data.

### Seed files

- `tmp_supabase_seed/chunks_04_09_clean/` — “clean” order chunks (baseline distribution)
- `tmp_supabase_seed/chunks_316_485_anomalies/` — anomaly-injected order chunks
- `tmp_supabase_seed/chunks_316_485_anomalies/groups_remaining/` — combined groups intended for easier execution (each file inserts a contiguous range)

### What the anomaly dataset is designed to show

- **Weekly behavior**: week-over-week changes in order volume and average order value
- **Day-of-week effect**: Fridays/Saturdays busier than Mondays
- **Time-of-day**: lunch vs dinner order size differences
- **Category shift**: a late-period spike in a specific category (e.g. Sashimi)
- **AYCE mix shift**: AYCE share dropping in the final 7–10 days
- **Strong Signals anomalies**:
  - a 2–3 day negative revenue shock late in the range (lower volume + fewer items)
  - a single-day positive volume spike
  - item-level “trending up” vs “declining” substitutions

### How to execute

Use your preferred SQL runner against the configured `DATABASE_URL` (Supabase SQL editor, `psql`, or your internal tooling). Execute the files in order and **do not** re-run the same chunk twice (they insert explicit IDs).

If you only want to finish the remaining anomaly inserts, run the `tmp_supabase_seed/chunks_316_485_anomalies/groups_remaining/group_*.sql` files (they are already bundled for convenience).
