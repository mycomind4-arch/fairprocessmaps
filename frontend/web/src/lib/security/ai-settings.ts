/**
 * Resolves which model and API key a request should use.
 *
 * Every existing caller of callClaude / callClaudeVision / callClaudeDocuments
 * takes a `ClaudeBindingEnv` and reads ANTHROPIC_API_KEY / ANTHROPIC_MODEL
 * directly off it. Rather than touching every call site, this produces an
 * "effective env" — the platform bindings, with an org's stored override
 * spliced in when one exists — so nothing downstream needs to know settings
 * exist at all.
 */

import { decryptApiKey, type AiSettingsCryptoEnv } from "./ai-settings-crypto";
import type { ClaudeBindingEnv } from "@/lib/claude";

export interface AiSettingsRow {
  provider: string;
  model: string | null;
  encrypted_key: string | null;
  key_last4: string | null;
  updated_at: string;
}

export async function loadAiSettings(
  db: D1Database,
  organizationId: string,
): Promise<AiSettingsRow | null> {
  const row = await db
    .prepare(
      `SELECT provider, model, encrypted_key, key_last4, updated_at
         FROM organization_ai_settings WHERE organization_id = ?`,
    )
    .bind(organizationId)
    .first();
  return (row as AiSettingsRow | null) ?? null;
}

/**
 * Build the env object model-calling code should actually use for this org.
 *
 * Falls back cleanly to the platform env when no override is stored, or when
 * the org's provider isn't "anthropic" (nothing else is implemented — see
 * docs/ai-settings.md). A decrypt failure (corrupted ciphertext, rotated
 * encryption secret) falls back to the platform key rather than hard-failing
 * the request — an org's broken override should not take down the platform
 * default for them.
 */
export async function resolveEffectiveClaudeEnv(
  env: ClaudeBindingEnv & AiSettingsCryptoEnv,
  db: D1Database,
  organizationId: string,
): Promise<ClaudeBindingEnv> {
  const settings = await loadAiSettings(db, organizationId);
  if (!settings || settings.provider !== "anthropic") return env;

  let apiKey: string | undefined;
  if (settings.encrypted_key) {
    try {
      apiKey = await decryptApiKey(env, settings.encrypted_key);
    } catch {
      // Corrupted ciphertext or a rotated encryption secret. Fall back rather
      // than breaking every request for this org.
      apiKey = undefined;
    }
  }

  return {
    ...env,
    ANTHROPIC_API_KEY: apiKey ?? env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: settings.model ?? env.ANTHROPIC_MODEL,
  };
}
