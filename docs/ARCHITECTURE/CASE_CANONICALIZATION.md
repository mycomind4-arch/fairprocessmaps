# FairProcessMaps Case Canonicalization

## Decision

`Case` is the canonical product-level work unit. `Project` is a legacy compatibility concept and must not be used as the primary identity for new workflows.

## Canonical graph

```text
Organization
  └── Case
       ├── Property
       ├── Evidence
       ├── Timeline Events
       ├── Authorities
       ├── Findings
       ├── Legal Authorities
       ├── Defense Strategy
       ├── Response Documents
       └── Communications
```

## Trust model

Every AI-generated statement must remain distinguishable from source evidence:

1. **Fact** — directly supported by a source document or structured source.
2. **Procedural observation** — a deterministic or evidence-backed observation about sequence, timing, absence, contradiction, or uncertainty.
3. **Legal analysis** — a proposed interpretation connecting facts/observations to legal authority.
4. **Action/defense proposal** — a proposed next step or argument requiring human review.

The system must never silently convert a proposal into a verified fact or legal conclusion.

## Communication boundary

FairProcessMaps owns the case, evidence, reasoning, response document, and business purpose. MailMyPDF owns physical mailing execution, payment, provider submission, tracking, and proof of mailing.

FairProcessMaps must never directly access MailMyPDF's Stripe, Lob, or database credentials.

The integration is API/event based:

```text
Case → Response Document → Communication Request
                                  ↓
                            MailMyPDF API
                                  ↓
                         tracking / proof event
                                  ↓
                            Case Timeline
```

## Migration rule

New code must create and reference Cases. Existing Project records may remain during compatibility migration, but new product flows must not introduce new Project-centric dependencies.

When a Project is encountered, resolve it to its associated Case at the application boundary rather than propagating `project_id` through new domain APIs.

## Non-goals

This decision does not require a database rewrite, graph database, PostGIS, microservices, or an agent marketplace. The current D1 architecture remains the operational store until actual scale or workload evidence justifies a change.
