import { requiredNumber, requiredString } from "../../src/utils/validation.js";

describe("validation utils", () => {
  test("requiredString returns trimmed valid string", () => {
    expect(requiredString(" hello ", "name", { min: 2, max: 10 })).toBe(
      "hello",
    );
  });

  test("requiredString throws on invalid boundaries", () => {
    expect(() => requiredString("", "name")).toThrow("name is required");
    expect(() => requiredString("a", "name", { min: 2 })).toThrow(
      "name must be at least 2 characters",
    );
    expect(() => requiredString("abcdefgh", "name", { max: 3 })).toThrow(
      "name must be at most 3 characters",
    );
  });

  test("requiredNumber returns valid value", () => {
    expect(requiredNumber("10", "amount", { min: 1, max: 20 })).toBe(10);
  });

  test("requiredNumber throws on invalid and boundary", () => {
    expect(() => requiredNumber("x", "amount")).toThrow(
      "amount must be a number",
    );
    expect(() => requiredNumber(0, "amount", { min: 1 })).toThrow(
      "amount must be >= 1",
    );
    expect(() => requiredNumber(11, "amount", { max: 10 })).toThrow(
      "amount must be <= 10",
    );
  });
});
