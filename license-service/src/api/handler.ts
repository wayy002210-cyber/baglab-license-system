import type { ZodType } from "zod";
import { ActivationError } from "../domain/activation-service";

const STATUS: Record<string, number> = {
  CODE_NOT_FOUND: 404, LICENSE_NOT_FOUND: 404, CODE_ALREADY_USED: 409,
  DEVICE_MISMATCH: 403, LICENSE_DISABLED: 403, LICENSE_EXPIRED: 403,
  BUILD_UNSUPPORTED: 426, RATE_LIMITED: 429
};

export function createJsonHandler<T, R>(schema: ZodType<T>, operation: (input: T) => Promise<R>) {
  return async (unknownInput: unknown, requestId: string) => {
    const parsed = schema.safeParse(unknownInput);
    if (!parsed.success) return { status: 400, body: { ok: false as const, error: { code: "INVALID_REQUEST", message: "请求参数无效" }, requestId } };
    try {
      const data = await operation(parsed.data);
      return { status: 200, body: { ok: true as const, data, requestId } };
    } catch (error) {
      if (error instanceof ActivationError) return { status: STATUS[error.code] ?? 400, body: { ok: false as const, error: { code: error.code, message: error.message }, requestId } };
      return { status: 500, body: { ok: false as const, error: { code: "INTERNAL_ERROR", message: "服务暂时不可用" }, requestId } };
    }
  };
}
