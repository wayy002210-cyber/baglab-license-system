import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignedCredential } from "../../electron/license/credential";

describe("desktop credential verification",()=>{
  it("verifies Ed25519 JWT and rejects modified payload",()=>{
    const {privateKey,publicKey}=generateKeyPairSync("ed25519");
    const header=Buffer.from(JSON.stringify({alg:"EdDSA",typ:"JWT"})).toString("base64url");
    const claims={version:1,licenseId:"l1",deviceFingerprint:"d1",plan:"day1",status:"active",issuedAt:"2026-08-13T00:00:00.000Z",expiresAt:"2026-08-14T00:00:00.000Z",offlineUntil:"2026-08-14T00:00:00.000Z",minimumBuildId:"0.7.0"};
    const payload=Buffer.from(JSON.stringify({license:claims})).toString("base64url");const input=`${header}.${payload}`;const signature=sign(null,Buffer.from(input),privateKey).toString("base64url");
    const token=`${input}.${signature}`;expect(verifySignedCredential(token,publicKey.export({format:"jwk"}))).toEqual(claims);
    expect(()=>verifySignedCredential(`${header}.${payload.slice(0,-1)}A.${signature}`,publicKey.export({format:"jwk"}))).toThrow();
  });
});
