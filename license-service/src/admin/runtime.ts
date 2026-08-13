import { randomBytes, timingSafeEqual } from "node:crypto";
import { verify } from "@node-rs/argon2";
import type { NextRequest } from "next/server";
import { loadConfig } from "../config";
import { createPostgresClient } from "../db/postgres-license-service";
import { ActivationError } from "../domain/activation-service";
import { AdminRepository } from "./repository";

const config = () => loadConfig();
let repository: AdminRepository | undefined;
export function adminRepository() { const value = config(); return repository ??= new AdminRepository(createPostgresClient(value.DATABASE_URL), value.LICENSE_CODE_PEPPER, value.ADMIN_SESSION_SECRET); }
export async function login(password: string) {
  if (!(await verify(config().ADMIN_PASSWORD_HASH, password))) throw new ActivationError("ADMIN_LOGIN_FAILED", "管理员密码错误");
  const token = randomBytes(32).toString("base64url"); const csrf = randomBytes(24).toString("base64url"); const expiresAt = new Date(Date.now() + 24 * 3_600_000);
  await adminRepository().createSession(token, csrf, expiresAt); return { token, csrf, expiresAt };
}
export async function authorize(request: NextRequest, requireCsrf: boolean) {
  const token = request.cookies.get("baglab_admin")?.value; if (!token) throw new ActivationError("ADMIN_SESSION_INVALID", "请先登录");
  const row = await adminRepository().session(token); if (!row) throw new ActivationError("ADMIN_SESSION_INVALID", "会话已失效");
  if (requireCsrf) { const supplied = request.headers.get("x-csrf-token") ?? ""; const expected = Buffer.from(String(row.csrf_hash)); const actual = Buffer.from(adminRepository().digest(supplied)); if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new ActivationError("CSRF_INVALID", "安全校验失败"); }
  return { token };
}
