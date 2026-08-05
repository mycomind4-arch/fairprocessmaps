import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { login, setSessionCookie } from "@/lib/security/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const result = await login(env.DB, body.email, body.password);

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    const cookie = setSessionCookie(result.token, result.expiresAt);

    return NextResponse.json(
      {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          organization_id: result.user.organization_id,
          role: result.user.role,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": cookie,
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
