import { generateKeyPair, exportJWK } from "jose";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

const password = process.env.ADMIN_INITIAL_PASSWORD;
if (!password || password.length < 12) throw new Error("Set ADMIN_INITIAL_PASSWORD to at least 12 characters");
const { privateKey, publicKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
const privateJwk = await exportJWK(privateKey);
const publicJwk = await exportJWK(publicKey);
const values = {
  LICENSE_CODE_PEPPER: randomBytes(32).toString("base64url"),
  ADMIN_PASSWORD_HASH: await hash(password),
  ADMIN_SESSION_SECRET: randomBytes(32).toString("base64url"),
  LICENSE_SIGNING_PRIVATE_KEY_JWK: JSON.stringify(privateJwk),
  LICENSE_SIGNING_PUBLIC_KEY_JWK: JSON.stringify(publicJwk)
};
for (const [name, value] of Object.entries(values)) process.stdout.write(`${name}=${value}\n`);
