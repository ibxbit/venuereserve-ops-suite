import { describe, expect, test } from "vitest";
import { runBootstrap } from "../../src/services/bootstrap-service.js";
import { createFakeDb } from "../helpers/fake-db.js";

function seed() {
  return {
    users: [],
    resources: [],
  };
}

describe("bootstrap service", () => {
  test("seeds baseline resources and initial manager", async () => {
    const fakeDb = createFakeDb(seed());

    const first = await runBootstrap({
      db: fakeDb,
      adminEmail: "manager@example.com",
      adminPassword: "StrongPass123",
      adminFullName: "Studio Manager",
    });
    const second = await runBootstrap({
      db: fakeDb,
      adminEmail: "manager@example.com",
      adminPassword: "StrongPass123",
      adminFullName: "Studio Manager",
    });

    expect(first.resources_created).toBeGreaterThan(0);
    expect(first.admin_created).toBe(true);
    expect(second.resources_created).toBe(0);
    expect(second.admin_created).toBe(false);

    expect(fakeDb.__state.resources.length).toBeGreaterThanOrEqual(2);
    const manager = fakeDb.__state.users.find(
      (user) => user.email === "manager@example.com",
    );
    expect(manager?.role).toBe("manager");
    expect(manager?.password_hash).toBeTruthy();
  });
});
