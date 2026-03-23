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
