import { describe, expect, it } from "vitest";
import { readJsonResponse } from "../../electron/http-response";

describe("readJsonResponse", () => {
  it("turns a non-JSON backend failure into an actionable error", async () => {
    const response = new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });

    await expect(readJsonResponse(response, "音色试听失败")).rejects.toThrow(
      "音色试听失败（本地服务错误 500）"
    );
  });

  it("uses the backend JSON detail when present", async () => {
    const response = new Response(
      JSON.stringify({ detail: "MiniMax 账户余额不足，请充值后再试听" }),
      {
        status: 402,
        headers: { "Content-Type": "application/json" }
      }
    );

    await expect(readJsonResponse(response, "音色试听失败")).rejects.toThrow(
      "MiniMax 账户余额不足，请充值后再试听"
    );
  });
});
