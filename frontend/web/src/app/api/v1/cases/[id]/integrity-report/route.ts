import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { checkRateLimit } from "@/lib/rate-limit";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import { generateIntegrityReport } from "@/lib/report/integrity-report";
import { eventsFromCodeEnforcement, eventsFromPermits } from "@/lib/policy/adapters";
import { resolvePack, defaultPack } from "@/lib/policy/registry";

export const runtime = "nodejs";

// GET /api/v1/cases/[id]/integrity-report — deterministic procedural audit
//
// Returns markdown plus a reproducibility receipt. `exportable` is false while
// the governing policy pack has not cleared legal review; the report still
// generates (counsel needs to read it) but carries a not-for-filing banner.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = authorize(user, "case.read");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: authz.reason ?? "Insufficient permissions" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const limit = await checkRateLimit(req, "integrity_report", 20, 60);
    if (!limit.ok) return limit.response!;

    const { env } = getCloudflareContext();
    const db = env.DB;
    const orgId = user.organization_id;

    const project = await db
      .prepare(
        `SELECT p.id, p.name, p.case_type, p.opened_at,
                pr.apn, pr.address, pr.county
           FROM projects p LEFT JOIN properties pr ON p.property_id = pr.id
          WHERE p.id = ? AND p.organization_id = ?`,
      )
      .bind(id, orgId)
      .first();

    if (!project) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const [timelineRes, evidenceRes, ceRes, permitRes] = await Promise.all([
      db
        .prepare(
          `SELECT id, event_date, event_type, description, evidence_id
             FROM timeline_events WHERE project_id = ? AND organization_id = ?
            ORDER BY event_date ASC`,
        )
        .bind(id, orgId)
        .all(),
      db
        .prepare(
          `SELECT id, title, doc_type, source, sha256_hash, extracted_text, ai_summary, created_at
             FROM evidence WHERE project_id = ? AND organization_id = ?`,
        )
        .bind(id, orgId)
        .all(),
      db
        .prepare(
          `SELECT * FROM code_enforcement_cases WHERE project_id = ? AND organization_id = ?`,
        )
        .bind(id, orgId)
        .all(),
      db
        .prepare(`SELECT * FROM building_permits WHERE project_id = ? AND organization_id = ?`)
        .bind(id, orgId)
        .all(),
    ]);

    const evidenceRows = (evidenceRes.results ?? []) as Record<string, unknown>[];
    const pack =
      resolvePack(project.county as string | null, project.case_type as string | null) ??
      defaultPack();

    const report = await generateIntegrityReport({
      case: {
        caseId: project.id as string,
        caseName: project.name as string,
        apn: (project.apn as string) ?? null,
        address: (project.address as string) ?? null,
        county: (project.county as string) ?? null,
        caseType: (project.case_type as string) ?? null,
        openedAt: (project.opened_at as string) ?? null,
      },
      pack,
      evaluation: {
        timeline: [
          ...((timelineRes.results ?? []) as any[]),
          ...eventsFromCodeEnforcement((ceRes.results ?? []) as any[]),
          ...eventsFromPermits((permitRes.results ?? []) as any[]),
        ],
        evidence: evidenceRows.map((e) => ({
          id: e.id as string,
          extracted_text: (e.extracted_text as string) ?? null,
          ai_summary: (e.ai_summary as string) ?? null,
          title: (e.title as string) ?? null,
        })),
      },
      evidenceIndex: evidenceRows.map((e) => ({
        id: e.id as string,
        title: (e.title as string) ?? null,
        docType: (e.doc_type as string) ?? null,
        source: (e.source as string) ?? null,
        sha256: (e.sha256_hash as string) ?? null,
        uploadedAt: (e.created_at as string) ?? null,
      })),
      preparedBy: user.email ?? user.id,
    });

    // The receipt is the point of the audit trail: it records exactly which
    // inputs and policy version produced the document someone may later rely on.
    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "report.integrity.generated",
      resourceType: "project",
      resourceId: id,
      detail: JSON.stringify(report.receipt),
    });

    const format = req.nextUrl.searchParams.get("format");
    if (format === "markdown") {
      return new NextResponse(report.markdown, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="integrity-report-${id}.md"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
