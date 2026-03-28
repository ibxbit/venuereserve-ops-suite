import {
  generateSalt,
  hashPassword,
  maskSensitive,
  verifyPassword,
} from "../../src/services/security-service.js";

describe("security-service", () => {
  test("hashPassword and verifyPassword roundtrip", () => {
    const salt = generateSalt();
    const password = "MyStrongPassword123";
    const hash = hashPassword(password, salt);
    expect(verifyPassword(password, salt, hash)).toBe(true);
    expect(verifyPassword("wrong", salt, hash)).toBe(false);
  });

  test("generateSalt creates non-empty different values", () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  test("maskSensitive masks all but last 4", () => {
    expect(maskSensitive("123456789")).toBe("*****6789");
    expect(maskSensitive("1234")).toBe("****");
    expect(maskSensitive("")).toBeNull();
  });
});
