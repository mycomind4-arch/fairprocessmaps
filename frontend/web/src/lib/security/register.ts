/**
 * User Registration — Self-service account creation
 *
 * Creates a new user + personal organization + membership.
 * Users get 'investigator' role by default (can create cases, upload evidence, run analysis).
 * No admin bootstrap token required — this is the public signup path.
 */

import { hashPassword, createSession } from "./auth";
import type { AuthUser, Role } from "./types";

export interface RegisterParams {
  email: string;
  name: string;
  password: string;
}

export interface RegisterResult {
  user: AuthUser;
  token: string;
  expiresAt: string;
}

export async function registerUser(
  db: D1Database,
  params: RegisterParams,
): Promise<RegisterResult | { error: string; status: number }> {
  const { email, name, password } = params;
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Check if user already exists
  const existingUser = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(normalizedEmail)
    .first();

  if (existingUser) {
    return { error: "An account with this email already exists", status: 409 };
  }

  // 2. Create personal organization
  const orgId = crypto.randomUUID();
  const orgSlug = `${normalizedEmail.split("@")[0]}-${orgId.slice(0, 8)}`;
  await db
    .prepare(
      `INSERT INTO organizations (id, name, slug, org_type, status)
       VALUES (?, ?, ?, 'individual', 'active')`,
    )
    .bind(orgId, `${name}'s Workspace`, orgSlug)
    .run();

  // 3. Create user with hashed password
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await db
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, status)
       VALUES (?, ?, ?, ?, 'active')`,
    )
    .bind(userId, normalizedEmail, name, passwordHash)
    .run();

  // 4. Create membership with 'investigator' role
  const membershipId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO organization_members (id, organization_id, user_id, role, status, joined_at)
       VALUES (?, ?, ?, 'investigator', 'active', datetime('now'))`,
    )
    .bind(membershipId, orgId, userId)
    .run();

  // 5. Create session (auto-login after registration)
  const session = await createSession(db, userId);

  return {
    user: {
      id: userId,
      email: normalizedEmail,
      name,
      organization_id: orgId,
      role: "investigator" as Role,
    },
    token: session.token,
    expiresAt: session.expiresAt,
  };
}
