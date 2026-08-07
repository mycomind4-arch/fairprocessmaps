import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, resolveProjectOrg } from "@/lib/security/middleware";
import { humanActor, emitAuditEvent } from "@/lib/security/events";

export const runtime = "nodejs";

// GET — list connectors for a project (org-scoped)
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

    const result = await db
      .prepare(
        `SELECT id, name, type, status, description, last_sync, endpoint, config, created_at, updated_at
         FROM project_connectors
         WHERE project_id = ? AND organization_id = ?
         ORDER BY created_at ASC`,
      )
      .bind(projectId, user.organization_id)
      .all();

    const items = (result.results ?? []).map((r: any) => ({
      ...r,
      config: r.config ? JSON.parse(r.config) : {},
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

// POST — add a connector
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const body = await req.json() as Record<string, unknown>;
    const projectId = body.project_id as string;

    if (!projectId) {
      return NextResponse.json(
        { error: "project_id is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const projectOrg = await resolveProjectOrg(db, projectId);
    if (projectOrg !== user.organization_id) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO project_connectors (id, project_id, organization_id, name, type, status, description, endpoint, config)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        projectId,
        user.organization_id,
        body.name as string,
        (body.type as string) ?? "data_source",
        (body.status as string) ?? "pending",
        (body.description as string) ?? null,
        (body.endpoint as string) ?? null,
        body.config ? JSON.stringify(body.config) : "{}",
      )
      .run();

    await emitAuditEvent({ db,
      actor: humanActor(user),
      action: "connector.create",
      resourceType: "project",
      resourceId: projectId,
      detail: JSON.stringify({ connector_id: id, name: body.name }),
    });

    return NextResponse.json(
      { id, status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// PATCH — toggle status or update config
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const body = await req.json() as Record<string, unknown>;
    const connectorId = body.id as string;

    if (!connectorId) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Verify ownership
    const existing = await db
      .prepare("SELECT project_id, organization_id FROM project_connectors WHERE id = ?")
      .bind(connectorId)
      .first<any>();

    if (!existing) {
      return NextResponse.json(
        { error: "Connector not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (existing.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const updates: string[] = [];
    const binds: any[] = [];

    if (body.status !== undefined) {
      updates.push("status = ?");
      binds.push(body.status);
      if (body.status === "connected") {
        updates.push("last_sync = ?");
        binds.push(new Date().toISOString());
      }
    }
    if (body.config !== undefined) {
      updates.push("config = ?");
      binds.push(JSON.stringify(body.config));
    }
    if (body.name !== undefined) {
      updates.push("name = ?");
      binds.push(body.name);
    }

    updates.push("updated_at = datetime('now')");
    binds.push(connectorId);

    await db
      .prepare(`UPDATE project_connectors SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...binds)
      .run();

    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// DELETE — remove a connector
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const connectorId = req.nextUrl.searchParams.get("id");
    if (!connectorId) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const existing = await db
      .prepare("SELECT project_id, organization_id FROM project_connectors WHERE id = ?")
      .bind(connectorId)
      .first<any>();

    if (!existing) {
      return NextResponse.json(
        { error: "Connector not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (existing.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    await db
      .prepare("DELETE FROM project_connectors WHERE id = ?")
      .bind(connectorId)
      .run();

    await emitAuditEvent({ db,
      actor: humanActor(user),
      action: "connector.delete",
      resourceType: "project",
      resourceId: existing.project_id,
      detail: JSON.stringify({ connector_id: connectorId }),
    });

    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
