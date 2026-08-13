import { hash } from "@node-rs/argon2";
import { describe, expect, it } from "vitest";
import { AdminAuth, InMemoryAdminSessionStore } from "./auth";

describe("administrator authentication", () => {
  it("verifies argon2 passwords and creates hashed sessions with CSRF", async () => {
    const store = new InMemoryAdminSessionStore();
    const passwordHash = await hash("correct horse battery staple");
    const auth = new AdminAuth(store, { passwordHash, sessionSecret: "s".repeat(32), now: () => new Date("2026-08-13T00:00:00Z") });
    await expect(auth.login("wrong")).rejects.toMatchObject({ code: "ADMIN_LOGIN_FAILED" });
    const session = await auth.login("correct horse battery staple");
    expect(session.token).not.toBe(store.sessions[0].tokenHash);
    await expect(auth.authorize(session.token, session.csrfToken)).resolves.toBeDefined();
    await expect(auth.authorize(session.token, "wrong")).rejects.toMatchObject({ code: "CSRF_INVALID" });
  });

  it("rejects expired and logged-out sessions", async () => {
    let now = new Date("2026-08-13T00:00:00Z");
    const store = new InMemoryAdminSessionStore();
    const auth = new AdminAuth(store, { passwordHash: await hash("password-long"), sessionSecret: "s".repeat(32), now: () => now });
    const session = await auth.login("password-long");
    now = new Date("2026-08-14T00:00:01Z");
    await expect(auth.authorize(session.token, session.csrfToken)).rejects.toMatchObject({ code: "ADMIN_SESSION_INVALID" });
    const next = await auth.login("password-long"); await auth.logout(next.token);
    await expect(auth.authorize(next.token, next.csrfToken)).rejects.toMatchObject({ code: "ADMIN_SESSION_INVALID" });
  });
});
