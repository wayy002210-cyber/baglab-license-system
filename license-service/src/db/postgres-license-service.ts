import postgres, { type Sql } from "postgres";
import type { JWK } from "jose";
import { signCredential } from "../crypto/credential";
import { calculateExpiry, hashActivationCode, OFFLINE_GRACE_MS, type LicenseCredential, type LicensePlan } from "../domain/license";
import { ActivationError } from "../domain/activation-service";
import { isBuildAllowed } from "../security/rate-limit";

export interface PostgresLicenseOptions { codePepper: string; minimumBuildId: string; privateJwk: JWK; now?: () => Date }
export interface ClientLicenseInput { deviceFingerprint: string; buildId: string }
export interface ActivationInput extends ClientLicenseInput { activationCode: string; installationIdHash: string }

export class PostgresLicenseService {
  private readonly now: () => Date;
  constructor(private readonly sql: Sql, private readonly options: PostgresLicenseOptions) { this.now = options.now ?? (() => new Date()); }

  async activate(input: ActivationInput) {
    this.assertBuild(input.buildId);
    return this.sql.begin(async (tx) => {
      const codeHash = hashActivationCode(input.activationCode, this.options.codePepper);
      const [code] = await tx`SELECT id, plan, status FROM license_codes WHERE code_hash=${codeHash} FOR UPDATE`;
      if (!code) throw new ActivationError("CODE_NOT_FOUND", "激活码无效");
      if (code.status !== "unused") {
        const [bound] = await tx`SELECT l.id, l.plan, l.status, l.expires_at, l.device_id, d.fingerprint_hash FROM licenses l LEFT JOIN devices d ON d.id=l.device_id WHERE l.license_code_id=${code.id} FOR UPDATE OF l`;
        if (bound?.status === "unbound" && !bound.device_id) {
          if (bound.expires_at && new Date(bound.expires_at) <= this.now()) throw new ActivationError("LICENSE_EXPIRED", "授权已到期");
          const [device] = await tx`INSERT INTO devices (fingerprint_hash, short_code, installation_id_hash, client_build_id)
            VALUES (${input.deviceFingerprint}, ${input.deviceFingerprint.slice(0, 12).toUpperCase()}, ${input.installationIdHash}, ${input.buildId})
            ON CONFLICT (fingerprint_hash) DO UPDATE SET last_online_at=clock_timestamp(), installation_id_hash=EXCLUDED.installation_id_hash, client_build_id=EXCLUDED.client_build_id RETURNING id`;
          await tx`UPDATE licenses SET device_id=${device.id}, status='active', updated_at=clock_timestamp() WHERE id=${bound.id}`;
          await tx`INSERT INTO license_events (license_id, license_code_id, device_id, event_type, actor_type, metadata) VALUES (${bound.id}, ${code.id}, ${device.id}, 'activated', 'client', ${tx.json({ rebind: true })})`;
          return this.issue({ ...bound, status: "active" }, input.deviceFingerprint);
        }
        throw new ActivationError(bound?.fingerprint_hash !== input.deviceFingerprint ? "DEVICE_MISMATCH" : "CODE_ALREADY_USED", "激活码已被兑换");
      }
      const now = this.now(); const expires = calculateExpiry(code.plan as LicensePlan, now);
      const [device] = await tx`INSERT INTO devices (fingerprint_hash, short_code, installation_id_hash, client_build_id)
        VALUES (${input.deviceFingerprint}, ${input.deviceFingerprint.slice(0, 12).toUpperCase()}, ${input.installationIdHash}, ${input.buildId})
        ON CONFLICT (fingerprint_hash) DO UPDATE SET last_online_at=clock_timestamp(), client_build_id=EXCLUDED.client_build_id RETURNING id`;
      const [license] = await tx`INSERT INTO licenses (license_code_id, device_id, plan, activated_at, expires_at, is_permanent)
        VALUES (${code.id}, ${device.id}, ${code.plan}, ${now}, ${expires}, ${code.plan === "permanent"}) RETURNING id, plan, status, activated_at, expires_at`;
      await tx`UPDATE license_codes SET status='used', used_at=${now} WHERE id=${code.id}`;
      await tx`INSERT INTO license_events (license_id, license_code_id, device_id, event_type, actor_type) VALUES (${license.id}, ${code.id}, ${device.id}, 'activated', 'client')`;
      return this.issue(license, input.deviceFingerprint);
    });
  }

  async validate(licenseId: string, input: ClientLicenseInput, eventType = "validated") {
    this.assertBuild(input.buildId);
    return this.sql.begin(async (tx) => {
      const [row] = await tx`SELECT l.id, l.plan, l.status, l.expires_at, l.device_id, d.fingerprint_hash
        FROM licenses l LEFT JOIN devices d ON d.id=l.device_id WHERE l.id=${licenseId} FOR UPDATE OF l`;
      if (!row || !row.device_id) throw new ActivationError("LICENSE_NOT_FOUND", "授权不存在或已解绑");
      if (row.fingerprint_hash !== input.deviceFingerprint) throw new ActivationError("DEVICE_MISMATCH", "设备不匹配");
      if (row.status === "disabled") throw new ActivationError("LICENSE_DISABLED", "授权已被禁用");
      if (row.expires_at && new Date(row.expires_at) <= this.now()) {
        await tx`UPDATE licenses SET status='expired', updated_at=clock_timestamp() WHERE id=${licenseId}`;
        throw new ActivationError("LICENSE_EXPIRED", "授权已到期");
      }
      await tx`UPDATE licenses SET last_validated_at=clock_timestamp(), updated_at=clock_timestamp() WHERE id=${licenseId}`;
      await tx`UPDATE devices SET last_online_at=clock_timestamp(), client_build_id=${input.buildId} WHERE id=${row.device_id}`;
      await tx`INSERT INTO license_events (license_id, device_id, event_type, actor_type) VALUES (${licenseId}, ${row.device_id}, ${eventType}, 'client')`;
      return this.issue(row, input.deviceFingerprint);
    });
  }

  private async issue(row: Record<string, unknown>, fingerprint: string) {
    const now = this.now(); const expiresAt = row.expires_at ? new Date(row.expires_at as string | Date) : null;
    const credential: LicenseCredential = { version: 1, licenseId: String(row.id), deviceFingerprint: fingerprint, plan: row.plan as LicensePlan, status: "active", issuedAt: now.toISOString(), expiresAt: expiresAt?.toISOString() ?? null, offlineUntil: new Date(Math.min(now.getTime() + OFFLINE_GRACE_MS, expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER)).toISOString(), minimumBuildId: this.options.minimumBuildId };
    return { credential, signedCredential: await signCredential(credential, this.options.privateJwk) };
  }
  private assertBuild(buildId: string) { if (!isBuildAllowed(buildId, this.options.minimumBuildId)) throw new ActivationError("BUILD_UNSUPPORTED", "客户端版本过低，请安装最新版本"); }
}

export function createPostgresClient(databaseUrl: string): Sql { return postgres(databaseUrl, { ssl: "require", max: 5, idle_timeout: 20 }); }
