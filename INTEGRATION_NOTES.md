# What's wired vs. what's left

This round edits the real files in place (not new copies) — diff these
against your repo and merge, don't just overwrite.

## Architecture pivot (ADR-006, 2026-08-04)

The microservices stack (FastAPI, PostGIS, Neo4j, Temporal, Meilisearch,
MinIO, LangGraph) described in ADRs 002–005 is **superseded**. The
production stack is now:

- **Next.js API routes** (`frontend/web/src/app/api/v1/*`) on Cloudflare Workers
- **Cloudflare D1** (SQLite at edge) — schema in `database/d1/schema.sql`
- **Cloudflare R2** (S3-compatible object storage for uploaded evidence)
- **Agent-triggered workflows** (Base44) for durable orchestration
- **Humboldt County ArcGIS REST API** for parcel lookup/identification

The Python code in `backend/` is frozen reference — not deployed.
See `docs/architecture/adr.md` ADR-006 for the full rationale.

## Fully wired end-to-end
- Map click → parcel popup → **Open as project** button (`PropertyMap.tsx`)
- Button → `POST /api/v1/properties/resolve` (find-or-create Property by APN)
- → `NewProjectModal` shows existing projects for that property, or a
  create form (`GET`/`POST /api/v1/properties/[id]/projects`)
- → creating/selecting a project routes to `/project/[id]`
- → **intelligence auto-gathers** from county GIS (APN, zoning, acres, legal desc)
- → **analysis auto-runs** (due-process rules against timeline + evidence)
- Dashboard header + mini-map + nav badge read from
  `GET /api/v1/projects/[id]`, which joins property + open/critical finding counts
- Dashboard panels (Overview, Property Intelligence, Timeline, Evidence Vault,
  Discrepancies, Building Dept, Code Enforcement, Legal Library, Connectors, Admin)
  all fetch by `projectId` — ✅ done
- Humboldt County parcel click-to-identify on the map — ✅ done

## Interactive timeline — ✅ done
- `POST /api/v1/timeline?projectId=...` → add custom events (notices, hearings,
  decisions, fines, deadlines, etc.) with date + type + description
- `DELETE /api/v1/timeline?id=...&projectId=...` → remove events
- TimelinePanel has an **Add Event** form with event-type dropdown
- Adding/deleting events **auto-triggers analysis** — findings update live
- Timeline events created automatically for: evidence uploads, intelligence gathering

## Due-process analyzer — ✅ done (ported + interactive)
- Python rule engine ported to TypeScript at `frontend/web/src/lib/auto-triggers.ts`
- Rules: notice timing (10-day min), hearing right, appeal pathway
- `POST /api/v1/analyze?projectId=...` → runs rules against evidence + timeline
- `POST /api/v1/findings?projectId=...` → manually trigger analysis
- `PATCH /api/v1/findings?id=...&projectId=...` → resolve/dismiss/reopen findings
- `GET /api/v1/findings?projectId=...` → returns findings + due_process_score
- DiscrepanciesPanel has **Run Analysis** button + resolve/dismiss actions
- `rule_name` column added for human-readable rule labels
- Score: starts at 100, -20 per critical, -10 per warning (min 0)

## Evidence vault — ✅ done
- `POST /api/v1/evidence/upload` → multipart upload to R2, creates DB record
- Upload auto-creates timeline event + auto-triggers analysis
- Text extraction for text-based file types (text/, json, xml)
- `GET /api/v1/evidence?projectId=...` → list with has_file flag
- `GET /api/v1/evidence/download?id=...` → stream file from R2
- `DELETE /api/v1/evidence?id=...&projectId=...` → delete from R2 + DB + timeline refs
- R2 binding: `EVIDENCE_BUCKET` in wrangler.toml (bucket: `fairprocess-evidence`)

## Property Intelligence — ✅ done (initial)
- `POST /api/v1/intelligence?projectId=...` → queries Humboldt County GIS by APN
- Auto-triggered on project creation via `auto-triggers.ts`
- Pulls: APN, address, zoning, general plan, acres, lot size, year built,
  coastal zone, flood zone, fire responsibility, supervisor district,
  legal description, transfer date
- Creates `ai_research` evidence + `intelligence_gathered` timeline event
- Does NOT yet: scrape county websites for enforcement history, pull
  permits/inspections, cross-reference prior cases

## D1 database — ✅ done
- Database `fairprocess` (`8b5ed716-77c3-48d2-81c1-009cb01b206f`) exists remotely
- Schema applied: `properties`, `projects`, `evidence`, `evidence_relations`,
  `timeline_events`, `due_process_findings`, `building_permits`,
  `code_enforcement_cases`
- `wrangler.toml` has the real `database_id` — no placeholder
- `rule_name` column added to `due_process_findings`

## Still open
1. **Local dev needs a D1 binding** — either run `wrangler dev` (not
   `next dev`) so `getCloudflareContext()` resolves, or add a dev shim.
   Plain `next dev` won't have `env.DB` available.

2. **The old README still describes the microservices stack** — it
   should be updated to reflect the Cloudflare D1/Workers architecture,
   or at minimum point to ADR-006.

3. **Appeal pathway rule** — the rule is defined but needs timeline
   events with `appeal_filed` type to test. Currently only notice_timing
   and hearing_right rules produce findings.

4. **Evidence AI summary** — uploaded evidence has `ai_summary` column
   but nothing populates it yet. Would need an LLM call to summarize
   extracted text.

5. **Building permits & code enforcement** — API routes exist but
   don't pull real data from county systems yet. Panels are UI shells.

## Phase 1D: Trust Boundary Layer (2026-08-05)

### What's wired

- **Identity model**: users, organizations, memberships, sessions tables in D1
  (migration 004). PBKDF2 password hashing via Web Crypto. Session tokens
  stored as SHA-256 hashes — never raw.
- **Auth routes**: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`,
  `GET /api/v1/auth/me`. Session in httpOnly + Secure + SameSite=Strict cookie.
- **Auth middleware**: `requireAuth()` + `requireAuthz()` called in every API
  route. Unauthenticated requests get 401; unauthorized get 403.
- **Authorization**: Centralized `authorize(user, action, resource)` with a
  6-role × 13-action permission matrix. Agent permissions are separate.
- **Org isolation**: Every org-scoped table has `organization_id`. Every query
  includes `AND organization_id = ?`. Properties are shared (county data).
- **Actor provenance**: Timeline events + audit_events table record
  `actor_type` (human/agent/system/government_source), `actor_id`,
  `actor_organization_id`.
- **Evidence immutability**: DELETE returns 405. New
  `POST /api/v1/evidence/withdraw` marks evidence as withdrawn with
  provenance. R2 objects retained.
- **Upload security**: 50 MB limit, MIME allowlist, filename sanitization,
  safe R2 keys (`evidence/{org}/{id}/{filename}`), SHA-256 hash on upload.
- **Download security**: Auth → org check → permission check → withdrawal
  check → stream from R2. Audit event on every download.
- **Debug routes**: `/api/v1/debug/*` requires admin role.
- **Security tests**: `frontend/web/src/lib/security/__tests__/security.test.ts`
  covers auth, authorization, org isolation, agent security, upload validation,
  filename sanitization, R2 key safety, and actor identity.
- **Canonical dictionary**: `docs/canonical-dictionary.md` documents all
  Phase 1D contracts.

### Migration required

```bash
npx wrangler d1 execute fairprocess --remote --file=database/d1/migrations/004_trust_boundary.sql
```

### Still open

1. **Seed users** — need a CLI script or admin UI to create initial users +
   organizations + memberships.
2. **Client-side auth update** — `auth.tsx` still uses Supabase; needs to
   switch to the new `/api/v1/auth/*` endpoints.
3. **Replay validation** — the replay harness needs to verify actor
   provenance on all events.
4. **R2 signed URLs** — Cloudflare R2 Workers API doesn't support presigned
   URLs directly; we stream through the worker with auth checks instead.
   If presigned URLs become needed, use R2 S3 API with `aws-sdk` or
   migrate to R2 public buckets with lifecycle rules.

## Phase 1E: Operational Security Hardening (2026-08-05)

- **Migration fix**: Phase 1D commit accidentally overwrote migrations 004-007.
  Restored original migrations (004_identity_platform, 005_event_store,
  006_event_date, 007_domain_validation). Trust boundary migration renamed
  to 008_trust_boundary.sql. Migration 008 is now ADDITIVE — does not
  recreate tables from 004 (organizations, organization_members, audit_logs).
  Only adds users, sessions, and ALTER TABLE columns.

- **Admin bootstrap**: `POST /api/v1/admin/bootstrap` — one-time, self-disabling.
  Creates initial admin + org + membership. Refuses if any admin exists.
  `frontend/web/src/lib/security/bootstrap.ts` has the `bootstrapAdmin()` function.

- **Security audit matrix**: `docs/security-audit-matrix.md` — every route with
  auth, permission, org scoping, and event actor coverage.

- **Supabase removed**: `@supabase/supabase-js` removed from package.json.
  `auth.tsx` now uses `/api/v1/auth/*` endpoints. `LoginModal` updated.
  Landing page and dashboard no longer check `NEXT_PUBLIC_SUPABASE_URL`.
  One identity authority: FairProcess Auth.

- **Table name reconciliation**: Security code updated to use existing tables
  from migration 004: `organization_members` (not `memberships`), `audit_logs`
  (not `audit_events`). The `emitAuditEvent` function writes to `audit_logs`
  with correct column mapping.
