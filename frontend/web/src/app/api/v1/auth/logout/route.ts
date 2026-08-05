import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { logout, clearSessionCookie, getSessionCookieName } from "@/lib/security/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { env } = getCloudflareContext();
    const cookieName = getSessionCookieName();

    // Parse session token from cookie
    const cookie = req.headers.get("cookie") ?? "";
    const token = cookie
      .split(";")
      .map((p) => p.trim().split("="))
      .find(([k]) => k === cookieName)?.[1];

    if (token) {
      await logout(env.DB, token);
    }

    return NextResponse.json(
      { ok: true },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": clearSessionCookie(),
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Logout failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
