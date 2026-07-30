import type { CreationDraft } from "../../shared/contracts";
import { segmentCopywriting, stableHash } from "../audio/segment-copywriting";

type Shot = CreationDraft["shots"][number];
type TemplateShot = {
  id: string;
  assetCategoryId: string | null;
  copywriting: string;
  durationMode: Shot["durationMode"];
  durationSec: number | null;
  muteOriginal: boolean;
};

export function normalizeShotIndexes(shots: Shot[]): Shot[] {
  return shots.map((shot, index) => ({ ...shot, index }));
}

export function buildShotsFromDraft(
  draft: CreationDraft,
  defaultCategoryId: string | null
): Shot[] {
  const copyBlocks = (draft.copywriting?.text ?? "")
    .split(/\r?\n+/)
    .map((text) => text.trim())
    .filter(Boolean);
  const fallbackSegments =
    copyBlocks.length > 1
      ? copyBlocks.map((text, index) => ({
          id: `draft-segment-${index}-${stableHash(text)}`,
          text,
          durationSec: null
        }))
      : segmentCopywriting(draft.copywriting?.text ?? "", 32).map(
          (segment, index) => ({
            id: `draft-segment-${index}-${stableHash(segment.text)}`,
            text: segment.text,
            durationSec: null
          })
        );
  const source =
    draft.audioSegments.length > 0
      ? draft.audioSegments.map((segment) => ({
          id: segment.id,
          text: segment.text,
          durationSec: segment.durationSec
        }))
      : fallbackSegments;

  return source.map((segment, index) => ({
    id: `shot-${segment.id}`,
    index,
    audioSegmentId: segment.id,
    copywriting: segment.text,
    assetCategoryId: defaultCategoryId,
    durationMode: "voice",
    durationSec: segment.durationSec,
    muteOriginal: true
  }));
}

export function appendShot(
  shots: Shot[],
  defaultCategoryId: string | null
): Shot[] {
  const id = `manual-${Date.now()}-${shots.length}`;
  return normalizeShotIndexes([
    ...shots,
    {
      id: `shot-${id}`,
      index: shots.length,
      audioSegmentId: id,
      copywriting: "请输入本镜头口播文案",
      assetCategoryId: defaultCategoryId,
      durationMode: "auto",
      durationSec: null,
      muteOriginal: true
    }
  ]);
}

export function applyTemplateShots(
  draft: CreationDraft,
  templateShots: TemplateShot[],
  defaultCategoryId: string | null
): Shot[] {
  const sourceShots = buildShotsFromDraft(draft, defaultCategoryId);
  if (sourceShots.length === 0) {
    return templateShots.map((preset, index) => ({
      id: `shot-template-${preset.id}`,
      index,
      audioSegmentId: `template-${preset.id}`,
      copywriting: preset.copywriting.trim() || `镜头 ${index + 1} 口播文案`,
      assetCategoryId: preset.assetCategoryId ?? defaultCategoryId,
      durationMode: preset.durationMode,
      durationSec: preset.durationMode === "fixed" ? preset.durationSec : null,
      muteOriginal: preset.muteOriginal
    }));
  }
  return sourceShots.map((source, index) => {
    const preset = templateShots.length
      ? templateShots[index % templateShots.length]
      : null;
    return {
      ...source,
      assetCategoryId: preset?.assetCategoryId ?? source.assetCategoryId,
      durationMode: preset?.durationMode ?? source.durationMode,
      durationSec:
        preset?.durationMode === "fixed"
          ? preset.durationSec
          : source.durationSec,
      muteOriginal: preset?.muteOriginal ?? source.muteOriginal
    };
  });
}
