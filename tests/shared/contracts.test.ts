import { describe, expect, it } from "vitest";
import {
  createTaskSchema,
  publishJobSchema,
  shotPlanSchema
} from "../../src/shared/contracts";

describe("shared contracts", () => {
  it("accepts a valid fixed-duration shot", () => {
    const shot = shotPlanSchema.parse({
      index: 0,
      role: "hook",
      assetCategoryId: "people",
      copywriting: "三秒告诉你怎么选对工厂",
      durationMode: "fixed",
      durationSec: 3,
      muteOriginal: true
    });
    expect(shot.durationSec).toBe(3);
  });

  it("rejects a fixed-duration shot without a positive duration", () => {
    expect(() =>
      shotPlanSchema.parse({
        index: 0,
        role: "hook",
        assetCategoryId: "people",
        copywriting: "文案",
        durationMode: "fixed",
        muteOriginal: true
      })
    ).toThrow();
  });

  it("limits a batch to twenty generation tasks", () => {
    expect(() =>
      createTaskSchema.parse({
        templateId: "template-1",
        personaId: "persona-1",
        count: 21
      })
    ).toThrow();
  });

  it("requires a future schedule for scheduled publish jobs", () => {
    expect(() =>
      publishJobSchema.parse({
        taskId: "task-1",
        accountId: "account-1",
        title: "标题",
        topics: ["工厂"],
        status: "scheduled"
      })
    ).toThrow();
  });
});
