import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { setSessionCookie } from "@/lib/security/auth";
import { registerUser } from "@/lib/security/register";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { handleCorsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return handleCorsPreflight(req) ?? new Response(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 3 registrations per hour per IP
    const rlEnv = getCloudflareContext();
    const limit = await checkRateLimit(
      req,
      "register",
      RATE_LIMITS.register.max,
      RATE_LIMITS.register.window,
      rlEnv.env,
    );
    if (!limit.ok) return limit.response!;

    const body = (await req.json()) as {
      email?: string;
      name?: string;
      password?: string;
    };

    if (!body.email || !body.name || !body.password) {
      return NextResponse.json(
        { error: "email, name, and password are required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (body.name.trim().length < 2) {
      return NextResponse.json(
        { error: "Name must be at least 2 characters" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const result = await registerUser(env.DB, {
      email: body.email,
      name: body.name.trim(),
      password: body.password,
    });

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
        status: 201,
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": cookie,
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
