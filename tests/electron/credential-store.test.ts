import { describe, expect, it } from "vitest";
import { CredentialStore } from "../../electron/credential-store";

describe("CredentialStore", () => {
  it("uses fixed service and allowlisted account names", async () => {
    const writes: Array<[string, string, string]> = [];
    const adapter = {
      getPassword: async () => null,
      setPassword: async (service: string, account: string, value: string) => {
        writes.push([service, account, value]);
      },
      deletePassword: async () => true
    };
    const store = new CredentialStore(adapter);

    await store.set("bailian", "secret-value");

    expect(writes).toEqual([
      ["AutoCut Studio", "bailian-api-key", "secret-value"]
    ]);
    await expect(store.set("unknown" as "bailian", "secret")).rejects.toThrow(
      "Unsupported credential"
    );
  });

  it("never accepts an empty secret", async () => {
    const store = new CredentialStore({
      getPassword: async () => null,
      setPassword: async () => undefined,
      deletePassword: async () => true
    });

    await expect(store.set("minimax", "   ")).rejects.toThrow(
      "Credential value is empty"
    );
  });

  it("allowlists license installation, credential and clock records", async () => {
    const writes: string[] = [];
    const store = new CredentialStore({ getPassword: async () => null, setPassword: async (_s, account) => { writes.push(account); }, deletePassword: async () => true });
    await store.set("license-installation-id", "id"); await store.set("license-credential", "token"); await store.set("license-clock", "time");
    expect(writes).toEqual(["license-installation-id", "license-credential", "license-clock"]);
  });
});
