/**
 * Procedural Integrity Report tests.
 *
 * The report is the artifact that leaves the building. What matters is that it
 * is complete (shows what passed, not only what failed), honest about its
 * limits, and reproducible.
 */

import { describe, it, expect } from "vitest";
import { generateIntegrityReport, computeInputHash } from "../integrity-report";
import { defaultPack } from "@/lib/policy/registry";
import type { IntegrityReportInput } from "../integrity-report";

const pack = defaultPack();

function baseInput(overrides: Partial<IntegrityReportInput> = {}): IntegrityReportInput {
  return {
    case: {
      caseId: "case-1",
      caseName: "1420 Redwood Dr — abatement",
      apn: "012-345-678",
      address: "1420 Redwood Dr, Eureka CA",
      county: "Humboldt County",
      caseType: "code_enforcement",
      openedAt: "2026-04-01",
    },
    pack,
    evaluation: {
      timeline: [
        { event_date: "2026-04-02", event_type: "notice", description: "NOV served" },
        { event_date: "2026-04-08", event_type: "abatement", description: "Abated" },
      ],
      evidence: [],
    },
    evidenceIndex: [
      {
        id: "ev1",
        title: "Notice of Violation",
        docType: "notice",
        source: "county",
        sha256: "a".repeat(64),
        uploadedAt: "2026-04-03",
      },
    ],
    preparedBy: "casey@example.com",
    generatedAt: "2026-09-05T12:00:00.000Z",
    ...overrides,
  };
}

describe("completeness", () => {
  it("reports satisfied checkpoints, not only adverse ones", async () => {
    // A report showing only bad findings is advocacy, and opposing counsel
    // will say so. Showing what passed is what makes what failed credible.
    const report = await generateIntegrityReport(baseInput());
    expect(report.markdown).toContain("Satisfied");
    expect(report.markdown).toMatch(/All checkpoints are listed/);
  });

  it("lists every checkpoint the pack defines across all statuses", async () => {
    const report = await generateIntegrityReport(baseInput());
    const total = Object.values(report.counts).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(pack.rules.length);
  });

  it("states its limitations explicitly", async () => {
    const report = await generateIntegrityReport(baseInput());
    // Collapse the prose's line wrapping before matching — the wrapping is a
    // formatting artifact, not part of what the report says.
    const flat = report.markdown.replace(/\s+/g, " ");
    expect(flat).toMatch(/not\s+evidence that the record does not exist/i);
    expect(flat).toMatch(/machine-extracted/i);
    expect(flat).toMatch(/does not determine whether/i);
  });

  it("indexes every authority it relied on with a source URL", async () => {
    const report = await generateIntegrityReport(baseInput());
    expect(report.markdown).toContain("## Authorities relied on");
    expect(report.markdown).toContain("humboldt.county.codes");
  });

  it("includes the timeline it actually measured against", async () => {
    const report = await generateIntegrityReport(baseInput());
    expect(report.markdown).toContain("## Timeline as analyzed");
    expect(report.markdown).toContain("2026-04-08");
  });
});

describe("export gating", () => {
  it("marks a report from an unreviewed pack as not for filing", async () => {
    const report = await generateIntegrityReport(baseInput());
    expect(report.exportable).toBe(false);
    expect(report.markdown).toContain("DRAFT — NOT FOR FILING");
  });

  it("lists the unverified checkpoints when the pack is unreviewed", async () => {
    const report = await generateIntegrityReport(baseInput());
    expect(report.markdown).toContain("Checkpoints with unverified parameters");
  });

  it("drops the draft banner once a pack is activated", async () => {
    const activated = { ...pack, activationStatus: "active" as const };
    const report = await generateIntegrityReport(baseInput({ pack: activated }));
    expect(report.exportable).toBe(true);
    expect(report.markdown).not.toContain("DRAFT — NOT FOR FILING");
  });
});

describe("reproducibility", () => {
  it("produces identical output for identical inputs", async () => {
    const a = await generateIntegrityReport(baseInput());
    const b = await generateIntegrityReport(baseInput());
    expect(a.markdown).toBe(b.markdown);
    expect(a.receipt.inputHash).toBe(b.receipt.inputHash);
  });

  it("ignores timeline ordering — the DB may return rows in any order", async () => {
    const forward = baseInput();
    const reversed = baseInput({
      evaluation: {
        ...forward.evaluation,
        timeline: [...forward.evaluation.timeline].reverse(),
      },
    });
    expect(await computeInputHash(forward)).toBe(await computeInputHash(reversed));
  });

  it("ignores who ran it and when", async () => {
    const a = baseInput();
    const b = baseInput({ preparedBy: "someone@else.com", generatedAt: "2027-01-01T00:00:00Z" });
    expect(await computeInputHash(a)).toBe(await computeInputHash(b));
  });

  it("changes the hash when a timeline date changes", async () => {
    const a = baseInput();
    const b = baseInput({
      evaluation: {
        ...a.evaluation,
        timeline: [
          { event_date: "2026-04-02", event_type: "notice", description: "NOV served" },
          { event_date: "2026-04-30", event_type: "abatement", description: "Abated" },
        ],
      },
    });
    expect(await computeInputHash(a)).not.toBe(await computeInputHash(b));
  });

  it("changes the hash when the policy version changes", async () => {
    const a = baseInput();
    const b = baseInput({ pack: { ...pack, policyVersion: "different" } });
    expect(await computeInputHash(a)).not.toBe(await computeInputHash(b));
  });

  it("changes the hash when an evidence document changes", async () => {
    const a = baseInput();
    const b = baseInput({
      evidenceIndex: [{ ...a.evidenceIndex[0], sha256: "b".repeat(64) }],
    });
    expect(await computeInputHash(a)).not.toBe(await computeInputHash(b));
  });

  it("carries a receipt naming the pack, version and activation state", async () => {
    const report = await generateIntegrityReport(baseInput());
    expect(report.receipt.policyPack).toBe(pack.id);
    expect(report.receipt.policyVersion).toBe(pack.policyVersion);
    expect(report.receipt.packActivation).toBe("legal_review_required");
    expect(report.receipt.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("neutrality", () => {
  const FORBIDDEN = ["violation of", "violated", "illegal", "unlawful", "misconduct", "wrongdoing"];

  it("emits no accusatory language anywhere in the report", async () => {
    const report = await generateIntegrityReport(baseInput());
    const text = report.markdown.toLowerCase();
    for (const word of FORBIDDEN) {
      expect(text, `report contained "${word}"`).not.toContain(word);
    }
  });

  it("handles an empty case file without inventing content", async () => {
    const report = await generateIntegrityReport(
      baseInput({
        evaluation: { timeline: [], evidence: [] },
        evidenceIndex: [],
      }),
    );
    expect(report.markdown).toContain("No documents have been added");
    expect(report.markdown).toContain("No events are recorded");
    expect(report.counts.Observed).toBe(0);
  });
});
