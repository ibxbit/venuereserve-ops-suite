import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  roles,
  roleOptions,
  getActiveRole,
  setActiveRole,
  getRoleLabel,
  getPermissionsForRole,
  hasPermission,
} from "../roles.js";

describe("frontend auth/roles.js (unit)", () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => {
        store.set(key, String(value));
      },
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("roles constant exposes all five canonical roles", () => {
    expect(Object.values(roles)).toEqual([
      "member",
      "front-desk",
      "manager",
      "moderator",
      "auditor",
    ]);
  });

  test("roleOptions includes a label for each role", () => {
    for (const role of Object.values(roles)) {
      expect(roleOptions.some((opt) => opt.value === role)).toBe(true);
    }
  });

  test("getRoleLabel falls back to Member for unknown values", () => {
    expect(getRoleLabel("manager")).toMatch(/Manager/);
    expect(getRoleLabel("ghost")).toBe("Member");
  });

  test("getActiveRole returns Member by default when storage empty", () => {
    expect(getActiveRole()).toBe("member");
  });

  test("setActiveRole then getActiveRole roundtrip", () => {
    setActiveRole("manager");
    expect(getActiveRole()).toBe("manager");
  });

  test("setActiveRole ignores unknown roles", () => {
    setActiveRole("hacker");
    expect(getActiveRole()).toBe("member");
  });

  test("getPermissionsForRole member includes reservations.read", () => {
    const perms = getPermissionsForRole("member");
    expect(perms).toContain("reservations.read");
    expect(perms).toContain("community.report");
  });

  test("hasPermission returns true for manager on audit.read", () => {
    expect(hasPermission("manager", "audit.read")).toBe(true);
    expect(hasPermission("member", "audit.read")).toBe(false);
  });

  test("auditor cannot write users but can read reports.financial", () => {
    expect(hasPermission("auditor", "users.write")).toBe(false);
    expect(hasPermission("auditor", "reports.financial")).toBe(true);
  });
});
