/**
 * Shared CORS headers for API routes.
 * Validates the request Origin against an allowlist and returns the
 * matching origin — never a static value.
 *
 * Allowed origins are read from the CORS_ALLOWED_ORIGINS env var
 * (comma-separated) with sensible defaults for dev and production.
 */

/** Default origins — can be overridden via CORS_ALLOWED_ORIGINS env var */
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

/** Get the CORS headers for a specific request, validating its Origin */
export function corsHeaders(req?: Request): Record<string, string> {
  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = req?.headers.get("Origin");

  // Validate the request Origin against the allowlist
  const allowedOrigin = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0]; // fallback to first (production) for same-origin requests

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
  };
}

/** Handle OPTIONS preflight requests — returns 204 or null if not a preflight */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  return null;
}

/** Merge CORS headers into existing headers */
export function withCors(headers: Record<string, string> = {}, req?: Request): Record<string, string> {
  return { ...headers, ...corsHeaders(req) };
}
