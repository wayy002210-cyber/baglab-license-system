import { NextResponse, type NextRequest } from "next/server";
import { mutationSchema } from "../../../../src/admin/contracts";
import { adminRepository, authorize } from "../../../../src/admin/runtime";
import { jsonBody } from "../../../../src/api/route-utils";
export async function PATCH(request: NextRequest) { try { await authorize(request,true); const input=mutationSchema.parse(await jsonBody(request)); await adminRepository().mutate(input.licenseId,input.action,input.hours,input.note); return NextResponse.json({ok:true}); } catch { return NextResponse.json({ok:false,error:{code:"ADMIN_REQUEST_DENIED",message:"管理操作失败"}},{status:403}); } }
