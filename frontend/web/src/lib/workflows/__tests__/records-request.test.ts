import { describe, expect, it } from "vitest";
import { advanceRun } from "../engine";
import { PUBLIC_RECORDS_REQUEST_STAGES } from "../types";
import { authorizeStage, confirmRecordsRequestSentStage, logRecordsRequestSentStage, logRecordsResponseStage } from "../stages";

describe("records request workflow", () => {
  it("reviews the request draft, waits for a human, and logs only confirmed dates", async () => {
    const context = { runId: "r", caseId: "c", organizationId: "o", actor: "casey@example.com", priorResults: [], input: {} };
    const deps = {
      loadAuthorization: async () => null,
      currentContentHash: async () => "reviewed-hash",
      executors: {
        draft_request: async () => ({ stageId: "draft_request", status: "complete", output: { body: "Records requested" }, summary: "draft", startedAt: "" }),
        authorize: authorizeStage("draft_request"), send: confirmRecordsRequestSentStage(),
        log_request: logRecordsRequestSentStage(), log_response: logRecordsResponseStage(),
      },
    };
    const initial = await advanceRun(deps as never, context, PUBLIC_RECORDS_REQUEST_STAGES);
    expect(initial.haltedAt).toBe("send");
    expect(initial.status).toBe("awaiting_authorization");
    const authorized = { ...deps, loadAuthorization: async () => ({ runId: "r", stageId: "send", authorizedBy: "human", contentHash: "reviewed-hash", attestation: "I reviewed this exact request.", authorizedAt: "" }) };
    const priorResults = initial.results.filter((r) => r.status === "complete");
    const waiting = await advanceRun(authorized as never, { ...context, priorResults }, PUBLIC_RECORDS_REQUEST_STAGES);
    expect(waiting.results.at(-1)?.status).toBe("blocked");
    const sent = await advanceRun(authorized as never, { ...context, priorResults, input: { sentDate: "2026-09-07", method: "email" } }, PUBLIC_RECORDS_REQUEST_STAGES);
    expect(sent.haltedAt).toBe("log_response");
    expect(sent.results.find((r) => r.stageId === "log_request")?.output?.sentDate).toBe("2026-09-07");
    const changed = await advanceRun({ ...authorized, currentContentHash: async () => null } as never, { ...context, priorResults }, PUBLIC_RECORDS_REQUEST_STAGES);
    expect(changed.status).toBe("awaiting_authorization");
  });
  it("rejects invalid calendar dates", async () => {
    const result = await logRecordsRequestSentStage()({ input: { sentDate: "2026-02-31" } } as never);
    expect(result.status).toBe("blocked");
  });
});
