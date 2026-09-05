/**
 * Policy compiler validator tests.
 *
 * The validator is the only thing standing between a language model and a
 * deadline in a court filing. These tests are adversarial on purpose: each one
 * is a way a plausible-looking hallucination could reach a pack.
 */

import { describe, it, expect } from "vitest";
import { validateProposedRules, buildReviewChecklist } from "../compiler";
import type { PolicyPack } from "../types";

const SOURCE = `
Section 500-1. Notice of Violation.
Upon determination that a violation exists, the enforcement officer shall serve
a notice of violation upon the owner. No abatement shall occur until at least
fifteen (15) days after service of the notice of violation.

Section 500-2. Hearing.
The owner may request a hearing within ten (10) days of service. The notice of
violation shall state the owner's right to request a hearing.
`;

const req = {
  jurisdiction: "Mendocino County, California",
  caseTypes: ["code_enforcement"],
  sourceText: SOURCE,
  sourceUrl: "https://example.gov/code/500",
  authority: "Mendocino County Board of Supervisors",
};

const goodRule = {
  id: "abatement_notice_period",
  kind: "elapsed_days" as const,
  name: "Abatement Following Notice",
  description: "Days between notice of violation and abatement.",
  severity: "critical" as const,
  citation: "Mendocino County Code § 500-1",
  sourceQuote:
    "No abatement shall occur until at least fifteen (15) days after service of the notice of violation.",
  minCalendarDays: 15,
  triggerEventTypes: ["notice"],
  actionEventTypes: ["abatement"],
};

describe("grounding — the quote must exist in the source", () => {
  it("accepts a rule whose quote appears verbatim", () => {
    const { accepted, rejected } = validateProposedRules([goodRule], req);
    expect(rejected).toHaveLength(0);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].minCalendarDays).toBe(15);
  });

  it("rejects a fabricated deadline that reads plausibly", () => {
    // The classic failure: a real-sounding requirement that is simply not in
    // the text. The model "knows" many counties require 30 days.
    const hallucinated = {
      ...goodRule,
      id: "fabricated",
      sourceQuote:
        "No abatement shall occur until at least thirty (30) days after service of the notice of violation.",
      minCalendarDays: 30,
    };
    const { accepted, rejected } = validateProposedRules([hallucinated], req);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/does not appear in the provided text/i);
  });

  it("tolerates whitespace reflow and typographic substitution", () => {
    const reflowed = {
      ...goodRule,
      sourceQuote:
        "No abatement shall occur until at least   fifteen (15) days\nafter service of the notice of violation.",
    };
    const { accepted } = validateProposedRules([reflowed], req);
    expect(accepted).toHaveLength(1);
  });

  it("rejects a rule with no quote at all", () => {
    const { rejected } = validateProposedRules(
      [{ ...goodRule, sourceQuote: undefined }],
      req,
    );
    expect(rejected[0].reason).toMatch(/no source quote/i);
  });

  it("rejects a quote too short to be verifiable", () => {
    const { rejected } = validateProposedRules([{ ...goodRule, sourceQuote: "15 days" }], req);
    expect(rejected[0].reason).toMatch(/too short/i);
  });

  it("rejects a day-count rule whose quote contains no number", () => {
    const { rejected } = validateProposedRules(
      [
        {
          ...goodRule,
          sourceQuote:
            "The notice of violation shall state the owner's right to request a hearing.",
        },
      ],
      req,
    );
    expect(rejected[0].reason).toMatch(/no number/i);
  });
});

describe("schema and parameter validation", () => {
  it("rejects a rule with no citation", () => {
    const { rejected } = validateProposedRules([{ ...goodRule, citation: undefined }], req);
    expect(rejected[0].reason).toMatch(/no citation/i);
  });

  it("rejects an unknown rule kind", () => {
    const { rejected } = validateProposedRules(
      [{ ...goodRule, kind: "vibes" as never }],
      req,
    );
    expect(rejected[0].reason).toMatch(/unknown rule kind/i);
  });

  it("rejects an elapsed_days rule with no day count", () => {
    const { rejected } = validateProposedRules(
      [{ ...goodRule, minCalendarDays: undefined }],
      req,
    );
    expect(rejected[0].reason).toMatch(/minCalendarDays/i);
  });

  it("rejects duplicate rule ids", () => {
    const { accepted, rejected } = validateProposedRules([goodRule, goodRule], req);
    expect(accepted).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/duplicate/i);
  });

  it("rejects a malformed id", () => {
    const { rejected } = validateProposedRules([{ ...goodRule, id: "Bad Id!" }], req);
    expect(rejected[0].reason).toMatch(/malformed rule id/i);
  });

  it("enforces the one-rule-per-action-type invariant", () => {
    const second = {
      ...goodRule,
      id: "second_abatement_rule",
      citation: "Mendocino County Code § 500-2",
      sourceQuote: "The owner may request a hearing within ten (10) days of service.",
      minCalendarDays: 10,
    };
    const { accepted, rejected } = validateProposedRules([goodRule, second], req);
    expect(accepted).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/already measured/i);
  });
});

describe("output safety", () => {
  it("stamps every accepted rule UNVERIFIED with its establishing quote", () => {
    const { accepted } = validateProposedRules([goodRule], req);
    expect(accepted[0].notes).toMatch(/MACHINE-EXTRACTED, UNVERIFIED/);
    expect(accepted[0].notes).toContain("fifteen (15) days");
  });

  it("takes sourceUrl and authority from the request, never from the model", () => {
    // A model-supplied URL could point anywhere. The caller knows where the
    // text came from; the model does not get a say.
    const spoofed = {
      ...goodRule,
      sourceUrl: "https://evil.example/fake",
      authority: "Not A Real Body",
    };
    const { accepted } = validateProposedRules([spoofed], req);
    expect(accepted[0].sourceUrl).toBe(req.sourceUrl);
    expect(accepted[0].authority).toBe(req.authority);
  });

  it("defaults severity rather than trusting a malformed value", () => {
    const { accepted } = validateProposedRules(
      [{ ...goodRule, severity: undefined }],
      req,
    );
    expect(accepted[0].severity).toBe("warning");
  });
});

describe("review checklist", () => {
  const pack: PolicyPack = {
    id: "mendocino-code-enforcement",
    jurisdiction: "Mendocino County, California",
    caseTypes: ["code_enforcement"],
    policyVersion: "2026-09-05-machine-draft",
    activationStatus: "legal_review_required",
    rules: validateProposedRules([goodRule], req).accepted,
  };

  it("asks about the abatement track for every day-count rule", () => {
    const checklist = buildReviewChecklist(pack);
    expect(checklist.some((c) => /summary abatement/i.test(c))).toBe(true);
  });

  it("asks whether days are calendar or business days", () => {
    const checklist = buildReviewChecklist(pack);
    expect(checklist.some((c) => /calendar or business days/i.test(c))).toBe(true);
  });

  it("puts activation last, after every verification item", () => {
    const checklist = buildReviewChecklist(pack);
    const activationIndex = checklist.findIndex((c) => /activationStatus/.test(c));
    expect(activationIndex).toBe(checklist.length - 1);
  });

  it("checks the source is currently codified, not superseded", () => {
    expect(buildReviewChecklist(pack)[0]).toMatch(/CURRENTLY CODIFIED/);
  });
});
