import { describe, expect, it } from "vitest";
import {
  appendShot,
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

  it("prefers audio segments and preserves their durations", () => {
    const draft = structuredClone(baseDraft);
    draft.audioSegments = [
      {
        id: "audio-1",
        index: 0,
        text: "音频段落",
        sourceStart: 0,
        sourceEnd: 4,
        textHash: "a",
        parameterHash: "b",
        audioPath: "D:/a.mp3",
        durationSec: 2.5,
        status: "ready",
        errorMessage: null
      }
    ];
    const shots = buildShotsFromDraft(draft, "category-1");
    expect(shots[0]).toMatchObject({
      audioSegmentId: "audio-1",
      durationSec: 2.5,
      copywriting: "音频段落"
    });
  });

  it("adds a valid editable shot and normalizes indexes", () => {
    const shots = appendShot([], "category-1");
    expect(shots[0].copywriting).toBe("请输入本镜头口播文案");
    expect(normalizeShotIndexes([...shots, { ...shots[0], id: "second" }])
      .map((shot) => shot.index)).toEqual([0, 1]);
  });
});
