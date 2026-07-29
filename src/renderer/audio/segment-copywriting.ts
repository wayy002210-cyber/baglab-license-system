export type CopySegment = {
  text: string;
  sourceStart: number;
  sourceEnd: number;
};

export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function segmentCopywriting(
  source: string,
  targetLength = 45
): CopySegment[] {
  const pieces: CopySegment[] = [];
  const sentencePattern = /[^。！？!?；;\n]+[。！？!?；;]?|\n/g;
  let match: RegExpExecArray | null;
  let pending: CopySegment | null = null;
  while ((match = sentencePattern.exec(source))) {
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) continue;
    const current = {
      text,
      sourceStart: match.index + leading,
      sourceEnd: match.index + leading + text.length
    };
    if (
      pending &&
      pending.text.length + current.text.length <= targetLength
    ) {
      pending = {
        text: source.slice(pending.sourceStart, current.sourceEnd),
        sourceStart: pending.sourceStart,
        sourceEnd: current.sourceEnd
      };
    } else {
      if (pending) pieces.push(pending);
      pending = current;
    }
  }
  if (pending) pieces.push(pending);
  return pieces;
}
