import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync
} from "node:fs";
import { dirname } from "node:path";

const SENSITIVE_KEY = /(api.?key|authorization|cookie|password|secret|token)/i;

export function redactSensitive(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitive(value.message)
    };
  }
  if (typeof value === "string") {
    return value
      .replace(
        /(authorization\s*:\s*)(?:bearer\s+)?[^\s,;]+/gi,
        "$1[REDACTED]"
      )
      .replace(/(cookie\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]");
  }
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitive(nested)
      ])
    );
  }
  return value;
}

export class JsonLogger {
  constructor(
    private readonly path: string,
    private readonly maxBytes = 5 * 1024 * 1024
  ) {}

  write(
    level: "info" | "warn" | "error",
    event: string,
    details: unknown = {}
  ): void {
    mkdirSync(dirname(this.path), { recursive: true });
    if (existsSync(this.path) && statSync(this.path).size >= this.maxBytes) {
      const rotated = `${this.path}.1`;
      if (existsSync(rotated)) {
        // The next rename replaces this file on Windows only after cleanup;
        // use a timestamp when an older rotation is still present.
        renameSync(this.path, `${this.path}.${Date.now()}`);
      } else {
        renameSync(this.path, rotated);
      }
    }
    appendFileSync(
      this.path,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        event,
        details: redactSensitive(details)
      })}\n`,
      "utf8"
    );
  }
}
