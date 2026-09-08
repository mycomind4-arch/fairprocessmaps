import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import { encryptApiKey, last4, looksLikeAnthropicKey } from "@/lib/security/ai-settings-crypto";
import { loadAiSettings, loadUserAiSettings } from "@/lib/security/ai-settings";

export const runtime = "nodejs";

/**
 * Personal BYOK settings. Any authenticated user may configure their own key.
 * The key is write-only: responses expose only whether it exists and last4.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;
    const { env } = getCloudflareContext();

    const [personal, organization] = await Promise.all([
      loadUserAiSettings(env.DB, user.id),
      loadAiSettings(env.DB, user.organization_id),
    ]);

    return NextResponse.json(
      {
        provider: "anthropic",
        model: personal?.model ?? null,
        keyConfigured: Boolean(personal?.encrypted_key),
        keyLast4: personal?.key_last4 ?? null,
        updatedAt: personal?.updated_at ?? null,
        fallback: organization?.encrypted_key ? "organization" : "platform",
        organizationKeyConfigured: Boolean(organization?.encrypted_key),
        supportedProviders: ["anthropic"],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;
    const body = (await req.json()) as {
      apiKey?: string;
      model?: string | null;
      clearKey?: boolean;
    };

    if (body.apiKey && body.clearKey) {
      return NextResponse.json({ error: "Provide apiKey or clearKey, not both." }, { status: 400 });
    }
    if (body.apiKey && !looksLikeAnthropicKey(body.apiKey)) {
      return NextResponse.json(
        { error: "That doesn't look like an Anthropic API key (expected sk-ant-...)." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;
    const existing = await loadUserAiSettings(db, user.id);

    let encryptedKey = existing?.encrypted_key ?? null;
    let keyLast4 = existing?.key_last4 ?? null;
    if (body.clearKey) {
      encryptedKey = null;
      keyLast4 = null;
    } else if (body.apiKey) {
      encryptedKey = await encryptApiKey(env as never, body.apiKey.trim());
      keyLast4 = last4(body.apiKey.trim());
    }
    const model = body.model !== undefined ? (body.model?.trim() || null) : (existing?.model ?? null);

    await db
      .prepare(
        `INSERT INTO user_ai_settings
           (user_id, provider, model, encrypted_key, key_last4, enabled, updated_at)
         VALUES (?, 'anthropic', ?, ?, ?, 1, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           provider = 'anthropic', model = excluded.model,
           encrypted_key = excluded.encrypted_key, key_last4 = excluded.key_last4,
           enabled = 1, updated_at = excluded.updated_at`,
      )
      .bind(user.id, model, encryptedKey, keyLast4)
      .run();

    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: body.clearKey
        ? "settings.ai.personal_key_cleared"
        : body.apiKey
          ? "settings.ai.personal_key_updated"
          : "settings.ai.personal_model_updated",
      resourceType: "user",
      resourceId: user.id,
      detail: JSON.stringify({ model, keyConfigured: Boolean(encryptedKey) }),
    });

    return NextResponse.json(
      {
        provider: "anthropic",
        model,
        keyConfigured: Boolean(encryptedKey),
        keyLast4,
        fallback: "platform",
        supportedProviders: ["anthropic"],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
