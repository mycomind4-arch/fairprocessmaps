import { collectPopulatedPaths, recordAiUsage, resolveEffectiveClaudeContext } from "@/lib/security/ai-settings";
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { checkRateLimit } from "@/lib/rate-limit";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import { readNotice } from "@/lib/vision/notice-reader";
import { routeDocument, isTextual } from "@/lib/vision/document-router";
import { buildCase, type ReadDocument } from "@/lib/vision/case-builder";
import { runAnalysis } from "@/lib/auto-triggers";

export const runtime = "nodejs";

const READABLE_TYPES = [
  "application/pdf",
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain", "text/markdown", "text/csv", "text/html",
  "application/json", "application/xml", "text/xml",
  "application/octet-stream",
];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = authorize(user, "evidence.upload");
    if (!authz.allowed) {
      return NextResponse.json({ error: authz.reason ?? "Insufficient permissions" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }

    const limit = await checkRateLimit(req, "case_intake", 5, 300);
    if (!limit.ok) return limit.response!;

    const body = (await req.json().catch(() => ({}))) as {
      evidenceIds?: string[];
      documentGroups?: string[][];
    };

    const { env } = getCloudflareContext();
    const db = env.DB;
    const bucket = env.EVIDENCE_BUCKET;
    const orgId = user.organization_id;

    const project = await db.prepare(
      `SELECT p.id, pr.apn AS property_apn
         FROM projects p LEFT JOIN properties pr ON p.property_id = pr.id
        WHERE p.id = ? AND p.organization_id = ?`,
    ).bind(id, orgId).first();
    if (!project) {
      return NextResponse.json({ error: "Case not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    let groups: string[][];
    if (body.documentGroups?.length) {
      groups = body.documentGroups;
    } else if (body.evidenceIds?.length) {
      groups = body.evidenceIds.map((e) => [e]);
    } else {
      const rows = await db.prepare(
        `SELECT id FROM evidence
          WHERE project_id = ? AND organization_id = ?
            AND content_type IN (${READABLE_TYPES.map(() => "?").join(",")})
            AND (extracted_text IS NULL OR extracted_text = '')
          ORDER BY uploaded_at ASC`,
      ).bind(id, orgId, ...READABLE_TYPES).all();
      groups = ((rows.results ?? []) as Record<string, unknown>[]).map((r) => [r.id as string]);
    }

    if (groups.length === 0) {
      return NextResponse.json({ read: 0, note: "No unread documents were found on this case. Upload the notices first — PDF, JPG, PNG, DOCX and text files are all read automatically." }, { headers: { "Cache-Control": "no-store" } });
    }

    const aiContext = await resolveEffectiveClaudeContext(env, db, orgId, user.id);
    const docs: ReadDocument[] = [];
    const failures: { evidenceId: string; error: string }[] = [];

    for (const group of groups) {
      const placeholders = group.map(() => "?").join(",");
      const rows = await db.prepare(
        `SELECT id, title, r2_key, content_type FROM evidence
          WHERE id IN (${placeholders}) AND project_id = ? AND organization_id = ?`,
      ).bind(...group, id, orgId).all();

      const pages = (rows.results ?? []) as Record<string, unknown>[];
      if (pages.length === 0) continue;

      try {
        const claudeDocs = [];
        const localText: string[] = [];
        for (const p of pages) {
          const obj = await bucket.get(p.r2_key as string);
          if (!obj) throw new Error(`File missing from storage for ${p.title ?? p.id}`);
          const bytes = new Uint8Array(await obj.arrayBuffer());
          const routed = await routeDocument(bytes, (p.content_type as string) ?? "", (p.title as string) ?? "");
          if (routed.kind === "unsupported") throw new Error(routed.reason ?? "Unsupported file");
          if (isTextual(routed)) localText.push(routed.text);
          else if (routed.claudeDocument) claudeDocs.push(routed.claudeDocument);
        }

        const result = await readNotice(
          aiContext.env,
          claudeDocs,
          localText.length > 0 ? localText.join("\n\n") : undefined,
        );

        await db.prepare(
          `UPDATE evidence SET extracted_text = ?, ai_summary = ?
            WHERE id = ? AND organization_id = ?`,
        ).bind(
          result.transcript,
          `${result.reading.documentType.value ?? "document"} read from file${result.needsConfirmation.length ? ` — ${result.needsConfirmation.length} field(s) need confirmation` : ""}`,
          pages[0].id as string,
          orgId,
        ).run();

        docs.push({
          evidenceId: pages[0].id as string,
          fileName: (pages[0].title as string) ?? (pages[0].id as string),
          reading: result.reading,
          needsConfirmation: result.needsConfirmation,
        });
      } catch (err) {
        failures.push({ evidenceId: group[0], error: String(err) });
      }
    }

    const built = buildCase(docs, (project.property_apn as string) ?? null);
    const existing = await db.prepare(
      `SELECT evidence_id, event_date FROM timeline_events
        WHERE project_id = ? AND organization_id = ?`,
    ).bind(id, orgId).all();
    const seen = new Set(((existing.results ?? []) as Record<string, unknown>[]).map((e) => `${e.evidence_id}|${e.event_date}`));
    const inserts = built.events.filter((e) => !seen.has(`${e.evidenceId}|${e.eventDate}`));

    if (inserts.length > 0) {
      await db.batch(inserts.map((e) => db.prepare(
        `INSERT INTO timeline_events
           (id, project_id, organization_id, event_date, event_type, description, evidence_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), id, orgId, e.eventDate, e.eventType,
        e.needsConfirmation ? `${e.description} — date read as "${e.dateAsPrinted}", CONFIRM AGAINST ORIGINAL` : e.description,
        e.evidenceId,
      )));
    }

    const analysis = inserts.length > 0 || docs.length > 0 ? await runAnalysis(id) : null;

    if (docs.length > 0) {
      await recordAiUsage({
        db,
        organizationId: orgId,
        userId: user.id,
        context: aiContext,
        operation: "Evidence document intake / notice reading",
        resourceType: "project",
        resourceId: id,
        populatedPaths: collectPopulatedPaths({ documents: docs, caseBuild: built }),
      });
    }

    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "case.intake.vision",
      resourceType: "project",
      resourceId: id,
      detail: JSON.stringify({ documentsRead: docs.length, eventsProposed: built.events.length, eventsInserted: inserts.length, failures: failures.length, aiCredentialScope: aiContext.credentialScope }),
    });

    return NextResponse.json({
      read: docs.length,
      failures,
      summary: built.summary,
      arc: built.arc,
      events: built.events,
      eventsAdded: inserts.length,
      gaps: built.gaps,
      confirmations: built.confirmations,
      analysis: analysis ? { score: analysis.score, summary: analysis.summary, findingsCount: analysis.findingsCount, provisional: analysis.provisional } : null,
      ai_credential_scope: aiContext.credentialScope,
      nextStep: built.confirmations.length > 0
        ? "Confirm the flagged fields against the original documents before relying on any deadline."
        : "Review the timeline, then start a response from the Respond to Notice panel.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
