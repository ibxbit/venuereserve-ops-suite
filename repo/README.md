# Fitness and Wellness Studio Platform (Local Network)

This is the first implementation slice for the core platform architecture:

- Vue.js front end (`frontend/`) that consumes local REST APIs
- Koa backend (`backend/`) exposing API endpoints for users, resources, reservations, orders, refunds, and audit trail reads
- MySQL as the system of record via Knex migrations
- Offline-first behavior in the front end using local cache + queued write operations
- Role-based dashboards and access control for Members, Front Desk Staff, Studio Managers, Moderators, and Auditors

## Start Command (How to Run)

Use one command from the `repo` directory:

```bash
docker compose up
```

This single command starts all declared dependencies (MySQL, backend, frontend), waits for database readiness, runs migrations automatically, and starts the app services.

## Service Address (Services List)

- Frontend (Vue): `http://localhost:5173`
- Backend API (Koa): `http://localhost:4000/api/v1`
- MySQL: `localhost:3306`

## Project Structure

```text
repo/
├── unit_tests/
├── API_tests/
└── run_tests.sh
```

## Running Tests

From the `repo` directory:

```bash
./run_tests.sh
```

This script is idempotent, non-interactive, and runs tests in the backend Docker container (Node 20) via `docker compose exec -T backend ...`.

Behavior:

- If Compose services are not running, it starts them automatically.
- It runs all unit tests from `unit_tests/`.
- It runs all API tests from `API_tests/`.
- If Docker Compose is unavailable, it falls back to host execution only when host Node is `20+`; otherwise it fails fast with a clear message.

It runs:

- all unit tests from `unit_tests/`
- all API tests from `API_tests/`

## Verification Guide (Core Features)

1. Run `docker compose up` from `repo/` and wait until all three services are healthy/running.
2. Open `http://localhost:5173` and confirm the frontend loads.
3. Open `http://localhost:4000/api/v1/health` and confirm the response includes `"status":"ok"`.
4. Verify a protected route returns standard auth errors, for example call `GET /api/v1/me/dashboard` without a token and confirm `401` JSON response.
5. Verify RBAC behavior by logging in as different roles and confirming allowed/forbidden actions in dashboard/API.
6. Run `./run_tests.sh` and confirm all unit + API tests pass.

## Optional Local (Non-Docker) Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

**Linux / macOS:**

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**Windows (Command Prompt):**

```bash
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

Update values in `backend/.env` for your local MySQL instance.

### 3) Create database and run migrations

Create the database manually (example name: `studio_local`) and run:

```bash
npm run migrate
```

### 4) Start services (two terminals)

Terminal 1:

```bash
npm run dev:backend
```

Terminal 2:

```bash
npm run dev:frontend
```

### API base

- Backend base URL: `http://<local-ip>:4000/api/v1`
- Frontend dev URL: `http://<local-ip>:5173`

For LAN usage, keep backend `HOST=0.0.0.0` and Vite server host is already `0.0.0.0`.

## Role and access behavior

- Frontend role profile selector in the sidebar switches dashboard views and available routes.
- Backend enforces RBAC from authenticated Bearer sessions (`Authorization: Bearer <token>`).
- Protected endpoints require a valid session token and return `401` when missing/invalid/expired.
- Public endpoints are limited to `GET /api/v1/health`, `POST /api/v1/auth/register`, and `POST /api/v1/auth/login`.
- Dashboard metadata endpoint: `GET /api/v1/me/dashboard`.

## Resource and reservation policy rules

- Resources now store configurable policy fields:
  - `booking_window_days` (default `30`)
  - `min_duration_minutes` (default `30`)
  - `max_duration_minutes` (default `240`)
  - `early_check_in_minutes` (default `10`)
  - `late_check_in_grace_minutes` (default `15`)
  - `allow_slot_stitching` (default `true`)
- Reservation API enforces booking window, duration limits, 30-minute slot increments, and overlap prevention.
- Adjacent 30-minute reservations for the same member/resource are stitched into one continuous reservation when policy allows.
- Check-in endpoint: `POST /api/v1/reservations/:id/check-in`.
- No-show batch endpoint: `POST /api/v1/reservations/mark-no-shows`.

## Availability and conflict detection

- Availability browse endpoint: `GET /api/v1/availability` with query params:
  - `resource_id`
  - `user_id`
  - `date` (`YYYY-MM-DD`)
  - `duration_minutes` (30-minute increments)
  - optional `start_time` (`HH:mm`)
- Conflict explanations are returned in plain language for:
  - capacity exceeded
  - occupancy overlap
  - required 15-minute cleaning buffer
  - blocked resource
  - blacklist restriction
- Alternative slot suggestions are returned with each availability response.
- Additional policy entities:
  - `resource-blocks`
  - `reservation-blacklists`

## Account standing and booking restrictions

- Users have internal standing score (`0-100`) in `users.standing_score`.
- Standing is recalculated from `attendance_history` using configurable policy in
  `account_standing_policies`.
- Peak-hour restrictions apply when either condition is true:
  - standing score below threshold (default `< 60`)
  - no-shows in lookback window reach limit (default `>= 2` in 30 days)
- Restricted peak-hour bookings require approved manager override from
  `reservation_overrides`.
- API endpoints:
  - `GET /api/v1/account-standing-policy`
  - `PUT /api/v1/account-standing-policy/:id` (manager)
  - `GET /api/v1/account-standing/:userId`
  - `GET /api/v1/attendance-history?user_id=...`
  - `GET /api/v1/reservation-overrides`
  - `POST /api/v1/reservation-overrides` (manager)

## Calendar, holidays, and booking exceptions

- Holiday rules are stored in `holiday_rules` and editable at `/holiday-rules` in the UI.
- Calendar day rule endpoint: `GET /api/v1/calendar/day-rules?date=YYYY-MM-DD`.
- Availability view now surfaces holiday context and reduced-hour windows.
- Exception workflow for rule overrides:
  - Member/staff submits request with reason: `POST /api/v1/booking-exceptions`
  - Manager decides with required justification: `POST /api/v1/booking-exceptions/:id/decision`
  - List requests: `GET /api/v1/booking-exceptions`
- Reservation create/update accepts `exception_request_id`; approved matching exceptions can bypass standard rule conflicts.
- All exception requests and decisions are logged to `audit_trails` with reason text.

## Unified cart, pricing, coupons, and fulfillment split/merge

- Commerce catalog endpoint: `GET /api/v1/commerce/catalog`.
- Coupon list endpoint: `GET /api/v1/commerce/coupons`.
- Real-time cart quote endpoint: `POST /api/v1/commerce/cart/quote`.
- Checkout endpoint with split/merge mode: `POST /api/v1/commerce/checkout`.
  - `split_mode=auto_split` creates separate orders by fulfillment path.
  - `split_mode=merge_all` creates one merged order.
- Post-checkout operations:
  - `POST /api/v1/commerce/orders/:id/split`
  - `POST /api/v1/commerce/orders/merge`
- Coupon rules support fixed and percentage discounts with:
  - minimum subtotal threshold
  - category targeting (e.g., class packs)
  - max discount cap (e.g., 15% max $25)
- Seeded examples include:
  - `$10 off purchases over $75` (`SAVE10OVER75`)
  - `15% off class pack, max $25` (`CLASSPACK15`)

## Order state machine, idempotency, and local payments

- Orders now use explicit state transitions:
  - `pending_payment -> paid -> active|awaiting_pickup -> fulfilled`
  - `pending_payment -> cancelled|expired`
- Client idempotency keys are required for write operations (checkout/pay/cancel/transition/split/merge).
  - Provide via `x-idempotency-key` header or `idempotency_key` in request body.
- Unpaid orders auto-expire after 15 minutes using:
  - `POST /api/v1/commerce/orders/expire-unpaid`
  - this releases inventory/reservation holds.
- Supported local payment methods only:
  - `cash`
  - `card_terminal`
  - `gift_certificate`
- Manual payment references are stored only as masked text and `last_four`.
- Related persistence tables:
  - `idempotency_keys`
  - `order_state_events`
  - `order_holds`
  - `order_payments`

## Community feed and moderation

- Community feed endpoints:
  - `GET /api/v1/community/feed`
  - `POST /api/v1/community/posts` (supports replies via `parent_post_id`)
  - `POST /api/v1/community/posts/:id/report`
  - `GET /api/v1/community/reports/mine`
- Moderation endpoints:
  - `GET /api/v1/community/moderation/queue`
  - `POST /api/v1/community/moderation/posts/:id/decision`
  - `POST /api/v1/community/moderation/reports/:id/decision`
- Anti-abuse controls:
  - account throttle: max posts/hour (default 10)
  - optional IP/device throttle limits
  - local CAPTCHA challenges via `POST /api/v1/community/captcha/challenge`
  - allowlist/blocklist rules (`community-rules` table)
  - temporary/permanent bans (`community-bans` table)
- Report statuses are visible to reporters via `community/reports/mine`.

## Security, audit, and reconciliation

- Authentication now supports salted password hashing (`scrypt`) via:
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
- Repeated login failures trigger lockout:
  - account locked for 15 minutes after 8 failed attempts
  - events written to queryable `security_events`
- Sensitive APIs support optional anti-replay request timestamps using
  `x-request-timestamp` within configured window.
- Permission changes are tracked with complete audit trail:
  - `PUT /api/v1/security/users/:id/permissions`
- Fine issuance and refund processing are auditable and financial-log backed:
  - `POST /api/v1/fines`
  - `POST /api/v1/refunds/:id/process`
- Financial logs are tamper-evident with chained hashes in `financial_logs`.
- Reconciliation APIs:
  - `GET /api/v1/reconciliation/daily?date=YYYY-MM-DD`
  - `POST /api/v1/reconciliation/shift-close`
  - `GET /api/v1/reconciliation/shift/:shiftKey`
- Variance flag is raised when drawer counted total differs from expected by more than `$5.00`.
