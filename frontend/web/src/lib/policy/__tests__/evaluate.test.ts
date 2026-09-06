/**
 * Policy evaluator tests.
 *
 * Two things are under test here. The first is arithmetic: intervals, trigger
 * selection, ripeness. The second matters more — the *language and status* of
 * what we emit. A miscounted day produces a wrong finding; an accusatory
 * finding produces a legal problem. Both are regressions.
 */

import { describe, it, expect } from "vitest";
import { evaluatePack, type EvaluationInput } from "../evaluate";
import { allPacks, defaultPack } from "../registry";
import { ACTIONABLE_STATUSES, type PolicyPack } from "../types";

const pack = defaultPack();

function input(
  timeline: EvaluationInput["timeline"],
  evidence: EvaluationInput["evidence"] = [],
): EvaluationInput {
  return { timeline, evidence };
}

function forRule(pack: PolicyPack, ruleId: string, i: EvaluationInput) {
  const single: PolicyPack = { ...pack, rules: pack.rules.filter((r) => r.id === ruleId) };
  return evaluatePack(single, i);
}

// ── Pack integrity ──────────────────────────────────────────────────────────

describe("policy pack integrity", () => {
  it("gives every rule a citation, source URL, and authority", () => {
    for (const p of allPacks()) {
      for (const rule of p.rules) {
        expect(rule.citation, `${p.id}/${rule.id} citation`).toBeTruthy();
        expect(rule.sourceUrl, `${p.id}/${rule.id} sourceUrl`).toMatch(/^https?:\/\//);
        expect(rule.authority, `${p.id}/${rule.id} authority`).toBeTruthy();
      }
    }
  });

  it("gives every elapsed_days rule a day count", () => {
    for (const p of allPacks()) {
      for (const rule of p.rules.filter((r) => r.kind === "elapsed_days")) {
        expect(rule.minCalendarDays, `${p.id}/${rule.id}`).toBeTypeOf("number");
      }
    }
  });

  it("uses unique rule ids within a pack", () => {
    for (const p of allPacks()) {
      const ids = p.rules.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("does not let two elapsed_days rules claim the same action type", () => {
    // Two rules measuring the same interval against different periods produce
    // contradictory-looking findings on one fact — e.g. a general state notice
    // rule and a specific county abatement rule both firing on an abatement.
    // The specific rule wins; the general one must exclude that action type.
    for (const p of allPacks()) {
      const claimed = new Map<string, string>();
      for (const rule of p.rules.filter((r) => r.kind === "elapsed_days")) {
        for (const action of rule.actionEventTypes ?? []) {
          const prior = claimed.get(action);
          expect(
            prior,
            `${p.id}: rules "${prior}" and "${rule.id}" both measure "${action}"`,
          ).toBeUndefined();
          claimed.set(action, rule.id);
        }
      }
    }
  });

  it("keeps unreviewed packs out of activation", () => {
    // The pilot pack carries unverified day counts. If someone flips this to
    // "active" without a lawyer, this test is the tripwire.
    expect(pack.activationStatus).toBe("legal_review_required");
  });

  it("documents day counts that have not been verified", () => {
    const unverified = pack.rules.filter((r) =>
      (r.notes ?? "").toUpperCase().includes("UNVERIFIED"),
    );
    for (const rule of unverified) {
      // A bare "UNVERIFIED" tag is not a disclosure — say what is in doubt.
      expect(
        (rule.notes ?? "").length,
        `${rule.id} must explain what is unverified`,
      ).toBeGreaterThan(80);
    }
  });
});

// ── elapsed_days ────────────────────────────────────────────────────────────

describe("elapsed_days", () => {
  it("reports the interval when an action follows its notice too closely", () => {
    const results = forRule(
      pack,
      "abatement_without_notice",
      input([
        { event_date: "2026-03-01", event_type: "notice" },
        { event_date: "2026-03-05", event_type: "abatement" },
      ]),
    );

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("Observed");
    expect(results[0].detail).toContain("4 day");
    expect(results[0].citation).toBe("Humboldt County Code § 352-4(c)");
  });

  it("marks a sufficient interval Satisfied", () => {
    const results = forRule(
      pack,
      "abatement_without_notice",
      input([
        { event_date: "2026-03-01", event_type: "notice" },
        { event_date: "2026-04-01", event_type: "abatement" },
      ]),
    );
    expect(results[0].status).toBe("Satisfied");
  });

  it("selects the most recent preceding notice, not the earliest", () => {
    const results = forRule(
      pack,
      "abatement_without_notice",
      input([
        { event_date: "2026-01-01", event_type: "notice" },
        { event_date: "2026-03-03", event_type: "notice" },
        { event_date: "2026-03-05", event_type: "abatement" },
      ]),
    );
    expect(results[0].status).toBe("Observed");
    expect(results[0].detail).toContain("2 day");
  });

  it("ignores notices dated after the action", () => {
    const results = forRule(
      pack,
      "abatement_without_notice",
      input([
        { event_date: "2026-06-01", event_type: "notice" },
        { event_date: "2026-03-05", event_type: "abatement" },
      ]),
    );
    expect(results[0].status).toBe("NotLocated");
  });

  it("says NotLocated — never 'violation' — when no notice is in the file", () => {
    const results = forRule(
      pack,
      "abatement_without_notice",
      input([{ event_date: "2026-03-05", event_type: "abatement" }]),
    );
    expect(results[0].status).toBe("NotLocated");
    // The absence of a record in our copy is not proof of absence.
    expect(results[0].detail).toMatch(/case file contains no/i);
    expect(results[0].recommendedNextAction).toBeTruthy();
  });

  it("is not ripe when the action has not occurred", () => {
    const results = forRule(
      pack,
      "abatement_without_notice",
      input([{ event_date: "2026-03-01", event_type: "notice" }]),
    );
    expect(results[0].status).toBe("AwaitingTrigger");
  });

  it("reports InsufficientEvidence for an unparseable date", () => {
    const results = forRule(
      pack,
      "abatement_without_notice",
      input([
        { event_date: "2026-03-01", event_type: "notice" },
        { event_date: "not a date", event_type: "abatement" },
      ]),
    );
    expect(results[0].status).toBe("InsufficientEvidence");
  });

  it("evaluates each action event independently", () => {
    const results = forRule(
      pack,
      "abatement_without_notice",
      input([
        { event_date: "2026-03-01", event_type: "notice" },
        { event_date: "2026-03-02", event_type: "abatement" },
        { event_date: "2026-05-01", event_type: "abatement" },
      ]),
    );
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.status)).toEqual(["Observed", "Satisfied"]);
  });
});

// ── required_predicate ──────────────────────────────────────────────────────

describe("required_predicate", () => {
  it("reports NotLocated when an adverse action has no hearing on record", () => {
    const results = forRule(
      pack,
      "hearing_right",
      input([{ event_date: "2026-03-05", event_type: "lien" }]),
    );
    expect(results[0].status).toBe("NotLocated");
    expect(results[0].detail).toMatch(/may be incomplete/i);
  });

  it("is Satisfied when a hearing is on record", () => {
    const results = forRule(
      pack,
      "hearing_right",
      input([
        { event_date: "2026-02-01", event_type: "hearing" },
        { event_date: "2026-03-05", event_type: "lien" },
      ]),
    );
    expect(results[0].status).toBe("Satisfied");
  });

  it("is not ripe with no adverse action", () => {
    const results = forRule(
      pack,
      "hearing_right",
      input([{ event_date: "2026-02-01", event_type: "notice" }]),
    );
    expect(results[0].status).toBe("AwaitingTrigger");
  });
});

// ── required_disclosure ─────────────────────────────────────────────────────

describe("required_disclosure", () => {
  it("does not treat an un-extracted document as a silent document", () => {
    const results = forRule(
      pack,
      "appeal_pathway",
      input(
        [{ event_date: "2026-03-05", event_type: "decision", evidence_id: "ev1" }],
        [{ id: "ev1", extracted_text: null, ai_summary: null }],
      ),
    );
    expect(results[0].status).toBe("InsufficientEvidence");
    expect(results[0].status).not.toBe("Observed");
  });

  it("reports InsufficientEvidence when no document is attached", () => {
    const results = forRule(
      pack,
      "appeal_pathway",
      input([{ event_date: "2026-03-05", event_type: "decision", evidence_id: null }]),
    );
    expect(results[0].status).toBe("InsufficientEvidence");
  });

  it("is Satisfied when the text discloses a review pathway", () => {
    const results = forRule(
      pack,
      "appeal_pathway",
      input(
        [{ event_date: "2026-03-05", event_type: "decision", evidence_id: "ev1" }],
        [{ id: "ev1", extracted_text: "You may APPEAL this determination within 30 days." }],
      ),
    );
    expect(results[0].status).toBe("Satisfied");
  });

  it("hedges an Observed disclosure gap with an extraction caveat", () => {
    const results = forRule(
      pack,
      "appeal_pathway",
      input(
        [{ event_date: "2026-03-05", event_type: "decision", evidence_id: "ev1" }],
        [{ id: "ev1", extracted_text: "The property shall be abated forthwith." }],
      ),
    );
    expect(results[0].status).toBe("Observed");
    expect(results[0].detail).toMatch(/extraction may be incomplete/i);
  });
});

// ── Language safety ─────────────────────────────────────────────────────────

describe("neutrality of emitted language", () => {
  // A finding lands in a court filing. It may describe the record. It may not
  // conclude that anyone broke the law.
  const FORBIDDEN = [
    "violation",
    "violated",
    "illegal",
    "unlawful",
    "misconduct",
    "failed to",
    "negligent",
    "wrongful",
  ];

  const busy = input(
    [
      { event_date: "2026-03-01", event_type: "notice" },
      { event_date: "2026-03-02", event_type: "abatement" },
      { event_date: "2026-03-03", event_type: "lien" },
      { event_date: "2026-03-04", event_type: "decision", evidence_id: "ev1" },
      { event_date: "2026-03-06", event_type: "permit_denied" },
      { event_date: "2026-03-07", event_type: "case_closed" },
    ],
    [{ id: "ev1", extracted_text: "The property shall be abated forthwith." }],
  );

  it("emits no accusatory language in any detail string", () => {
    for (const result of evaluatePack(pack, busy)) {
      const text = result.detail.toLowerCase();
      for (const word of FORBIDDEN) {
        expect(text, `rule ${result.ruleId} used "${word}": ${result.detail}`).not.toContain(
          word,
        );
      }
    }
  });

  it("carries provenance on every emitted evaluation", () => {
    for (const result of evaluatePack(pack, busy)) {
      expect(result.citation, result.ruleId).toBeTruthy();
      expect(result.sourceUrl, result.ruleId).toMatch(/^https?:\/\//);
      expect(result.policyVersion, result.ruleId).toBe(pack.policyVersion);
    }
  });

  it("flags every evaluation provisional while the pack is unreviewed", () => {
    for (const result of evaluatePack(pack, busy)) {
      expect(result.provisional, result.ruleId).toBe(true);
    }
  });

  it("gives every actionable non-Observed status a next step", () => {
    // "We could not evaluate this" is only useful with "here is how to fix that".
    for (const result of evaluatePack(pack, busy)) {
      if (!ACTIONABLE_STATUSES.includes(result.status)) continue;
      if (result.status === "Observed") continue;
      expect(result.recommendedNextAction, result.ruleId).toBeTruthy();
    }
  });
});

// ── Whole-pack behavior ─────────────────────────────────────────────────────

describe("record_presence", () => {
  // Build a minimal one-rule pack rather than depending on any real pack
  // shipping a record_presence rule today.
  const recordPack = {
    ...pack,
    rules: [
      {
        id: "lien_recorded",
        kind: "record_presence" as const,
        name: "Administrative Penalty Lien Recorded",
        description: "Checks whether the lien was recorded at the County Recorder.",
        severity: "warning" as const,
        citation: "Humboldt County Code § 352-23",
        sourceUrl: "https://humboldt.county.codes/Code/352-23",
        authority: "Humboldt County Recorder",
        instrumentKind: "administrative_civil_penalty_lien",
      },
    ],
  };

  it("reports InsufficientEvidence when no search has been logged", () => {
    const results = evaluatePack(recordPack, input([]));
    expect(results[0].status).toBe("InsufficientEvidence");
    expect(results[0].recommendedNextAction).toMatch(/search the county recorder index/i);
  });

  it("reports Satisfied when a search found the instrument", () => {
    const results = evaluatePack(recordPack, {
      timeline: [],
      evidence: [],
      recorderSearches: [
        {
          instrumentKind: "administrative_civil_penalty_lien",
          found: true,
          instrumentNumber: "2025-01234",
          recordedDate: "2025-07-01",
          searchedBy: "counsel@example.com",
          searchedAt: "2026-09-06",
        },
      ],
    });
    expect(results[0].status).toBe("Satisfied");
    expect(results[0].detail).toContain("2025-01234");
    expect(results[0].detail).toContain("2025-07-01");
  });

  it("reports NotLocated when a search was performed and found nothing", () => {
    const results = evaluatePack(recordPack, {
      timeline: [],
      evidence: [],
      recorderSearches: [
        {
          instrumentKind: "administrative_civil_penalty_lien",
          found: false,
          searchedBy: "counsel@example.com",
          searchedAt: "2026-09-06",
          sourceNote: "searched online index by APN and owner name",
        },
      ],
    });
    expect(results[0].status).toBe("NotLocated");
    expect(results[0].detail).toContain("counsel@example.com");
    // A negative search result must read as a reproducible fact, not a guess.
    expect(results[0].detail).toMatch(/independently reproducible/i);
  });

  it("ignores a search logged for a different instrument kind", () => {
    const results = evaluatePack(recordPack, {
      timeline: [],
      evidence: [],
      recorderSearches: [
        { instrumentKind: "notice_of_pendency", found: true, searchedBy: "x", searchedAt: "2026-09-06" },
      ],
    });
    expect(results[0].status).toBe("InsufficientEvidence");
  });
});

describe("evaluatePack", () => {
  it("produces no actionable findings for an empty case file", () => {
    const results = evaluatePack(pack, input([]));
    const actionable = results.filter((r) => ACTIONABLE_STATUSES.includes(r.status));
    expect(actionable).toHaveLength(0);
    expect(results.every((r) => r.status === "AwaitingTrigger")).toBe(true);
  });

  it("covers every rule in the pack", () => {
    const results = evaluatePack(pack, input([]));
    expect(new Set(results.map((r) => r.ruleId)).size).toBe(pack.rules.length);
  });
});
