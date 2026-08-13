import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { FixedWindowRateLimiter } from "../security/rate-limit";

const limiter = new FixedWindowRateLimiter(30, 60_000);

export async function jsonBody(request: NextRequest): Promise<unknown> { try { return await request.json(); } catch { return null; } }
export function requestId(request: NextRequest): string { return request.headers.get("x-request-id")?.slice(0, 64) || randomUUID(); }
export function jsonResult(result: { status: number; body: unknown }) { return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } }); }
export function allowRequest(request: NextRequest): boolean { const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"; return limiter.consume(forwarded); }
