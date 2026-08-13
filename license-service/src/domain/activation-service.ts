import { randomUUID } from "node:crypto";
import { calculateExpiry, hashActivationCode, OFFLINE_GRACE_MS, type LicenseCredential, type LicensePlan, type LicenseStatus } from "./license";

type EventType = "generated" | "activated" | "validated" | "disabled" | "restored" | "extended" | "unbound" | "rejected";
interface CodeRow { id: string; hash: string; plan: LicensePlan; usedAt: Date | null; licenseId: string | null }
interface LicenseRow { id: string; codeId: string; plan: LicensePlan; device: string | null; installation: string | null; activatedAt: Date; expiresAt: Date | null; status: LicenseStatus | "unbound" }
interface EventRow { type: EventType; licenseId?: string; actor: string; at: Date }

export class ActivationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export class InMemoryLicenseStore {
  codes = new Map<string, CodeRow>(); licenses = new Map<string, LicenseRow>(); events: EventRow[] = [];
  private queue: Promise<void> = Promise.resolve();
  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue; let release!: () => void;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous; try { return await operation(); } finally { release(); }
  }
}

interface Options { codePepper: string; minimumBuildId: string; now: () => Date; sign: (claims: LicenseCredential) => Promise<string> }
interface ActivationInput { code: string; deviceFingerprint: string; installationIdHash: string; buildId: string }

export class ActivationService {
  constructor(private readonly store: InMemoryLicenseStore, private readonly options: Options) {}

  async generateCodes(plan: LicensePlan, count: number, plaintext: string[]): Promise<void> {
    if (count !== plaintext.length) throw new ActivationError("INVALID_REQUEST", "Code count mismatch");
    for (const value of plaintext) {
      const hash = hashActivationCode(value, this.options.codePepper);
      if (this.store.codes.has(hash)) throw new ActivationError("CODE_CONFLICT", "Duplicate code");
      this.store.codes.set(hash, { id: randomUUID(), hash, plan, usedAt: null, licenseId: null });
      this.store.events.push({ type: "generated", actor: "admin", at: this.options.now() });
    }
  }

  async activate(input: ActivationInput) {
    return this.store.transaction(async () => {
      const code = this.store.codes.get(hashActivationCode(input.code, this.options.codePepper));
      if (!code) throw new ActivationError("CODE_NOT_FOUND", "Activation code is invalid");
      if (code.usedAt) {
        const existing = code.licenseId ? this.store.licenses.get(code.licenseId) : undefined;
        if (existing?.status === "unbound" && !existing.device) {
          if (existing.expiresAt && existing.expiresAt <= this.options.now()) throw new ActivationError("LICENSE_EXPIRED", "License expired");
          existing.device = input.deviceFingerprint; existing.installation = input.installationIdHash; existing.status = "active";
          this.store.events.push({ type: "activated", licenseId: existing.id, actor: "client", at: this.options.now() });
          return this.result(existing);
        }
        throw new ActivationError(existing?.device !== input.deviceFingerprint ? "DEVICE_MISMATCH" : "CODE_ALREADY_USED", "Activation code was already redeemed");
      }
      const activatedAt = this.options.now(); const id = randomUUID();
      const row: LicenseRow = { id, codeId: code.id, plan: code.plan, device: input.deviceFingerprint, installation: input.installationIdHash, activatedAt, expiresAt: calculateExpiry(code.plan, activatedAt), status: "active" };
      code.usedAt = activatedAt; code.licenseId = id; this.store.licenses.set(id, row);
      this.store.events.push({ type: "activated", licenseId: id, actor: "client", at: activatedAt });
      return this.result(row);
    });
  }

  async validate(id: string, device: string, _buildId: string) {
    const row = this.store.licenses.get(id);
    if (!row || !row.device) throw new ActivationError("LICENSE_NOT_FOUND", "License is not bound");
    if (row.device !== device) throw new ActivationError("DEVICE_MISMATCH", "Device does not match");
    if (row.status === "disabled") throw new ActivationError("LICENSE_DISABLED", "License is disabled");
    if (row.expiresAt && row.expiresAt <= this.options.now()) throw new ActivationError("LICENSE_EXPIRED", "License expired");
    this.store.events.push({ type: "validated", licenseId: id, actor: "client", at: this.options.now() });
    return this.result(row);
  }

  async setStatus(id: string, status: "active" | "disabled", actor: string) {
    const row = this.required(id); row.status = status;
    this.store.events.push({ type: status === "disabled" ? "disabled" : "restored", licenseId: id, actor, at: this.options.now() });
  }
  async extend(id: string, hours: number, actor: string) {
    const row = this.required(id); if (row.expiresAt) row.expiresAt = new Date(row.expiresAt.getTime() + hours * 3_600_000);
    this.store.events.push({ type: "extended", licenseId: id, actor, at: this.options.now() });
  }
  async unbind(id: string, actor: string) { const row = this.required(id); row.device = null; row.installation = null; row.status = "unbound"; this.store.events.push({ type: "unbound", licenseId: id, actor, at: this.options.now() }); }
  private required(id: string) { const row = this.store.licenses.get(id); if (!row) throw new ActivationError("LICENSE_NOT_FOUND", "License not found"); return row; }
  private async result(row: LicenseRow) {
    if (row.status === "unbound" || !row.device) throw new ActivationError("LICENSE_NOT_FOUND", "License is not bound");
    const now = this.options.now();
    const offline = new Date(Math.min(now.getTime() + OFFLINE_GRACE_MS, row.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER));
    const credential: LicenseCredential = { version: 1, licenseId: row.id, deviceFingerprint: row.device!, plan: row.plan, status: row.status, issuedAt: now.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null, offlineUntil: offline.toISOString(), minimumBuildId: this.options.minimumBuildId };
    return { credential, signedCredential: await this.options.sign(credential) };
  }
}
