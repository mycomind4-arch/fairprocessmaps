-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 019: Rate Limit Log Table
--
-- Creates the rate_limit_log table that the rate-limit middleware references
-- but was never created (P1-6). Without this table, rate limiting fails
-- silently — the checkRateLimit function catches the error and returns
-- { ok: true }, effectively disabling rate limiting everywhere.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,                    -- composite key (endpoint + ip hash)
  endpoint TEXT NOT NULL,              -- e.g. "login", "recon_stream"
  ip_hash TEXT NOT NULL,               -- SHA-256 of IP address
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_log_key ON rate_limit_log(key);
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_created ON rate_limit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_endpoint ON rate_limit_log(endpoint);
