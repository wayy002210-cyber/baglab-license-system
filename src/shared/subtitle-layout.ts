export type SubtitleLayoutStyle = {
  fontSize: number;
  scale?: number;
  letterSpacing?: number;
  outlineWidth?: number;
};

export function estimateSubtitleLineCapacity(
  style: SubtitleLayoutStyle,
  canvasWidth = 1080
): number {
  const usable = Math.max(120, canvasWidth - 180 - (style.outlineWidth ?? 0) * 4);
  const glyph = Math.max(
    1,
    style.fontSize * Math.max(style.scale ?? 100, 1) / 100 + (style.letterSpacing ?? 0)
  );
  return Math.max(4, Math.floor(usable / glyph));
}

export function wrapSubtitlePreview(
  text: string,
  style: SubtitleLayoutStyle,
  canvasWidth = 1080,
  maxLines = 2
): string[] {
  const normalized = text.replace(/\s+/g, "").trim();
  if (!normalized) return [];
  const capacity = estimateSubtitleLineCapacity(style, canvasWidth);
  const chunks = normalized.split(/(?<=[。！？；，、：,.!?;:])/u).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (let chunk of chunks) {
    while (chunk) {
      const remaining = capacity - current.length;
      if (remaining <= 0) {
        lines.push(current);
        current = "";
        continue;
      }
      if (chunk.length <= remaining) {
        current += chunk;
        chunk = "";
      } else if (current) {
        lines.push(current);
        current = "";
      } else {
        lines.push(chunk.slice(0, capacity));
        chunk = chunk.slice(capacity);
      }
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}
