import { NextResponse, type NextRequest } from "next/server";
import { loginSchema } from "../../../../src/admin/contracts";
import { login } from "../../../../src/admin/runtime";
import { jsonBody } from "../../../../src/api/route-utils";

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await jsonBody(request)); if (!parsed.success) return NextResponse.json({ ok: false, error: { code: "INVALID_REQUEST", message: "请输入管理员密码" } }, { status: 400 });
  try { const result = await login(parsed.data.password); const response = NextResponse.json({ ok: true, data: { csrfToken: result.csrf } }); response.cookies.set("baglab_admin", result.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires: result.expiresAt }); return response; }
  catch { return NextResponse.json({ ok: false, error: { code: "ADMIN_LOGIN_FAILED", message: "管理员密码错误" } }, { status: 401 }); }
}
