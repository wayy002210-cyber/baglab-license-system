interface Bucket { count: number; started: number }
export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  constructor(private readonly maximum: number, private readonly windowMs: number, private readonly now = Date.now) {}
  consume(key: string): boolean {
    const time = this.now(); let bucket = this.buckets.get(key);
    if (!bucket || time - bucket.started >= this.windowMs) { bucket = { count: 0, started: time }; this.buckets.set(key, bucket); }
    bucket.count += 1; return bucket.count <= this.maximum;
  }
}

function numericBuild(value: string): number[] { return value.split("-")[0].split(".").map((part) => Number.parseInt(part, 10) || 0); }
export function isBuildAllowed(current: string, minimum: string): boolean {
  const left = numericBuild(current); const right = numericBuild(minimum);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0); if (difference) return difference > 0;
  }
  return true;
}
