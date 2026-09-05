import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { checkRateLimit } from "@/lib/rate-limit";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import { readNotice } from "@/lib/vision/notice-reader";
import { buildCase, type ReadDocument } from "@/lib/vision/case-builder";
import { runAnalysis } from "@/lib/auto-triggers";

export const runtime = "nodejs";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/**
 * POST /api/v1/cases/[id]/intake
 *
 * Reads photographed notices already in the evidence vault, builds the case
 * chronology from them, and runs the procedural checkpoints over the result.
 *
 * The whole arc in one call: images → facts → timeline → findings.
 *
 * Two things this deliberately does NOT do:
 *
 *   - It does not overwrite a timeline event a person has already confirmed.
 *     A re-read produces proposals; confirmed history wins.
 *   - It does not silently accept a date it could not read cleanly. Events
 *     whose dates are uncertain are written with a marker and surfaced for
 *     confirmation, because every deadline on the case hangs off them.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = authorize(user, "evidence.upload");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: authz.reason ?? "Insufficient permissions" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Vision calls over many pages are expensive; keep the tap narrow.
    const limit = await checkRateLimit(req, "case_intake", 5, 300);
    if (!limit.ok) return limit.response!;

    const body = (await req.json().catch(() => ({}))) as {
      evidenceIds?: string[];
      /** Group page images belonging to one document: [[id1,id2],[id3]] */
      documentGroups?: string[][];
    };

    const { env } = getCloudflareContext();
    const db = env.DB;
    const bucket = env.EVIDENCE_BUCKET;
    const orgId = user.organization_id;

    const project = await db
      .prepare(`SELECT id FROM projects WHERE id = ? AND organization_id = ?`)
      .bind(id, orgId)
      .first();
    if (!project) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Default: every image on the case that has not been read yet. One page per
    // document unless the caller grouped them.
    let groups: string[][];
    if (body.documentGroups?.length) {
      groups = body.documentGroups;
    } else if (body.evidenceIds?.length) {
      groups = body.evidenceIds.map((e) => [e]);
    } else {
      const rows = await db
        .prepare(
          `SELECT id FROM evidence
            WHERE project_id = ? AND organization_id = ?
              AND content_type IN (${IMAGE_TYPES.map(() => "?").join(",")})
              AND (extracted_text IS NULL OR extracted_text = '')
            ORDER BY uploaded_at ASC`,
        )
        .bind(id, orgId, ...IMAGE_TYPES)
        .all();
      groups = ((rows.results ?? []) as Record<string, unknown>[]).map((r) => [r.id as string]);
    }

    if (groups.length === 0) {
      return NextResponse.json(
        {
          read: 0,
          note: "No unread images were found on this case. Upload photographs of the notices first, or pass evidenceIds to re-read specific documents.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const docs: ReadDocument[] = [];
    const failures: { evidenceId: string; error: string }[] = [];

    for (const group of groups) {
      const placeholders = group.map(() => "?").join(",");
      const rows = await db
        .prepare(
          `SELECT id, title, r2_key, content_type FROM evidence
            WHERE id IN (${placeholders}) AND project_id = ? AND organization_id = ?`,
        )
        .bind(...group, id, orgId)
        .all();

      const pages = (rows.results ?? []) as Record<string, unknown>[];
      if (pages.length === 0) continue;

      try {
        const images = [];
        for (const p of pages) {
          const obj = await bucket.get(p.r2_key as string);
          if (!obj) throw new Error(`File missing from storage for ${p.title ?? p.id}`);
          images.push({
            data: new Uint8Array(await obj.arrayBuffer()),
            mediaType: (p.content_type as string) ?? "image/jpeg",
          });
        }

        const result = await readNotice(env as never, images);

        // Store the transcript so every existing text-based analyzer, the
        // search index, and the disclosure checkpoints work on photographed
        // documents exactly as on text uploads.
        await db
          .prepare(
            `UPDATE evidence SET extracted_text = ?, ai_summary = ?
              WHERE id = ? AND organization_id = ?`,
          )
          .bind(
            result.transcript,
            `${result.reading.documentType.value ?? "document"} read from image${
              result.needsConfirmation.length ? ` — ${result.needsConfirmation.length} field(s) need confirmation` : ""
            }`,
            pages[0].id as string,
            orgId,
          )
          .run();

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

    const built = buildCase(docs);

    // Write proposed timeline events, skipping any date already on the timeline
    // for the same document — a re-read must not duplicate confirmed history.
    const existing = await db
      .prepare(
        `SELECT evidence_id, event_date FROM timeline_events
          WHERE project_id = ? AND organization_id = ?`,
      )
      .bind(id, orgId)
      .all();
    const seen = new Set(
      ((existing.results ?? []) as Record<string, unknown>[]).map(
        (e) => `${e.evidence_id}|${e.event_date}`,
      ),
    );

    const inserts = built.events.filter(
      (e) => !seen.has(`${e.evidenceId}|${e.eventDate}`),
    );

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
              crypto.randomUUID(),
              id,
              orgId,
              e.eventDate,
              e.eventType,
              e.needsConfirmation
                ? `${e.description} — date read as "${e.dateAsPrinted}", CONFIRM AGAINST ORIGINAL`
                : e.description,
              e.evidenceId,
            ),
        ),
      );
    }

    // Now that the chronology exists, the checkpoints have something to measure.
    const analysis = inserts.length > 0 || docs.length > 0 ? await runAnalysis(id) : null;

    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "case.intake.vision",
      resourceType: "project",
      resourceId: id,
      detail: JSON.stringify({
        documentsRead: docs.length,
        eventsProposed: built.events.length,
        eventsInserted: inserts.length,
        failures: failures.length,
      }),
    });

    return NextResponse.json(
      {
        read: docs.length,
        failures,
        summary: built.summary,
        arc: built.arc,
        events: built.events,
        eventsAdded: inserts.length,
        gaps: built.gaps,
        confirmations: built.confirmations,
        analysis: analysis
          ? {
              score: analysis.score,
              summary: analysis.summary,
              findingsCount: analysis.findingsCount,
              provisional: analysis.provisional,
            }
          : null,
        nextStep:
          built.confirmations.length > 0
            ? "Confirm the flagged fields against the original documents before relying on any deadline."
            : "Review the timeline, then start a response from the Respond to Notice panel.",
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
