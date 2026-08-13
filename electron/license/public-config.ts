import { readFileSync } from "node:fs";
import type { JsonWebKey } from "node:crypto";

export function loadLicensePublicConfig(input: {
  environment: NodeJS.ProcessEnv;
  packagedConfigPath: string;
  readFile?: (path: string) => string;
}): { serviceOrigin: string; publicJwk: JsonWebKey } {
  const origin = input.environment.AUTOCUT_LICENSE_SERVICE_ORIGIN;
  const jwk = input.environment.AUTOCUT_LICENSE_PUBLIC_KEY_JWK;
  const parsed = origin && jwk
    ? { serviceOrigin: origin, publicJwk: JSON.parse(jwk) as JsonWebKey }
    : JSON.parse((input.readFile ?? ((path) => readFileSync(path, "utf8")))(input.packagedConfigPath));
  if (typeof parsed.serviceOrigin !== "string" || !parsed.serviceOrigin.startsWith("https://")) {
    throw new Error("Invalid license service origin");
  }
  if (!parsed.publicJwk || typeof parsed.publicJwk !== "object" || "d" in parsed.publicJwk) {
    throw new Error("Invalid license public key");
  }
  return parsed;
}
