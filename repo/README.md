# Fitness and Wellness Studio Platform (Local Network)

**Project Type: fullstack**

This is the first implementation slice for the core platform architecture:

- Vue.js front end (`frontend/`) that consumes local REST APIs
- Koa backend (`backend/`) exposing API endpoints for users, resources,
  reservations, orders, refunds, and audit trail reads
- MySQL as the system of record via Knex migrations
- Offline-first behavior in the front end using local cache + queued write
  operations
- Role-based dashboards and access control for Members, Front Desk Staff,
  Studio Managers, Moderators, and Auditors

## Start Command (How to Run)

From the `repo` directory, run the single primary startup command:

```bash
docker-compose up
```

This single command starts all declared dependencies (MySQL, backend,
frontend), waits for database readiness, runs migrations automatically,
seeds baseline resources, and seeds the demo role accounts listed below.

No `npm install`, `pip install`, `apt-get`, or manual database creation is
required for the standard run path. Everything is fully Docker-contained.

## Service Address (Access)

After `docker-compose up`, services are available at:

- Frontend (Vue): `http://localhost:5173`
- Backend API (Koa): `http://localhost:4000/api/v1`
- Health probe: `http://localhost:4000/api/v1/health`
- MySQL (host port): `localhost:3306`

## Verification Guide

After `docker-compose up`, confirm the system is running by completing all
three checks below.

### 1) API check (curl)

```bash
curl -s http://localhost:4000/api/v1/health
```

Expected output (timestamp will vary):

```json
{ "status": "ok", "service": "studio-backend", "timestamp": "..." }
```

For an authenticated probe, sign in as the demo manager:

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo-manager@local.test","password":"DemoStudio123!"}'
```

Expected: HTTP 200 with `{ token, user_id, role: "manager", ... }`.

### 2) Web UI flow

1. Open `http://localhost:5173` in a browser.
2. The home view loads and shows the **Core Platform Architecture** tiles.
3. Click **Sign In**, log in with `demo-manager@local.test` /
   `DemoStudio123!`.
4. After login, the Studio Manager dashboard is displayed and protected
   navigation links are enabled.

### 3) Authorization check

Without a token, calling a protected endpoint must return JSON 401:

```bash
curl -s -i http://localhost:4000/api/v1/me/dashboard | head -1
```

Expected: `HTTP/1.1 401 Unauthorized`.

## Demo Credentials (one per role)

`docker-compose up` runs the bootstrap script which seeds one demo account
per role. All five accounts share the same password to make local QA
reproducible. **Rotate these passwords for any non-local environment.**

| Role          | Email                          | Password         |
| ------------- | ------------------------------ | ---------------- |
| member        | `demo-member@local.test`       | `DemoStudio123!` |
| front-desk    | `demo-frontdesk@local.test`    | `DemoStudio123!` |
| manager       | `demo-manager@local.test`      | `DemoStudio123!` |
| moderator     | `demo-moderator@local.test`    | `DemoStudio123!` |
| auditor       | `demo-auditor@local.test`      | `DemoStudio123!` |

The bootstrap is idempotent and re-runs are safe — existing accounts are
not overwritten. The default-seeded production-style manager
(`manager@local.test` / `LocalManagerPass123!`) is also created so the
existing operational documentation continues to work.

To disable the demo accounts in a specific deployment, set
`BOOTSTRAP_SEED_DEMO_ACCOUNTS=false` in `docker-compose.yml` before bringing
the stack up.

## Running Tests

The single supported test command is Docker-contained and runs every test
suite in the backend container against the same toolchain as production:

```bash
./run_tests.sh
```

This script:

1. Brings up the Compose services (build if needed, start if not running).
2. Runs all unit tests from `unit_tests/` inside the backend container.
3. Runs all API tests from `API_tests/` inside the backend container — this
   includes the no-mock HTTP suite under `API_tests/no-mock/` which boots
   the real app, runs through real route handlers, and persists via the
   real `db.js` layer.

To run both backend and frontend test suites together:

```bash
./run_all_tests.sh
```

Both runners are deterministic and CI-safe.

## Project Structure

```text
repo/
├── backend/
│   ├── migrations/
│   ├── src/
│   └── tests/
│       └── helpers/real-db-harness.js   ← real-db setup for no-mock tests
├── frontend/
│   ├── src/
│   └── dist/
├── API_tests/
│   ├── run-all.api.test.js
│   └── no-mock/                         ← true no-mock HTTP suite
├── unit_tests/
├── scripts/
│   └── generate-endpoint-inventory.mjs  ← endpoint inventory generator
├── docker-compose.yml
└── run_tests.sh
```

## Role and access behavior

- Frontend role profile selector switches dashboard views and routes.
- Backend enforces RBAC from authenticated Bearer sessions
  (`Authorization: Bearer <token>`).
- Protected endpoints return `401` JSON when missing/invalid/expired token.
- Public endpoints: `GET /api/v1/health`, `POST /api/v1/auth/register`,
  `POST /api/v1/auth/login`.
- Dashboard metadata endpoint: `GET /api/v1/me/dashboard`.

## Resource and reservation policy rules

- Resources store configurable policy fields (booking window, min/max
  duration, early check-in window, late grace, slot stitching).
- Reservation API enforces booking window, duration limits, 30-minute slot
  increments, and overlap prevention.
- Adjacent 30-minute reservations for the same member/resource are stitched
  into one continuous reservation when policy allows.
- Check-in: `POST /api/v1/reservations/:id/check-in`.
- No-show batch: `POST /api/v1/reservations/mark-no-shows`.

## Availability and conflict detection

- Availability: `GET /api/v1/availability` with `resource_id`, `user_id`,
  `date`, `duration_minutes`, optional `start_time`.
- Conflict explanations are returned in plain language for capacity,
  occupancy overlap, cleaning buffer, blocked resource, blacklist.
- Alternative slot suggestions are returned with each availability response.
- Additional policy entities: `resource-blocks`, `reservation-blacklists`.

## Account standing and booking restrictions

- Users have an internal standing score (`0-100`) in `users.standing_score`.
- Standing is recalculated from `attendance_history` using configurable
  policy in `account_standing_policies`.
- Peak-hour restrictions apply when standing score is below threshold or
  recent no-shows reach the limit.
- Restricted peak-hour bookings require an approved manager override from
  `reservation_overrides`.
- API endpoints:
  - `GET /api/v1/account-standing-policy`
  - `PUT /api/v1/account-standing-policy/:id` (manager)
  - `GET /api/v1/account-standing/:userId`
  - `GET /api/v1/attendance-history?user_id=...`
  - `GET /api/v1/reservation-overrides`
  - `POST /api/v1/reservation-overrides` (manager)

## Calendar, holidays, and booking exceptions

- Holiday rules in `holiday_rules`, editable at `/holiday-rules` in the UI.
- Calendar day rule: `GET /api/v1/calendar/day-rules?date=YYYY-MM-DD`.
- Availability view surfaces holiday context and reduced-hour windows.
- Exception workflow:
  - Submit: `POST /api/v1/booking-exceptions`
  - Decide: `POST /api/v1/booking-exceptions/:id/decision` (manager)
  - List: `GET /api/v1/booking-exceptions`
- Reservation create/update accepts `exception_request_id`; approved
  matching exceptions can bypass standard rule conflicts.
- All exception requests and decisions are written to `audit_trails`.

## Unified cart, pricing, coupons, and fulfillment split/merge

- Catalog: `GET /api/v1/commerce/catalog`.
- Coupons: `GET /api/v1/commerce/coupons`.
- Real-time cart quote: `POST /api/v1/commerce/cart/quote` (supports
  `items` and `reservation_lines` in one payload).
- Checkout with split/merge mode: `POST /api/v1/commerce/checkout`.
- Post-checkout operations:
  - `POST /api/v1/commerce/orders/:id/split`
  - `POST /api/v1/commerce/orders/merge`
  - `POST /api/v1/commerce/orders/:id/transition`
- Order viewing (read-only):
  - `GET /api/v1/orders` (Members see self-owned, Managers see all)
  - `GET /api/v1/orders/:id` (Ownership enforced)
- Coupon rules support fixed and percentage discounts with minimum
  subtotal, category targeting, and max discount cap. Seeded examples
  include `$10 off purchases over $75` (`SAVE10OVER75`) and
  `15% off class pack, max $25` (`CLASSPACK15`).

## Order state machine, idempotency, and local payments

- Orders use explicit state transitions:
  `pending_payment → paid → active|awaiting_pickup → fulfilled` with
  `pending_payment → cancelled|expired` side branches.
- Client idempotency keys are required for write operations
  (`x-idempotency-key` header or `idempotency_key` body field).
- Unpaid orders auto-expire after 15 minutes via background worker or
  manual `POST /api/v1/commerce/orders/expire-unpaid`.
- Supported local payment methods only: `cash`, `card_terminal`,
  `gift_certificate`. References stored as masked text and `last_four`.
- Related persistence tables: `idempotency_keys`, `order_state_events`,
  `order_holds`, `order_payments`.

## Community feed and moderation

- Feed: `GET /api/v1/community/feed`.
- Posting: `POST /api/v1/community/posts` (replies via `parent_post_id`).
- Reporting: `POST /api/v1/community/posts/:id/report`,
  `GET /api/v1/community/reports/mine`.
- Moderation: `GET /api/v1/community/moderation/queue`,
  `POST /api/v1/community/moderation/posts/:id/decision`,
  `POST /api/v1/community/moderation/reports/:id/decision`.
- Anti-abuse: account/IP/device throttle, local CAPTCHA via
  `POST /api/v1/community/captcha/challenge`, allow/block rules
  (`community-rules`), bans (`community-bans`).

## Security, audit, and reconciliation

- Auth: salted password hashing (`scrypt`) via `POST /api/v1/auth/register`
  and `POST /api/v1/auth/login`.
- Repeated login failures lock the account for 15 minutes after 8 attempts;
  events written to queryable `security_events`.
- Sensitive APIs support optional anti-replay timestamps via
  `x-request-timestamp`.
- Permission changes carry full audit trail and are restricted to managers
  with `security.permissions.manage`. Self-grant of privileged permissions
  is denied. Endpoints:
  - `PUT /api/v1/security/users/:id/permissions`
  - `GET /api/v1/user-permissions` (List/Browse)
- Fines and refund processing are auditable and financial-log backed:
  - `POST /api/v1/fines`
  - `POST /api/v1/refunds/:id/process`
  - `GET /api/v1/financial-logs` (Read-only)
- Financial logs are tamper-evident with chained hashes in `financial_logs`.
- Reconciliation:
  - `GET /api/v1/reconciliation/daily?date=YYYY-MM-DD`
  - `POST /api/v1/reconciliation/shift-close`
  - `GET /api/v1/reconciliation/shift/:shiftKey`
- Variance flag is raised when drawer counted total differs from expected
  by more than `$5.00`.

## Remaining scope exclusions and limitations

- CAPTCHA is a local arithmetic challenge for audit/testing; not a
  production anti-bot service.
- Tamper-evident verification in the frontend flags hash-chain continuity
  issues from retrieved rows but does not recompute server-side payload
  hashes in-browser.
- Real-time dashboards and audit browsers are polling/refresh-based; no
  websocket push channel in this slice.
- Some moderation/security settings are read-only for lower-privilege
  roles due to RBAC constraints.

## Frontend Static Audit Mapping

- Detailed requirement-to-file and requirement-to-test mapping:
  - `frontend/docs/frontend-static-audit-mapping.md`
