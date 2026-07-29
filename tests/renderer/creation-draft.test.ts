import { describe, expect, it, vi } from "vitest";
import { useCreationDraft } from "../../src/renderer/composables/useCreationDraft";

describe("useCreationDraft", () => {
  it("restores and saves a validated draft", async () => {
    const existing = {
      version: 1 as const,
      stage: "persona" as const,
      personaId: null,
      copywriting: null,
      voice: null,
      audioSegments: [],
      shots: [],
      bgm: null,
      titleStyle: null,
      subtitleStyle: null
    };
    const save = vi.fn(async (draft) => draft);
    Object.assign(window, {
      autocut: {
        getCreationDraft: vi.fn(async () => existing),
        saveCreationDraft: save
      }
    });

    const state = useCreationDraft();
    await state.load();
    state.draft.value.stage = "copywriting";
    await state.saveImmediate();

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "copywriting" })
    );
  });
});
