/**
 * POST /api/v1/admin/bootstrap
 *
 * Creates the initial admin user + organization.
 * Only works when NO admin exists yet (one-time setup).
 * After the first admin is created, this endpoint refuses to run.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { bootstrapAdmin } from "@/lib/security/bootstrap";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { env } = getCloudflareContext();
    const db = env.DB;

    // Security: refuse if any admin already exists
    const existingAdmin = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM organization_members WHERE role = 'admin' AND status = 'active'`,
      )
      .first();

    if ((existingAdmin?.n as number) > 0) {
      return NextResponse.json(
        { error: "Admin already exists — bootstrap is disabled" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = (await req.json()) as {
      email?: string;
      name?: string;
      password?: string;
      organizationName?: string;
    };

    if (!body.email || !body.name || !body.password || !body.organizationName) {
      return NextResponse.json(
        { error: "email, name, password, and organizationName are required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await bootstrapAdmin(db, {
      email: body.email,
      name: body.name,
      password: body.password,
      organizationName: body.organizationName,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        userId: result.userId,
        organizationId: result.organizationId,
        message: "Admin created. Login at /api/v1/auth/login",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Bootstrap failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
