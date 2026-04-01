# System Design - VenueReserve Operations Suite

## 1. Architectural Overview

VenueReserve is a full-stack suite designed for localized, resilient fitness and wellness studio management. It prioritizes data integrity and availability over distributed consistency, using a local area network (LAN) client-server model.

### Technology Stack
- **Frontend**: Vue.js (SPA) using `axios` for API interactions and `localStorage` for offline persistence.
- **Backend**: Node.js with Koa (RESTful API), `pino` for structured logging, and `scrypt` for security.
- **Database**: MySQL managed via Knex migrations.
- **Testing**: Vitest for unit and integration testing with a Knex-compatible memory driver (`fake-db`).

---

## 2. Offline-First Resilience

The system operates with a "local-first" mindset to ensure studio staff can process sales and check-ins regardless of network stability.

### Local Caching
- **Entity Cache**: GET requests (e.g., catalog, resources) populate a local `localStorage` cache.
- **Transparent Fallback**: If the server is unreachable, `fetchList` returns the cached data and markers the response as `offline: true` for UI awareness.

### Background Sync Queue
- **Operation Enqueueing**: Mutative operations (POST/PUT/DELETE) that fail due to network errors are stored in a `studio-offline-queue`.
- **Automatic Replay**: A global `online` listener triggers a `syncQueue` process to replay cached operations sequentially once connectivity is restored.

---

## 3. Data Integrity & Auditing

### Tamper-Evident Financial Logging
- **Deterministic Chaining**: Every entry in `financial_logs` contains an `entry_hash` derived from its payload and the `entry_hash` of its immediate predecessor.
- **Payload Stability**: Payloads are stringified using a deterministic (sorted keys) algorithm to ensure consistent hash generation.
- **Audit Requirement**: Any modification to a historical log entry breaks the hash chain, facilitating immediate detection of data tampering.

### Idempotent State Transitions
- **Client-Generated Keys**: All write operations require an `x-idempotency-key`.
- **Deduplication Router**: The backend checks keys before execution; duplicate requests receive the cached result of the original successful response, preventing double-billing or duplicate resource allocation.

---

## 4. Domain-Specific Engines

### Reservation Engine Logic
The engine evaluates booking requests against eight distinct rule layers:
1. **Operating Hours**: Requests must fall within the studio's open/close window (standard or holiday).
2. **Booking Window**: Enforces a 30-day lookahead for standard members.
3. **Duration Limits**: Minimum of 30 minutes, maximum of 4 hours, in 30-minute increments.
4. **Capacity**: Validates total occupant count for shared resources.
5. **Occupancy Overlap**: Prevents double-booking of specific seats or equipment.
6. **Cleaning Buffer**: Automatically enforces a 15-minute gap between sequential bookings.
7. **Resource Blacklist**: Checks for individual resource-level blocks (maintenance/cleaning).
8. **Holiday Closures**: Overrides standard hours with global studio-wide closures.

### Account Standing Score
- **Dynamic Rating**: Scores are recalibrated based on attendance events. Check-ins grant positive points, while unexcused no-shows trigger significant penalties.
- **Peak-Hour Restriction**: Users with scores below the `low_score_threshold` (default 60) or more than 2 no-shows in 30 days are automatically blocked from self-booking during peak hours (e.g., 17:00 - 20:00).
- **Manager Overrides**: Managers can issue manual overrides for standing-restricted slots through an exception approval workflow.

### Commerce State Machine
Orders follow a strict transition path to ensure inventory and reservation holds are correctly managed:
`pending_payment` → (`paid` OR `cancelled` OR `expired`) → `fulfilled`.
- **Auto-Expiration**: Unpaid orders are swept every 15 minutes; expired orders release all inventory and reservation blocks back to the catalog/engine.
- **Split Fulfillment**: Orders are automatically grouped by `fulfillment_path` (e.g., `instant_activation` vs `front_desk_pickup`) to allow partial fulfillment and specialized handling.
