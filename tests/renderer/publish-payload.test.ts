import { reactive } from "vue";
import { describe, expect, it } from "vitest";
import { createPublishAssetPatch, createPublishJobsInput } from "../../src/renderer/lib/publish-payload";

describe("publish IPC payloads", () => {
  it("copies Vue reactive arrays into cloneable plain values and maps legacy coverPath to vertical cover", () => {
    const asset = reactive({
      id: "asset-1",
      publishTitle: "brand title",
      topics: ["baglab", "canvas"],
      topicTemplateId: null,
      coverPath: "D:/cover.jpg"
    });
    const selectedAccounts = reactive(["account-1", "account-2"]);

    const patch = createPublishAssetPatch(asset);
    const jobs = createPublishJobsInput(asset.id, selectedAccounts, null);

    expect(patch).toEqual({
      publishTitle: "brand title",
      topics: ["baglab", "canvas"],
      topicTemplateId: null,
      coverPath: "D:/cover.jpg",
      verticalCoverPath: "D:/cover.jpg",
      horizontalCoverPath: null
    });
    expect(jobs.accountIds).toEqual(["account-1", "account-2"]);
    expect(patch.topics).not.toBe(asset.topics);
    expect(jobs.accountIds).not.toBe(selectedAccounts);
  });

  it("preserves independent vertical and horizontal covers for new publish assets", () => {
    const patch = createPublishAssetPatch({
      id: "asset-new",
      publishTitle: "new asset",
      topics: [],
      topicTemplateId: null,
      coverPath: null,
      verticalCoverPath: "D:/vertical.jpg",
      horizontalCoverPath: "D:/horizontal.jpg"
    });

    expect(patch).toEqual({
      publishTitle: "new asset",
      topics: [],
      topicTemplateId: null,
      coverPath: "D:/vertical.jpg",
      verticalCoverPath: "D:/vertical.jpg",
      horizontalCoverPath: "D:/horizontal.jpg"
    });
  });

  it("uses publishTime as platform publish time and does not send scheduledAt", () => {
    const jobs = createPublishJobsInput("asset-1", ["account-1"], "2026-08-11T20:00:00.000Z");

    expect(jobs).toEqual({
      assetId: "asset-1",
      accountIds: ["account-1"],
      publishTime: "2026-08-11T20:00:00.000Z"
    });
    expect("scheduledAt" in jobs).toBe(false);
  });

  it("uses null publishTime for immediate publish", () => {
    expect(createPublishJobsInput("asset-1", ["account-1"], null).publishTime).toBeNull();
  });
});
