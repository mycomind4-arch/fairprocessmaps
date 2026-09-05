/**
 * POST /api/v1/cases/[id]/expand-zip — unpack an already-uploaded ZIP into
 * one evidence row per readable entry.
 *
 * No model calls happen here — this is unzip-and-store, not read. It has to
 * be fast: a case bundle can be dozens of files, and the read step that
 * follows (grouping, then /intake) is what's expensive.
 *
 * Safety (see src/lib/security/zip-intake.ts for the mechanics):
 *   - Entry count and total-uncompressed-bytes caps, checked before inflation.
 *   - Path traversal stripped from every entry name.
 *   - __MACOSX/, .DS_Store, Thumbs.db, and zero-byte entries skipped.
 *   - Nested ZIPs rejected, not recursed into.
 *
 * Idempotency: a ZIP evidence row is marked `expanded` once its entries exist,
 * so calling this twice on the same ZIP returns the existing entries instead
 * of duplicating them. A second upload of byte-identical ZIP content (same
 * sha256_hash) reuses the first upload's expansion for the same reason.
 * Per-entry dedupe (identical file inside two different bundles) happens
 * regardless of ZIP-level identity, keyed on each entry's own sha256_hash.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { checkRateLimit } from "@/lib/rate-limit";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import {
  resolveAllowedMimeType,
  sanitizeFilename,
  safeR2Key,
  computeSHA256Bytes,
} from "@/lib/security/evidence";
import { expandZipSafely } from "@/lib/security/zip-intake";

export const runtime = "nodejs";

interface CreatedEntry {
  id: string;
  title: string;
  zipPath: string;
  contentType: string;
  duplicateOfEvidenceId?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;
    const orgId = user.organization_id;

    const authz = authorize(user, "evidence.upload");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: authz.reason ?? "Insufficient permissions" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Expansion is cheap (no model calls), but still I/O-bound over
    // potentially hundreds of R2 writes — keep the tap narrow.
    const limit = await checkRateLimit(req, "zip_expand", 10, 300);
    if (!limit.ok) return limit.response!;

    const body = (await req.json().catch(() => ({}))) as { evidenceId?: string };
    if (!body.evidenceId) {
      return NextResponse.json(
        { error: "evidenceId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;
    const bucket = env.EVIDENCE_BUCKET;

    const project = await db
      .prepare(`SELECT id FROM projects WHERE id = ? AND organization_id = ?`)
      .bind(projectId, orgId)
      .first();
    if (!project) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const zipRow = await db
      .prepare(
        `SELECT id, r2_key, content_type, sha256_hash, expanded
           FROM evidence WHERE id = ? AND project_id = ? AND organization_id = ?`,
      )
      .bind(body.evidenceId, projectId, orgId)
      .first<{ id: string; r2_key: string | null; content_type: string | null; sha256_hash: string | null; expanded: number }>();

    if (!zipRow) {
      return NextResponse.json(
        { error: "Evidence not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if ((zipRow.content_type ?? "") !== "application/zip") {
      return NextResponse.json(
        { error: "This evidence item is not a ZIP archive" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    async function existingChildren(sourceZipId: string): Promise<CreatedEntry[]> {
      const rows = await db
        .prepare(
          `SELECT id, title, zip_entry_path, content_type FROM evidence
             WHERE source_zip_evidence_id = ? AND project_id = ? AND organization_id = ? AND withdrawn = 0`,
        )
        .bind(sourceZipId, projectId, orgId)
        .all();
      return ((rows.results ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        title: r.title as string,
        zipPath: (r.zip_entry_path as string) ?? (r.title as string),
        contentType: (r.content_type as string) ?? "",
      }));
    }

    // Already expanded — return what's there rather than redo the work.
    if (zipRow.expanded === 1) {
      return NextResponse.json(
        {
          zipEvidenceId: zipRow.id,
          alreadyExpanded: true,
          created: await existingChildren(zipRow.id),
          duplicates: [],
          skipped: [],
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    // Same ZIP content uploaded again under a new evidence row — reuse the
    // sibling's expansion instead of writing everything twice.
    if (zipRow.sha256_hash) {
      const sibling = await db
        .prepare(
          `SELECT id FROM evidence
             WHERE project_id = ? AND organization_id = ? AND sha256_hash = ?
               AND expanded = 1 AND id != ?`,
        )
        .bind(projectId, orgId, zipRow.sha256_hash, zipRow.id)
        .first<{ id: string }>();
      if (sibling) {
        await db
          .prepare(`UPDATE evidence SET expanded = 1, expanded_at = ? WHERE id = ? AND organization_id = ?`)
          .bind(new Date().toISOString(), zipRow.id, orgId)
          .run();
        return NextResponse.json(
          {
            zipEvidenceId: zipRow.id,
            duplicateOfZipEvidenceId: sibling.id,
            created: await existingChildren(sibling.id),
            duplicates: [],
            skipped: [],
            note: "An identical ZIP was already uploaded and expanded on this case; reusing that expansion rather than re-billing it.",
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    if (!zipRow.r2_key || !bucket) {
      return NextResponse.json(
        { error: "Archive file is not available in storage" },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
    const obj = await bucket.get(zipRow.r2_key);
    if (!obj) {
      return NextResponse.json(
        { error: "Archive file is missing from storage" },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
    const zipBytes = new Uint8Array(await obj.arrayBuffer());

    const expansion = expandZipSafely(zipBytes);
    if (!expansion.ok) {
      return NextResponse.json(
        { error: expansion.error },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const now = new Date().toISOString();
    const created: CreatedEntry[] = [];
    const duplicates: CreatedEntry[] = [];
    const skipped = [...expansion.skipped.map((s) => ({ path: s.rawPath, reason: s.reason }))];

    for (const entry of expansion.entries) {
      const resolvedType = resolveAllowedMimeType("", entry.baseName);
      if (!resolvedType) {
        skipped.push({ path: entry.path, reason: `File type of "${entry.baseName}" is not supported as evidence.` });
        continue;
      }

      const sha256Hash = await computeSHA256Bytes(entry.data);

      // Per-entry dedupe: this exact file's content may already be on the
      // case, whether from a prior upload or another entry in this bundle.
      const existing = await db
        .prepare(
          `SELECT id, title, zip_entry_path, content_type FROM evidence
             WHERE project_id = ? AND organization_id = ? AND sha256_hash = ? AND withdrawn = 0
             LIMIT 1`,
        )
        .bind(projectId, orgId, sha256Hash)
        .first<{ id: string; title: string; zip_entry_path: string | null; content_type: string | null }>();

      if (existing) {
        duplicates.push({
          id: existing.id,
          title: existing.title,
          zipPath: entry.path,
          contentType: existing.content_type ?? resolvedType,
          duplicateOfEvidenceId: existing.id,
        });
        continue;
      }

      const newId = crypto.randomUUID();
      const safeName = sanitizeFilename(entry.baseName);
      const r2Key = safeR2Key(orgId, newId, entry.baseName);

      await bucket.put(r2Key, entry.data, { httpMetadata: { contentType: resolvedType } });

      await db
        .prepare(
          `INSERT INTO evidence
             (id, project_id, source, doc_type, title, status, extracted_text,
              r2_key, organization_id, uploaded_by, sha256_hash, content_type,
              original_filename, uploaded_at, source_zip_evidence_id, zip_entry_path)
           VALUES (?, ?, 'upload', NULL, ?, 'processed', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId, projectId, safeName, r2Key, orgId, user.id, sha256Hash, resolvedType,
          entry.baseName, now, zipRow.id, entry.path,
        )
        .run();

      created.push({ id: newId, title: safeName, zipPath: entry.path, contentType: resolvedType });
    }

    await db
      .prepare(`UPDATE evidence SET expanded = 1, expanded_at = ? WHERE id = ? AND organization_id = ?`)
      .bind(now, zipRow.id, orgId)
      .run();

    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "case.zip.expanded",
      resourceType: "evidence",
      resourceId: zipRow.id,
      detail: JSON.stringify({
        created: created.length,
        duplicates: duplicates.length,
        skipped: skipped.length,
      }),
    });

    return NextResponse.json(
      { zipEvidenceId: zipRow.id, created, duplicates, skipped },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
