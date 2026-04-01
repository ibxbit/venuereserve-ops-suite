import {
  getPermissionsForRole,
  hasPermission,
  normalizeRole,
  roles,
} from "../../src/auth/roles.js";

describe("roles", () => {
  test("normalizeRole handles valid/invalid input", () => {
    expect(normalizeRole(" MANAGER ")).toBe("manager");
    expect(normalizeRole("unknown")).toBe("member");
    expect(normalizeRole(null)).toBe("member");
  });

  test("hasPermission checks role matrix", () => {
    expect(hasPermission(roles.MEMBER, "community.write")).toBe(true);
    expect(hasPermission(roles.MEMBER, "community.moderate")).toBe(false);

    expect(hasPermission(roles.FRONT_DESK, "reservations.write")).toBe(true);
    expect(hasPermission(roles.FRONT_DESK, "community.moderate")).toBe(false);

    expect(hasPermission(roles.MANAGER, "community.moderate")).toBe(true);
    expect(hasPermission(roles.MANAGER, "reports.financial")).toBe(true);

    expect(hasPermission(roles.MODERATOR, "community.moderate")).toBe(true);
    expect(hasPermission(roles.MODERATOR, "orders.write")).toBe(false);

    expect(hasPermission(roles.AUDITOR, "reports.security")).toBe(true);
    expect(hasPermission(roles.AUDITOR, "orders.write")).toBe(false);
  });

  test("getPermissionsForRole returns non-empty for each role", () => {
    for (const role of Object.values(roles)) {
      expect(getPermissionsForRole(role).length).toBeGreaterThan(0);
    }
  });
});
