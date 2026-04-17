# VenueReserve Frontend Static Audit Mapping

This document maps prompt-required frontend coverage to concrete Vue files and tests.

## Dedicated Entity Pages

- Reservations: `frontend/src/pages/ReservationsPage.vue`
- Orders: `frontend/src/pages/OrdersPage.vue`
- Refunds: `frontend/src/pages/RefundsPage.vue`
- Catalog Items: `frontend/src/pages/CatalogItemsPage.vue`
- Fines: `frontend/src/pages/FinesPage.vue`
- Audit Trails: `frontend/src/pages/AuditTrailsPage.vue`
- Users: `frontend/src/pages/UsersPage.vue`
- Resources: `frontend/src/pages/ResourcesPage.vue`

Each dedicated page maps to route-level navigation and renders explicit entity flow UI through the shared entity workflow component in `frontend/src/pages/EntityPage.vue`.

## Router and Navigation Verifiability

- Route definitions and page imports: `frontend/src/router.js`
- Sidebar navigation links: `frontend/src/App.vue`
- Route-to-page mapping test: `frontend/src/pages/__tests__/entity-route-mapping.test.js`

## Entity Flow and CRUD Coverage

- Shared CRUD and state handling implementation: `frontend/src/pages/EntityPage.vue`
- CRUD integration coverage for required entities:
  - `frontend/src/pages/__tests__/entity-crud.integration.test.js`
- Offline/online transitions, queued operations, and forbidden state coverage:
  - `frontend/src/pages/__tests__/entity-offline.integration.test.js`
- E2E-style app-shell route and flow coverage:
  - `frontend/src/__tests__/entity-flows.e2e.test.js`

## Prompt Flow Coverage (Extended)

- Advanced reservation rules and exception flow:
  - `frontend/src/pages/AvailabilityPage.vue`
  - tests: `frontend/src/pages/__tests__/AvailabilityPage.test.js`
- Coupon logic presentation and recalculation states:
  - `frontend/src/pages/CommerceCartPage.vue`
  - tests: `frontend/src/pages/__tests__/CommerceCartPage.test.js`
- Moderation throttles and policy visibility:
  - `frontend/src/pages/ModerationConsolePage.vue`
  - `frontend/src/pages/CommunityFeedPage.vue`
  - tests: `frontend/src/pages/__tests__/ModerationConsolePage.test.js`, `frontend/src/pages/__tests__/CommunityFeedPage.test.js`
- Audit, reconciliation, and security event browsing:
  - `frontend/src/pages/OperationsAuditPage.vue`
  - tests: `frontend/src/pages/__tests__/OperationsAuditPage.test.js`

## Shared Utilities (Refactor)

- Reusable client-side business/state helpers: `frontend/src/utils/client-helpers.js`
- Utility tests: `frontend/src/utils/__tests__/client-helpers.test.js`

## Known Scope Notes

- Dedicated entity pages use a shared, statically test-covered pattern (`EntityPage.vue`) to avoid duplicate CRUD logic and keep behavior consistent across entities.
- E2E coverage is implemented as full-app router integration tests in Vitest (`entity-flows.e2e.test.js`) instead of browser-driver tooling.
