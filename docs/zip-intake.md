# ZIP bundle intake

A user drags in a ZIP of mixed code-enforcement paperwork — PDFs, DOCX,
JPG/PNG photos, text files — and it becomes readable evidence, grouped into
documents, then run through the existing intake pipeline
(`POST /api/v1/cases/[id]/intake`).

There is no async infrastructure (no Queues, no Durable Objects, no cron).
Reading dozens of documents is client-driven chunking: the browser calls
`/intake` in small batches with a progress bar, never one long request.

## Pipeline

```
ZIP evidence row (uploaded like any other file)
        │
        ▼
POST /expand-zip          — unzip, sanitize, dedupe, store. No model calls.
        │
        ▼
POST /group-documents      — filename/folder heuristics (free), then an
  (heuristic pass)           optional cheap first-page model pass, both
        │                    gated behind a shown cost estimate + confirm.
        ▼
  Review UI (client)        — proposed groups are draggable/splittable;
                               nothing here is committed yet.
        │
        ▼
POST /intake × N batches   — the existing read → transcript → timeline →
  (chunked, client-driven)   findings pipeline, unchanged.
        │
        ▼
  Analysis / Legal tabs     — runAnalysis, generateIntegrityReport,
                               generateBrief: already wired, just linked to.
```

## Files

- `src/lib/security/zip-intake.ts` — safe expansion: entry-count and
  total-uncompressed-bytes caps checked from the ZIP's declared sizes before
  any inflation, path-traversal stripped, junk (`__MACOSX/`, `.DS_Store`,
  `Thumbs.db`) and zero-byte entries skipped, nested ZIPs rejected rather than
  recursed into. Pure function, no I/O — `expandZipSafely(bytes, limits)`.
- `src/lib/vision/document-grouping.ts` — the grouping heuristics
  (`proposeDocumentGroups`), the cheap model pass (`cheapClassifyDocuments`,
  `refineGroupsWithCheapReads`), and the cost estimator
  (`estimateIntakeCost`). All the interesting logic lives here and is unit
  tested without any Cloudflare bindings.
- `src/app/api/v1/cases/[id]/expand-zip/route.ts` — wires the above to R2/D1:
  fetches the ZIP's bytes, expands it, writes one evidence row per entry,
  dedupes on `sha256_hash` (both at the whole-ZIP level and per entry), marks
  the parent ZIP `expanded` so it's never re-expanded or itself sent to a
  model.
- `src/app/api/v1/cases/[id]/group-documents/route.ts` — heuristic-only by
  default; pass `useModel: true` to also run the cheap pass. Excludes
  already-read evidence (`extracted_text` present) from the cost estimate and
  the model pass.
- `src/components/ZipIntakeWizard.tsx` — the client driver: calls the two
  routes above, renders the review UI, then loops `/intake` in batches of 4
  with a progress bar, and finally links to the Analysis/Legal tabs.
  Triggered automatically from `EvidenceVaultPanel` when an uploaded file is
  a ZIP.

## Schema

Migration `024_zip_intake.sql` adds to `evidence`:

- `expanded` / `expanded_at` — idempotency marker on the ZIP row itself.
- `source_zip_evidence_id` — lineage from an expanded entry back to its ZIP.
- `zip_entry_path` — the entry's sanitized path inside the archive; the
  strongest grouping signal when an archive is already one folder per
  document.

## What this deliberately does not do

- **No recursion into nested ZIPs.** A ZIP inside a ZIP is skipped and
  reported, never expanded automatically.
- **No auto-confirm of anything.** Groups are proposals until a person
  reviews them; `/intake` itself still writes `CONFIRM AGAINST ORIGINAL`
  markers for anything it couldn't read cleanly, unchanged from before this
  feature.
- **No new async infrastructure.** If someone closes their laptop mid-run,
  completed batches are kept (`/intake` is idempotent per evidence) but
  there is no server-side resumption — that's the tradeoff for not reaching
  for Queues. Revisit only if this becomes a real problem in practice.
