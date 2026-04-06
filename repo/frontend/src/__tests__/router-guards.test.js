import { describe, expect, test, beforeEach } from "vitest";
import { AUTH_TOKEN_KEY } from "../services/api.js";
import { installRouteGuards } from "../router.js";

function makeRouterStub() {
  const stub = {
    guard: null,
    beforeEach(handler) {
      this.guard = handler;
    },
  };
  installRouteGuards(stub);
  return stub;
}

describe("Route guard behavior", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("redirects unauthenticated users to login", () => {
    const router = makeRouterStub();
    const result = router.guard({ path: "/checkout", meta: { permission: "orders.read" } });
    expect(result).toBe("/login");
  });

  test("redirects authenticated users away from login", () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "token-1");
    const router = makeRouterStub();
    const result = router.guard({ path: "/login", meta: {} });
    expect(result).toBe("/");
  });

  test("sends user to access denied when role lacks route permission", () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "token-1");
    localStorage.setItem("studio-active-role", "member");
    const router = makeRouterStub();
    const result = router.guard({
      path: "/moderation",
      meta: { permission: "community.moderate" },
    });
    expect(result).toBe("/access-denied");
  });
});
