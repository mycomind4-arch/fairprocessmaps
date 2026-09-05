import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { computeDeadlines, urgencyOf, urgencyMessage } from "@/lib/workflows/deadlines";
import { resolvePack, defaultPack } from "@/lib/policy/registry";

export const runtime = "nodejs";

/**
 * GET /api/v1/cases/[id]/deadlines
 *
 * Every response window implied by the case file, soonest first.
 *
 * Deliberately independent of workflow runs. A case has deadlines the moment a
 * notice date exists, whether or not anyone started a workflow — and the
 * deadline is exactly the thing a user must not have to go looking for.
 */
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

    const { env } = getCloudflareContext();
    const db = env.DB;
    const orgId = user.organization_id;

    const project = await db
      .prepare(
        `SELECT p.case_type, pr.county FROM projects p
           LEFT JOIN properties pr ON p.property_id = pr.id
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

    const pack =
      resolvePack(project.county as string | null, project.case_type as string | null) ??
      defaultPack();

    // Notice events are what start response clocks.
    const notices = await db
      .prepare(
        `SELECT event_date, event_type, description
           FROM timeline_events
          WHERE project_id = ? AND organization_id = ?
            AND LOWER(event_type) LIKE '%notice%'
          ORDER BY event_date DESC`,
      )
      .bind(id, orgId)
      .all();

    // Code enforcement rows carry their own service dates.
    const ceRows = await db
      .prepare(
        `SELECT case_number, notice_served_date
           FROM code_enforcement_cases
          WHERE project_id = ? AND organization_id = ?
            AND notice_served_date IS NOT NULL`,
      )
      .bind(id, orgId)
      .all();

    const sources = [
      ...((notices.results ?? []) as Record<string, unknown>[]).map((n) => ({
        serviceDate: n.event_date as string,
        noticeType: (n.event_type as string) ?? "notice",
        label: (n.description as string) ?? "Notice",
      })),
      ...((ceRows.results ?? []) as Record<string, unknown>[]).map((c) => ({
        serviceDate: c.notice_served_date as string,
        noticeType: "notice",
        label: c.case_number ? `Case ${c.case_number}` : "Code enforcement notice",
      })),
    ];

    const all = sources.flatMap((s) =>
      computeDeadlines({ serviceDate: s.serviceDate, noticeType: s.noticeType, pack })
        .filter((d) => d.dueDate !== null)
        .map((d) => ({
          ...d,
          sourceLabel: s.label,
          serviceDate: s.serviceDate,
          urgency: urgencyOf(d),
          message: urgencyMessage(d),
        })),
    );

    // Soonest first. A case with nothing to respond to is a legitimate result,
    // not an error — but say so rather than returning a bare empty list.
    all.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

    const open = all.filter((d) => (d.daysRemaining ?? 0) >= 0);

    return NextResponse.json(
      {
        deadlines: all,
        primary: open[0] ?? all[0] ?? null,
        openCount: open.length,
        passedCount: all.length - open.length,
        policyPack: pack.id,
        provisional: pack.activationStatus !== "active",
        note:
          sources.length === 0
            ? "No notice with a service date is recorded on this case, so no response window can be computed. If a notice was received, add it to the timeline."
            : null,
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
