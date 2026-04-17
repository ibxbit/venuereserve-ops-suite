# Test Coverage Audit

## Backend Endpoint Inventory
- Project type declaration exists at top of README: `Project Type: fullstack` (`repo/README.md:3`).
- API prefix resolved as `/api/v1` from router mount (`repo/backend/src/routes/index.js`).
- Unique endpoint inventory source: `repo/.tmp/generated-endpoint-inventory.json:1-838` and `repo/.tmp/generated-endpoint-inventory.md:1-135`.
- Total unique endpoints: **127** (`repo/.tmp/generated-endpoint-inventory.json:4`).
- Inventory covers direct routes + CRUD-generated resources + reservations + commerce + community + security groups (`repo/.tmp/generated-endpoint-inventory.md:7-135`).

## API Test Mapping Table
- Full per-endpoint table (all 127 endpoints) with:
  - endpoint
  - HTTP-covered yes/no
  - true no-mock yes/no
  - test files
- Evidence location: `repo/.tmp/test-coverage-verification.md:20-148`.
- Table quality check: each listed endpoint row maps at least one concrete test file path; uncovered list is explicit (`repo/.tmp/test-coverage-verification.md:150-151`).

## API Test Classification
1. **True No-Mock HTTP**
   - Files: `repo/API_tests/no-mock/direct-endpoints.no-mock.api.test.js`, `repo/API_tests/no-mock/crud-endpoints.no-mock.api.test.js`, `repo/API_tests/no-mock/reservations-endpoints.no-mock.api.test.js`, `repo/API_tests/no-mock/commerce-endpoints.no-mock.api.test.js`, `repo/API_tests/no-mock/community-endpoints.no-mock.api.test.js`, `repo/API_tests/no-mock/security-endpoints.no-mock.api.test.js`.
   - Real app bootstrap evidence: `createApp()` + `request(app)` in no-mock tests (example: `repo/API_tests/no-mock/direct-endpoints.no-mock.api.test.js:24-37`).
   - Real DB path evidence: harness imports real `db.js` and does not mock transport/controllers/services (`repo/backend/tests/helpers/real-db-harness.js:1-8`, `repo/backend/tests/helpers/real-db-harness.js:52-55`).

2. **HTTP with Mocking**
   - `repo/API_tests/run-all.api.test.js:7` (`vi.mock("../backend/src/db.js")`)
   - `repo/backend/tests/integration/auth-rbac.test.js:7` (`vi.mock("../../src/db.js")`)
   - `repo/backend/tests/integration/business-flows.test.js:14` (`vi.mock("../../src/db.js")`)
   - `repo/backend/tests/integration/core-logic.test.js:7` (`vi.mock("../../src/db.js")`)
   - `repo/backend/tests/integration/security-hardening.test.js:7` (`vi.mock("../../src/db.js")`)
   - `repo/backend/tests/integration/security-acceptance-upgrades.test.js:8` (`vi.mock("../../src/db.js")`)
   - `repo/backend/tests/integration/audit-fix-verification.test.js:8` (`vi.mock("../../src/db.js")`)

3. **Non-HTTP (unit/integration without HTTP transport)**
   - Backend unit suite: `repo/backend/tests/unit/*.test.js` and `repo/unit_tests/run-all.unit.test.js`.
   - Frontend unit/component tests: `repo/frontend/src/**/__tests__/*.test.js`.

## Mock Detection (Strict)
- Detected backend-mocking in HTTP tests via `vi.mock` of DB module (files listed above).
- In no-mock suite (`repo/API_tests/no-mock/*.js`), static search found no executable `vi.mock/jest.mock/sinon.stub` usage; only comment text mentions (`repo/API_tests/no-mock/crud-endpoints.no-mock.api.test.js:3`, `repo/API_tests/no-mock/direct-endpoints.no-mock.api.test.js:3`).
- Frontend tests intentionally mock frontend API service modules (example `repo/frontend/src/pages/__tests__/LoginPage.test.js`), but this does not affect backend true no-mock API classification.

## Coverage Summary
- Total endpoints: **127** (`repo/.tmp/generated-endpoint-inventory.json:4`).
- Endpoints with HTTP tests: **127** (`repo/.tmp/test-coverage-verification.md:6`).
- Endpoints with TRUE no-mock HTTP tests: **127** (`repo/.tmp/test-coverage-verification.md:7`).
- HTTP coverage %: **100.00%** (`repo/.tmp/test-coverage-verification.md:8`).
- True API coverage %: **100.00%** (`repo/.tmp/test-coverage-verification.md:9`).

## Unit Test Summary

### Backend Unit Tests
- Files include:
  - `repo/backend/tests/unit/account-standing-service.test.js`
  - `repo/backend/tests/unit/financial-log-service.test.js`
  - `repo/backend/tests/unit/roles.test.js`
  - `repo/backend/tests/unit/security-service.test.js`
  - `repo/backend/tests/unit/validation.test.js`
  - `repo/backend/tests/unit/order-expiry-worker.test.js`
  - `repo/backend/tests/unit/bootstrap-service.test.js`
- Modules covered:
  - **services:** account-standing, financial-log, security, order-expiry-worker, bootstrap
  - **auth/guards logic:** roles matrix (`repo/backend/tests/unit/roles.test.js`)
  - **utils/validation:** validation guards (`repo/backend/tests/unit/validation.test.js`)
- Important backend modules not directly unit-tested (still exercised by HTTP tests):
  - `repo/backend/src/routes/crud-router.js`
  - `repo/backend/src/middleware/authorize.js`
  - `repo/backend/src/middleware/anti-replay.js`
  - `repo/backend/src/middleware/error-handler.js`
  - `repo/backend/src/routes/reservations.js`, `repo/backend/src/routes/commerce.js`, `repo/backend/src/routes/community.js`, `repo/backend/src/routes/security.js`

### Frontend Unit Tests (STRICT REQUIREMENT)
- Frontend test files exist (examples):
  - `repo/frontend/src/pages/__tests__/LoginPage.test.js`
  - `repo/frontend/src/pages/__tests__/HomePage.test.js`
  - `repo/frontend/src/pages/__tests__/AccessDeniedPage.test.js`
  - `repo/frontend/src/services/__tests__/api.test.js`
  - `repo/frontend/src/auth/__tests__/roles.test.js`
  - plus existing page/component suites under `repo/frontend/src/pages/__tests__/`.
- Framework/tooling evidence:
  - Vitest imports (`from "vitest"`) across frontend test files.
  - Vue Test Utils usage (`from "@vue/test-utils"`) in component/page tests.
- Components/modules covered by direct import/render:
  - `LoginPage.vue`, `HomePage.vue`, `AccessDeniedPage.vue`
  - `AvailabilityPage.vue`, `CommerceCartPage.vue`, `CommunityFeedPage.vue`, `ModerationConsolePage.vue`, `OperationsAuditPage.vue`, `RoleDashboardPage.vue`
  - Entity pages (`UsersPage.vue`, `ResourcesPage.vue`, `ReservationsPage.vue`, `OrdersPage.vue`, `RefundsPage.vue`, `CatalogItemsPage.vue`, `FinesPage.vue`, `AuditTrailsPage.vue`)
  - `App.vue`, `router.js`, `services/api.js`, `auth/roles.js`, `utils/client-helpers.js`
- Important frontend modules not directly tested (minor):
  - `repo/frontend/src/main.js`
  - `repo/frontend/src/pages/EntityPage.vue` (legacy shell page)

**Frontend unit tests: PRESENT**

### Cross-Layer Observation
- Backend has complete endpoint-level no-mock API coverage per static matrix.
- Frontend has broad component/unit coverage with direct file-level evidence.
- Balance is acceptable; no backend-heavy-without-frontend-testing pattern detected.

## Tests Check
- API observability: strong in no-mock suite (explicit endpoint calls + request payloads + response assertions visible in test bodies; example `repo/API_tests/no-mock/direct-endpoints.no-mock.api.test.js:53-70`, `repo/API_tests/no-mock/crud-endpoints.no-mock.api.test.js`).
- Test depth: includes success, failure, auth, permission, and validation checks across groups (see no-mock group files and mapping matrix in `repo/.tmp/test-coverage-verification.md`).
- `run_tests.sh` policy check:
  - Docker-based runner path present and primary (`repo/run_tests.sh:4-12`, `repo/run_tests.sh:45-54`) -> **OK**.
  - Main script has no host `npm ci` fallback -> no strict-environment flag.
- End-to-end expectation (fullstack): explicit browser-driven FE↔BE runtime E2E is not evidenced in this static pass; however 100% no-mock backend API coverage + frontend unit/component breadth provides strong compensation.

## Test Coverage Score (0–100)
**96/100**

## Score Rationale
- + Endpoint coverage breadth: full (127/127).
- + True no-mock API coverage: full (127/127).
- + Over-mocking risk mitigated by dedicated no-mock suite.
- + Frontend unit/component evidence is substantial and explicit.
- - Minor deduction for absence of clearly documented real browser FE↔BE E2E suite in audited static evidence.

## Key Gaps
- No blocking gap for strict coverage thresholds.
- Non-blocking improvement: add explicit real FE↔BE browser-level E2E proof artifact for fullstack expectations.

## Confidence & Assumptions
- Confidence: **high** for endpoint counts, mapping, and README hard-gate checks.
- Assumptions:
  - Generated artifacts (`repo/.tmp/generated-endpoint-inventory.*`, `repo/.tmp/test-coverage-verification.md`) are current and produced from this repository state.
  - Static audit does not execute tests; runtime success is inferred only from code/artifact evidence.

---

# README Audit

## High Priority Issues
- None (hard gates pass).

## Medium Priority Issues
- README is long; quick-start and deep-dive sections could be separated for maintainability (non-gate issue).

## Low Priority Issues
- Minor editorial tightening possible in later architecture sections; no compliance impact.

## Hard Gate Failures
- None.

## Hard Gate Evidence Check
- README exists at required path: `repo/README.md`.
- Project type declared near top: `Project Type: fullstack` (`repo/README.md:3`).
- Required startup command present exactly: `docker-compose up` (`repo/README.md:21`).
- Access methods include URL + ports (`repo/README.md:35-38`).
- Verification methods include API curl + UI flow + auth behavior (`repo/README.md:45-55`, `repo/README.md:67-84`).
- Environment rules satisfied in main flow: explicit statement prohibiting runtime/manual setup for standard path (`repo/README.md:28-29`).
- Auth exists and demo credentials include all roles with email + password (`repo/README.md:92-98`).

## README Verdict (PASS / PARTIAL PASS / FAIL)
**PASS**
