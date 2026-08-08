/**
 * GET /api/v1/intelligence/recon/stream
 *
 * Server-Sent Events endpoint that streams agent results in real-time
 * as each recon agent completes.
 */
import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz, resolveProjectOrg } from "@/lib/security/middleware";
import { ALL_AGENTS, type ReconContext, type ReconAgentResult, fetchParcelByAPN } from "@/lib/recon-agents";
import { runAnalysisAgents } from "@/lib/analysis-agents";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: "Unauthorized" })}\n\n`,
      { status: 401, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } },
    );
  }
  const user = auth.user;

  const projectId = req.nextUrl.searchParams.get("projectId");
  const force = req.nextUrl.searchParams.get("force") === "true";

  if (!projectId) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: "Missing projectId" })}\n\n`,
      { status: 400, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } },
    );
  }

  const { env } = getCloudflareContext();
  const db = env.DB;

  const projectOrg = await resolveProjectOrg(db, projectId);
  const authz = requireAuthz(user, "case.read", { organization_id: projectOrg ?? undefined });
  if (!authz.ok) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: "Forbidden" })}\n\n`,
      { status: 403, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } },
    );
  }

  const project = await db
    .prepare(
      `SELECT p.id, p.name, p.property_id, p.organization_id, pr.apn, pr.address, pr.city
       FROM projects p JOIN properties pr ON p.property_id = pr.id WHERE p.id = ?`,
    )
    .bind(projectId).first();

  if (!project) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: "Project not found" })}\n\n`,
      { status: 404, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } },
    );
  }

  const apn = project.apn as string;
  if (!apn) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: "No APN on property" })}\n\n`,
      { status: 400, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } },
    );
  }

  // Check if recon was already done (unless forced)
  if (!force) {
    const existing = await db
      .prepare(
        `SELECT id FROM evidence WHERE project_id = ? AND source = 'ai_research' AND doc_type = 'recon_report' AND organization_id = ? LIMIT 1`,
      )
      .bind(projectId, project.organization_id as string).first();
    if (existing) {
      return new Response(
        `event: complete\ndata: ${JSON.stringify({ skipped: true, message: "Recon already completed" })}\n\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } },
      );
    }
  }

  // If forcing, clean up old records
  if (force) {
    await db.prepare(`DELETE FROM timeline_events WHERE evidence_id IN (SELECT id FROM evidence WHERE project_id = ? AND source = 'ai_research' AND organization_id = ?)`).bind(projectId, project.organization_id as string).run();
    await db.prepare(`DELETE FROM due_process_findings WHERE evidence_id IN (SELECT id FROM evidence WHERE project_id = ? AND source = 'ai_research' AND organization_id = ?)`).bind(projectId, project.organization_id as string).run();
    await db.prepare(`DELETE FROM evidence_relations WHERE evidence_id IN (SELECT id FROM evidence WHERE project_id = ? AND source = 'ai_research' AND organization_id = ?) OR related_evidence_id IN (SELECT id FROM evidence WHERE project_id = ? AND source = 'ai_research' AND organization_id = ?)`).bind(projectId, project.organization_id as string, projectId, project.organization_id as string).run();
    await db.prepare(`DELETE FROM evidence WHERE project_id = ? AND source = 'ai_research' AND organization_id = ?`).bind(projectId, project.organization_id as string).run();
    await db.prepare(`DELETE FROM property_intelligence WHERE property_id = ?`).bind(project.property_id as string).run();
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Send all agent start events immediately
        for (const { name, description } of ALL_AGENTS) {
          send("agent_start", { agent: name, description, total: ALL_AGENTS.length });
        }

        // Fetch parcel data first (needed by other agents)
        const parcel = await fetchParcelByAPN(apn);

        const ctx: ReconContext = {
          apn,
          projectId,
          propertyId: project.property_id as string,
          organizationId: project.organization_id as string,
          db,
          parcel,
        };

        // Run all agents in parallel, streaming each result as it completes
        let completed = 0;
        const results: ReconAgentResult[] = [];
        const total = ALL_AGENTS.length;

        const agentPromises = ALL_AGENTS.map(({ name, agent }) =>
          agent(ctx)
            .then((result: ReconAgentResult) => {
              completed++;
              results.push(result);
              send("agent_done", {
                agent: name,
                status: result.status,
                message: result.message,
                completed,
                total,
              });
              return result;
            })
            .catch((err: any) => {
              completed++;
              const result: ReconAgentResult = {
                agent: name,
                status: "error",
                message: err instanceof Error ? err.message : "Unknown error",
              };
              results.push(result);
              send("agent_done", {
                agent: name,
                status: "error",
                message: result.message,
                completed,
                total,
              });
              return result;
            }),
        );

        await Promise.allSettled(agentPromises);

        const succeeded = results.filter((r) => r.status === "success").length;
        const failed = results.filter((r) => r.status === "error").length;
        const noData = results.filter((r) => r.status === "no_data").length;

        const intelligenceData: Record<string, any> = {};
        for (const result of results) {
          if (result.data) intelligenceData[result.agent] = result.data;
        }

        // Write to property_intelligence cache
        const reconId = crypto.randomUUID();
        await db.prepare(
          `INSERT INTO property_intelligence (id, property_id, apn, zoning, general_plan, acres, coastal_zone, flood_zone, fire_responsibility, legal_description, raw_data, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET raw_data = excluded.raw_data, fetched_at = datetime('now')`
        ).bind(
          reconId, project.property_id, apn,
          intelligenceData.parcel?.zoning || null,
          intelligenceData.zoning?.general_plan || null,
          intelligenceData.parcel?.acres ? parseFloat(intelligenceData.parcel.acres) : null,
          intelligenceData.coastal_zone?.in_coastal_zone ? "Yes" : "No",
          intelligenceData.flood?.in_flood_zone ? "Yes" : "No",
          intelligenceData.fire?.fire_responsibility || null,
          intelligenceData.parcel?.LEGAL || null,
          JSON.stringify(intelligenceData),
        ).run();

        // Create evidence record
        const evidenceId = crypto.randomUUID();
        const summaryLines = [
          `FAIRPROCESS PROPERTY INTELLIGENCE RECONNAISSANCE REPORT`,
          `Generated: ${new Date().toISOString()}`,
          `APN: ${apn}`,
          `Project: ${project.name}`,
          ``,
          `=== RECON SUMMARY ===`,
          `Agents run: ${total}`,
          `Succeeded: ${succeeded}, No data: ${noData}, Failed: ${failed}`,
          ``,
          ...results.map((r) => `[${r.status.toUpperCase()}] ${r.agent}: ${r.message}`),
        ];

        await db.prepare(
          `INSERT INTO evidence (id, project_id, organization_id, source, doc_type, title, status, extracted_text, ai_summary)
           VALUES (?, ?, ?, 'ai_research', 'recon_report', ?, 'processed', ?, ?)`
        ).bind(
          evidenceId, projectId, project.organization_id as string,
          `Property Intelligence Recon — APN ${apn}`,
          summaryLines.join("\n"),
          `Full recon: ${succeeded}/${total} agents succeeded. ${failed} failed, ${noData} no data.`,
        ).run();

        // Create timeline event
        await db.prepare(
          `INSERT INTO timeline_events (id, project_id, evidence_id, event_date, event_type, description, organization_id)
           VALUES (?, ?, ?, datetime('now'), 'intelligence_gathered', ?, ?)`
        ).bind(
          crypto.randomUUID(), projectId, evidenceId,
          `Full property intelligence recon completed: ${succeeded}/${total} agents succeeded (${failed} failed, ${noData} no data).`,
          project.organization_id as string,
        ).run();

        // Run analysis agents
        let analysisSummary = "";
        try {
          const analysisResult = await runAnalysisAgents({
            projectId,
            propertyId: project.property_id as string,
            organizationId: project.organization_id as string,
            db,
          });
          analysisSummary = analysisResult.summary;
        } catch (err: any) {
          analysisSummary = `Analysis agents error: ${err?.message || "unknown"}`;
        }

        send("complete", { succeeded, failed, noData, total, evidenceId, analysisSummary });
      } catch (err: any) {
        send("error", { message: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
