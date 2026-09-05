# Policy packs

Procedural rules are data, not code. A pack is a JSON file describing the
checkpoints for one jurisdiction; the evaluators in `src/lib/policy/evaluate.ts`
are the only place logic lives. Adding a county means writing a pack and
registering it — not writing rules.

## Why this exists

Before this, the rule engine hardcoded `const NOTICE_MIN_DAYS = 10` and emitted
findings like *"Only 4 days between notice and action (minimum: 10)."* A reader
could not tell where the 10 came from, an export could not be reproduced against
the rule text that produced it, and the wording implied a legal conclusion the
software is not qualified to reach.

Every finding now carries its citation, source URL, authority, pack id, and pack
version, and describes the record instead of judging it.

## The status vocabulary

This is the product's legal-safety boundary. A checkpoint never "fails" —
it reports what the available records show.

| Status | Meaning |
|---|---|
| `Observed` | The condition the checkpoint describes appears in the case file. |
| `NotLocated` | An expected record was not found in the evidence we have. **Not** proof it doesn't exist. |
| `InsufficientEvidence` | Required dates or documents are missing; the checkpoint can't be evaluated. |
| `AwaitingTrigger` | The event that starts the clock hasn't been established. |
| `Satisfied` | The records meet the checkpoint. |

`Observed`, `NotLocated`, and `InsufficientEvidence` are persisted as findings.
`Satisfied` and `AwaitingTrigger` are counted in the summary but not surfaced as
work items.

The neutrality tests in `src/lib/policy/__tests__/evaluate.test.ts` fail the
build if any evaluator emits "violation", "failed to", "unlawful", or similar.
Keep them.

## Rule kinds

Packs supply parameters; they cannot introduce behavior. Four evaluators exist:

- **`elapsed_days`** — minimum calendar days between a trigger event and an
  action. Takes `triggerEventTypes`, `actionEventTypes`, `minCalendarDays`.
  Selects the *most recent* trigger preceding each action, and evaluates each
  action independently.
- **`required_predicate`** — an expected event must accompany an adverse action.
  Takes `actionEventTypes`, `satisfyingEventTypes`.
- **`required_disclosure`** — a document must mention specified terms. Takes
  `documentEventTypes`, `disclosureTerms`. An un-extracted document yields
  `InsufficientEvidence`, never `Observed` — a document we can't read is not a
  document that says nothing.
- **`record_presence`** — recorder-index checks. Stubbed until a recorder search
  is wired; reports `InsufficientEvidence` honestly rather than silently passing.

Adding a fifth kind means editing `evaluate.ts` and the `RuleKind` union.

## Activation gate

```json
"activationStatus": "legal_review_required"
```

A pack in this state still evaluates, but every finding it produces is flagged
`provisional`, renders with a warning in the UI, and must be excluded from
court-facing exports. Only a qualified human moves a pack to `active`.

**The pilot pack is not activated.** Several day counts in
`humboldt-code-enforcement.json` are carried over from the project's earlier
statute library and are marked `UNVERIFIED` in their `notes`. A test asserts the
pack stays unactivated, so flipping it requires deliberately deleting that test —
which is the point.

Before activation, a lawyer needs to confirm, per rule:

1. That the cited section is the controlling authority for that checkpoint.
2. That the day count matches the currently codified text.
3. Which abatement track it applies to (summary abatement of an imminent hazard
   runs on different timelines than ordinary abatement).

## Adding a jurisdiction

1. Write `src/lib/policy/packs/<county>-<case-type>.json`. Every rule needs
   `citation`, `sourceUrl`, and `authority` — a test enforces this.
2. Register it in `src/lib/policy/registry.ts`.
3. Set `activationStatus: "legal_review_required"` and write honest `notes` on
   anything you have not personally verified against the codified text.
4. Ensure properties for that county carry the right `county` value —
   `resolvePack()` matches on it, and an unmatched county produces **no**
   findings rather than findings from the wrong county's rules.
5. Run `make test-policy`.


## Drafting a pack with the compiler

`POST /api/v1/policy/compile` drafts a pack from municipal code text. This is
what turns "county #2 is an engineering project" into "county #2 is an
afternoon of drafting plus a lawyer's review".

```json
{
  "jurisdiction": "Mendocino County, California",
  "caseTypes": ["code_enforcement"],
  "sourceUrl": "https://example.gov/code/500",
  "authority": "Mendocino County Board of Supervisors",
  "sourceText": "<the full text of the relevant code sections>"
}
```

It returns a draft pack, the rules the validator threw out and why, and a
review checklist. Nothing is written to the registry — you commit the pack file
yourself after review.

### Why you can trust the output more than you trust the model

You shouldn't trust the model at all. The safety is entirely in the validator,
which runs after the response and drops anything unsupported:

- **Every rule must quote the sentence that establishes it**, and that quote
  must actually appear in the source text you supplied. A model that reaches
  for background knowledge — "most counties require 30 days" — produces a quote
  that isn't in the text, and the rule is discarded. This is the single most
  important check.
- **A day-count rule whose quote contains no number is rejected.**
- **`sourceUrl` and `authority` come from your request, never the model.** A
  model-supplied URL could point anywhere.
- **Output is always `legal_review_required`.** There is no code path in the
  compiler that produces an activated pack.
- Rules are stamped `MACHINE-EXTRACTED, UNVERIFIED` with their establishing
  quote embedded in the notes, so a reviewer sees what it was based on.

Run `make test-policy` to see the adversarial cases — each test is a way a
plausible-looking hallucination could otherwise reach a pack.

## The Procedural Integrity Report

`GET /api/v1/cases/{id}/integrity-report` (add `?format=markdown` to download).

This is the deliverable, and it is deliberately not the brief generator. A brief
argues; this reports. Three properties make it worth paying for:

- **Complete.** Every checkpoint appears, including satisfied ones and ones that
  could not be evaluated. A report showing only adverse findings is advocacy
  wearing an audit's clothes, and opposing counsel will say so. Showing what
  passed is what makes what failed credible.
- **Cited.** Every statement traces to an authority with a URL.
- **Reproducible.** A receipt hashes the case identity, timeline, evidence
  hashes and policy version. Same inputs and same pack version regenerate the
  report exactly; any divergence is detectable. The hash deliberately excludes
  who ran it and when.

No LLM runs in report generation — it is deterministic. While the governing pack
is unreviewed the report carries a **DRAFT — NOT FOR FILING** banner and
`exportable: false`.

## What still needs building

- `record_presence` needs a recorder-index connector before it does anything.
- Event-type matching is substring-based (`"notice"` matches
  `"notice_of_violation"`). This is deliberately loose because timeline event
  types are user-entered. If event types ever become a closed vocabulary,
  tighten it.
- Findings from before the policy engine were marked `superseded` by migration
  `022`; they regenerate with provenance on the next analysis run.
