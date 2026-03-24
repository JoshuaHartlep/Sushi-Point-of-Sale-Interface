# Sushi POS

A modern Point of Sale system built for restaurants, originally inspired by a local all-you-can-eat sushi place in Durham, NC. Started as a personal project to explore full-stack development and build something actually useful — covers menu management, order processing, table tracking, and a full customer-facing ordering UI.

Flexible enough to be used for any restaurant, not just sushi.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI (Python 3.12/3.13) |
| Database | PostgreSQL via **Supabase** (cloud-hosted) |
| ORM | SQLAlchemy with Alembic for migrations |
| Frontend | React + TypeScript, Vite, Tailwind CSS |
| State | TanStack React Query + React contexts |
| Image storage | Local disk (`/uploads/`) served as static files |

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

The venv used to run the app lives at `sushi_pos_api/venv/`, not `.venv`:
```bash
source sushi_pos_api/venv/bin/activate
```

---

## Project Structure

```
app/
  api/          # FastAPI routers (menu, orders, images, dashboard, settings, tables)
  models/       # SQLAlchemy ORM models
  schemas/      # Pydantic request/response schemas
  core/         # DB config, settings, error handling, logging

frontend/
  src/
    components/ # Shared UI (Layout, sidebar nav)
    contexts/   # ThemeContext, MealPeriodContext, RestaurantContext, CustomerOrderContext
    pages/
      customer/ # Customer-facing ordering UI (CustomerApp, MenuItemModal)
      ...       # Manager pages: Dashboard, Menu, Orders, Tables, Modifiers, Settings,
                #   ImageModeration, ReportedImages
    services/   # api.ts — typed Axios client for all endpoints

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

Backend runs at `http://localhost:8000`. API docs at `/api/docs` (Swagger) and `/api/redoc`.

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
| `/customer` | Customer ordering UI (no auth) |
| `/` | Manager dashboard |
| `/menu` | Menu item management |
| `/modifiers` | Modifier management |
| `/orders` | Order management |
| `/tables` | Table status |
| `/settings` | Restaurant settings |
| `/moderation` | Image moderation (approve/reject customer photos) |
| `/reported-images` | Images flagged by customers |

---

## Customer Photo Moderation

Customer-uploaded images go through an approval workflow before becoming publicly visible:

1. Customer uploads a photo → stored immediately with `status = 'pending'`
2. Customer sees "submitted for review" — the image is **not** shown publicly yet
3. Manager reviews in `/moderation` → Approve makes it visible; Reject deletes the file and DB record entirely (no storage waste)
4. The customer-facing image endpoint only returns `status = 'approved'` images

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

This repo includes SPA rewrites for React Router deep links (like `/customer?table=1`):

```1:8:frontend/vercel.json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### Render (Backend)

Use a Render Web Service rooted at repo root (do **not** set Root Directory to `backend` for this repo).

- **Root Directory:** *(blank)*
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Environment Variable:** `PYTHON_VERSION=3.12.7` (or another 3.12.x)

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

- **Menu management** — items, categories, modifiers, meal period (lunch/dinner/both), availability toggle
- **Order processing** — regular pricing and AYCE (all-you-can-eat) mode
- **Table management** — assign and track table status
- **Customer ordering UI** — mobile-friendly, swipeable image lightbox, custom notes, cart
- **Customer photo uploads** — with manager approval workflow before photos go public
- **Image moderation** — pending queue, reported images tab, approve or delete from a fullscreen lightbox
- **Dark/light/system theme** — persisted in localStorage
- **Lunch/dinner mode** — dinner-only items are visually disabled during lunch service
- **Settings panel** — restaurant name and other global config
