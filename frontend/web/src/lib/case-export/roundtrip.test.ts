import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as exportCase } from "@/app/api/v1/cases/[id]/export/route";
import { POST as importCase } from "@/app/api/v1/cases/import/route";

const state = vi.hoisted(() => ({ env: {} as any, user: { id: "u", email: "test@example.invalid", organization_id: "org-source", role: "admin" } }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: state.env }) }));
vi.mock("@/lib/security/middleware", () => ({ requireAuth: async () => ({ ok: true, user: state.user }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/security/events", () => ({ humanActor: () => ({}), emitAuditEvent: async () => {} }));

let writes: { sql: string; values: any[] }[];
let objects: Map<string, Uint8Array>;
beforeEach(() => {
  state.user.organization_id = "org-source";
  writes = [];
  objects = new Map([["org-source/original.txt", new TextEncoder().encode("Evidence bytes")]]);
  const rows = (sql: string) => {
    if (/FROM evidence\b/.test(sql)) return [{ id: "e", source: "upload", title: "Evidence", content_type: "text/plain", original_filename: "evidence.txt", r2_key: "org-source/original.txt", status: "processed" }];
    if (/FROM workflow_runs\b/.test(sql)) return [{ id: "run", workflow_id: "notice-response", status: "running", current_stage: "mail", source_evidence_id: "e" }];
    if (/FROM workflow_authorizations\b/.test(sql)) return [{ id: "auth", run_id: "run", stage_id: "mail", authorized_by: "source-human", authorized_at: "2026-09-01", content_hash: "source-hash", attestation: "Source case only" }];
    return [];
  };
  state.env = {
    DB: {
      prepare(sql: string) {
        const statement = { sql, values: [] as any[], bind(...values: any[]) { this.values = values; return this; },
          async all() { return { results: rows(sql) }; },
          async first() {
            if (/FROM projects\b/.test(sql)) return { id: "case-source", property_id: "property", name: "Test case", status: "open" };
            if (/FROM properties\b/.test(sql)) return { id: "property", apn: "123-456-789", address: "Test address" };
            if (/FROM cases\b/.test(sql)) return { id: "case-source", name: "Test case", status: "open" };
            return null;
          },
        };
        return statement;
      },
      batch: vi.fn(async (statements) => { writes = statements; return []; }),
    },
    EVIDENCE_BUCKET: {
      get: async (key: string) => objects.has(key) ? { size: objects.get(key)!.byteLength, arrayBuffer: async () => objects.get(key)!.buffer } : null,
      put: vi.fn(async (key: string, value: Uint8Array) => { objects.set(key, value); }),
      delete: vi.fn(async (keys: string[]) => { keys.forEach((key) => objects.delete(key)); }),
    },
  };
});

async function exportedRequest() {
  const response = await exportCase(new NextRequest("http://localhost/api/v1/cases/case-source/export"), { params: Promise.resolve({ id: "case-source" }) });
  expect(response.status).toBe(200);
  const form = new FormData();
  form.set("file", new File([await response.arrayBuffer()], "test.fpcase.zip"));
  state.user.organization_id = "org-destination";
  return new NextRequest("http://localhost/api/v1/cases/import", { method: "POST", body: form });
}

it("round-trips evidence into a new org and supersedes old authorizations", async () => {
  const response = await importCase(await exportedRequest());
  expect(response.status).toBe(200);
  const result = (await response.json()) as { projectId: string };
  expect(result.projectId).not.toBe("case-source");
  expect(state.env.DB.batch).toHaveBeenCalledOnce();
  const evidence = writes.find((s) => /INSERT INTO evidence\b/.test(s.sql))!;
  expect(evidence.values).toContain("org-destination");
  expect(evidence.values[0]).not.toBe("e");
  const key = [...objects.keys()].find((key) => key !== "org-source/original.txt")!;
  expect(key).toContain("org-destination");
  expect(new TextDecoder().decode(objects.get(key))).toBe("Evidence bytes");
  const auth = writes.find((s) => /INSERT INTO workflow_authorizations\b/.test(s.sql))!;
  expect(auth.sql).toContain("superseded_at");
  expect(auth.values.at(-1)).toMatch(/^\d{4}-/);
});

it("removes only newly uploaded blobs if the atomic import fails", async () => {
  const request = await exportedRequest();
  state.env.DB.batch.mockRejectedValueOnce(new Error("Database unavailable"));
  const response = await importCase(request);
  expect(response.status).toBe(500);
  expect([...objects.keys()]).toEqual(["org-source/original.txt"]);
});
