/**
 * Authentication layer — Phase 1D.
 *
 * Handles:
 *   - password hashing (PBKDF2 via Web Crypto)
 *   - session creation / validation / destruction
 *   - request authentication (cookie → session → AuthUser)
 *   - login / logout flows
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AuthUser, AuthResult, Role } from "./types";

// ── Constants ───────────────────────────────────────────────────────────────

const SESSION_COOKIE = "fp_session";
const SESSION_TTL_DAYS = 7;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32; // 256 bits
const SALT_LEN = 16;

// ── Password hashing ──────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as unknown as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    PBKDF2_KEYLEN * 8,
  );
  const hashBytes = new Uint8Array(derived);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${toHex(salt)}:${toHex(hashBytes)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expected = parts[3];

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as unknown as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    PBKDF2_KEYLEN * 8,
  );
  return toHex(new Uint8Array(derived)) === expected;
}

// ── Session management ────────────────────────────────────────────────────────

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(hash));
}

export async function createSession(db: D1Database, userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86400000).toISOString();

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(sessionId, userId, tokenHash, expiresAt, now.toISOString(), now.toISOString())
    .run();

  return { token, expiresAt };
}

export async function validateSession(db: D1Database, token: string): Promise<AuthUser | null> {
  if (!token) return null;
  const tokenHash = await hashToken(token);

  const session = await db
    .prepare(
      `SELECT s.user_id, s.expires_at
       FROM sessions s
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    )
    .bind(tokenHash)
    .first();

  if (!session) return null;

  // Update last_used_at
  await db
    .prepare("UPDATE sessions SET last_used_at = datetime('now') WHERE token_hash = ?")
    .bind(tokenHash)
    .run();

  // Resolve user + membership (primary org = first membership)
  const user = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.status, m.organization_id, m.role
       FROM users u
       JOIN organization_members m ON m.user_id = u.id
       WHERE u.id = ? AND u.status = 'active'
       LIMIT 1`,
    )
    .bind(session.user_id as string)
    .first();

  if (!user) return null;

  return {
    id: user.id as string,
    email: user.email as string,
    name: user.name as string,
    organization_id: user.organization_id as string,
    role: user.role as Role,
  };
}

export async function destroySession(db: D1Database, token: string): Promise<void> {
  const tokenHash = await hashToken(token);
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

// ── Request authentication ─────────────────────────────────────────────────────

export async function authenticateRequest(req: Request): Promise<AuthResult> {
  try {
    const { env } = getCloudflareContext();
    const db = env.DB;

    const cookie = parseCookie(req.headers.get("cookie") ?? "");
    const token = cookie[SESSION_COOKIE];

    if (!token) {
      return { ok: false, status: 401, error: "Authentication required" };
    }

    const user = await validateSession(db, token);
    if (!user) {
      return { ok: false, status: 401, error: "Invalid or expired session" };
    }

    return { ok: true, user };
  } catch (err) {
    return { ok: false, status: 500, error: "Authentication error" };
  }
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}

export function setSessionCookie(token: string, expiresAt: string): string {
  const expires = new Date(expiresAt).toUTCString();
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expires}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// ── Login / Logout ─────────────────────────────────────────────────────────────

export async function login(
  db: D1Database,
  email: string,
  password: string,
): Promise<{ user: AuthUser; token: string; expiresAt: string } | { error: string; status: number }> {
  const userRow = await db
    .prepare("SELECT id, email, name, password_hash, status FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first();

  if (!userRow) {
    return { error: "Invalid credentials", status: 401 };
  }

  if (userRow.status !== "active") {
    return { error: "Account is not active", status: 403 };
  }

  const valid = await verifyPassword(password, userRow.password_hash as string);
  if (!valid) {
    return { error: "Invalid credentials", status: 401 };
  }

  // Resolve membership
  const membership = await db
    .prepare(
      `SELECT organization_id, role FROM organization_members WHERE user_id = ? LIMIT 1`,
    )
    .bind(userRow.id as string)
    .first();

  if (!membership) {
    return { error: "No organization membership found", status: 403 };
  }

  // Session fixation prevention: destroy any existing sessions for this user
  // before creating a new one. This ensures the old session token is invalidated.
  const existingSessions = await db
    .prepare("SELECT token_hash FROM sessions WHERE user_id = ?")
    .bind(userRow.id as string)
    .all();

  const oldTokenHashes = (existingSessions.results ?? []).map((r: any) => r.token_hash as string);

  // Delete all existing sessions for this user
  await db
    .prepare("DELETE FROM sessions WHERE user_id = ?")
    .bind(userRow.id as string)
    .run();

  // Create new session (track rotation if there was a previous one)
  const session = await createSession(db, userRow.id as string);

  return {
    user: {
      id: userRow.id as string,
      email: userRow.email as string,
      name: userRow.name as string,
      organization_id: membership.organization_id as string,
      role: membership.role as Role,
    },
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

export async function logout(db: D1Database, token: string): Promise<void> {
  await destroySession(db, token);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function parseCookie(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key && valueParts.length > 0) {
      cookies[key] = valueParts.join("=");
    }
  }
  return cookies;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
