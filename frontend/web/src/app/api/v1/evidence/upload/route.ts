/**
 * POST /api/v1/evidence/upload — upload evidence to R2 with full security.
 *
 * Security:
 *   - Authentication required
 *   - Authorization: evidence.upload
 *   - Organization boundary enforced
 *   - SHA-256 hash computed on upload
 *   - MIME allowlist + file size limit
 *   - Safe R2 keys (org-scoped)
 *   - Actor provenance on timeline event
 *
 * Reading (extracted_text, ai_summary, proposed timeline events): every
 * uploaded file that the vision pipeline can read (PDF, image, DOCX, plain
 * text) goes through the same routeDocument -> readNotice -> buildCase path
 * as /api/v1/cases/[id]/intake and ZipIntakeWizard — previously that pipeline
 * only ran on ZIP-bundle uploads; a single photographed notice (the common
 * case this product is built around) got none of it. Reading is best-effort
 * and rate-limited: a failure or an exhausted budget still lets the upload
 * itself succeed, just without the AI enrichment for that file.
 *
 * GET /api/v1/evidence/upload?projectId=... — list evidence (org-scoped)
 */
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz, resolveProjectOrg } from "@/lib/security/middleware";
import { humanActor, emitTimelineEvent, emitAuditEvent } from "@/lib/security/events";
import {
  validateUpload,
  computeSHA256,
  sanitizeFilename,
  safeR2Key,
  MAX_FILE_SIZE,
} from "@/lib/security/evidence";
import { runAnalysis } from "@/lib/auto-triggers";
import { checkRateLimit } from "@/lib/rate-limit";
import { routeDocument, isTextual } from "@/lib/vision/document-router";
import { readNotice } from "@/lib/vision/notice-reader";
import { buildCase, type ReadDocument } from "@/lib/vision/case-builder";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const formData = await req.formData();
    const projectId = formData.get("projectId") as string;
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Authorization: verify project belongs to user's org
    const { env } = getCloudflareContext();
    const db = env.DB;
    const bucket = env.EVIDENCE_BUCKET;

    const projectOrg = await resolveProjectOrg(db, projectId);
    const authz = requireAuthz(user, "evidence.upload", {
      organization_id: projectOrg ?? undefined,
      project_id: projectId,
    });
    if (!authz.ok) return authz.response;

    const files = formData.getAll("files") as File[];
    if (files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const actor = humanActor(user);
    const uploaded: Array<{ id: string; title: string; sha256: string }> = [];
    const readDocs: ReadDocument[] = [];
    const readFailures: { id: string; title: string; error: string }[] = [];

    // One budget check for the whole request, not per file — a burst of
    // several photos in one upload shouldn't burn through the vision budget
    // faster than a single one would. Exhausting it degrades gracefully:
    // files still upload and store normally, just without AI reading for
    // this request. Shares the same bucket as /cases/[id]/intake's bulk
    // reads so the two paths can't combine into a cost surprise.
    const visionLimit = await checkRateLimit(req, "case_intake", 5, 300);
    const visionBudgetAvailable = visionLimit.ok;
    // The rate limit above bounds requests, not files within one request —
    // without this, a single upload of many files would still fire a vision
    // call per file. Cap it so one oversized batch can't spend an unbounded
    // amount in a single call.
    const MAX_VISION_READS_PER_REQUEST = 10;
    let visionReadsThisRequest = 0;

    for (const file of files) {
      // Validate file
      const validation = validateUpload(file);
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.error },
          { status: validation.status, headers: { "Cache-Control": "no-store" } },
        );
      }

      const id = crypto.randomUUID();
      const contentType = validation.contentType;
      const safeName = sanitizeFilename(file.name);
      const r2Key = safeR2Key(user.organization_id, id, file.name);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha256Hash = await computeSHA256(file);

      // Upload to R2 with safe key
      if (bucket) {
        await bucket.put(r2Key, bytes, {
          httpMetadata: { contentType },
        });
      }

      // Read the file: PDFs/images go to Claude as native document blocks,
      // DOCX/text are extracted locally first — same routing intake and
      // ZipIntakeWizard use, so a single photographed notice gets the same
      // treatment a ZIP-bundled one already did.
      let extractedText: string | null = null;
      let aiSummary: string | null = null;

      if (visionBudgetAvailable && visionReadsThisRequest < MAX_VISION_READS_PER_REQUEST) {
        try {
          const routed = await routeDocument(bytes, contentType, file.name);
          if (routed.kind !== "unsupported") {
            visionReadsThisRequest++;
            const result = await readNotice(
              env as never,
              isTextual(routed) ? [] : routed.claudeDocument ? [routed.claudeDocument] : [],
              isTextual(routed) ? routed.text : undefined,
            );
            extractedText = result.transcript;
            aiSummary = `${result.reading.documentType.value ?? "document"} read from file${
              result.needsConfirmation.length ? ` — ${result.needsConfirmation.length} field(s) need confirmation` : ""
            }`;
            readDocs.push({ evidenceId: id, fileName: safeName, reading: result.reading, needsConfirmation: result.needsConfirmation });
          }
        } catch (err) {
          // Best-effort: a misread or an unconfigured API key must not block
          // the upload itself. Fall through to the plain-text fallback below.
          readFailures.push({ id, title: safeName, error: err instanceof Error ? err.message : String(err) });
        }
      }

      // Fallback for anything not read above (no vision budget, read failed,
      // or a plain-text format that doesn't need a model call to trust).
      if (extractedText === null && (contentType.startsWith("text/") || contentType === "application/json" || contentType === "application/xml")) {
        extractedText = new TextDecoder().decode(bytes).slice(0, 50000);
      }

      const now = new Date().toISOString();

      // Insert evidence record with full provenance
      await db
        .prepare(
          `INSERT INTO evidence
            (id, project_id, source, doc_type, title, status, extracted_text, ai_summary,
             r2_key, organization_id, uploaded_by, sha256_hash, content_type,
             original_filename, uploaded_at)
           VALUES (?, ?, 'upload', ?, ?, 'processed', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id, projectId, contentType, safeName, extractedText, aiSummary, r2Key,
          user.organization_id, user.id, sha256Hash, contentType,
          file.name, now,
        )
        .run();

      // Emit timeline event with actor provenance
      await emitTimelineEvent({
        db,
        projectId,
        evidenceId: id,
        eventDate: now.slice(0, 10),
        eventType: "evidence_uploaded",
        description: `Evidence uploaded: ${safeName}`,
        actor,
      });

      // Emit audit event
      await emitAuditEvent({
        db,
        actor,
        action: "evidence.upload",
        resourceType: "evidence",
        resourceId: id,
        detail: `Uploaded '${safeName}' (${contentType}, ${file.size} bytes, sha256: ${sha256Hash.slice(0, 16)}...)`,
      });

      uploaded.push({ id, title: safeName, sha256: sha256Hash });
    }

    // Build the chronology from whatever was read, and propose timeline
    // events — same clustering/gap-finding buildCase does for a ZIP batch,
    // scoped here to just the files in this one upload.
    let visionSummary: ReturnType<typeof buildCase> | null = null;
    if (readDocs.length > 0) {
      const built = buildCase(readDocs);
      visionSummary = built;

      const existing = await db
        .prepare(`SELECT evidence_id, event_date FROM timeline_events WHERE project_id = ? AND organization_id = ?`)
        .bind(projectId, user.organization_id)
        .all();
      const seen = new Set(
        ((existing.results ?? []) as Record<string, unknown>[]).map((e) => `${e.evidence_id}|${e.event_date}`),
      );
      const inserts = built.events.filter((e) => !seen.has(`${e.evidenceId}|${e.eventDate}`));

      if (inserts.length > 0) {
        await db.batch(
          inserts.map((e) =>
            db
              .prepare(
                `INSERT INTO timeline_events
                   (id, project_id, organization_id, event_date, event_type, description, evidence_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                crypto.randomUUID(), projectId, user.organization_id, e.eventDate, e.eventType,
                e.needsConfirmation
                  ? `${e.description} — date read as "${e.dateAsPrinted}", CONFIRM AGAINST ORIGINAL`
                  : e.description,
                e.evidenceId,
              ),
          ),
        );
      }
    }

    // Auto-trigger analysis
    try {
      const analysisResult = await runAnalysis(projectId);
      return NextResponse.json(
        {
          uploaded: uploaded.length,
          ids: uploaded.map((u) => u.id),
          analysis: analysisResult,
          vision: visionSummary
            ? { read: readDocs.length, summary: visionSummary.summary, gaps: visionSummary.gaps, confirmations: visionSummary.confirmations }
            : null,
          readFailures: readFailures.length > 0 ? readFailures : undefined,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return NextResponse.json(
        { uploaded: uploaded.length, ids: uploaded.map((u) => u.id) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// GET — list evidence for a project (org-scoped)
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Org-scoped query — never SELECT * without organization_id
    const result = await db
      .prepare(
        `SELECT id, title, source, doc_type, status, extracted_text, ai_summary,
                r2_key, content_type, sha256_hash, uploaded_by, uploaded_at,
                withdrawn, withdrawn_at, created_at
         FROM evidence
         WHERE project_id = ? AND organization_id = ?
         ORDER BY created_at DESC`,
      )
      .bind(projectId, user.organization_id)
      .all();

    const items = (result.results ?? []).map((item: any) => ({
      ...item,
      has_file: !!item.r2_key,
    }));

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
