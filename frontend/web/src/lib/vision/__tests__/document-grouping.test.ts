/**
 * Document grouping heuristic tests.
 *
 * The realistic scenario throughout: a ZIP of mixed evidence where getting a
 * merge wrong either hides a service date inside a false multi-page document
 * or invents timeline events out of one document's pages. The heuristics
 * favor being provably right (page markers, folders) over being clever
 * (bare numeric sequences), and treat the latter as unconfirmed.
 */

import { describe, it, expect } from "vitest";
import {
  proposeDocumentGroups,
  refineGroupsWithCheapReads,
  estimateIntakeCost,
  type GroupingCandidate,
  type ProposedGroup,
  type CheapClassification,
} from "../document-grouping";

function cand(evidenceId: string, fileName: string, zipPath: string | null = null): GroupingCandidate {
  return { evidenceId, fileName, zipPath: zipPath ?? fileName };
}

function idsOf(groups: ProposedGroup[]): string[][] {
  return groups.map((g) => [...g.evidenceIds].sort());
}

describe("proposeDocumentGroups", () => {
  it("groups explicit page markers sharing a stem, sorted by page", () => {
    const groups = proposeDocumentGroups([
      cand("e3", "abatement_order_page3.jpg"),
      cand("e1", "abatement_order_page1.jpg"),
      cand("e2", "abatement_order_page2.jpg"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].evidenceIds).toEqual(["e1", "e2", "e3"]);
    expect(groups[0].confidence).toBe("high");
  });

  it("does not group a lone file that merely looks like a page marker", () => {
    const groups = proposeDocumentGroups([cand("e1", "notice_page1.jpg")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].evidenceIds).toEqual(["e1"]);
    expect(groups[0].confidence).toBe("high");
  });

  it("groups files sharing an archive folder", () => {
    const groups = proposeDocumentGroups([
      cand("e1", "img1.jpg", "abatement-order/img1.jpg"),
      cand("e2", "img2.jpg", "abatement-order/img2.jpg"),
      cand("e3", "cover.pdf", "cover.pdf"),
    ]);
    const folderGroup = groups.find((g) => g.evidenceIds.includes("e1"))!;
    expect(folderGroup.evidenceIds.sort()).toEqual(["e1", "e2"]);
    expect(folderGroup.confidence).toBe("medium");

    const singleton = groups.find((g) => g.evidenceIds.includes("e3"))!;
    expect(singleton.evidenceIds).toEqual(["e3"]);
    expect(singleton.confidence).toBe("high");
  });

  it("page markers take priority over shared folder for the same files", () => {
    const groups = proposeDocumentGroups([
      cand("e1", "notice_p1.jpg", "case-a/notice_p1.jpg"),
      cand("e2", "notice_p2.jpg", "case-a/notice_p2.jpg"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe("high");
    expect(groups[0].reason).toMatch(/page markers/);
  });

  it("groups a consecutive numeric sequence as low confidence", () => {
    const groups = proposeDocumentGroups([
      cand("e1", "IMG_4471.jpg"),
      cand("e2", "IMG_4472.jpg"),
      cand("e3", "IMG_4473.jpg"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].evidenceIds.sort()).toEqual(["e1", "e2", "e3"]);
    expect(groups[0].confidence).toBe("low");
  });

  it("splits a numeric sequence at a gap into separate runs", () => {
    const groups = proposeDocumentGroups([
      cand("e1", "IMG_4471.jpg"),
      cand("e2", "IMG_4472.jpg"),
      // Gap: 4473-4479 missing (photos of something else in between).
      cand("e3", "IMG_4480.jpg"),
      cand("e4", "IMG_4481.jpg"),
    ]);
    expect(idsOf(groups).sort()).toEqual([["e1", "e2"], ["e3", "e4"]]);
    for (const g of groups) expect(g.confidence).toBe("low");
  });

  it("never places the same file in two groups and never drops a file", () => {
    const candidates = [
      cand("e1", "abatement_order_page1.jpg", "case/abatement_order_page1.jpg"),
      cand("e2", "abatement_order_page2.jpg", "case/abatement_order_page2.jpg"),
      cand("e3", "IMG_9001.jpg"),
      cand("e4", "IMG_9002.jpg"),
      cand("e5", "cover_letter.pdf"),
    ];
    const groups = proposeDocumentGroups(candidates);
    const allIds = groups.flatMap((g) => g.evidenceIds);
    expect(allIds.sort()).toEqual(["e1", "e2", "e3", "e4", "e5"]);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("treats an unrelated single file as its own high-confidence document", () => {
    const groups = proposeDocumentGroups([cand("e1", "cover_letter.pdf")]);
    expect(groups).toEqual([
      {
        evidenceIds: ["e1"],
        confidence: "high",
        reason: "No other file in this bundle shares its name pattern or folder.",
      },
    ]);
  });
});

describe("refineGroupsWithCheapReads", () => {
  function read(evidenceId: string, documentType: string | null, page: number | null = null): CheapClassification {
    return { evidenceId, documentType, pageMarker: { page, ofTotal: null }, note: null };
  }

  it("splits a numeric-sequence group when the model reports different document types", () => {
    const groups: ProposedGroup[] = [
      { evidenceIds: ["e1", "e2", "e3"], confidence: "low", reason: "sequence" },
    ];
    const reads = [
      read("e1", "notice_of_violation"),
      read("e2", "notice_of_violation"),
      read("e3", "civil_penalty_notice"),
    ];
    const refined = refineGroupsWithCheapReads(groups, reads);
    const byIds = refined.map((g) => [...g.evidenceIds].sort());
    expect(byIds.sort()).toEqual([["e1", "e2"], ["e3"]]);
  });

  it("upgrades confidence to high when every file carries an explicit page marker", () => {
    const groups: ProposedGroup[] = [
      { evidenceIds: ["e1", "e2"], confidence: "low", reason: "sequence" },
    ];
    const reads = [read("e1", "compliance_order", 1), read("e2", "compliance_order", 2)];
    const refined = refineGroupsWithCheapReads(groups, reads);
    expect(refined).toHaveLength(1);
    expect(refined[0].confidence).toBe("high");
  });

  it("leaves singleton groups untouched", () => {
    const groups: ProposedGroup[] = [{ evidenceIds: ["e1"], confidence: "high", reason: "alone" }];
    const refined = refineGroupsWithCheapReads(groups, [read("e1", "correspondence")]);
    expect(refined).toEqual(groups);
  });

  it("keeps a group merged, at its original confidence, when types agree but no page markers were read", () => {
    const groups: ProposedGroup[] = [
      { evidenceIds: ["e1", "e2"], confidence: "low", reason: "sequence" },
    ];
    const reads = [read("e1", "notice_of_violation"), read("e2", "notice_of_violation")];
    const refined = refineGroupsWithCheapReads(groups, reads);
    expect(refined).toHaveLength(1);
    expect(refined[0].confidence).toBe("low");
  });
});

describe("estimateIntakeCost", () => {
  it("scales with file count and group count, never charging for reads that will not happen", () => {
    const small = estimateIntakeCost(5, 3);
    const large = estimateIntakeCost(50, 30);
    expect(small.cheapPassCalls).toBe(5);
    expect(small.fullReadCalls).toBe(3);
    expect(large.approxUsd).toBeGreaterThan(small.approxUsd);
  });

  it("produces a non-negative, finite dollar estimate", () => {
    const estimate = estimateIntakeCost(0, 0);
    expect(estimate.approxUsd).toBe(0);
    expect(Number.isFinite(estimateIntakeCost(200, 200).approxUsd)).toBe(true);
  });
});
