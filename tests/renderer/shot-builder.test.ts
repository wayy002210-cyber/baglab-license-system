import { describe, expect, it } from "vitest";
import {
  appendShot,
  applyTemplateShots,
  buildShotsFromDraft,
  normalizeShotIndexes
} from "../../src/renderer/editing/shot-builder";
import type { CreationDraft } from "../../src/shared/contracts";

const baseDraft: CreationDraft = {
  version: 1,
  stage: "editing",
  personaId: "persona",
  copywriting: {
    model: "deepseek-v3",
    temperature: 0.7,
    topics: [],
    selectedTopicId: null,
    text: "第一段讲痛点。\n第二段给方案。",
    complianceIssues: []
  },
  voice: null,
  audioSegments: [],
  shots: [],
  bgm: null,
  titleStyle: null,
  subtitleStyle: null
};

describe("shot builder", () => {
  it("falls back to copywriting when audio segments are empty", () => {
    const shots = buildShotsFromDraft(baseDraft, "category-1");
    expect(shots).toHaveLength(2);
    expect(shots[0].copywriting).toBe("第一段讲痛点。");
    expect(shots[1].audioSegmentId).toContain("draft-segment");
  });

  it("maps each generated audio segment to its matching script shot", () => {
    const draft = structuredClone(baseDraft);
    draft.audioSegments = [
      {
        id: "audio-1",
        index: 0,
        text: "第一段讲痛点。",
        sourceStart: 0,
        sourceEnd: 7,
        textHash: "a",
        parameterHash: "b",
        audioPath: "D:/a.mp3",
        durationSec: 4,
        status: "ready",
        errorMessage: null
      },
      {
        id: "audio-2",
        index: 1,
        text: "第二段给方案。",
        sourceStart: 8,
        sourceEnd: 15,
        textHash: "c",
        parameterHash: "b",
        audioPath: "D:/b.mp3",
        durationSec: 6,
        status: "ready",
        errorMessage: null
      }
    ];
    const shots = buildShotsFromDraft(draft, "category-1");
    expect(shots).toHaveLength(2);
    expect(shots.map((shot) => shot.audioSegmentId)).toEqual([
      "audio-1",
      "audio-2"
    ]);
    expect(shots.map((shot) => shot.durationSec)).toEqual([4, 6]);
  });

  it("adds a valid editable shot and normalizes indexes", () => {
    const shots = appendShot([], "category-1");
    expect(shots[0].copywriting).toBe("请输入本镜头口播文案");
    expect(normalizeShotIndexes([...shots, { ...shots[0], id: "second" }])
      .map((shot) => shot.index)).toEqual([0, 1]);
  });

  it("loads template shots when the current draft has no copywriting", () => {
    const draft = structuredClone(baseDraft);
    draft.copywriting = null;
    const shots = applyTemplateShots(draft, [
      {
        id: "hook",
        assetCategoryId: "category-hook",
        copywriting: "开场钩子",
        durationMode: "fixed",
        durationSec: 3,
        muteOriginal: true
      }
    ], "category-default");
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({
      copywriting: "开场钩子",
      assetCategoryId: "category-hook",
      durationMode: "fixed",
      durationSec: 3
    });
  });
});
