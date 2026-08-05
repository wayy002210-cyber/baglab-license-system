import { reactive } from "vue";
import { describe, expect, it } from "vitest";
import { createPublishAssetPatch, createPublishJobsInput } from "../../src/renderer/lib/publish-payload";

describe("publish IPC payloads", () => {
  it("copies Vue reactive arrays into cloneable plain values", () => {
    const asset = reactive({ id: "asset-1", publishTitle: "品牌曝光玄机", topics: ["袋研官", "帆布袋定制"], topicTemplateId: null, coverPath: "D:/cover.jpg" });
    const selectedAccounts = reactive(["account-1", "account-2"]);
    const patch = createPublishAssetPatch(asset);
    const jobs = createPublishJobsInput(asset.id, selectedAccounts, null);
    expect(patch).toEqual({ publishTitle: "品牌曝光玄机", topics: ["袋研官", "帆布袋定制"], topicTemplateId: null, coverPath: "D:/cover.jpg" });
    expect(jobs.accountIds).toEqual(["account-1", "account-2"]);
    expect(patch.topics).not.toBe(asset.topics);
    expect(jobs.accountIds).not.toBe(selectedAccounts);
  });
});
