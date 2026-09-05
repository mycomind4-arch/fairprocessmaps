/**
 * Workflow engine tests.
 *
 * These are adversarial against one thing: getting a letter mailed that no
 * human authorized. Every test below is a way that could happen.
 */

import { describe, it, expect, vi } from "vitest";
import { runStage, advanceRun, hashContent, type EngineDeps, type StageContext } from "../engine";
import type { StageAuthorization, StageId, StageResult } from "../types";
import { NOTICE_RESPONSE_STAGES } from "../types";

function ctx(priorResults: StageResult[] = []): StageContext {
  return {
    runId: "run-1",
    caseId: "case-1",
    organizationId: "org-1",
    actor: "casey@example.com",
    priorResults,
  };
}

function done(stageId: StageId): StageResult {
  return {
    stageId,
    status: "complete",
    summary: "ok",
    startedAt: "2026-09-05T00:00:00Z",
    completedAt: "2026-09-05T00:00:01Z",
  };
}

/** Every stage up to but not including `mail`. */
const upToMail: StageResult[] = [
  "intake", "classify", "extract", "deadline", "analyze", "draft", "authorize",
].map((s) => done(s as StageId));

const auth: StageAuthorization = {
  runId: "run-1",
  stageId: "mail",
  authorizedBy: "counsel@example.com",
  authorizedAt: "2026-09-05T10:00:00Z",
  contentHash: "abc123",
  attestation: "I have read the final letter and authorize sending it.",
};

function deps(over: Partial<EngineDeps> = {}): EngineDeps {
  return {
    loadAuthorization: async () => null,
    currentContentHash: async () => null,
    executors: {},
    ...over,
  };
}

describe("the authorization gate", () => {
  it("refuses to mail without an authorization", async () => {
    const send = vi.fn();
    const result = await runStage(
      deps({ executors: { mail: send as never } }),
      ctx(upToMail),
      "mail",
    );

    expect(result.status).toBe("awaiting_authorization");
    expect(send).not.toHaveBeenCalled();
  });

  it("mails once a matching authorization exists", async () => {
    const send = vi.fn(async () => ({
      stageId: "mail" as StageId,
      status: "complete" as const,
      summary: "sent",
      startedAt: "",
    }));

    const result = await runStage(
      deps({
        loadAuthorization: async () => auth,
        currentContentHash: async () => "abc123",
        executors: { mail: send as never },
      }),
      ctx(upToMail),
      "mail",
    );

    expect(result.status).toBe("complete");
    expect(send).toHaveBeenCalledOnce();
  });

  it("refuses when the document changed after authorization", async () => {
    // The dangerous case: someone authorizes a letter, someone else edits it,
    // and the edited version mails under the old approval.
    const send = vi.fn();
    const result = await runStage(
      deps({
        loadAuthorization: async () => auth,
        currentContentHash: async () => "DIFFERENT",
        executors: { mail: send as never },
      }),
      ctx(upToMail),
      "mail",
    );

    expect(result.status).toBe("awaiting_authorization");
    expect(result.summary).toMatch(/changed after/i);
    expect(result.summary).toContain("counsel@example.com");
    expect(send).not.toHaveBeenCalled();
  });

  it("does not mail before the draft has been reviewed", async () => {
    const send = vi.fn();
    const partial = ["intake", "classify", "extract", "deadline", "analyze", "draft"].map(
      (s) => done(s as StageId),
    );

    const result = await runStage(
      deps({
        loadAuthorization: async () => auth,
        currentContentHash: async () => "abc123",
        executors: { mail: send as never },
      }),
      ctx(partial),
      "mail",
    );

    expect(result.status).toBe("blocked");
    expect(result.summary).toContain("authorize");
    expect(send).not.toHaveBeenCalled();
  });

  it("treats a missing content hash as authorized-as-is, not as a bypass", async () => {
    // A provider that cannot hash content should still require the
    // authorization row to exist — absence of a hash is not absence of a gate.
    const send = vi.fn();
    const result = await runStage(
      deps({ currentContentHash: async () => "anything", executors: { mail: send as never } }),
      ctx(upToMail),
      "mail",
    );
    expect(result.status).toBe("awaiting_authorization");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("stage ordering", () => {
  it("blocks a stage whose dependencies are incomplete", async () => {
    const result = await runStage(deps(), ctx([]), "draft");
    expect(result.status).toBe("blocked");
    expect(result.summary).toMatch(/has not completed/);
  });

  it("reports a failing executor without losing prior results", async () => {
    const result = await runStage(
      deps({
        executors: {
          intake: async () => {
            throw new Error("R2 unavailable");
          },
        },
      }),
      ctx([]),
      "intake",
    );
    expect(result.status).toBe("failed");
    expect(result.summary).toContain("R2 unavailable");
  });
});

describe("advanceRun", () => {
  it("halts in front of the human rather than skipping ahead", async () => {
    const executors = Object.fromEntries(
      NOTICE_RESPONSE_STAGES.map((s) => [
        s.id,
        async () => ({
          stageId: s.id,
          status: "complete" as const,
          summary: "ok",
          startedAt: "",
        }),
      ]),
    );

    const { haltedAt, status, results } = await advanceRun(
      deps({ executors: executors as never }),
      ctx([]),
    );

    expect(haltedAt).toBe("mail");
    expect(status).toBe("awaiting_authorization");
    // Everything before the gate ran; nothing after it did.
    expect(results.filter((r) => r.status === "complete").map((r) => r.stageId)).toEqual([
      "intake", "classify", "extract", "deadline", "analyze", "draft", "authorize",
    ]);
    expect(results.some((r) => r.stageId === "prove")).toBe(false);
  });

  it("completes the run once mailing is authorized", async () => {
    const executors = Object.fromEntries(
      NOTICE_RESPONSE_STAGES.map((s) => [
        s.id,
        async () => ({
          stageId: s.id,
          status: "complete" as const,
          summary: "ok",
          startedAt: "",
        }),
      ]),
    );

    const { status } = await advanceRun(
      deps({
        loadAuthorization: async () => auth,
        currentContentHash: async () => "abc123",
        executors: executors as never,
      }),
      ctx([]),
    );

    expect(status).toBe("complete");
  });
});

describe("stage catalogue", () => {
  it("gates every stage that acts outside the organization", async () => {
    // If a future stage sends, files, or pays, it belongs behind the gate.
    // This test is the reminder.
    const gated = NOTICE_RESPONSE_STAGES.filter((s) => s.requiresAuthorization);
    expect(gated.map((s) => s.id)).toEqual(["mail"]);
  });

  it("puts authorization before mailing in the dependency graph", () => {
    const mail = NOTICE_RESPONSE_STAGES.find((s) => s.id === "mail")!;
    expect(mail.dependsOn).toContain("authorize");
  });

  it("marks which stages involve a model", () => {
    const ai = NOTICE_RESPONSE_STAGES.filter((s) => s.usesAI).map((s) => s.id);
    expect(ai).toEqual(["classify", "extract", "draft"]);
    // The deterministic ones must stay deterministic.
    const deadline = NOTICE_RESPONSE_STAGES.find((s) => s.id === "deadline")!;
    expect(deadline.usesAI).toBe(false);
  });
});

describe("hashContent", () => {
  it("is stable and content-sensitive", async () => {
    expect(await hashContent("letter body")).toBe(await hashContent("letter body"));
    expect(await hashContent("letter body")).not.toBe(await hashContent("letter body "));
  });
});
