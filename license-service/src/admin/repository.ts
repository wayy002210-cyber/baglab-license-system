import { createHmac, randomBytes } from "node:crypto";
import { hashActivationCode, type LicensePlan } from "../domain/license";
import { generateActivationCodes } from "./codes";
import type { Sql } from "postgres";

const HOURS: Record<Exclude<LicensePlan, "permanent">, number> = { day1: 24, day3: 72, day7: 168, month: 720, year: 8760 };
export class AdminRepository {
  constructor(private readonly sql: Sql, private readonly pepper: string, private readonly sessionSecret: string) {}
  digest(value: string) { return createHmac("sha256", this.sessionSecret).update(value).digest("hex"); }
  async createSession(token: string, csrf: string, expiresAt: Date) { await this.sql`INSERT INTO admin_sessions (token_hash, csrf_hash, expires_at) VALUES (${this.digest(token)}, ${this.digest(csrf)}, ${expiresAt})`; }
  async session(token: string) { const [row] = await this.sql`SELECT token_hash, csrf_hash, expires_at FROM admin_sessions WHERE token_hash=${this.digest(token)} AND expires_at > clock_timestamp()`; return row; }
  async deleteSession(token: string) { await this.sql`DELETE FROM admin_sessions WHERE token_hash=${this.digest(token)}`; }

  async generate(plan: LicensePlan, count: number, note: string) {
    const codes = generateActivationCodes(plan, count); const batchId = crypto.randomUUID();
    await this.sql.begin(async (tx) => {
      for (const item of codes) await tx`INSERT INTO license_codes (code_hash, code_suffix, plan, duration_hours, batch_id, note)
        VALUES (${hashActivationCode(item.plaintext, this.pepper)}, ${item.plaintext.slice(-4)}, ${plan}, ${plan === "permanent" ? null : HOURS[plan]}, ${batchId}, ${note})`;
      await tx`INSERT INTO license_events (event_type, actor_type, actor_id, metadata) VALUES ('generated', 'admin', 'primary', ${tx.json({ batchId, plan, count })})`;
    });
    return { batchId, codes: codes.map((item) => item.plaintext) };
  }

  async dashboard(query = "") {
    const term = `%${query.trim()}%`;
    const codes = await this.sql`SELECT c.id, c.code_suffix, c.plan, c.status, c.note, c.created_at, c.used_at, l.id license_id, l.expires_at
      FROM license_codes c LEFT JOIN licenses l ON l.license_code_id=c.id WHERE ${query === ""} OR c.code_suffix ILIKE ${term} OR c.note ILIKE ${term} OR CAST(l.id AS text) ILIKE ${term} ORDER BY c.created_at DESC LIMIT 200`;
    const licenses = await this.sql`SELECT l.id, l.plan, l.status, l.activated_at, l.expires_at, l.note, d.short_code, d.last_online_at FROM licenses l LEFT JOIN devices d ON d.id=l.device_id ORDER BY l.created_at DESC LIMIT 200`;
    const events = await this.sql`SELECT id, license_id, event_type, actor_type, actor_id, metadata, created_at FROM license_events ORDER BY created_at DESC LIMIT 200`;
    return { codes, licenses, events };
  }

  async mutate(id: string, action: "disable" | "restore" | "extend" | "unbind", hours: number | undefined, note: string) {
    await this.sql.begin(async (tx) => {
      const [license] = await tx`SELECT id, device_id FROM licenses WHERE id=${id} FOR UPDATE`; if (!license) throw new Error("LICENSE_NOT_FOUND");
      if (action === "disable") await tx`UPDATE licenses SET status='disabled', note=${note}, updated_at=clock_timestamp() WHERE id=${id}`;
      if (action === "restore") await tx`UPDATE licenses SET status='active', note=${note}, updated_at=clock_timestamp() WHERE id=${id}`;
      if (action === "extend") await tx`UPDATE licenses SET expires_at=CASE WHEN expires_at IS NULL THEN NULL ELSE expires_at + (${hours ?? 0} * interval '1 hour') END, note=${note}, updated_at=clock_timestamp() WHERE id=${id}`;
      if (action === "unbind") await tx`UPDATE licenses SET device_id=NULL, status='unbound', note=${note}, updated_at=clock_timestamp() WHERE id=${id}`;
      await tx`INSERT INTO license_events (license_id, device_id, event_type, actor_type, actor_id, metadata) VALUES (${id}, ${license.device_id}, ${action}, 'admin', 'primary', ${tx.json({ hours, note })})`;
    });
  }
}
