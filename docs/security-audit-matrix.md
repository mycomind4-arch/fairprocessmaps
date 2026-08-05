# FairProcess Security Audit Matrix
## Phase 1D — Route-Level Security Contract

Every API route, its authentication, authorization, organization scoping, and actor identity coverage.

| Route | Method | Auth | Permission | Org Scoped | Event Actor | Audit Event |
|---|---|---|---|---|---|---|
| `/api/v1/auth/login` | POST | none | none | no | no | no |
| `/api/v1/auth/logout` | POST | session | none | no | no | no |
| `/api/v1/auth/me` | GET | session | none | no | no | no |
| `/api/v1/admin/bootstrap` | POST | none¹ | none¹ | no | no | no |
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

¹ Bootstrap is a one-time endpoint that refuses if any admin already exists. No auth required but self-disabling.

² Properties and property intelligence are shared county-wide parcel data — not org-scoped. Only child entities (projects, evidence, findings, etc.) are org-scoped.

### Security Properties

- **No route is publicly accessible** (except login + one-time bootstrap)
- **Every org-scoped query** includes `AND organization_id = ?`
- **Evidence is immutable** — DELETE returns 405, use withdraw
- **All mutations** emit timeline events with actor provenance + audit events
- **Agent permissions** are separate from human permissions (read-only)
- **Session tokens** are hashed with SHA-256 — never stored raw
- **Cookies** are HttpOnly + Secure + SameSite=Strict
- **Password hashing** uses PBKDF2 (100k iterations) via Web Crypto
