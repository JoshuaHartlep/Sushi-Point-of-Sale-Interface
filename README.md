# Sushi POS API

A modern Point of Sale (POS) system built for restaurants, originally inspired by a local all-you-can-eat sushi place in Durham, NC. I started this project to explore full-stack development and build something useful that could streamline restaurant operations like menu customization, order processing, and table tracking. While it started with sushi in mind, it’s flexible enough to be used for any kind of restaurant.

This project has taught me a ton about database design, backend API development, and frontend UI integration. I'm continuing to build this out with the goal of making it a full-scale solution for small and mid-sized restaurants.
## Project Structure

- `app/`: Backend FastAPI application
  - `api/`: API endpoints
  - `models/`: Database models
  - `schemas/`: Pydantic schemas
  - `core/`: Core functionality
  - `db/`: Database configuration
- `frontend/`: React frontend application
  - `src/`: Source code
    - `components/`: Reusable UI components
    - `pages/`: Page components
    - `services/`: API service calls
    - `contexts/`: React context providers

## Setup Instructions

### Backend Setup

1. Use Python 3.12 or 3.13 (3.14 is not supported by this repo's pinned deps).

2. Create and activate virtual environment:
```bash
python3.12 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies:
```bash
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r requirements.txt
```

4. Start the backend server:
```bash
python -m uvicorn app.main:app --reload
```

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The app opens at `http://localhost:5173` and talks to the backend at `http://localhost:8000`.

---

## Phone / Local Network Testing

Use this when you want to open the app on your phone or another device on the same Wi-Fi.

### Step 1 — Find your machine's LAN IP
```bash
ipconfig getifaddr en0
# e.g. 10.197.255.151
```

### Step 2 — Set the IP in the network env file
Edit `frontend/.env.network` and set your IP:
```
VITE_API_URL=http://<YOUR_LAN_IP>:8000
```

### Step 3 — Start the frontend in network mode
```bash
cd frontend
npm run dev:network
```
Vite binds to all interfaces and prints something like:
```
  ➜  Network: http://10.197.255.151:5173/
```

### Step 4 — Open that URL on your phone
Make sure your phone is on the same Wi-Fi, then navigate to the Network URL printed by Vite.

> The backend already binds to `0.0.0.0:8000` (via `scripts/start-backend.sh`) and CORS allows all origins, so no extra backend changes are needed.

> **Network warning:** This only works on a trusted home/personal Wi-Fi network. Networks like **DukeBlue** (and most university/enterprise Wi-Fi) block device-to-device communication even though they assign private IPs (e.g. `10.x.x.x`). If your phone can't reach the backend, the network is the likely cause — switch to a personal hotspot or home Wi-Fi instead.

---

## Environment Files

| File | Used when | Purpose |
|---|---|---|
| `frontend/.env.local` | `npm run dev` | Standard localhost dev |
| `frontend/.env.network` | `npm run dev:network` | LAN / phone testing |

`VITE_API_URL` controls which backend the frontend hits. If the variable is missing, it falls back to `http://localhost:8000`. The active URL is logged to the browser console on startup.

---

## API Documentation

Once the backend server is running, you can access the API documentation at:
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc

## Troubleshooting (Local Setup)

- `ModuleNotFoundError: No module named 'pydantic_settings'`:
  - Install it in the active venv with `python -m pip install pydantic-settings`.
- `Form data requires "python-multipart" to be installed`:
  - Run `python -m pip install python-multipart` in the same active venv used to run uvicorn.
- If `venv/bin/activate` is missing:
  - This project uses `.venv`, so activate with `source .venv/bin/activate`.

## Features

- Menu Management: Add, edit, delete menu items, and organize them by category

- Order Processing: Create and manage orders, apply discounts, support for AYCE pricing

- Table Management: Assign and track table orders

- Modifier System: Add-ons and substitutions tied to menu categories

- Settings Panel: Update restaurant info like name (which reflects in the UI)

- Live Updates: All data is fetched from real-time API responses, no page reloads needed

More features coming soon like customer-facing views, analytics, authentication, and Toast-style payment integration.
