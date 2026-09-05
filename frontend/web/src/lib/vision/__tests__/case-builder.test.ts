/**
 * Case builder tests.
 *
 * The realistic scenario throughout: a stack of photographed notices running
 * from a notice of violation to a civil penalty. What matters is that the
 * builder orders them correctly, refuses to place what it could not read, and
 * describes the sequence without concluding anything about the law.
 */

import { describe, it, expect } from "vitest";
import { buildCase, type ReadDocument } from "../case-builder";
import type { NoticeReading, ExtractedField } from "../notice-reader";

function field(value: string | null, legibility: ExtractedField["legibility"] = "clear"): ExtractedField {
  return { value, asPrinted: value, page: 1, legibility };
}

function doc(
  evidenceId: string,
  documentType: string,
  serviceDate: string | null,
  opts: { legibility?: ExtractedField["legibility"]; needsConfirmation?: string[] } = {},
): ReadDocument {
  const reading = {
    documentType: field(documentType),
    issuingAgency: field("Humboldt County Code Enforcement"),
    documentDate: field(serviceDate),
    serviceDate: field(serviceDate, opts.legibility ?? "clear"),
    serviceMethod: field("personal service"),
    caseNumber: field("CE-2026-0187"),
    apn: field("205-131-012"),
    propertyAddress: field("1234 Kneeland Rd"),
    recipientName: field("Owner"),
    statedDeadline: field(null),
    statedDeadlineText: field(null),
    penaltyAmount: field(null),
    allegedConditions: [],
    citedAuthorities: [],
    appealRights: { mentioned: false, asPrinted: null, page: null },
    agencyContact: { name: null, address: null, phone: null },
    overallLegibility: "clear",
    humanReviewNeeded: [],
    otherObservations: [],
  } as unknown as NoticeReading;

  return {
    evidenceId,
    fileName: `${documentType}.jpg`,
    reading,
    needsConfirmation: opts.needsConfirmation ?? [],
  };
}

describe("chronology", () => {
  it("orders documents by date regardless of upload order", () => {
    const built = buildCase([
      doc("e3", "civil_penalty_notice", "2026-06-01"),
      doc("e1", "notice_of_violation", "2026-04-02"),
      doc("e2", "compliance_order", "2026-05-01"),
    ]);
    expect(built.events.map((e) => e.evidenceId)).toEqual(["e1", "e2", "e3"]);
  });

  it("maps document types onto the event vocabulary the rules match", () => {
    const built = buildCase([
      doc("e1", "notice_of_violation", "2026-04-02"),
      doc("e2", "civil_penalty_notice", "2026-06-01"),
      doc("e3", "lien_notice", "2026-07-01"),
    ]);
    expect(built.events.map((e) => e.eventType)).toEqual(["notice", "penalty", "lien"]);
  });

  it("prefers the service date over the date on the document's face", () => {
    const d = doc("e1", "notice_of_violation", "2026-04-02");
    d.reading.documentDate = field("2026-03-28");
    const built = buildCase([d]);
    expect(built.events[0].eventDate).toBe("2026-04-02");
  });
});

describe("refusing to place what it could not read", () => {
  it("does not put an undated document on the timeline", () => {
    const built = buildCase([doc("e1", "notice_of_violation", null)]);
    expect(built.events).toHaveLength(0);
    expect(built.gaps[0].kind).toBe("undated_document");
    expect(built.gaps[0].severity).toBe("high");
  });

  it("flags a date read with partial legibility for confirmation", () => {
    const built = buildCase([
      doc("e1", "notice_of_violation", "2026-04-02", { legibility: "partial" }),
    ]);
    expect(built.events[0].needsConfirmation).toBe(true);
    expect(built.events[0].confidence).toBe("medium");
    expect(built.events[0].confirmationReason).toMatch(/every deadline on this case depends/i);
  });

  it("carries the printed form of the date through for verification", () => {
    const d = doc("e1", "notice_of_violation", "2026-04-02", { legibility: "partial" });
    d.reading.serviceDate.asPrinted = "4/2/26";
    const built = buildCase([d]);
    expect(built.events[0].dateAsPrinted).toBe("4/2/26");
  });

  it("collects per-document confirmation requests", () => {
    const built = buildCase([
      doc("e1", "notice_of_violation", "2026-04-02", { needsConfirmation: ["serviceDate"] }),
    ]);
    expect(built.confirmations).toHaveLength(1);
    expect(built.confirmations[0].fields).toContain("serviceDate");
  });
});

describe("arc analysis", () => {
  it("observes a penalty with no hearing anywhere before it", () => {
    const built = buildCase([
      doc("e1", "notice_of_violation", "2026-04-02"),
      doc("e2", "civil_penalty_notice", "2026-06-01"),
    ]);
    const gap = built.gaps.find((g) => g.kind === "no_hearing_before_penalty");
    expect(gap).toBeTruthy();
    expect(gap!.severity).toBe("high");
    // Must acknowledge our file may be incomplete rather than asserting absence.
    expect(gap!.description).toMatch(/may be incomplete/i);
  });

  it("does not raise that observation when a hearing notice precedes the penalty", () => {
    const built = buildCase([
      doc("e1", "notice_of_violation", "2026-04-02"),
      doc("e2", "notice_of_hearing", "2026-05-01"),
      doc("e3", "civil_penalty_notice", "2026-06-01"),
    ]);
    expect(built.gaps.find((g) => g.kind === "no_hearing_before_penalty")).toBeUndefined();
  });

  it("observes a compressed interval between escalating steps", () => {
    const built = buildCase([
      doc("e1", "notice_of_violation", "2026-04-02"),
      doc("e2", "compliance_order", "2026-04-04"),
    ]);
    const gap = built.gaps.find((g) => g.kind === "compressed_interval");
    expect(gap).toBeTruthy();
    expect(gap!.description).toContain("2 days");
  });

  it("observes a skipped rung in the escalation ladder", () => {
    const built = buildCase([
      doc("e1", "notice_of_violation", "2026-04-02"),
      doc("e2", "lien_notice", "2026-08-01"),
    ]);
    const gap = built.gaps.find((g) => g.kind === "missing_rung");
    expect(gap).toBeTruthy();
    expect(gap!.suggestedNextStep).toMatch(/complete case file/i);
  });

  it("gives every observation an action, not just a complaint", () => {
    const built = buildCase([
      doc("e1", "notice_of_violation", "2026-04-02"),
      doc("e2", "civil_penalty_notice", "2026-04-05"),
      doc("e3", "notice_of_abatement", null),
    ]);
    expect(built.gaps.length).toBeGreaterThan(0);
    for (const g of built.gaps) {
      expect(g.suggestedNextStep, g.kind).toBeTruthy();
      expect(g.evidenceIds.length, g.kind).toBeGreaterThan(0);
    }
  });
});

describe("neutrality", () => {
  const FORBIDDEN = ["violation of law", "violated", "illegal", "unlawful", "misconduct", "failed to"];

  it("describes the sequence without concluding anything about the law", () => {
    const built = buildCase([
      doc("e1", "notice_of_violation", "2026-04-02"),
      doc("e2", "compliance_order", "2026-04-04"),
      doc("e3", "civil_penalty_notice", "2026-04-06"),
      doc("e4", "lien_notice", null),
    ]);
    const text = [
      built.summary,
      ...built.gaps.map((g) => `${g.description} ${g.suggestedNextStep}`),
    ]
      .join(" ")
      .toLowerCase();

    for (const word of FORBIDDEN) {
      expect(text, `builder emitted "${word}"`).not.toContain(word);
    }
  });

  it("warns in the summary when dates were not read cleanly", () => {
    const built = buildCase([
      doc("e1", "notice_of_violation", "2026-04-02", { legibility: "partial" }),
    ]);
    expect(built.summary).toMatch(/confirm them before relying on any deadline/i);
  });
});

describe("empty and degenerate input", () => {
  it("handles an empty stack without inventing anything", () => {
    const built = buildCase([]);
    expect(built.events).toHaveLength(0);
    expect(built.gaps).toHaveLength(0);
    expect(built.summary).toContain("Read 0 documents");
  });
});
