/**
 * POST /api/v1/cases/[id]/group-documents — propose which raw files belong
 * to the same document, before any of them is read in full.
 *
 * Two modes, both required by the cost-gating rule in the intake brief: no
 * model call happens until a person has seen an estimate and asked to
 * proceed.
 *
 *   - `useModel` omitted or false: filename/folder heuristics only
 *     (`proposeDocumentGroups`). Instant, free, safe to call as often as the
 *     review UI wants to recompute after a manual split/merge.
 *   - `useModel: true`: additionally runs the cheap first-page classification
 *     pass and refines the heuristic groups with it. This is a model call
 *     per unread file — call it once, after the person has seen the cost
 *     estimate from the first call and confirmed.
 *
 * Already-read evidence (extracted_text present) is included in the grouping
 * so the review UI can show the whole bundle, but excluded from the cost
 * estimate and from the cheap pass — it does not need re-billing.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  proposeDocumentGroups,
  cheapClassifyDocuments,
  refineGroupsWithCheapReads,
  estimateIntakeCost,
  type GroupingCandidate,
} from "@/lib/vision/document-grouping";

export const runtime = "nodejs";

interface EvidenceRow {
  id: string;
  title: string | null;
  original_filename: string | null;
  zip_entry_path: string | null;
  content_type: string | null;
  r2_key: string | null;
  extracted_text: string | null;
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

    // The useModel pass calls the model once per unread file; keep it as
    // tightly rate-limited as case intake itself.
    const limit = await checkRateLimit(req, "document_grouping", 10, 300);
    if (!limit.ok) return limit.response!;

    const body = (await req.json().catch(() => ({}))) as {
      evidenceIds?: string[];
      useModel?: boolean;
    };
    if (!body.evidenceIds?.length) {
      return NextResponse.json(
        { error: "evidenceIds is required" },
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

    const placeholders = body.evidenceIds.map(() => "?").join(",");
    const rows = await db
      .prepare(
        `SELECT id, title, original_filename, zip_entry_path, content_type, r2_key, extracted_text
           FROM evidence
          WHERE id IN (${placeholders}) AND project_id = ? AND organization_id = ?
            AND withdrawn = 0 AND (content_type IS NULL OR content_type != 'application/zip')`,
      )
      .bind(...body.evidenceIds, projectId, orgId)
      .all();

    const evidence = (rows.results ?? []) as unknown as EvidenceRow[];
    const excludedIds = body.evidenceIds.filter((id) => !evidence.some((e) => e.id === id));

    if (evidence.length === 0) {
      return NextResponse.json(
        {
          groups: [],
          costEstimate: estimateIntakeCost(0, 0),
          alreadyReadIds: [],
          excludedIds,
          note: "None of the requested evidence is available to group — it may be withdrawn, missing, or itself the ZIP archive rather than an entry inside it.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const candidates: GroupingCandidate[] = evidence.map((e) => ({
      evidenceId: e.id,
      fileName: e.title ?? e.original_filename ?? e.id,
      zipPath: e.zip_entry_path,
    }));
    const alreadyReadIds = evidence.filter((e) => e.extracted_text).map((e) => e.id);
    const unread = evidence.filter((e) => !e.extracted_text);

    let groups = proposeDocumentGroups(candidates);
    const costEstimate = estimateIntakeCost(unread.length, groups.length);

    if (body.useModel && unread.length > 0) {
      if (!bucket) {
        return NextResponse.json(
          { error: "Evidence storage is not available" },
          { status: 500, headers: { "Cache-Control": "no-store" } },
        );
      }

      const files: { evidenceId: string; data: Uint8Array; contentType: string; fileName: string }[] = [];
      for (const e of unread) {
        if (!e.r2_key) continue;
        const obj = await bucket.get(e.r2_key);
        if (!obj) continue;
        files.push({
          evidenceId: e.id,
          data: new Uint8Array(await obj.arrayBuffer()),
          contentType: e.content_type ?? "",
          fileName: e.title ?? e.original_filename ?? e.id,
        });
      }

      const reads = await cheapClassifyDocuments(env as never, files);
      groups = refineGroupsWithCheapReads(groups, reads);
    }

    return NextResponse.json(
      {
        groups,
        costEstimate,
        alreadyReadIds,
        excludedIds,
        modelPassApplied: Boolean(body.useModel && unread.length > 0),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
