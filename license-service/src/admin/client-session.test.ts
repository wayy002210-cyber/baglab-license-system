import { describe, expect, it } from "vitest";
import { clearAdminCsrf, readAdminCsrf, saveAdminCsrf } from "./client-session";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
}

describe("admin browser session", () => {
  it("restores the CSRF token after a page refresh in the same tab", () => {
    const storage = memoryStorage();
    saveAdminCsrf(storage, "csrf-token");
    expect(readAdminCsrf(storage)).toBe("csrf-token");
  });

  it("clears stale CSRF state after a rejected admin request", () => {
    const storage = memoryStorage();
    saveAdminCsrf(storage, "stale-token");
    clearAdminCsrf(storage);
    expect(readAdminCsrf(storage)).toBe("");
  });
});
