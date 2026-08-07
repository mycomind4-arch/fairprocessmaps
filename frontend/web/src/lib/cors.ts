/**
 * Shared CORS headers for API routes.
 * Allows cross-origin requests from the deployed frontend and localhost dev.
 */

export function corsHeaders(): Record<string, string> {
  const allowedOrigins = [
    "https://fairprocess-web.mycomind4.workers.dev",
    "http://localhost:3000",
    "http://localhost:8787",
  ];
  
  return {
    "Access-Control-Allow-Origin": allowedOrigins[0], // Worker origin is same-origin in production
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
  };
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  return null;
}

/** Merge CORS headers into existing headers */
export function withCors(headers: Record<string, string> = {}): Record<string, string> {
  return { ...headers, ...corsHeaders() };
}
