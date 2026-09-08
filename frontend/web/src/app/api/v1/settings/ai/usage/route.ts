import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { env } = getCloudflareContext();

  const result = await env.DB
    .prepare(
      `SELECT id, provider, model, credential_scope, operation,
              resource_type, resource_id, populated_paths_json, created_at
         FROM ai_usage_provenance
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 100`,
    )
    .bind(auth.user.id)
    .all();

  const items = (result.results ?? []).map((row: any) => ({
    id: row.id,
    provider: row.provider,
    model: row.model,
    credentialScope: row.credential_scope,
    operation: row.operation,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    populatedPaths: (() => {
      try { return JSON.parse(row.populated_paths_json || "[]"); } catch { return []; }
    })(),
    createdAt: row.created_at,
  }));

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
