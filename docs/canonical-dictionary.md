# Canonical Domain Dictionary — FairProcess 2.0

## Phase 1D: Trust Boundary Layer

### Identity Provenance Contract

Every action has an identifiable actor.

- Every API request resolves `request.user` with `{ id, organization_id, role }`.
- Every timeline event records `actor_type`, `actor_id`, `actor_organization_id`.
- Every audit event in the `audit_events` table records the same actor triple.
- Actor types: `human`, `agent`, `system`, `government_source`.
- The full history of who did what, when, and under what authority can be
  reconstructed from `audit_events` and `timeline_events`.

### Authorization Contract

No domain operation occurs without permission evaluation.

- All API routes call `requireAuth()` → `requireAuthz(user, action, resource?)`.
- Authorization is centralized in `authorize(user, action, resource)` —
  never inlined in route handlers.
- Roles (admin, investigator, attorney, advocate, reviewer, viewer) define
  a fixed permission matrix.
- Agent permissions are a separate, read-only system (`AGENT_PERMISSIONS`).
- Resource-level checks enforce organization boundaries: if a resource has
  `organization_id`, it must match the user's organization.

### Evidence Custody Contract

Evidence cannot be destroyed, only withdrawn with provenance.

- `DELETE /api/v1/evidence` returns 405 — evidence is immutable.
- `POST /api/v1/evidence/withdraw` marks evidence as withdrawn and emits:
  - A timeline event with `actor_type=human`, `actor_id=<user>`.
  - An audit event recording the withdrawal action.
- The R2 object is retained — chain-of-custody is preserved.
- Every evidence record stores: `uploaded_by`, `organization_id`,
  `sha256_hash`, `content_type`, `original_filename`, `uploaded_at`.
- If withdrawn: `withdrawn=1`, `withdrawn_at`, `withdrawn_by`.
- SHA-256 hash is computed on upload and stored for integrity verification.

### Organization Isolation Contract

No cross-organization data access.

- Every org-scoped table has an `organization_id` column.
- Properties (county parcel data) are shared and NOT org-scoped.
- Projects, evidence, timeline events, findings, permits, enforcement cases,
  and recorder records ARE org-scoped.
- Every query on org-scoped tables includes `AND organization_id = ?`.
- No `SELECT * FROM <table> WHERE id = ?` without the org boundary.
- Download endpoints verify org access before streaming from R2.
- R2 object keys are structured as `evidence/{org_id}/{evidence_id}/{filename}`
  so storage is physically separated by organization.

## Security Middleware Order

Every request follows this sequence:

1. **Authenticate** — read session cookie → validate session → resolve user
2. **Resolve organization** — user.organization_id from membership
3. **Authorize action** — check role permissions + org boundary
4. **Execute domain operation** — run business logic (org-scoped queries)
5. **Emit event with actor identity** — timeline + audit events
6. **Return response** — never expose permanent file URLs

## Database Schema Additions (Phase 1D)

### Identity Tables

- `users` — id, email, name, password_hash, status, created_at, updated_at
- `organizations` — id, name, created_at, updated_at
- `memberships` — id, organization_id, user_id, role, created_at
- `sessions` — id, user_id, token_hash, expires_at, created_at, last_used_at

### Org-Scoped Columns

Added `organization_id` to: projects, evidence, timeline_events,
due_process_findings, building_permits, code_enforcement_cases, recorder_records.

### Actor Provenance Columns

Added to `timeline_events`: `actor_type`, `actor_id`, `actor_organization_id`.

### Evidence Custody Columns

Added to `evidence`: `uploaded_by`, `sha256_hash`, `content_type`,
`original_filename`, `uploaded_at`, `withdrawn`, `withdrawn_at`, `withdrawn_by`.

### Audit Ledger

New table `audit_events` — append-only log of every authenticated action
with actor provenance.

### Finding Review Columns

Added to `due_process_findings`: `reviewed_by`, `reviewed_at`.

## Evidence Upload Security

- Maximum file size: 50 MB
- MIME allowlist: PDF, Word, text, JSON, XML, HTML, Markdown, RTF,
  JPEG, PNG, GIF, WebP, TIFF, BMP, MP3, WAV, OGG, M4A, MP4, QuickTime, ZIP
- Filename sanitization: path traversal removed, dangerous chars replaced,
  length capped at 200 characters
- Safe R2 keys: `evidence/{org_id}/{evidence_id}/{sanitized_filename}`
- SHA-256 hash computed and stored on upload

## R2 Download Security

1. Authenticate user (session cookie)
2. Load evidence record (org-scoped query)
3. Verify organization access (org_id match)
4. Verify permission (`evidence.read`)
5. Check withdrawal status (withdrawn evidence cannot be downloaded)
6. Stream file from R2 through the worker (never expose permanent URLs)
7. Emit audit event for the download

## Debug Route Protection

- `/api/v1/debug/*` requires `admin.debug` permission
- Only the `admin` role has this permission
- Internal GIS query logic is never public

---

## Phase 1E: Operational Security Hardening

### Admin Bootstrap Contract

The first admin is created via a one-time, self-disabling endpoint.

- `POST /api/v1/admin/bootstrap` creates the initial user + organization + membership.
- Refuses to run if any admin already exists (checks `organization_members` for `role='admin'`).
- No public signup — uncontrolled account creation is inappropriate for a legal evidence system.
- Passwords must be at least 8 characters.
- The bootstrap function is idempotent — safe to call multiple times (only creates if not present).

### Session Fixation Prevention

Login destroys any existing session and creates a new authenticated one.

- `POST /api/v1/auth/login` always creates a fresh session.
- Any prior session token in the cookie is overwritten by the new token.
- Session tokens are SHA-256 hashed — never stored raw.

### Single Identity Authority

There is one identity system: FairProcess Auth.

- Supabase auth dependency has been removed.
- Client-side `auth.tsx` now calls `/api/v1/auth/login`, `/api/v1/auth/logout`, `/api/v1/auth/me`.
- The `@supabase/supabase-js` package has been removed from dependencies.
- `user_id` in `organization_members` maps to `users.id` (D1), not Supabase `auth.uid`.

### Password Recovery (Future Requirement)

Not implemented in Phase 1E. When added, must use:

- `password_reset_tokens` table with expiry
- `email_verification` flow
- `account_recovery_events` in the audit log (append-only)

Do not bolt this on without events.

---

## Pre-Production Hardening (Phase 1E+)

### Audit Log Immutability Contract

Audit logs are append-only. No UPDATE. No DELETE.

- `assertAppendOnly()` in `immutability.ts` rejects UPDATE/DELETE on audit_logs.
- Corrections to audit records are themselves new audit events:
  `{ action: "audit.correction", details: "..." }`
- The `audit_logs` table (from migration 004) is never mutated by any code path.

### Resource Organization Scoping Contract

Events record both actor and resource organization separately.

- `actor_organization_id`: the organization of the actor performing the action.
- `resource_organization_id`: the organization that owns the affected resource.
- These are NOT always the same. A government_source agent (actor org = null)
  can create an event about a resource owned by Organization B.
- Both columns exist on `timeline_events` and `events` (migration 009).

### Agent Version Provenance Contract

AI agents record their version in every event.

- `agent_version` column on `timeline_events`, `events`, and `due_process_findings`.
- An event from `statute-analysis-agent v2.1.0` records:
  `actor_type: "agent", actor_id: "statute-analysis-agent", agent_version: "2.1.0"`
- Version provenance matters for AI systems — findings from v1.0 may be
  superseded by v2.0 rules.

### Bootstrap Hardening Contract

The bootstrap endpoint requires an environment token.

- `BOOTSTRAP_TOKEN` env var must be set for the endpoint to activate.
- Request must include `X-Bootstrap-Token` header matching the env var.
- Self-disabling: refuses if any admin already exists.
- Records usage in `bootstrap_config` table.
- The vulnerable moment (first invocation) is protected by the token.

### Session Fixation Prevention Contract

Login destroys all existing sessions before creating a new one.

- `login()` queries all existing sessions for the user, deletes them,
  then creates a fresh session with `rotated_from` tracking.
- The `sessions.rotated_from` column records the previous session's token hash.
- This prevents session fixation attacks where an attacker pre-sets a
  session cookie and waits for the victim to authenticate.
