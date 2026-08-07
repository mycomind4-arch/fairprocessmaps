/**
 * Rate Limiting — Production Hardening
 *
 * Uses D1 as a lightweight rate-limit store. Tracks requests per IP + endpoint.
 * Window: 60 seconds. Limits vary by endpoint sensitivity.
 *
 * IMPORTANT: Both the INSERT and SELECT use the same timestamp format
 * (ISO 8601 with T separator and Z timezone) to ensure SQLite string
 * comparison works correctly for the sliding window.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  response?: NextResponse;
  debugError?: string;
}

function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIP = req.headers.get("x-real-ip");
  if (realIP) return realIP;
  return "unknown";
}

function hashIP(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export async function checkRateLimit(
  req: NextRequest,
  endpoint: string,
  maxRequests: number = 60,
  windowSeconds: number = 60,
  env?: { DB: any },
): Promise<RateLimitResult> {
  let debugError: string | undefined;
  try {
    let db: any;
    if (env?.DB) {
      db = env.DB;
    } else {
      const ctx = getCloudflareContext();
      db = ctx.env.DB;
    }

    if (!db) {
      return { ok: true, remaining: maxRequests, resetAt: 0, debugError: "no DB binding" };
    }

    const ip = getClientIP(req);
    const key = `${hashIP(ip)}:${endpoint}`;
    const now = Date.now();
    const nowISO = new Date(now).toISOString();
    const windowStartISO = new Date(now - windowSeconds * 1000).toISOString();

    // INSERT first, then COUNT — avoids TOCTOU race across requests.
    // The batch runs in a single transaction so the COUNT sees our INSERT.
    const batch = [
      db.prepare(
        `INSERT INTO rate_limit_log (id, key, endpoint, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), key, endpoint, hashIP(ip), nowISO),
      db.prepare(
        `SELECT COUNT(*) as n FROM rate_limit_log WHERE key = ? AND created_at > ?`
      ).bind(key, windowStartISO),
    ];

    const results = await db.batch(batch);
    // results[1] is the COUNT, which now includes the row we just inserted
    const totalAfterInsert = (results[1]?.results?.[0]?.n as number) ?? 1;

    if (totalAfterInsert > maxRequests) {
      const resetAt = now + windowSeconds * 1000;
      return {
        ok: false,
        remaining: 0,
        resetAt,
        response: NextResponse.json(
          { error: "Rate limit exceeded. Please try again later." },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": String(maxRequests),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(Math.floor(resetAt / 1000)),
              "Retry-After": String(windowSeconds),
              "Cache-Control": "no-store",
            },
          },
        ),
      };
    }

    const remaining = maxRequests - totalAfterInsert;
    const resetAt = now + windowSeconds * 1000;

    return { ok: true, remaining, resetAt };
  } catch (err) {
    debugError = err instanceof Error ? err.message : String(err);
    // Fail open — but surface the error for debugging
    return { ok: true, remaining: maxRequests, resetAt: 0, debugError };
  }
}

// Periodic cleanup: old rows should be pruned periodically
// This can be done via a cron job or scheduled task
export async function cleanupRateLimitLog(db: any, olderThanSeconds: number = 3600): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000).toISOString();
  await db.prepare(`DELETE FROM rate_limit_log WHERE created_at < ?`).bind(cutoff).run();
}

export const RATE_LIMITS = {
  login: { max: 5, window: 60 },
  register: { max: 3, window: 3600 },
  bootstrap: { max: 3, window: 3600 },
  upload: { max: 10, window: 60 },
  agent_run: { max: 10, window: 60 },
  default: { max: 120, window: 60 },
} as const;
