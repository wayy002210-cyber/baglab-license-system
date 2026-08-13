import { NextResponse, type NextRequest } from "next/server";
import { adminRepository, authorize } from "../../../../src/admin/runtime";
export async function POST(request: NextRequest) { try { const { token } = await authorize(request, true); await adminRepository().deleteSession(token); } catch {} const response = NextResponse.json({ ok: true }); response.cookies.delete("baglab_admin"); return response; }
