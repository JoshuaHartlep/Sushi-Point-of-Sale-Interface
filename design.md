# Sushi POS - Product Design & Roadmap

## 1. Purpose
This document captures the current scope of the Sushi POS project and the direction we want to go in the future:

- Keep the existing manager/admin workflow for menu + order/table operations.
- Add a customer-facing experience that uses a unique QR code per table.
- Support both All-You-Can-Eat (AYCE) and a la carte ordering modes.
- Make the UI cleaner and more Japanese-styled.
- Add menu item pictures and serve them through the backend.
- Move from local Postgres to a centralized (hosted) database suitable for real restaurants.

## 2. Current State (What exists today)

### 2.1 Backend (FastAPI)
The backend is a FastAPI app with versioned endpoints under `/api/v1`.

Core areas:
- Menu: menu items, categories, modifiers.
- Orders: create/update orders, manage order items, apply discounts, calculate totals.
- Tables: create tables, list tables, update table status, clear tables, list table orders.
- Dashboard: simple stats and recent orders.
- Settings: singleton settings (restaurant name + timezone + AYCE lunch/dinner pricing + current meal period).

Relevant existing endpoints (high level):
- Tables: `POST /orders/tables/`, `GET /orders/tables/`, `PUT /orders/tables/{id}/status`, `POST /orders/tables/{id}/clear`, `GET /orders/tables/{id}/orders/`
- Orders: `GET /orders/`, `POST /orders/`, `PUT /orders/{order_id}`, `PUT /orders/{order_id}/status`, `POST /orders/{order_id}/items`, `GET /orders/{order_id}/total`
- Menu: `GET /menu/menu-items/`, `GET /menu/categories/`, `GET /menu/modifiers/`, and write endpoints for admin workflows
- Settings: `GET /settings/`, `PATCH /settings/`, and `PATCH /settings/meal-period`

Key domain models already exist:
- `menu_items` supports a `meal_period` (LUNCH / DINNER / BOTH) and the model already contains an `image_url` field.
- Orders support `ayce_order` (boolean) and AYCE pricing driven by `settings.current_meal_period`.
- Tables store customer-related fields (name/phone/etc.) in at least one of the existing model definitions.

Important implementation caveat (gap):
- The codebase currently has duplicated/competing `Table` model definitions (one under `app/models/table.py` and another embedded in `app/models/order.py`), and the status + field names differ.
  - This matters because the routing layer imports tables/status enums from `app.models.order`.
  - Before expanding QR/customer flows, we should consolidate table modeling so there is one canonical `Table` schema/model everywhere.

### 2.2 Frontend (React)
There are currently two React apps in the repository:

- `sushi-pos-frontend/`: a simpler manager UI with routes like `/`, `/menu`, `/orders`, `/settings`.
- `frontend/`: a more developed manager UI that includes theme/meal-period contexts and richer admin workflows (menu filtering by meal period, settings UI, order editing view, etc.).

Both currently present a manager/admin experience rather than a customer-facing one.

## 3. Target Future State (Customer-facing experience)

### 3.1 Personas
- Manager/Admin: manages menu content, controls availability, and tracks/updates order status for kitchens.
- Customers: arrive at a table, scan the table QR code, and order without interacting with staff until pickup/delivery time.

### 3.2 Customer Journey (High-level Flow)
1. Customer scans a QR code on their table.
2. The QR code opens a URL (URL-based QR) that resolves a non-guessable token to the correct restaurant + table.
3. The customer enters their name (and optionally party size).
4. The customer chooses ordering mode:
   - AYCE
   - A la carte
5. The customer browses the menu for the current meal period.
   - Items not available for the current meal period should be hidden or disabled (per `meal_period`).
6. The customer places/updates their order.
7. The kitchen/manager dashboard sees orders as they move through statuses (pending -> preparing -> ready -> delivered/completed).
8. When the table is cleared, the system returns the table to an available state.

## 4. QR Code + Table Claiming Requirements

### 4.1 QR Token Design
Each physical table gets a unique QR code that encodes:
- `restaurant_id` (or equivalent identifier)
- `table_id` (or an alternative stable key)
- a secure, non-guessable token to prevent guessing/abuse

Candidate QR strategies:
- Link-only QR (chosen): QR points to a URL like `/c/{token}`. When scanned, it opens the customer page.
- In-app scanning QR: customers use the camera inside the app, then the app resolves the token.

We will use URL-based QR as the primary strategy (in-app scanning can be a later enhancement).

### 4.2 Table “Claim” vs “Create”
Today, “table creation” exists mainly for admin workflows.

For the customer journey, we need a “table claim” behavior:
- On first QR visit, mark the table as reserved/occupied.
- Store customer identity fields (`customer_name`, optional phone/party size).
- Ensure idempotency:
  - If the customer refreshes, they should resume the same active order state rather than creating duplicates.

## 5. AYCE vs A la carte Ordering Requirements

### 5.1 A la carte
- Customer picks menu items, quantities, and modifiers.
- Backend creates an order and order items.
- Total is computed from item unit prices + modifier prices.

### 5.2 AYCE
- AYCE pricing is a fixed per-party price (based on the restaurant + current meal period).
- Customers can still pick menu items and modifiers for kitchen clarity, but the final total price is the fixed AYCE price (not the sum of selected item prices).
- Menu items should have mode availability:
  - A la carte availability (and a la carte price) when enabled.
  - AYCE availability for lunch and/or dinner.
- In AYCE mode, the customer UI should allow selecting only items that are available for AYCE in the current meal period, while still recording the selection on the order for prep.

Backend implication (implementation direction):
- Keep recording selected items/modifiers on the order for kitchen prep, but adjust total calculation:
  - For AYCE orders: `total_amount = ayce_price` (ignore per-item prices for totals).
  - For a la carte orders: `total_amount = sum(item.unit_price * qty + modifier.price * qty)` as today.

Note: the current backend menu schema uses a single `meal_period` + `price`. We will need to extend menu item availability so that “a la carte vs AYCE lunch/dinner” can be expressed separately.

### 5.3 Meal Period Enforcement
- Menu items already carry `meal_period` in the model.
- The customer UI must enforce this so that:
  - lunch-only items don’t appear during dinner (or are disabled)
  - dinner-only items don’t appear during lunch

## 6. Backend Integration with “the restaurant the actual restaurant uses”
Architecturally, we still need a strategy for:
- how restaurant identity maps into data (tables, menu, settings, orders)
- whether we share one backend deployment across restaurants or run a separate install per restaurant

### Option A: Multi-tenant within this system
- Each restaurant has its own:
  - menu configuration
  - tables
  - orders
  - settings (AYCE prices, meal period)
- A restaurant identifier is included in the QR token.

Your preference (updated):
- Separate installs per restaurant (default assumption), but centralized hosting for the database.
- Even with separate installs, we will likely keep tenant separation in the schema via `restaurant_id`, because the customer QR still needs to resolve to a specific restaurant dataset safely.

Implementation direction (recommended starting point):
- Add/ensure `restaurant_id` exists on core data where needed (settings, tables, menu_items, categories, modifiers, orders).
- Ensure all API queries filter by `restaurant_id` resolved from the QR token.

### Option B: Connect to an external POS/backoffice
- Customers still order through our customer app, but the order state is mirrored/forwarded to the restaurant’s “real” backend.
- This requires an integration layer or adapter.

Open questions:
- What does “the restaurant backend” mean?
  - Do they already use another database/POS?
  - Do they expose an API we can call?
  - Are we expected to fully replace their system or only sync orders?

## 7. Database: Centralized Instead of Local PostgreSQL
Today, the backend reads `DATABASE_URL` (defaulting to local Postgres).

For real deployments, we want:
- A hosted Postgres instance (managed service).
- Environment-based configuration:
  - dev uses local
  - staging/prod uses hosted

For centralized hosting:
- Even with separate installs per restaurant, we need a tenant isolation strategy in the shared database (e.g. `restaurant_id` row filtering or separate schemas).
- We’ll likely need migration discipline and predictable schema versioning (Alembic).

## 8. UI/UX Direction (Japanese aesthetic + cleaner frontend)

### 8.1 Styling Goals
- More Japanese aesthetic:
  - calm typography
  - restrained color palette
  - spacing consistency
  - subtle separators and card styling
- Reduce “raw admin feel” for customer screens:
  - large buttons
  - fewer form fields
  - clear step-by-step flow (scan -> name -> mode -> menu -> order)

### 8.2 Frontend Structure Goals
- Introduce a reusable component/design system so customer and manager UIs stay consistent:
  - `Button`, `Card`, `Header`, `TabBar`, `MenuGrid`, `OrderSummary`
  - standardized loading/empty/error states
- Reduce ad-hoc inline logic in pages and move toward reusable hooks:
  - `useMenuAvailability()`
  - `useTableClaim()`
  - `useActiveOrder()` (customer)

### 8.3 Meal Period UI
- Use meal period context/settings to:
  - filter/hide menu items
  - show an explicit banner like “Lunch” vs “Dinner”
  - show AYCE pricing clearly when in AYCE mode

## 9. Menu Item Pictures

The backend menu model includes an `image_url` field, but the current API schema/response may not fully expose it to the frontend.

To implement menu pictures end-to-end, we need:
- Backend:
  - Include `image_url` in `MenuItemResponse` (and any relevant endpoints).
  - Add a manager/admin image upload flow (preferred):
    - Upload image file to backend storage
    - Store resulting URL in `menu_items.image_url`
    - Customer and manager menu UIs render from `image_url`
  - Decide how images are stored:
    - managed object storage (S3/Supabase storage/etc.)
    - upload endpoint in the API
- Frontend:
  - Update menu cards to render images.
  - Add loading skeletons for images and fallbacks for missing images.

Assumption:
- Only managers/admins can upload menu item images (customers view the menu).

## 10. Proposed Milestones (Roadmap)

### Milestone 1: Document/decide the architecture
- Consolidate the canonical `Table` model and enum usage.
- Decide QR token strategy (URL-based recommended).
- Decide multi-tenant strategy (Option A) vs external POS integration (Option B).

### Milestone 2: Customer QR + Table Claim API
- Add endpoints to:
  - resolve QR token -> table + restaurant context
  - claim/reserve a table under a customer name
  - create/resume the active order for that table

### Milestone 3: Customer ordering UI
- Create a customer-facing route set:
  - `/c/{token}` landing/claim
  - `/c/{token}/menu`
  - `/c/{token}/order` (optional order summary)
  - AYCE vs a la carte flow screens

### Milestone 4: AYCE correctness
- Adjust backend order total calculation so AYCE orders use the fixed `ayce_price` regardless of selected items/modifiers.
- Ensure AYCE lunch/dinner availability rules match what the customer UI shows.

### Milestone 5: Menu images
- Add `image_url` to API responses (and admin management for images).
- Render images in customer and manager menu views.

### Milestone 6: Central DB + deployment readiness
- Move away from local Postgres for staging/prod.
- Ensure environment variables and migrations are production-safe.

## 11. Risks / Open Issues
- Duplicate table model definitions and mismatched schema fields currently exist.
- AYCE totals currently may be computed from item/modifier prices; we need to update totals to fixed-price behavior while still recording selections.
- Customer QR abuse/security:
  - tokens should be unguessable
  - repeated scans should be idempotent
- Multi-restaurant scoping:
  - we need a clear path to map QR -> the correct restaurant dataset.
- “Which backend the restaurant uses” is not specified yet; the integration strategy will drive major architecture decisions.

## 12. What We Still Need From You (Clarifications)
1. What centralized DB provider do you want to start with (or stay flexible for now)?
2. In AYCE mode, what should happen to items that are only available for a la carte?
   - Hidden (recommended)
   - Disabled (shown but not selectable)
   - Still selectable but rejected by backend if they somehow get selected
3. In AYCE mode, do modifiers ever add extra charges, or are they always free under the fixed AYCE price?
4. For QR “table claim” edge cases:
   - should customers be allowed to re-seating/claim the same table QR after it is cleared?
   - if so, what customer UX should it show (new session vs resume old)?

