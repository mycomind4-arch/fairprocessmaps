/**
 * Next.js middleware — global CORS handling for all /api/v1/ routes.
 *
 * This ensures every API route gets proper CORS headers and OPTIONS
 * preflight handling without requiring each route to import cors.ts
 * individually. Routes that already handle CORS (auth/*) are unaffected
 * since middleware runs first and the route handler runs second.
 *
 * Security: only /api/v1/ paths are matched. Non-API routes pass through
 * untouched. Origin is validated against an allowlist.
 */

import { NextRequest, NextResponse } from "next/server";

function getAllowedOrigins(): string[] {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [
    "https://fairprocess-web.mycomind4.workers.dev",
    "http://localhost:3000",
    "http://localhost:8787",
  ];
}

export function middleware(req: NextRequest) {
  // Only handle CORS for API routes
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = req.headers.get("Origin");

  const allowedOrigin = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0];

  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
  };

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  // For non-preflight requests, add CORS headers to the response
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
