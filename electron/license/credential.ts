import { createPublicKey, verify, type JsonWebKey } from "node:crypto";
import type { DesktopCredential } from "./policy.js";

function parsePart(value:string){return JSON.parse(Buffer.from(value,"base64url").toString("utf8")) as Record<string,unknown>}
export function verifySignedCredential(token:string,publicJwk:JsonWebKey):DesktopCredential{
  const parts=token.split(".");if(parts.length!==3)throw new Error("Invalid credential format");
  const header=parsePart(parts[0]);if(header.alg!=="EdDSA")throw new Error("Invalid credential algorithm");
  const key=createPublicKey({key:publicJwk,format:"jwk"});if(!verify(null,Buffer.from(`${parts[0]}.${parts[1]}`),key,Buffer.from(parts[2],"base64url")))throw new Error("Invalid credential signature");
  const payload=parsePart(parts[1]);const value=payload.license as DesktopCredential|undefined;
  if(!value||value.version!==1||typeof value.licenseId!=="string"||typeof value.deviceFingerprint!=="string"||typeof value.offlineUntil!=="string")throw new Error("Invalid credential claims");
  return value;
}
