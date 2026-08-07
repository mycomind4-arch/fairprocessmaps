import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/security/middleware";

import { handleCorsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return handleCorsPreflight(req) ?? new Response(null, { status: 204 });
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    {
      user: auth.user,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
