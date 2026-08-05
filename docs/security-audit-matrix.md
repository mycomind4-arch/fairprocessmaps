# FairProcess Security Audit Matrix
## Phase 1D+1E — Route-Level Security Contract

Every API route, its authentication, authorization, organization scoping, and actor identity coverage.

| Route | Method | Auth | Permission | Org Scoped | Event Actor | Audit Event |
|---|---|---|---|---|---|---|
| `/api/v1/auth/login` | POST | none | none | no | no | no |
| `/api/v1/auth/logout` | POST | session | none | no | no | no |
| `/api/v1/auth/me` | GET | session | none | no | no | no |
| `/api/v1/admin/bootstrap` | POST | token¹ | none¹ | no | no | no |
| `/api/v1/projects` | GET | yes | case.read | yes | no | no |
| `/api/v1/projects/list` | GET | yes | case.read | yes | no | no |
| `/api/v1/property-projects` | GET | yes | case.read | yes | no | no |
| `/api/v1/property-projects` | POST | yes | case.update | yes | yes | yes |
| `/api/v1/properties` | GET | yes | property.read | no² | no | no |
| `/api/v1/properties/resolve` | POST | yes | property.read | no² | no | no |
| `/api/v1/search` | GET | yes | property.read | no² | no | no |
| `/api/v1/overview` | GET | yes | case.read | yes | no | no |
| `/api/v1/evidence` | GET | yes | evidence.read | yes | no | no |
| `/api/v1/evidence` | DELETE | yes | — | — | — | — (returns 405) |
| `/api/v1/evidence/upload` | POST | yes | evidence.upload | yes | yes | yes |
| `/api/v1/evidence/upload` | GET | yes | evidence.read | yes | no | no |
| `/api/v1/evidence/download` | GET | yes | evidence.read | yes | no | yes |
| `/api/v1/evidence/withdraw` | POST | yes | evidence.withdraw | yes | yes | yes |
| `/api/v1/findings` | GET | yes | finding.read | yes | no | no |
| `/api/v1/findings` | POST | yes | case.read | yes | no | no |
| `/api/v1/findings` | PATCH | yes | finding.review | yes | no | yes |
| `/api/v1/timeline` | GET | yes | event.read | yes | no | no |
| `/api/v1/timeline` | POST | yes | case.update | yes | yes | yes |
| `/api/v1/timeline` | DELETE | yes | case.update | yes | no | yes |
| `/api/v1/analyze` | GET | yes | case.read | yes | no | no |
| `/api/v1/analyze` | POST | yes | case.read | yes | no | no |
| `/api/v1/permits` | GET | yes | case.read | yes | no | no |
| `/api/v1/permits` | POST | yes | case.update | yes | no | yes |
| `/api/v1/enforcement` | GET | yes | case.read | yes | no | no |
| `/api/v1/enforcement` | POST | yes | case.update | yes | no | yes |
| `/api/v1/intelligence` | POST | yes | case.read | yes | no | no |
| `/api/v1/intelligence/data` | GET | yes | property.read | no² | no | no |
| `/api/v1/intelligence/recon` | POST | yes | case.read | yes | no | no |
| `/api/v1/debug/arcgis` | GET | yes | admin.debug | no | no | no |

### Notes

¹ Bootstrap requires `BOOTSTRAP_TOKEN` env var + `X-Bootstrap-Token` header. Self-disabling after first admin.

² Properties and property intelligence are shared county-wide parcel data — not org-scoped.

### Security Properties

- **No route is publicly accessible** (except login + one-time bootstrap)
- **Every org-scoped query** includes `AND organization_id = ?`
- **Evidence is immutable** — DELETE returns 405, use withdraw
- **Audit logs are append-only** — application-layer enforcement, no UPDATE/DELETE
- **All mutations** emit timeline events with actor provenance + audit events
- **Agent permissions** are separate from human permissions (read-only)
- **Agent version** tracked in events (agent_version column)
- **Resource org** tracked separately from actor org (resource_organization_id)
- **Session fixation** prevented — login destroys old sessions, tracks rotation
- **Session tokens** hashed with SHA-256 — never stored raw
- **Cookies** are HttpOnly + Secure + SameSite=Strict
- **Password hashing** uses PBKDF2 (100k iterations) via Web Crypto
- **Bootstrap** requires environment token + self-disables after first admin

### PR Checklist for New Routes

Before adding a route, verify:

| Requirement | Required |
|---|---|
| Auth middleware (`requireAuth`) | ✅ |
| Authorization rule (`requireAuthz`) | ✅ |
| Organization scope (if org-scoped data) | ✅ |
| Actor event (if mutation) | ✅ |
| Audit event (if mutation) | ✅ |
| Test case | ✅ |
| Security matrix updated | ✅ |

### Phase 2.1+2.2+2.3 Routes

| Route | Method | Auth | Permission | Org Scoped | Event Actor | Audit Event |
|---|---|---|---|---|---|---|
| `/api/v1/cases/{id}/graph` | GET | yes | case.read | yes | no | no |
| `/api/v1/cases/{id}/timeline` | GET | yes | event.read | yes | no | no |
| `/api/v1/cases/{id}/summary` | GET | yes | case.read | yes | no | no |
| `/api/v1/cases/{id}/focus` | GET | yes | case.read | yes | no | no |
| `/api/v1/cases/{id}/explain` | GET | yes | case.read | yes | no | no |
| `/api/v1/entities/{type}/{id}/relationships` | GET | yes | relationship.read | yes¹ | no | no |
| `/api/v1/entities/{type}/{id}/history` | GET | yes | event.read | yes¹ | no | no |
| `/api/v1/relationships/{id}/review` | PATCH | yes | relationship.review | yes² | yes | yes |

### Phase 3.1-3.2 Routes (Implemented)

| Route | Method | Auth | Permission | Org Scoped | Event Actor | Audit Event |
|---|---|---|---|---|---|---|
| `/api/v1/cases/{id}/agents/run` | POST | yes | agent.run | yes | agent | yes |
| `/api/v1/cases/{id}/agents/proposals` | GET | yes | agent.read | yes | no | no |
| `/api/v1/agents/proposals/{id}/review` | PATCH | yes | agent.review | yes | human | yes |
| `/api/v1/relationships/{id}/lineage` | GET | yes | relationship.read | yes | no | no |

¹ Org-scoped via the caseId query parameter — the entity must belong to a case in the user's organization.
² Org-scoped via the relationship's case_id, which must belong to the user's organization.
