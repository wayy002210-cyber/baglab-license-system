import type { CreationDraft } from "../../src/shared/contracts.js";
import type { Persona } from "../repositories/persona-repository.js";
import type { AssetRecord } from "../repositories/asset-repository.js";
import type { MediaSettings } from "../repositories/settings-repository.js";

export type DraftSnapshotInput = {
  draft: CreationDraft;
  persona: Persona;
  assets: AssetRecord[];
  media: MediaSettings;
};

export function buildDraftTaskSnapshot(
  input: DraftSnapshotInput
): Record<string, unknown> {
  const draft = structuredClone(input.draft);
  if (draft.stage !== "ready") {
    throw new Error("请先完成镜头剪辑并保存镜头方案");
  }
  if (!draft.copywriting?.text.trim() || !draft.voice) {
    throw new Error("文案或配音设置不完整");
  }
  if (
    draft.audioSegments.length !== draft.shots.length ||
    draft.audioSegments.some(
      (segment) =>
        segment.status !== "ready" ||
        !segment.audioPath ||
        !segment.durationSec
    )
  ) {
    throw new Error("请先完成所有镜头的分段配音");
  }
  if (!draft.shots.length || draft.shots.some(
    (item) => !item.assetCategoryId || !item.copywriting.trim()
  )) {
    throw new Error("镜头缺少素材类型或口播文案");
  }
  const categoryIds = new Set(draft.shots.map((item) => item.assetCategoryId));
  const assets = input.assets.filter(
    (item) =>
      item.status === "ready" &&
      item.durationSec &&
      categoryIds.has(item.categoryId)
  );
  for (const categoryId of categoryIds) {
    if (!assets.some((item) => item.categoryId === categoryId)) {
      throw new Error("某个镜头所选素材分类中没有可用视频，请先补充素材");
    }
  }
  return {
    approved: true,
    persona: structuredClone(input.persona),
    copywriting: structuredClone(draft.copywriting),
    voice: structuredClone(draft.voice),
    audioSegments: structuredClone(draft.audioSegments),
    shots: structuredClone(draft.shots),
    template: {
      name: "创作草稿快照",
      shots: draft.shots.map((shot) => ({
        index: shot.index,
        role: "custom",
        assetCategoryId: shot.assetCategoryId,
        copywriting: shot.copywriting,
        durationMode: shot.durationMode,
        durationSec: shot.durationSec,
        muteOriginal: shot.muteOriginal
      }))
    },
    assets: structuredClone(assets),
    bgm: structuredClone(draft.bgm),
    bgmPath: draft.bgm?.sourceType === "file" ? draft.bgm.path : null,
    titleStyle: structuredClone(draft.titleStyle),
    subtitleStyle: structuredClone(draft.subtitleStyle),
    media: structuredClone(input.media),
    modelMetadata: {
      copyModel: draft.copywriting.model,
      draftVersion: draft.version
    }
  };
}
