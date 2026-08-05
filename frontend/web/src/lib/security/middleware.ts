/**
 * Security middleware — Phase 1D.
 *
 * Every API request follows:
 *   Request → Authenticate → Resolve organization → Authorize → Execute → Emit event → Return
 *
 * Usage in API routes:
 *
 *   import { requireAuth, requireAuthz } from "@/lib/security/middleware";
 *
 *   export async function GET(req: NextRequest) {
 *     const auth = await requireAuth(req);
 *     if (!auth.ok) return auth.response;
 *     const user = auth.user;
 *
 *     const authz = requireAuthz(user, "evidence.read");
 *     if (!authz.ok) return authz.response;
 *
 *     // ... route logic, all queries org-scoped to user.organization_id
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "./auth";
import { authorize } from "./authorization";
import type { Action, AuthUser, AuthResult, AuthzResult, Resource } from "./types";

// ── requireAuth: authenticate the request ──────────────────────────────────────

export async function requireAuth(req: NextRequest): Promise<
  | { ok: true; user: AuthUser }
  | { ok: false; response: NextResponse }
> {
  const result: AuthResult = await authenticateRequest(req);
  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: result.error },
        { status: result.status, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  return { ok: true, user: result.user };
}

// ── requireAuthz: authorize the action ─────────────────────────────────────────

export function requireAuthz(
  user: AuthUser,
  action: Action,
  resource?: Resource,
):
  | { ok: true }
  | { ok: false; response: NextResponse } {
  const result: AuthzResult = authorize(user, action, resource);
  if (!result.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: result.reason ?? "Forbidden" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  return { ok: true };
}

// ── resolveProjectOrg: get organization_id for a project ───────────────────────

export async function resolveProjectOrg(
  db: D1Database,
  projectId: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT organization_id FROM projects WHERE id = ?")
    .bind(projectId)
    .first();
  return (row?.organization_id as string) ?? null;
}

// ── resolveEvidenceOrg: get organization_id for evidence ──────────────────────

export async function resolveEvidenceOrg(
  db: D1Database,
  evidenceId: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT organization_id FROM evidence WHERE id = ?")
    .bind(evidenceId)
    .first();
  return (row?.organization_id as string) ?? null;
}

// ── verifyOrgAccess: check that a resource belongs to the user's org ─────────

export function verifyOrgAccess(
  user: AuthUser,
  resourceOrgId: string | null,
): boolean {
  if (!resourceOrgId) return false;
  return resourceOrgId === user.organization_id;
}

// ── orgScopedQuery: helper to ensure every query includes org boundary ──────
// Usage: const q = orgScopedQuery(user, "SELECT ... FROM evidence WHERE id = ? AND organization_id = ?")

export function orgScope(user: AuthUser): [string, string] {
  return ["organization_id", user.organization_id];
}
