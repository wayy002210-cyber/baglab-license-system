import { loadConfig } from "./config";
import { createPostgresClient, PostgresLicenseService } from "./db/postgres-license-service";

let service: PostgresLicenseService | undefined;
export function licenseService(): PostgresLicenseService {
  if (!service) { const config = loadConfig(); service = new PostgresLicenseService(createPostgresClient(config.DATABASE_URL), { codePepper: config.LICENSE_CODE_PEPPER, minimumBuildId: config.MINIMUM_DESKTOP_BUILD_ID, privateJwk: config.LICENSE_SIGNING_PRIVATE_KEY_JWK }); }
  return service;
}
