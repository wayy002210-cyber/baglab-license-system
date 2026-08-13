import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const serviceOrigin = process.env.AUTOCUT_LICENSE_SERVICE_ORIGIN;
const rawJwk = process.env.AUTOCUT_LICENSE_PUBLIC_KEY_JWK;
if (!serviceOrigin?.startsWith("https://") || !rawJwk) throw new Error("HTTPS service origin and public JWK are required");
const publicJwk = JSON.parse(rawJwk);
if (publicJwk.d) throw new Error("Private JWK must never be packaged");
mkdirSync(join(process.cwd(), "build-resources"), { recursive: true });
writeFileSync(join(process.cwd(), "build-resources", "license-public.json"), JSON.stringify({ serviceOrigin, publicJwk }, null, 2));
process.stdout.write("Wrote public license config\n");
