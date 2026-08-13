import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter, isBuildAllowed } from "./rate-limit";

describe("client security limits", () => {
  it("blocks excess attempts inside a fixed window", () => {
    let now = 0; const limiter = new FixedWindowRateLimiter(2, 1_000, () => now);
    expect(limiter.consume("device")).toBe(true); expect(limiter.consume("device")).toBe(true);
    expect(limiter.consume("device")).toBe(false); now = 1_001; expect(limiter.consume("device")).toBe(true);
  });

  it("compares numeric and prerelease build identifiers", () => {
    expect(isBuildAllowed("0.7.0", "0.7.0")).toBe(true);
    expect(isBuildAllowed("0.7.1", "0.7.0")).toBe(true);
    expect(isBuildAllowed("0.6.9", "0.7.0")).toBe(false);
    expect(isBuildAllowed("0.7.0-test.2", "0.7.0")).toBe(true);
  });
});
