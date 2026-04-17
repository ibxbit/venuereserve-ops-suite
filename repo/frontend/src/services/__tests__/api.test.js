import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// This test targets the frontend api client helpers (services/api.js). It
// exercises only the browser-side helpers that don't require a live backend:
// storage helpers, caching, and paginated-list extraction.
//
// We stub the minimal globals needed for the module to load in Node / jsdom
// (localStorage, window.addEventListener for online-queue sync).

function installLocalStorageStub() {
  const store = new Map();
  const api = {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => {
      store.set(key, String(value));
    }),
    removeItem: vi.fn((key) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
  };
  vi.stubGlobal("localStorage", api);
  return api;
}

describe("frontend services/api.js (unit)", () => {
  let storage;

  beforeEach(async () => {
    storage = installLocalStorageStub();
    if (typeof window !== "undefined") {
      window.addEventListener = vi.fn();
    } else {
      vi.stubGlobal("window", {
        addEventListener: vi.fn(),
      });
    }
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  test("getStoredAuthToken returns null when unset", async () => {
    const { getStoredAuthToken } = await import("../api.js");
    expect(getStoredAuthToken()).toBeNull();
  });

  test("clearStoredAuthToken removes the token from storage", async () => {
    const { clearStoredAuthToken, AUTH_TOKEN_KEY } = await import("../api.js");
    localStorage.setItem(AUTH_TOKEN_KEY, "abc");
    clearStoredAuthToken();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  test("clearStoredActorUserId removes the actor id", async () => {
    const { clearStoredActorUserId, ACTOR_ID_KEY } = await import("../api.js");
    localStorage.setItem(ACTOR_ID_KEY, "user-1");
    clearStoredActorUserId();
    expect(localStorage.getItem(ACTOR_ID_KEY)).toBeNull();
  });

  test("setCachedList / getCachedList roundtrip is JSON safe", async () => {
    const { setCachedList, getCachedList } = await import("../api.js");
    setCachedList("reservations", [{ id: "r1" }]);
    const entries = getCachedList("reservations");
    expect(entries).toEqual([{ id: "r1" }]);
  });

  test("getCachedList returns empty array when cache missing", async () => {
    const { getCachedList } = await import("../api.js");
    expect(getCachedList("missing")).toEqual([]);
  });
});
