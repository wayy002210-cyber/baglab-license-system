import { describe, expect, it } from "vitest";
import { evaluateCredential, type DesktopCredential } from "../../electron/license/policy";

const credential=(patch:Partial<DesktopCredential>={}):DesktopCredential=>({version:1,licenseId:"l1",deviceFingerprint:"d1",plan:"day1",status:"active",issuedAt:"2026-08-13T00:00:00.000Z",expiresAt:"2026-08-14T00:00:00.000Z",offlineUntil:"2026-08-14T00:00:00.000Z",minimumBuildId:"0.7.0",...patch});
describe("desktop license policy",()=>{
  it("allows valid offline credentials",()=>expect(evaluateCredential(credential(),{now:new Date("2026-08-13T12:00:00Z"),deviceFingerprint:"d1",buildId:"0.7.0",lastObservedAt:new Date("2026-08-13T11:00:00Z")})).toMatchObject({allowed:true,mode:"offline"}));
  it.each([[{status:"disabled"},"LICENSE_DISABLED"],[{deviceFingerprint:"d2"},"DEVICE_MISMATCH"]] as const)("rejects invalid binding/state",(patch,code)=>expect(evaluateCredential(credential(patch),{now:new Date("2026-08-13T12:00:00Z"),deviceFingerprint:"d1",buildId:"0.7.0",lastObservedAt:null})).toMatchObject({allowed:false,code}));
  it("never extends business expiry with offline grace",()=>expect(evaluateCredential(credential({offlineUntil:"2026-08-16T00:00:00Z"}),{now:new Date("2026-08-14T00:00:01Z"),deviceFingerprint:"d1",buildId:"0.7.0",lastObservedAt:null})).toMatchObject({allowed:false,code:"LICENSE_EXPIRED"}));
  it("rejects expired offline deadline, old builds and clock rollback",()=>{
    expect(evaluateCredential(credential({expiresAt:null,offlineUntil:"2026-08-13T10:00:00Z"}),{now:new Date("2026-08-13T12:00:00Z"),deviceFingerprint:"d1",buildId:"0.7.0",lastObservedAt:null})).toMatchObject({code:"OFFLINE_EXPIRED"});
    expect(evaluateCredential(credential(),{now:new Date("2026-08-13T12:00:00Z"),deviceFingerprint:"d1",buildId:"0.6.9",lastObservedAt:null})).toMatchObject({code:"BUILD_UNSUPPORTED"});
    expect(evaluateCredential(credential(),{now:new Date("2026-08-13T10:00:00Z"),deviceFingerprint:"d1",buildId:"0.7.0",lastObservedAt:new Date("2026-08-13T12:00:00Z")})).toMatchObject({code:"CLOCK_ROLLBACK"});
  });
});
