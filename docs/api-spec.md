# API Specification - VenueReserve Operations Suite

This document outlines the RESTful API endpoints for the VenueReserve Operations Suite. All endpoints return JSON and expect JSON payloads unless otherwise specified.

**Base URL**: `http://<server-ip>:4000/api/v1`

---

## Global Headers & Behavior

### Required for All Requests
- **`Authorization`**: `Bearer <token>` (Required for all routes except `/auth/login`, `/auth/register`, and `/health`).
- **`x-actor-user-id`**: The UUID of the user performing the action (provided by the frontend service/session).
- **`x-user-role`**: The role of the acting user (`member`, `front-desk`, `manager`, `moderator`, `auditor`).

### Required for Write Operations
- **`x-idempotency-key`**: A unique client-generated string (e.g., UUID) to ensure requests are processed exactly once.

### Optional Security
- **`x-request-timestamp`**: Unix timestamp (seconds) for anti-replay protection. Requests outside a 5-minute window are rejected.

---

## 1. Authentication
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Register a new user (Role defaults to `member`). | Public |
| `POST` | `/auth/login` | Login with email/password. | Public |

**Login Response Example**:
```json
{
  "user_id": "uuid",
  "full_name": "John Doe",
  "role": "member",
  "token": "session-token-uuid",
  "token_expires_at": "ISO-8601",
  "actor_headers": {
    "x-actor-user-id": "uuid",
    "x-user-role": "member"
  }
}
```

---

## 2. Resources & Availability
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/resources` | List all resources (rooms, equipment, seats). | Member+ |
| `GET` | `/availability` | Browse availability. Query: `resource_id`, `date`, `duration_minutes`. | Member+ |

**Availability Response**: Includes `requested` slot status, `conflicts` (plain language array), and `alternatives` (suggested free slots).

---

## 3. Reservations
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/reservations` | Create a reservation. Supports optional `exception_request_id`. | Member+ |
| `POST` | `/reservations/:id/check-in` | Mark check-in. Allowed 10m before/15m after start. | Staff+ |
| `POST` | `/reservations/mark-no-shows`| Batch process expired bookings to penalize standing. | Staff+ |
| `GET` | `/booking-exceptions` | List pending exception requests. | Staff+ |
| `POST` | `/booking-exceptions` | Request manager approval for a policy-violating slot. | Member+ |
| `POST` | `/booking-exceptions/:id/decision` | Approve or reject an exception request. | Manager |

---

## 4. Commerce & Cart
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/commerce/catalog` | Fetch active memberships, class packs, and merchandise. | Member+ |
| `POST` | `/commerce/cart/quote` | Recalculate cart totals with real-time coupon validation. | Member+ |
| `POST` | `/commerce/checkout` | Create orders. Params: `items`, `coupon_code`, `split_mode`. | Member+ |
| `POST` | `/commerce/orders/:id/pay` | Capture payment (Local Tender). Masks sensitive refs. | Member+ |
| `POST` | `/commerce/orders/expire-unpaid`| Auto-expire unpaid orders after 15 minutes. | System |
| `POST` | `/commerce/orders/:id/split`| Split order by fulfillment path. | Staff+ |
| `POST` | `/commerce/orders/merge` | Merge compatible pending orders. | Staff+ |

**Split Modes**: `auto_split` (by fulfillment path) or `merge_all` (single order).

---

## 5. Account Standing
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/account-standing/:userId`| Get score and peak-restriction status. | Member+ |
| `GET` | `/attendance-history` | Paginated history of check-ins and no-shows. | Member+ |
| `GET` | `/account-standing-policy`| Fetch current scoring rules and peak-hour window. | Any |

---

## 6. Community & Moderation
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/community/feed` | List published posts and hierarchical replies. | Member+ |
| `POST` | `/community/posts` | Submit content. Requires `captcha_answer` if enabled. | Member+ |
| `POST` | `/community/posts/:id/report` | Flag content. Auto-holds at threshold (default: 3). | Member+ |
| `GET` | `/community/moderation/queue`| List held posts and open reports. | Moderator+ |
| `POST` | `/community/moderation/posts/:id/decision` | Accept or reject content. | Moderator+ |

---

## 7. Financials & Audit
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/fines` | Issue manual fine (appends to financial log). | Staff+ |
| `POST` | `/refunds/:id/process` | Approve/Reject refund. Updates order state. | Manager |
| `GET` | `/reconciliation/daily` | Audit summary of transactions by method. | Auditor |
| `POST` | `/reconciliation/shift-close`| Record drawer counts and flag variance > $5.00. | Staff+ |
| `GET` | `/security/events` | Audit log of login failures, perm changes, etc. | Auditor |
