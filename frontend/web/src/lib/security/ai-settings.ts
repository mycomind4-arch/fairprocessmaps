/**
 * AI credential resolution and provenance.
 *
 * Credential precedence is deliberately narrow and predictable:
 *   1. the authenticated user's own encrypted Anthropic key/model
 *   2. the organization's encrypted Anthropic key/model
 *   3. the platform Worker bindings
 *
 * Plaintext keys never leave this server module and are never written to D1.
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

export type AiCredentialScope = "user" | "organization" | "platform";

export interface EffectiveClaudeContext<T extends object> {
  env: T & ClaudeBindingEnv;
  provider: "anthropic";
  model: string | null;
  credentialScope: AiCredentialScope;
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

export async function loadUserAiSettings(
  db: D1Database,
  userId: string,
): Promise<AiSettingsRow | null> {
  const row = await db
    .prepare(
      `SELECT provider, model, encrypted_key, key_last4, updated_at
         FROM user_ai_settings
        WHERE user_id = ? AND enabled = 1`,
    )
    .bind(userId)
    .first();
  return (row as AiSettingsRow | null) ?? null;
}

async function decryptOverride<T extends object>(
  env: T,
  settings: AiSettingsRow | null,
): Promise<string | undefined> {
  if (!settings?.encrypted_key || settings.provider !== "anthropic") return undefined;
  try {
    return await decryptApiKey(env as AiSettingsCryptoEnv, settings.encrypted_key);
  } catch {
    // A broken override must not expose ciphertext or take down the platform
    // default. The settings screen still shows that a key is configured so the
    // user can replace it.
    return undefined;
  }
}

/** Resolve the effective Anthropic environment plus which credential paid. */
export async function resolveEffectiveClaudeContext<T extends object>(
  env: T,
  db: D1Database,
  organizationId: string,
  userId?: string | null,
): Promise<EffectiveClaudeContext<T>> {
  const [userSettings, orgSettings] = await Promise.all([
    userId ? loadUserAiSettings(db, userId) : Promise.resolve(null),
    loadAiSettings(db, organizationId),
  ]);

  const userKey = await decryptOverride(env, userSettings);
  if (userKey) {
    const model = userSettings?.model ?? (env as ClaudeBindingEnv).ANTHROPIC_MODEL ?? null;
    return {
      env: { ...env, ANTHROPIC_API_KEY: userKey, ANTHROPIC_MODEL: model ?? undefined },
      provider: "anthropic",
      model,
      credentialScope: "user",
    };
  }

  const orgKey = await decryptOverride(env, orgSettings);
  if (orgKey) {
    const model = orgSettings?.model ?? (env as ClaudeBindingEnv).ANTHROPIC_MODEL ?? null;
    return {
      env: { ...env, ANTHROPIC_API_KEY: orgKey, ANTHROPIC_MODEL: model ?? undefined },
      provider: "anthropic",
      model,
      credentialScope: "organization",
    };
  }

  const model = (env as ClaudeBindingEnv).ANTHROPIC_MODEL ?? orgSettings?.model ?? null;
  return {
    env: {
      ...env,
      ANTHROPIC_API_KEY: (env as ClaudeBindingEnv).ANTHROPIC_API_KEY,
      ANTHROPIC_MODEL: model ?? undefined,
    },
    provider: "anthropic",
    model,
    credentialScope: "platform",
  };
}

/** Backwards-compatible env-only helper. Pass userId to enable personal BYOK. */
export async function resolveEffectiveClaudeEnv<T extends object>(
  env: T,
  db: D1Database,
  organizationId: string,
  userId?: string | null,
): Promise<T & ClaudeBindingEnv> {
  return (await resolveEffectiveClaudeContext(env, db, organizationId, userId)).env;
}

/**
 * Produce a compact list of the actual object paths populated by an AI result.
 * Values are never stored here — only field paths, so the credential history is
 * useful without duplicating potentially sensitive case content.
 */
export function collectPopulatedPaths(value: unknown, prefix = "", limit = 100): string[] {
  const paths: string[] = [];
  const visit = (node: unknown, path: string) => {
    if (paths.length >= limit || node === null || node === undefined) return;
    if (Array.isArray(node)) {
      if (node.length > 0 && path) paths.push(path);
      node.slice(0, 20).forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        visit(child, path ? `${path}.${key}` : key);
        if (paths.length >= limit) break;
      }
      return;
    }
    if (path) paths.push(path);
  };
  visit(value, prefix);
  return [...new Set(paths)].slice(0, limit);
}

export async function recordAiUsage(args: {
  db: D1Database;
  organizationId: string;
  userId: string;
  context: Pick<EffectiveClaudeContext<object>, "provider" | "model" | "credentialScope">;
  operation: string;
  resourceType?: string;
  resourceId?: string;
  populatedPaths?: string[];
}): Promise<void> {
  await args.db
    .prepare(
      `INSERT INTO ai_usage_provenance
         (id, organization_id, user_id, provider, model, credential_scope,
          operation, resource_type, resource_id, populated_paths_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      crypto.randomUUID(),
      args.organizationId,
      args.userId,
      args.context.provider,
      args.context.model,
      args.context.credentialScope,
      args.operation,
      args.resourceType ?? null,
      args.resourceId ?? null,
      JSON.stringify(args.populatedPaths ?? []),
    )
    .run();
}
