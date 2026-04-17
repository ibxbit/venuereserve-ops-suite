// True no-mock API test suite: reservations router endpoints.
//
// Covers:
//   GET /reservations, GET /reservations/:id, POST/PUT/DELETE /reservations,
//   POST /reservations/:id/check-in, POST /reservations/mark-no-shows,
//   GET /calendar/day-rules,
//   GET /booking-exceptions, POST /booking-exceptions,
//   POST /booking-exceptions/:id/decision,
//   GET /availability,
//   GET /account-standing-policy, PUT /account-standing-policy/:id,
//   GET /account-standing/:userId,
//   GET /attendance-history,
//   GET /reservation-overrides, POST /reservation-overrides.

import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  authHeader,
  getDb,
  resetRealDb,
  seedResource,
  setupRealDb,
  userIdsByRole,
} from "../../backend/tests/helpers/real-db-harness.js";

let app;
let resourceId;

beforeAll(async () => {
  await setupRealDb();
  const { createApp } = await import("../../backend/src/app.js");
  app = createApp().callback();
});

beforeEach(async () => {
  await resetRealDb();
  const db = await getDb();
  resourceId = await seedResource(db, { name: "Reservations Test Room" });
});

function tomorrowAt(hour) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

async function createReservation({ userId = userIdsByRole.member, startOffset = 0 } = {}) {
  const db = await getDb();
  const now = new Date();
  const start = tomorrowAt(10 + startOffset);
  const end = new Date(start.getTime() + 30 * 60_000);
  const id = randomUUID();
  await db("reservations").insert({
    id,
    user_id: userId,
    resource_id: resourceId,
    start_time: start,
    end_time: end,
    status: "booked",
    notes: null,
    created_at: now,
    updated_at: now,
  });
  return { id, start, end };
}

describe("GET /api/v1/reservations (no-mock)", () => {
  test("returns list with data/pagination for manager", async () => {
    await createReservation();
    const response = await request(app)
      .get("/api/v1/reservations")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    expect(response.body.pagination.page).toBe(1);
  });

  test("returns only member's own reservations for member role", async () => {
    await createReservation({ userId: userIdsByRole.member });
    await createReservation({
      userId: userIdsByRole["member-2"],
      startOffset: 1,
    });
    const response = await request(app)
      .get("/api/v1/reservations")
      .set(authHeader("member"));
    expect(response.status).toBe(200);
    expect(
      response.body.data.every(
        (row) => row.user_id === userIdsByRole.member,
      ),
    ).toBe(true);
  });
});

describe("GET /api/v1/reservations/:id (no-mock)", () => {
  test("returns 200 for owner", async () => {
    const { id } = await createReservation();
    const response = await request(app)
      .get(`/api/v1/reservations/${id}`)
      .set(authHeader("member"));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(id);
  });

  test("returns 403 when member fetches another member reservation", async () => {
    const { id } = await createReservation({
      userId: userIdsByRole["member-2"],
    });
    const response = await request(app)
      .get(`/api/v1/reservations/${id}`)
      .set(authHeader("member"));
    expect(response.status).toBe(403);
  });

  test("returns 404 for unknown id", async () => {
    const response = await request(app)
      .get("/api/v1/reservations/nope")
      .set(authHeader("manager"));
    expect(response.status).toBe(404);
  });
});

describe("POST /api/v1/reservations (no-mock)", () => {
  test("returns 201 and persists reservation", async () => {
    const start = tomorrowAt(9);
    const end = new Date(start.getTime() + 30 * 60_000);
    const response = await request(app)
      .post("/api/v1/reservations")
      .set(authHeader("member"))
      .send({
        user_id: userIdsByRole.member,
        resource_id: resourceId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
    expect(response.status).toBe(201);
    expect(response.body.resource_id).toBe(resourceId);
  });
});

describe("PUT /api/v1/reservations/:id (no-mock)", () => {
  test("updates notes for owner", async () => {
    const { id, start, end } = await createReservation();
    const response = await request(app)
      .put(`/api/v1/reservations/${id}`)
      .set(authHeader("member"))
      .send({
        user_id: userIdsByRole.member,
        resource_id: resourceId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        notes: "updated note",
      });
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(id);
    expect(response.body.notes).toBe("updated note");
  });
});

describe("DELETE /api/v1/reservations/:id (no-mock)", () => {
  test("returns 204 for owner", async () => {
    const { id } = await createReservation();
    const response = await request(app)
      .delete(`/api/v1/reservations/${id}`)
      .set(authHeader("member"));
    expect(response.status).toBe(204);
  });

  test("member cannot delete another member's reservation", async () => {
    const { id } = await createReservation({
      userId: userIdsByRole["member-2"],
    });
    const response = await request(app)
      .delete(`/api/v1/reservations/${id}`)
      .set(authHeader("member"));
    expect(response.status).toBe(403);
  });
});

describe("POST /api/v1/reservations/:id/check-in (no-mock)", () => {
  test("returns 400 when too early", async () => {
    const { id } = await createReservation({ startOffset: 5 });
    const response = await request(app)
      .post(`/api/v1/reservations/${id}/check-in`)
      .set(authHeader("manager"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/reservations/mark-no-shows (no-mock)", () => {
  test("returns 200 with marked_count", async () => {
    const response = await request(app)
      .post("/api/v1/reservations/mark-no-shows")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(typeof response.body.marked_count).toBe("number");
  });
});

describe("GET /api/v1/calendar/day-rules (no-mock)", () => {
  test("returns 400 without date", async () => {
    const response = await request(app)
      .get("/api/v1/calendar/day-rules")
      .set(authHeader("member"));
    expect(response.status).toBe(400);
  });

  test("returns day-rule payload when date provided", async () => {
    const response = await request(app)
      .get("/api/v1/calendar/day-rules?date=2026-12-25")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(typeof response.body.is_closed === "boolean").toBe(true);
  });
});

describe("GET /api/v1/booking-exceptions (no-mock)", () => {
  test("returns array for authorized member", async () => {
    const response = await request(app)
      .get("/api/v1/booking-exceptions")
      .set(authHeader("member"));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});

describe("POST /api/v1/booking-exceptions (no-mock)", () => {
  test("returns 201 when valid payload", async () => {
    const response = await request(app)
      .post("/api/v1/booking-exceptions")
      .set(authHeader("member"))
      .send({
        user_id: userIdsByRole.member,
        resource_id: resourceId,
        start_time: tomorrowAt(14).toISOString(),
        end_time: tomorrowAt(15).toISOString(),
        request_reason: "personal event",
      });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("pending");
  });

  test("returns 400 when missing request_reason", async () => {
    const response = await request(app)
      .post("/api/v1/booking-exceptions")
      .set(authHeader("member"))
      .send({
        user_id: userIdsByRole.member,
        resource_id: resourceId,
        start_time: tomorrowAt(14).toISOString(),
        end_time: tomorrowAt(15).toISOString(),
      });
    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/booking-exceptions/:id/decision (no-mock)", () => {
  test("manager approval persists decision", async () => {
    const create = await request(app)
      .post("/api/v1/booking-exceptions")
      .set(authHeader("member"))
      .send({
        user_id: userIdsByRole.member,
        resource_id: resourceId,
        start_time: tomorrowAt(14).toISOString(),
        end_time: tomorrowAt(15).toISOString(),
        request_reason: "personal",
      });
    const response = await request(app)
      .post(`/api/v1/booking-exceptions/${create.body.id}/decision`)
      .set(authHeader("manager"))
      .send({ decision: "approved", decision_reason: "ok" });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("approved");
  });

  test("member cannot decide booking exception (403)", async () => {
    const response = await request(app)
      .post("/api/v1/booking-exceptions/anything/decision")
      .set(authHeader("member"))
      .send({ decision: "approved", decision_reason: "ok" });
    expect(response.status).toBe(403);
  });
});

describe("GET /api/v1/availability (no-mock)", () => {
  test("returns slots for valid params", async () => {
    const date = tomorrowAt(0).toISOString().slice(0, 10);
    const response = await request(app)
      .get(
        `/api/v1/availability?resource_id=${resourceId}&date=${date}&duration_minutes=30&user_id=${userIdsByRole.member}`,
      )
      .set(authHeader("member"));
    expect(response.status).toBe(200);
    expect(response.body.resource_id).toBe(resourceId);
    expect(Array.isArray(response.body.slots)).toBe(true);
  });

  test("returns 400 when resource_id missing", async () => {
    const response = await request(app)
      .get("/api/v1/availability")
      .set(authHeader("member"));
    expect(response.status).toBe(400);
  });
});

describe("GET /api/v1/account-standing-policy (no-mock)", () => {
  test("returns active policy", async () => {
    const response = await request(app)
      .get("/api/v1/account-standing-policy")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(typeof response.body.lookback_days).toBe("number");
  });
});

describe("PUT /api/v1/account-standing-policy/:id (no-mock)", () => {
  test("manager can update policy", async () => {
    const response = await request(app)
      .put("/api/v1/account-standing-policy/default-standing-policy")
      .set(authHeader("manager"))
      .send({ lookback_days: 45 });
    expect(response.status).toBe(200);
    expect(response.body.lookback_days).toBe(45);
  });
});

describe("GET /api/v1/account-standing/:userId (no-mock)", () => {
  test("returns 200 with standing_score", async () => {
    const response = await request(app)
      .get(`/api/v1/account-standing/${userIdsByRole.member}`)
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(typeof response.body.standing_score).toBe("number");
  });

  test("returns 404 for unknown user", async () => {
    const response = await request(app)
      .get("/api/v1/account-standing/nope")
      .set(authHeader("manager"));
    expect(response.status).toBe(404);
  });
});

describe("GET /api/v1/attendance-history (no-mock)", () => {
  test("returns data with pagination", async () => {
    const response = await request(app)
      .get("/api/v1/attendance-history")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });
});

describe("GET /api/v1/reservation-overrides (no-mock)", () => {
  test("returns array for manager", async () => {
    const response = await request(app)
      .get("/api/v1/reservation-overrides")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});

describe("POST /api/v1/reservation-overrides (no-mock)", () => {
  test("manager can create override", async () => {
    const response = await request(app)
      .post("/api/v1/reservation-overrides")
      .set(authHeader("manager"))
      .send({
        user_id: userIdsByRole.member,
        resource_id: resourceId,
        start_time: tomorrowAt(18).toISOString(),
        end_time: tomorrowAt(19).toISOString(),
        reason: "VIP override",
      });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("approved");
  });

  test("returns 400 for invalid range", async () => {
    const response = await request(app)
      .post("/api/v1/reservation-overrides")
      .set(authHeader("manager"))
      .send({
        user_id: userIdsByRole.member,
        start_time: tomorrowAt(19).toISOString(),
        end_time: tomorrowAt(18).toISOString(),
      });
    expect(response.status).toBe(400);
  });
});
