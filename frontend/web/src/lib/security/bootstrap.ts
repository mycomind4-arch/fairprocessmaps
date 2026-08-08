/**
 * Admin Bootstrap — Phase 1E
 *
 * Creates the initial admin user + organization + membership safely.
 * No public signup — this is the only way to create the first admin.
 *
 * Usage (from a secure context — CLI, wrangler script, or admin-only API):
 *
 *   import { bootstrapAdmin } from "@/lib/security/bootstrap";
 *   await bootstrapAdmin(db, {
 *     email: "admin@example.com",
 *     name: "Initial Admin",
 *     password: process.env.BOOTSTRAP_PASSWORD  // set via env var, never hardcode,
 *     organizationName: "FairProcess Internal",
 *   });
 */

import { hashPassword } from "./auth";

export interface BootstrapParams {
  email: string;
  name: string;
  password: string;
  organizationName: string;
  organizationSlug?: string;
}

export interface BootstrapResult {
  success: boolean;
  userId?: string;
  organizationId?: string;
  membershipId?: string;
  error?: string;
}

export async function bootstrapAdmin(
  db: D1Database,
  params: BootstrapParams,
): Promise<BootstrapResult> {
  const { email, name, password, organizationName } = params;
  const slug = params.organizationSlug ?? organizationName.toLowerCase().replace(/\s+/g, "-");

  try {
    // 1. Check if org already exists
    const existingOrg = await db
      .prepare("SELECT id FROM organizations WHERE slug = ?")
      .bind(slug)
      .first();

    let orgId: string;

    if (existingOrg) {
      orgId = existingOrg.id as string;
    } else {
      orgId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO organizations (id, name, slug, org_type, status)
           VALUES (?, ?, ?, 'organization', 'active')`,
        )
        .bind(orgId, organizationName, slug)
        .run();
    }

    // 2. Check if user already exists
    const existingUser = await db
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email.toLowerCase())
      .first();

    let userId: string;

    if (existingUser) {
      userId = existingUser.id as string;
    } else {
      userId = crypto.randomUUID();
      const passwordHash = await hashPassword(password);
      await db
        .prepare(
          `INSERT INTO users (id, email, name, password_hash, status)
           VALUES (?, ?, ?, ?, 'active')`,
        )
        .bind(userId, email.toLowerCase(), name, passwordHash)
        .run();
    }

    // 3. Create membership with admin role
    const existingMembership = await db
      .prepare(
        `SELECT id FROM organization_members WHERE user_id = ? AND organization_id = ?`,
      )
      .bind(userId, orgId)
      .first();

    let membershipId: string;

    if (existingMembership) {
      membershipId = existingMembership.id as string;
      // Upgrade to admin if not already
      await db
        .prepare("UPDATE organization_members SET role = 'admin', status = 'active' WHERE id = ?")
        .bind(membershipId)
        .run();
    } else {
      membershipId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO organization_members (id, organization_id, user_id, role, status, joined_at)
           VALUES (?, ?, ?, 'admin', 'active', datetime('now'))`,
        )
        .bind(membershipId, orgId, userId)
        .run();
    }

    return { success: true, userId, organizationId: orgId, membershipId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Bootstrap failed",
    };
  }
}
