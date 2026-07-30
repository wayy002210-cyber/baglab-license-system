type BackendErrorBody = {
  detail?: string | { message?: string };
};

export async function readJsonResponse<T>(
  response: Response,
  fallback: string
): Promise<T> {
  const text = await response.text();
  let body: (T & BackendErrorBody) | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as T & BackendErrorBody;
    } catch {
      if (!response.ok) {
        throw new Error(`${fallback}（本地服务错误 ${response.status}）`);
      }
      throw new Error(`${fallback}：本地服务返回了无法识别的数据`);
    }
  }
  if (!response.ok) {
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : body?.detail?.message;
    throw new Error(detail || `${fallback}（错误码 ${response.status}）`);
  }
  if (body === null) throw new Error(`${fallback}：本地服务未返回数据`);
  return body;
}
