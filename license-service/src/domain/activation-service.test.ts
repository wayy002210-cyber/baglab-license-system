import { describe, expect, it } from "vitest";
import { ActivationError, ActivationService, InMemoryLicenseStore } from "./activation-service";

const clock = () => new Date("2026-08-13T00:00:00.000Z");
const service = (store = new InMemoryLicenseStore()) => new ActivationService(store, {
  codePepper: "test-pepper", minimumBuildId: "0.7.0", now: clock,
  sign: async (claims) => `signed:${claims.licenseId}`
});

describe("activation service", () => {
  it("redeems once and binds the device using server time", async () => {
    const store = new InMemoryLicenseStore();
    await service(store).generateCodes("day3", 1, ["BAGL-AAAA-BBBB-CCCC"]);
    const result = await service(store).activate({ code: "baglaaaabbbbcccc", deviceFingerprint: "d1", installationIdHash: "i1", buildId: "0.7.0" });
    expect(result.credential.plan).toBe("day3");
    expect(result.credential.expiresAt).toBe("2026-08-16T00:00:00.000Z");
    expect(result.signedCredential).toMatch(/^signed:/);
  });

  it("rejects repeat redemption and cross-device use", async () => {
    const store = new InMemoryLicenseStore();
    const sut = service(store);
    await sut.generateCodes("day1", 1, ["BAGL-AAAA-BBBB-DDDD"]);
    await sut.activate({ code: "BAGL-AAAA-BBBB-DDDD", deviceFingerprint: "d1", installationIdHash: "i1", buildId: "0.7.0" });
    await expect(sut.activate({ code: "BAGL-AAAA-BBBB-DDDD", deviceFingerprint: "d1", installationIdHash: "i1", buildId: "0.7.0" })).rejects.toMatchObject({ code: "CODE_ALREADY_USED" });
    await expect(sut.activate({ code: "BAGL-AAAA-BBBB-DDDD", deviceFingerprint: "d2", installationIdHash: "i2", buildId: "0.7.0" })).rejects.toMatchObject({ code: "DEVICE_MISMATCH" });
  });

  it("allows only one concurrent redemption", async () => {
    const store = new InMemoryLicenseStore();
    const sut = service(store);
    await sut.generateCodes("day1", 1, ["BAGL-AAAA-BBBB-EEEE"]);
    const results = await Promise.allSettled([1, 2].map(() => sut.activate({ code: "BAGL-AAAA-BBBB-EEEE", deviceFingerprint: "d1", installationIdHash: "i1", buildId: "0.7.0" })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("validates, disables, restores, extends and unbinds with events", async () => {
    const store = new InMemoryLicenseStore();
    const sut = service(store);
    await sut.generateCodes("day1", 1, ["BAGL-AAAA-BBBB-FFFF"]);
    const active = await sut.activate({ code: "BAGL-AAAA-BBBB-FFFF", deviceFingerprint: "d1", installationIdHash: "i1", buildId: "0.7.0" });
    await sut.setStatus(active.credential.licenseId, "disabled", "admin");
    await expect(sut.validate(active.credential.licenseId, "d1", "0.7.0")).rejects.toMatchObject({ code: "LICENSE_DISABLED" });
    await sut.setStatus(active.credential.licenseId, "active", "admin");
    await sut.extend(active.credential.licenseId, 24, "admin");
    expect((await sut.validate(active.credential.licenseId, "d1", "0.7.0")).credential.expiresAt).toBe("2026-08-15T00:00:00.000Z");
    await sut.unbind(active.credential.licenseId, "admin");
    await expect(sut.validate(active.credential.licenseId, "d1", "0.7.0")).rejects.toBeInstanceOf(ActivationError);
    expect(store.events.map((event) => event.type)).toEqual(expect.arrayContaining(["generated", "activated", "disabled", "restored", "extended", "unbound"]));
  });

  it("rebinds an unbound unexpired license without restarting its validity period", async () => {
    const store = new InMemoryLicenseStore();
    const sut = service(store);
    await sut.generateCodes("day3", 1, ["BAGL-AAAA-BBBB-GGGG"]);
    const first = await sut.activate({ code: "BAGL-AAAA-BBBB-GGGG", deviceFingerprint: "old", installationIdHash: "i1", buildId: "0.7.0" });
    await sut.unbind(first.credential.licenseId, "admin");

    const rebound = await sut.activate({ code: "BAGL-AAAA-BBBB-GGGG", deviceFingerprint: "new", installationIdHash: "i2", buildId: "0.7.0" });

    expect(rebound.credential.licenseId).toBe(first.credential.licenseId);
    expect(rebound.credential.expiresAt).toBe(first.credential.expiresAt);
    await expect(sut.activate({ code: "BAGL-AAAA-BBBB-GGGG", deviceFingerprint: "third", installationIdHash: "i3", buildId: "0.7.0" })).rejects.toMatchObject({ code: "DEVICE_MISMATCH" });
  });
});
