import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadLicensePublicConfig } from "../../electron/license/public-config";

describe("loadLicensePublicConfig", () => {
  it("ships the mainland-accessible production authorization domain", () => {
    const config = JSON.parse(readFileSync("config/license-public.json", "utf8"));
    expect(config.serviceOrigin).toBe("https://license-api.pangluobo.site");
  });
  it("prefers development environment values", () => {
    expect(loadLicensePublicConfig({
      environment: { AUTOCUT_LICENSE_SERVICE_ORIGIN: "https://dev.example", AUTOCUT_LICENSE_PUBLIC_KEY_JWK: '{"kty":"OKP"}' },
      packagedConfigPath: "missing.json"
    })).toEqual({ serviceOrigin: "https://dev.example", publicJwk: { kty: "OKP" } });
  });

  it("loads only public values from the packaged config", () => {
    const config = loadLicensePublicConfig({
      environment: {}, packagedConfigPath: "license-public.json",
      readFile: () => JSON.stringify({ serviceOrigin: "https://app.vercel.app", publicJwk: { kty: "OKP", crv: "Ed25519", x: "public" } })
    });
    expect(config.serviceOrigin).toBe("https://app.vercel.app");
    expect(config.publicJwk).not.toHaveProperty("d");
  });
});
