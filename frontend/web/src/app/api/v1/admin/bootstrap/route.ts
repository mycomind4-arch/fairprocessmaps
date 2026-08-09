/**
 * POST /api/v1/admin/bootstrap
 *
 * Creates the initial admin user + organization + membership.
 * Requires:
 *   1. BOOTSTRAP_TOKEN env var is set
 *   2. Request includes X-Bootstrap-Token header matching it
 *   3. No admin already exists (self-disabling)
 *
 * Security layers:
 *   - Environment token (prevents drive-by bootstrapping)
 *   - Self-disabling (refuses if any admin exists)
 *   - Password minimum length (8 chars)
 *   - Idempotent (safe to retry)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { bootstrapAdmin } from "@/lib/security/bootstrap";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { env } = getCloudflareContext();

    // Layer 1: Environment token check
    const expectedToken = (env as unknown as Record<string, string>).BOOTSTRAP_TOKEN;
    if (!expectedToken) {
      return NextResponse.json(
        { error: "Bootstrap is not configured — set BOOTSTRAP_TOKEN environment variable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const providedToken = req.headers.get("X-Bootstrap-Token");
    // Constant-time comparison to prevent timing attacks (C6)
    const tokenValid = providedToken && providedToken.length === expectedToken.length
      ? (() => { let r = 0; for (let i = 0; i < providedToken.length; i++) r |= providedToken.charCodeAt(i) ^ expectedToken.charCodeAt(i); return r === 0; })()
      : false;
    if (!tokenValid) {
      return NextResponse.json(
        { error: "Invalid bootstrap token" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Layer 2: Self-disabling — refuse if any admin exists
    const db = env.DB;
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

    // Layer 3: Input validation
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

    // Layer 4: Create admin
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

    // Layer 5: Record bootstrap usage
    // Hash the token before storing — never store the raw token (C6)
    const tokenHashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(providedToken!),
    );
    const tokenHash = Array.from(new Uint8Array(tokenHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await db
      .prepare(
        `INSERT INTO bootstrap_config (id, token_hash, used_at)
         VALUES ('singleton', ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET used_at = datetime('now')`,
      )
      .bind(tokenHash)
      .run();

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
