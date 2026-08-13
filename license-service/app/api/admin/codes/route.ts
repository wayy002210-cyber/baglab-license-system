import { NextResponse, type NextRequest } from "next/server";
import { generateSchema } from "../../../../src/admin/contracts";
import { adminRepository, authorize } from "../../../../src/admin/runtime";
import { jsonBody } from "../../../../src/api/route-utils";
export async function POST(request: NextRequest) { try { await authorize(request, true); const parsed=generateSchema.parse(await jsonBody(request)); return NextResponse.json({ ok:true, data:await adminRepository().generate(parsed.plan,parsed.count,parsed.note) },{headers:{"Cache-Control":"no-store"}}); } catch { return NextResponse.json({ok:false,error:{code:"ADMIN_REQUEST_DENIED",message:"请求未通过安全校验"}},{status:403}); } }
