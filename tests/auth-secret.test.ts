import { describe, expect, it } from "vitest";
import { EXAMPLE_NEXTAUTH_SECRET, assertAuthSecret, isUsableAuthSecret } from "../src/lib/auth-secret";

describe("auth secret", () => {
  it("rejects empty, short and example placeholder values", () => {
    expect(isUsableAuthSecret("")).toBe(false);
    expect(isUsableAuthSecret("short")).toBe(false);
    expect(isUsableAuthSecret(EXAMPLE_NEXTAUTH_SECRET)).toBe(false);
  });

  it("accepts a long random secret", () => {
    expect(isUsableAuthSecret("a".repeat(32))).toBe(true);
    expect(assertAuthSecret("prod-secret-value-32chars-ok")).toBe("prod-secret-value-32chars-ok");
  });
});
