import { describe, expect, it } from "vitest";
import { generateActivationCodes } from "./codes";

describe("activation code generation", () => {
  it("generates unique readable codes and returns plaintext once", () => {
    const result = generateActivationCodes("day7", 100);
    expect(new Set(result.map((item) => item.plaintext)).size).toBe(100);
    expect(result.every((item) => /^BAGL-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(item.plaintext))).toBe(true);
    expect(result.every((item) => !Object.hasOwn(item, "hash"))).toBe(true);
  });

  it("limits batch size", () => {
    expect(() => generateActivationCodes("day1", 0)).toThrow();
    expect(() => generateActivationCodes("day1", 501)).toThrow();
  });
});
