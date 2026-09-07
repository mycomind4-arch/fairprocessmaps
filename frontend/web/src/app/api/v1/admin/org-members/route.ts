/**
 * GET/POST/PATCH /api/v1/admin/org-members
 *
 * Real organization-level user management — the actual gap: self-registration
 * (/api/v1/auth/register) always creates a brand-new standalone "personal
 * organization" for the signing-up email, and the only other way a user ever
 * gets attached to an organization is the one-time /api/v1/admin/bootstrap,
 * which permanently disables itself once any organization anywhere has an
 * admin. There was no route at all for "let a teammate into MY org."
 *
 * Distinct from /api/v1/members (project_members): that's a lightweight,
 * informational per-case roster (attorneys, property owners, witnesses) that
 * does NOT grant login access. This route manages real organization_members
 * rows — the thing that actually determines what a person can log in and do,
 * via security/authorization.ts's role → permission map.
 *
 * Scope, deliberately: invite/list/change-role/deactivate members of the
 * CALLER's own organization. Creating additional organizations (real
 * multi-tenant onboarding) is out of scope — a bigger product decision than
 * an admin action, and not something this route pretends to solve.
 *
 * Auth: requires the "org.manage" permission (admin role only).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz } from "@/lib/security/middleware";
import { hashPassword } from "@/lib/security/auth";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import type { Role } from "@/lib/security/types";
import { VALID_ROLES, isValidRole, isValidMemberStatus, generateTemporaryPassword } from "@/lib/security/admin-validation";

export const runtime = "nodejs";

// ── GET — list the caller's organization's members ──────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = requireAuthz(user, "org.manage");
    if (!authz.ok) return authz.response;

    const { env } = getCloudflareContext();
    const db = env.DB;

    const result = await db
      .prepare(
        `SELECT m.id, m.role, m.status, m.invited_by, m.invited_at, m.joined_at,
                u.id AS user_id, u.email, u.name
         FROM organization_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = ?
         ORDER BY m.joined_at ASC`,
      )
      .bind(user.organization_id)
      .all();

    return NextResponse.json(
      { items: result.results ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// ── POST — invite a member into the caller's organization ───────────────────

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = requireAuthz(user, "org.manage");
    if (!authz.ok) return authz.response;

    const body = await req.json() as { email?: string; name?: string; role?: string };
    const email = body.email?.toLowerCase().trim();
    const name = body.name?.trim();
    const role = body.role as Role | undefined;

    if (!email || !name) {
      return NextResponse.json(
        { error: "email and name are required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!isValidRole(role)) {
      return NextResponse.json(
        { error: `role must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const existingUser = await db
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();

    let userId: string;
    let temporaryPassword: string | null = null;
    let createdNewUser = false;

    if (existingUser) {
      userId = existingUser.id;
      const existingMembership = await db
        .prepare("SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?")
        .bind(user.organization_id, userId)
        .first();
      if (existingMembership) {
        return NextResponse.json(
          { error: "This person is already a member of your organization" },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
    } else {
      // New person — generate a temporary password server-side rather than
      // accepting an admin-typed one. Returned once in the response; never
      // stored or logged in plaintext.
      userId = crypto.randomUUID();
      temporaryPassword = generateTemporaryPassword();
      createdNewUser = true;
      const passwordHash = await hashPassword(temporaryPassword);
      await db
        .prepare(
          `INSERT INTO users (id, email, name, password_hash, status)
           VALUES (?, ?, ?, ?, 'active')`,
        )
        .bind(userId, email, name, passwordHash)
        .run();
    }

    const membershipId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO organization_members (id, organization_id, user_id, role, status, invited_by, invited_at, joined_at)
         VALUES (?, ?, ?, ?, 'active', ?, datetime('now'), datetime('now'))`,
      )
      .bind(membershipId, user.organization_id, userId, role, user.id)
      .run();

    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "org.member.invite",
      resourceType: "organization_member",
      resourceId: membershipId,
      detail: `Invited ${email} as ${role}${createdNewUser ? " (new account)" : " (existing account)"}`,
    });

    return NextResponse.json(
      {
        id: membershipId,
        user_id: userId,
        created_new_user: createdNewUser,
        // Only present when a new account was created — relay this to the
        // invitee securely; there is no email-delivery path in this app yet.
        temporary_password: temporaryPassword,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// ── PATCH — change a member's role or status ─────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = requireAuthz(user, "org.manage");
    if (!authz.ok) return authz.response;

    const membershipId = req.nextUrl.searchParams.get("id");
    if (!membershipId) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = await req.json() as { role?: string; status?: string };
    if (body.role !== undefined && !isValidRole(body.role)) {
      return NextResponse.json(
        { error: `role must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (body.status !== undefined && !isValidMemberStatus(body.status)) {
      return NextResponse.json(
        { error: "status must be one of: active, suspended, removed" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (body.role === undefined && body.status === undefined) {
      return NextResponse.json(
        { error: "role and/or status is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const existing = await db
      .prepare("SELECT organization_id, user_id FROM organization_members WHERE id = ?")
      .bind(membershipId)
      .first<{ organization_id: string; user_id: string }>();

    if (!existing) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (existing.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    // Lockout prevention: an admin can't demote or deactivate themselves
    // through this route. A different admin has to do it.
    if (existing.user_id === user.id) {
      return NextResponse.json(
        { error: "You cannot change your own membership — ask another admin" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const sets: string[] = [];
    const binds: unknown[] = [];
    if (body.role !== undefined) { sets.push("role = ?"); binds.push(body.role); }
    if (body.status !== undefined) { sets.push("status = ?"); binds.push(body.status); }
    sets.push("updated_at = datetime('now')");
    binds.push(membershipId);

    await db
      .prepare(`UPDATE organization_members SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...binds)
      .run();

    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "org.member.update",
      resourceType: "organization_member",
      resourceId: membershipId,
      detail: JSON.stringify({ role: body.role, status: body.status }),
    });

    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
