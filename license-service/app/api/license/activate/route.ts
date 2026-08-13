import type { NextRequest } from "next/server";
import { activateRequestSchema } from "../../../../src/api/contracts";
import { createJsonHandler } from "../../../../src/api/handler";
import { allowRequest, jsonBody, jsonResult, requestId } from "../../../../src/api/route-utils";
import { licenseService } from "../../../../src/runtime";

export async function POST(request: NextRequest) {
  if (!allowRequest(request)) return jsonResult({ status: 429, body: { ok: false, error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后重试" } } });
  const handler = createJsonHandler(activateRequestSchema, (input) => licenseService().activate(input));
  return jsonResult(await handler(await jsonBody(request), requestId(request)));
}
