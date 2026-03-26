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
| Image storage | Local disk (`uploads/`) served at `/uploads/` by FastAPI |
| Hosting | Frontend **Vercel**, backend **Render** (see **Deployment**) |

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

uploads/
  menu-images/  # Official menu item images (uploaded by manager)
  user-images/  # Customer-submitted photos (moderated before going public)
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
3. Manager uses **`/moderation`**: **Approve** sets `status = approved`; **reject/remove** uses **delete**, which removes the file from disk and the DB row
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

## Deployment (Vercel + Render)

Current production split:

- Frontend (React/Vite) on **Vercel**
- Backend (FastAPI) on **Render**
- Database on **Supabase Postgres**

### Vercel (Frontend)

Use a Vercel project rooted at `frontend/`.

- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Framework Preset:** Vite
- **Environment Variable:** `VITE_API_URL=https://<your-render-backend-domain>`

This repo includes SPA rewrites for React Router deep links (for example `/customer?table=1`). See `frontend/vercel.json`.

### Render (Backend)

Use a Render Web Service rooted at repo root (do **not** set Root Directory to `backend` for this repo).

- **Root Directory:** *(blank)*
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Environment Variable:** `PYTHON_VERSION=3.12.7` (or another 3.12.x)
- **Database:** set `DATABASE_URL` to your Postgres connection string (e.g. Supabase)

Why `PYTHON_VERSION` is required: pinned deps in `requirements.txt` (notably `pydantic==2.6.1`) can fail to build under Python 3.14 on Render.

### Important Notes

- Keep secrets (Render API keys, DB URLs, etc.) in platform environment variables, not in committed files.
- `VITE_*` variables are public in frontend bundles; never put server secrets there.
- Uploaded images are stored on backend disk (`/uploads/`). For long-term multi-instance scalability, move to object storage (S3/R2/etc.).

---

## Common Troubleshooting

- **`ModuleNotFoundError: No module named 'pydantic_settings'`** — run `pip install pydantic-settings` in the active venv
- **`Form data requires "python-multipart"`** — run `pip install python-multipart`
- **Alembic `Target database is not up to date`** — ignore Alembic entirely; apply schema changes directly (see Database section above)
- **Images not loading** — the backend must be running; `/uploads/` is served as a static mount by FastAPI, not a CDN
- **Render build fails while preparing `pydantic-core`** — set `PYTHON_VERSION=3.12.7` in Render environment variables and redeploy
- **Vercel `/customer` returns 404** — confirm `frontend/vercel.json` exists and Vercel project Root Directory is `frontend`

---

## Features

- **Dashboard** — order/revenue stats, recent orders with per-order totals
- **Menu management** — categories, items, meal period (lunch/dinner/both), availability, official item images
- **Manager view of customer photos** — per-item gallery on Menu; delete inappropriate uploads
- **Modifiers** — per-category modifiers and pricing
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
