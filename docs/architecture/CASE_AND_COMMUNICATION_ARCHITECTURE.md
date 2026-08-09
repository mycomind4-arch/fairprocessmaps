# FairProcessMaps Case & Communication Architecture

## Purpose

This document establishes the canonical application boundary for FairProcessMaps and its future integration with MailMyPDF.

FairProcessMaps is the intelligence and defense system. MailMyPDF is the document-mailing and proof-of-service execution system. The repositories remain separate.

## Canonical Case Model

The canonical product object is **Case**.

A Case owns or references:

- Property
- Evidence
- Timeline events
- Authorities and legal authorities
- Procedural findings
- Defense strategy
- Response documents
- Communications

`Project` is a legacy compatibility concept. New application features must use Case semantics. Existing Project-backed records should be migrated or adapted at the repository/service boundary rather than creating new Project-centric features.

## Evidence Trust Model

FairProcessMaps must distinguish three layers:

1. **Fact** — directly supported by an evidence item or authoritative source.
2. **Procedural observation** — an observed relationship, omission, contradiction, or timing issue derived from facts.
3. **Legal conclusion** — a proposed interpretation that requires appropriate authority and human review.

AI may propose observations and conclusions, but it must not silently convert an inference into a canonical fact.

## Defense Workflow

The primary workflow is:

`Property → Recon → Evidence → Timeline → Analysis → Defense → Response → Communication`

Each stage should consume structured output from the previous stage and preserve provenance back to source evidence.

## Communication Boundary

FairProcessMaps must not directly access MailMyPDF's database, Stripe, Lob credentials, or internal storage.

FairProcessMaps creates a **Communication Intent**. MailMyPDF converts that intent into a mail job.

### Communication Intent

Required conceptual fields:

- `case_id`
- `organization_id`
- `purpose`
- `response_type`
- `document_id` or immutable document reference
- recipient identity and address
- requested mail class
- matter reference
- optional legal/reference metadata

The intent should be idempotent. A stable client-generated idempotency key must be retained so retries cannot create duplicate physical mailings.

## MailMyPDF Boundary

MailMyPDF owns:

- document intake/validation
- payment
- address verification
- provider submission
- USPS/Lob tracking
- fulfillment state machine
- proof of mailing/delivery
- provider identifiers
- execution audit events

FairProcessMaps owns the case meaning and legal/procedural context.

## State Synchronization

Mail status is synchronized back into the Case as case events. FairProcessMaps should never infer a physical-mail state from its own local timestamps.

Conceptual lifecycle:

`intent_created → queued → paid → submitted → accepted → in_transit → delivered → completed`

Provider failures, cancellation, refund, and manual intervention are explicit states/events rather than generic errors.

## Design Rule

FairProcessMaps answers:

> What happened, what does the evidence establish, what may be procedurally wrong or missing, and what should we do?

MailMyPDF answers:

> How do we securely send this document, track it, and produce durable proof?

Neither product should absorb the other's core responsibilities.
