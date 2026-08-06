/**
 * Rate Limiting — Production Hardening
 *
 * Uses D1 as a lightweight rate-limit store. Tracks requests per IP + endpoint.
 * Window: 60 seconds. Limits vary by endpoint sensitivity.
 *
 * Usage:
 *   const limit = await checkRateLimit(req, "login", 5); // 5 attempts/min
 *   if (!limit.ok) return limit.response;
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  response?: NextResponse;
}

function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIP = req.headers.get("x-real-ip");
  if (realIP) return realIP;
  return "unknown";
}

function hashIP(ip: string): string {
  // Simple hash for storage — not cryptographic, just for key normalization
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
): Promise<RateLimitResult> {
  try {
    const { env } = getCloudflareContext();
    const db = env.DB;
    const ip = getClientIP(req);
    const key = `${hashIP(ip)}:${endpoint}`;
    const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

    // Count requests in window
    const countResult = await db
      .prepare(
        `SELECT COUNT(*) as n FROM rate_limit_log WHERE key = ? AND created_at > ?`
      )
      .bind(key, windowStart)
      .first();

    const count = (countResult?.n as number) ?? 0;

    if (count >= maxRequests) {
      const resetAt = Date.now() + windowSeconds * 1000;
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

    // Log this request
    await db
      .prepare(`INSERT INTO rate_limit_log (id, key, endpoint, ip_hash, created_at) VALUES (?, ?, ?, ?, datetime('now'))`)
      .bind(crypto.randomUUID(), key, endpoint, hashIP(ip))
      .run();

    const remaining = maxRequests - count - 1;
    const resetAt = Date.now() + windowSeconds * 1000;

    return { ok: true, remaining, resetAt };
  } catch {
    // Fail open — if D1 is down, don't block requests
    return { ok: true, remaining: maxRequests, resetAt: Date.now() + windowSeconds * 1000 };
  }
}

// Preset limits for sensitive endpoints
export const RATE_LIMITS = {
  login: { max: 5, window: 60 },      // 5 login attempts per minute
  register: { max: 3, window: 3600 }, // 3 registrations per hour
  bootstrap: { max: 3, window: 3600 }, // 3 bootstrap attempts per hour
  upload: { max: 10, window: 60 },     // 10 uploads per minute
  agent_run: { max: 10, window: 60 },  // 10 agent runs per minute
  default: { max: 120, window: 60 },   // 120 requests per minute
} as const;
