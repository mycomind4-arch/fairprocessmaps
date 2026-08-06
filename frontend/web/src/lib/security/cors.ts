/**
 * CORS Middleware — Production Hardening
 *
 * Configurable CORS for API routes. In production, restrict to known origins.
 */

import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:8788", // wrangler dev
  // Add production origins here:
  // "https://fairprocess.example.com",
];

export function withCORS(req: NextRequest, res: NextResponse, allowAll: boolean = false): NextResponse {
  const origin = req.headers.get("origin") ?? "*";
  const allowed = allowAll || ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  res.headers.set("Access-Control-Allow-Origin", allowed);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Bootstrap-Token");
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Max-Age", "86400");

  return res;
}

export function handleCORS(req: NextRequest): NextResponse | null {
  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    return withCORS(req, res);
  }
  return null;
}
