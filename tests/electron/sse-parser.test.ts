import { describe, expect, it } from "vitest";
import { SseParser } from "../../electron/sse-parser";

describe("SseParser", () => {
  it("parses events split across network chunks and preserves ids", () => {
    const parser = new SseParser();

    expect(parser.feed('id: 1\nevent: task\ndata: {"status":"enc')).toEqual([]);
    expect(parser.feed('oding"}\n\nid: 2\ndata: {"status":"completed"}\n\n')).toEqual([
      { id: 1, event: "task", data: '{"status":"encoding"}' },
      { id: 2, event: "message", data: '{"status":"completed"}' }
    ]);
  });
});
