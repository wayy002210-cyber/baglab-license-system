import type { BailianModelRecommendation } from "../repositories/settings-repository.js";
import { z } from "zod";

export type BailianModelRefreshResult = {
  recommendations: BailianModelRecommendation[];
  checkedAt: string;
  source: "provider" | "fallback";
};

const resultSchema = z.object({
  recommendations: z.array(z.object({
    id: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    family: z.enum(["deepseek", "qwen", "other"]),
    status: z.literal("available"),
    note: z.string()
  })).max(5),
  checkedAt: z.string().datetime({ offset: true }),
  source: z.enum(["provider", "fallback"])
});

type ErrorBody = {
  detail?: string | { code?: string; message?: string };
};

export function buildBailianBackendHeaders(input: {
  apiKey: string;
  sessionToken: string;
  licenseHeaders: Record<string, string>;
}): Record<string, string> {
  return {
    "X-Autocut-Token": input.sessionToken,
    ...input.licenseHeaders,
    "X-Bailian-Key": input.apiKey
  };
}

function errorMessage(status: number, body: ErrorBody | null): string {
  const detail = typeof body?.detail === "object" ? body.detail : null;
  const suffix = detail?.message ? `：${detail.message}` : "";
  if (status === 401) return `百炼密钥无效或地域不匹配${suffix}`;
  if (status === 403) return `当前账号无权使用推荐模型，请检查服务开通和额度${suffix}`;
  if (status === 429) return `百炼请求过于频繁，请稍后重试${suffix}`;
  if (status === 504) return `百炼网络连接超时，请检查网络后重试${suffix}`;
  return typeof body?.detail === "string"
    ? body.detail
    : detail?.message || `百炼模型更新失败（错误码 ${status}）`;
}

export async function refreshBailianModels(input: {
  baseUrl: string;
  apiKey: string;
  sessionToken: string;
  licenseHeaders: Record<string, string>;
  fetchImpl?: typeof fetch;
}): Promise<BailianModelRefreshResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetchImpl(
      `${input.baseUrl}/copywriting/models/recommendations`,
      {
        method: "POST",
        headers: buildBailianBackendHeaders(input),
        signal: controller.signal
      }
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("百炼网络连接超时，请检查网络后重试");
    }
    throw new Error(`百炼网络连接异常，请检查网络后重试：${
      error instanceof Error ? error.message : String(error)
    }`);
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("百炼模型服务返回了无法识别的数据");
  }
  if (!response.ok) {
    throw new Error(errorMessage(response.status, body as ErrorBody | null));
  }
  const parsed = resultSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("百炼模型服务返回了无法识别的数据");
  }
  return parsed.data;
}
