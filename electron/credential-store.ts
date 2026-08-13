export type CredentialName = "bailian" | "minimax" | "license-installation-id" | "license-credential" | "license-clock";

export type CredentialAdapter = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(
    service: string,
    account: string,
    password: string
  ): Promise<unknown>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

const SERVICE = "AutoCut Studio";
const ACCOUNTS: Record<CredentialName, string> = {
  bailian: "bailian-api-key",
  minimax: "minimax-api-key"
  ,"license-installation-id": "license-installation-id"
  ,"license-credential": "license-credential"
  ,"license-clock": "license-clock"
};

export class CredentialStore {
  constructor(private readonly adapter: CredentialAdapter) {}

  async get(name: CredentialName): Promise<string | null> {
    return this.adapter.getPassword(SERVICE, this.accountFor(name));
  }

  async set(name: CredentialName, value: string): Promise<void> {
    const secret = value.trim();
    if (!secret) throw new Error("Credential value is empty");
    await this.adapter.setPassword(SERVICE, this.accountFor(name), secret);
  }

  async delete(name: CredentialName): Promise<boolean> {
    return this.adapter.deletePassword(SERVICE, this.accountFor(name));
  }

  private accountFor(name: CredentialName): string {
    const account = ACCOUNTS[name];
    if (!account) throw new Error(`Unsupported credential: ${String(name)}`);
    return account;
  }
}
