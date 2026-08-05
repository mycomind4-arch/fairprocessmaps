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
      const sha256Hash = await computeSHA256(file);

      // Upload to R2 with safe key
      if (bucket) {
        await bucket.put(r2Key, file.stream(), {
          httpMetadata: { contentType },
        });
      }

      // Extract text from text-based files
      let extractedText: string | null = null;
      if (contentType.startsWith("text/") || contentType === "application/json" || contentType === "application/xml") {
        const text = await file.text();
        extractedText = text.slice(0, 50000);
      }

      const now = new Date().toISOString();

      // Insert evidence record with full provenance
      await db
        .prepare(
          `INSERT INTO evidence
            (id, project_id, source, doc_type, title, status, extracted_text,
             r2_key, organization_id, uploaded_by, sha256_hash, content_type,
             original_filename, uploaded_at)
           VALUES (?, ?, 'upload', ?, ?, 'processed', ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id, projectId, contentType, safeName, extractedText, r2Key,
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

    // Auto-trigger analysis
    try {
      const analysisResult = await runAnalysis(projectId);
      return NextResponse.json(
        { uploaded: uploaded.length, ids: uploaded.map((u) => u.id), analysis: analysisResult },
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
