import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import {
  encryptApiKey,
  last4,
  looksLikeAnthropicKey,
} from "@/lib/security/ai-settings-crypto";
import { loadAiSettings } from "@/lib/security/ai-settings";

export const runtime = "nodejs";

/**
 * GET /api/v1/settings/ai
 *
 * Returns whether a key is configured and its last 4 characters, NEVER the
 * key itself. `keyConfigured: false` with no `keyLast4` means the org is
 * using the platform default.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = authorize(user, "settings.ai.manage");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: "Managing AI provider settings requires an administrator." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const settings = await loadAiSettings(env.DB, user.organization_id);

    return NextResponse.json(
      {
        provider: settings?.provider ?? "anthropic",
        model: settings?.model ?? null,
        keyConfigured: Boolean(settings?.encrypted_key),
        keyLast4: settings?.key_last4 ?? null,
        updatedAt: settings?.updated_at ?? null,
        // Told plainly so the UI never implies more than is implemented.
        supportedProviders: ["anthropic"],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

/**
 * PUT /api/v1/settings/ai
 *
 * Body: { apiKey?: string, model?: string | null, clearKey?: boolean }
 *
 * `apiKey`, when present, is encrypted immediately and never stored, logged,
 * echoed, or returned in plaintext anywhere — including this response.
 * `clearKey: true` removes the stored key and reverts the org to the
 * platform default. `model` alone can be updated without touching the key.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = authorize(user, "settings.ai.manage");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: "Managing AI provider settings requires an administrator." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = (await req.json()) as {
      apiKey?: string;
      model?: string | null;
      clearKey?: boolean;
    };

    if (body.apiKey && body.clearKey) {
      return NextResponse.json(
        { error: "Provide apiKey or clearKey, not both." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (body.apiKey && !looksLikeAnthropicKey(body.apiKey)) {
      return NextResponse.json(
        {
          error:
            "That doesn't look like an Anthropic API key (expected to start with sk-ant-). " +
            "Double-check it was copied in full before saving.",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;
    const orgId = user.organization_id;

    const existing = await loadAiSettings(db, orgId);

    let encryptedKey = existing?.encrypted_key ?? null;
    let keyLast4 = existing?.key_last4 ?? null;

    if (body.clearKey) {
      encryptedKey = null;
      keyLast4 = null;
    } else if (body.apiKey) {
      encryptedKey = await encryptApiKey(env as never, body.apiKey);
      keyLast4 = last4(body.apiKey);
    }

    const model = body.model !== undefined ? body.model : (existing?.model ?? null);

    await db
      .prepare(
        `INSERT INTO organization_ai_settings
           (organization_id, provider, model, encrypted_key, key_last4, updated_by, updated_at)
         VALUES (?, 'anthropic', ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(organization_id) DO UPDATE SET
           model = excluded.model,
           encrypted_key = excluded.encrypted_key,
           key_last4 = excluded.key_last4,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      )
      .bind(orgId, model, encryptedKey, keyLast4, user.email ?? user.id)
      .run();

    // The audit trail records THAT a key was changed, and by whom — never the
    // key itself, not even in hashed form (a hash of a low-entropy-looking
    // secret is still worth avoiding when it serves no purpose here).
    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: body.clearKey
        ? "settings.ai.key_cleared"
        : body.apiKey
          ? "settings.ai.key_updated"
          : "settings.ai.model_updated",
      resourceType: "organization",
      resourceId: orgId,
      detail: JSON.stringify({ model, keyConfigured: Boolean(encryptedKey) }),
    });

    return NextResponse.json(
      {
        provider: "anthropic",
        model,
        keyConfigured: Boolean(encryptedKey),
        keyLast4,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
