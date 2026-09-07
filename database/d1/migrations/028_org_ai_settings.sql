-- 026_org_ai_settings.sql
--
-- Per-organization override for which model reads documents and which API key
-- pays for it, so an org can bring its own Anthropic key/model instead of the
-- platform default.
--
-- The API key is NEVER stored in plaintext. `encrypted_key` holds AES-GCM
-- ciphertext (IV prefixed) produced by src/lib/security/ai-settings-crypto.ts,
-- encrypted with a server-side secret (AI_SETTINGS_ENCRYPTION_KEY) that never
-- leaves the Worker. `key_last4` holds only the last 4 characters of the real
-- key, for display ("configured, ending ...ab12") — never enough to
-- reconstruct or reuse the key. The plaintext key is never written to any
-- column, never returned by any API response, and never logged.
--
-- One row per organization; absence of a row means "use the platform default
-- from the ANTHROPIC_API_KEY / ANTHROPIC_MODEL bindings in wrangler.toml".

CREATE TABLE IF NOT EXISTS organization_ai_settings (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

  -- Only "anthropic" is implemented today — see docs/ai-settings.md for why
  -- other providers are a separate, larger effort (different request shape
  -- entirely, especially for native PDF reading).
  provider TEXT NOT NULL DEFAULT 'anthropic',

  -- Free text, not a fixed dropdown: model ids change over time and this
  -- table should not need a migration every time they do.
  model TEXT,

  encrypted_key TEXT,
  key_last4 TEXT,

  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
