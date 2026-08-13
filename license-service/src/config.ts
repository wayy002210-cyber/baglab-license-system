import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().startsWith("postgresql://"),
  LICENSE_CODE_PEPPER: z.string().min(32),
  LICENSE_SIGNING_PRIVATE_KEY_JWK: z.string().transform((value, context) => {
    try { return JSON.parse(value) as JsonWebKey; } catch { context.addIssue({ code: "custom", message: "Invalid signing JWK" }); return z.NEVER; }
  }),
  ADMIN_PASSWORD_HASH: z.string().min(32), ADMIN_SESSION_SECRET: z.string().min(32),
  MINIMUM_DESKTOP_BUILD_ID: z.string().min(1)
});

export type ServiceConfig = z.infer<typeof schema>;
export function loadConfig(env: Record<string, string | undefined> = process.env): ServiceConfig {
  return schema.parse({ ...env, DATABASE_URL: env.DATABASE_URL ?? env.LICENSE_DB_DATABASE_URL });
}
