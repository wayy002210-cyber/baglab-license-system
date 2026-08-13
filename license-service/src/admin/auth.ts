import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { verify } from "@node-rs/argon2";
import { ActivationError } from "../domain/activation-service";

interface SessionRow { tokenHash: string; csrfHash: string; expiresAt: Date }
export class InMemoryAdminSessionStore {
  sessions: SessionRow[] = [];
  async add(row: SessionRow) { this.sessions.push(row); }
  async get(hash: string) { return this.sessions.find((row) => row.tokenHash === hash); }
  async remove(hash: string) { this.sessions = this.sessions.filter((row) => row.tokenHash !== hash); }
}
interface AuthOptions { passwordHash: string; sessionSecret: string; now?: () => Date }

export class AdminAuth {
  private readonly now: () => Date;
  constructor(private readonly store: InMemoryAdminSessionStore, private readonly options: AuthOptions) { this.now = options.now ?? (() => new Date()); }
  private digest(value: string) { return createHmac("sha256", this.options.sessionSecret).update(value).digest("hex"); }
  async login(password: string) {
    if (!(await verify(this.options.passwordHash, password))) throw new ActivationError("ADMIN_LOGIN_FAILED", "管理员密码错误");
    const token = randomBytes(32).toString("base64url"); const csrfToken = randomBytes(24).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + 24 * 3_600_000);
    await this.store.add({ tokenHash: this.digest(token), csrfHash: this.digest(csrfToken), expiresAt });
    return { token, csrfToken, expiresAt };
  }
  async authorize(token: string, csrfToken?: string) {
    const row = await this.store.get(this.digest(token));
    if (!row || row.expiresAt <= this.now()) throw new ActivationError("ADMIN_SESSION_INVALID", "管理员会话已失效");
    if (csrfToken) { const expected = Buffer.from(row.csrfHash); const actual = Buffer.from(this.digest(csrfToken)); if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new ActivationError("CSRF_INVALID", "安全校验失败"); }
    return row;
  }
  async logout(token: string) { await this.store.remove(this.digest(token)); }
}
