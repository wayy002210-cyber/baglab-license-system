import { NextResponse, type NextRequest } from "next/server";
import { adminRepository, authorize } from "../../../../src/admin/runtime";
export async function GET(request: NextRequest) { try { await authorize(request,false); return NextResponse.json({ok:true,data:await adminRepository().dashboard(request.nextUrl.searchParams.get("q")??"")},{headers:{"Cache-Control":"no-store"}}); } catch { return NextResponse.json({ok:false,error:{code:"ADMIN_SESSION_INVALID",message:"请先登录"}},{status:401}); } }
