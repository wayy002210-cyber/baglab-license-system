import type { CreationDraft } from "../../shared/contracts";
import { stableHash } from "./segment-copywriting";

type VoiceSettings = NonNullable<CreationDraft["voice"]>;
type AudioSegment = CreationDraft["audioSegments"][number];

export function masterAudioParameterHash(
  voice: VoiceSettings,
  model: string
): string {
  return stableHash(JSON.stringify({ model, ...voice }));
}

export function buildMasterAudioSegment(
  text: string,
  voice: VoiceSettings,
  model: string
): AudioSegment {
  const textHash = stableHash(text);
  const parameterHash = masterAudioParameterHash(voice, model);
  return {
    id: `master-${textHash}-${parameterHash}`,
    index: 0,
    text,
    sourceStart: 0,
    sourceEnd: text.length,
    textHash,
    parameterHash,
    audioPath: null,
    durationSec: null,
    status: "pending",
    errorMessage: null
  };
}

export function allocateShotDurations(
  texts: string[],
  totalDurationSec: number,
  minimumDurationSec = 0.5
): number[] {
  if (!texts.length) return [];
  if (!(totalDurationSec > 0)) return texts.map(() => 0);
  if (totalDurationSec <= texts.length * minimumDurationSec) {
    const equal = totalDurationSec / texts.length;
    return texts.map((_, index) =>
      index === texts.length - 1
        ? totalDurationSec - equal * index
        : equal
    );
  }
  const weights = texts.map(
    (text) => Math.max(1, text.replace(/\s/g, "").length)
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const distributable =
    totalDurationSec - minimumDurationSec * texts.length;
  const durations: number[] = [];
  let allocated = 0;
  for (let index = 0; index < texts.length; index += 1) {
    const duration =
      index === texts.length - 1
        ? totalDurationSec - allocated
        : minimumDurationSec +
          distributable * (weights[index] / totalWeight);
    durations.push(duration);
    allocated += duration;
  }
  return durations;
}
