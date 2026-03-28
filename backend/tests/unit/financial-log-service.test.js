import {
  computeChainHash,
  stableStringify,
} from "../../src/services/financial-log-service.js";

describe("financial-log-service", () => {
  test("stableStringify is deterministic for object key order", () => {
    const a = stableStringify({ b: 1, a: 2, nest: { z: 3, y: 4 } });
    const b = stableStringify({ nest: { y: 4, z: 3 }, a: 2, b: 1 });
    expect(a).toBe(b);
  });

  test("computeChainHash changes when payload changes", () => {
    const base = computeChainHash({
      previousHash: null,
      payload: { amount: 10 },
    });
    const changed = computeChainHash({
      previousHash: null,
      payload: { amount: 11 },
    });
    expect(base).not.toBe(changed);
  });

  test("computeChainHash supports chained integrity", () => {
    const first = computeChainHash({ previousHash: null, payload: { id: 1 } });
    const second = computeChainHash({
      previousHash: first,
      payload: { id: 2 },
    });
    const tampered = computeChainHash({
      previousHash: first,
      payload: { id: 999 },
    });
    expect(second).not.toBe(tampered);
  });
});
