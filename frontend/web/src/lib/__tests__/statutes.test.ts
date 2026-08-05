import { describe, it, expect } from "vitest";
import {
  STATUTES,
  getStatutesByCategory,
  findStatute,
  businessDaysBetween,
  calendarDaysBetween,
  evaluateDeadline,
  type StatuteRule,
} from "@/lib/statutes";

// ── Actual statute data from statutes.ts ──
// HCC § 351-7    — Citation Mailing Deadline         — business_days, 3,  max, notice
// HCC § 351-12   — Notice Publication Before Hearing — calendar_days, 10, min, hearing
// CA Gov Code § 65852.2 — ADU Application Review       — calendar_days, 60, max, permit
// HCC § 4.2      — Enforcement Notice Posting         — business_days, 5,  max, enforcement
// CA Gov Code § 65905 — Zoning Decision Appeal Period  — calendar_days, 10, min, appeal
// HCC § 311-3    — Nuisance Abatement Notice Period    — calendar_days, 30, min, enforcement
// CA Gov Code § 53069.4 — Administrative Citation Appeal — calendar_days, 10, min, appeal
// CA Gov Code § 65863.3 — Permit Decision Notification  — calendar_days, 30, max, permit
// HCC § 351-9    — Recording of Enforcement Orders     — business_days, 5,  max, recording
// CA CCP § 1094.5 — Writ of Mandate Filing             — calendar_days, 90, max, appeal

describe("Statutes Library", () => {
  it("should have 10 statutes", () => {
    expect(STATUTES).toHaveLength(10);
  });

  it("every statute has required fields", () => {
    for (const s of STATUTES) {
      expect(s.ref).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.category).toBeTruthy();
      expect(s.deadline_type).toMatch(/business_days|calendar_days/);
      expect(s.deadline_value).toBeGreaterThan(0);
      expect(s.deadline_direction).toMatch(/min|max/);
      expect(s.source).toBeTruthy();
      expect(s.description).toBeTruthy();
    }
  });

  it("HCC § 351-7 is the 3-business-day citation mailing deadline", () => {
    const s = STATUTES.find((x) => x.ref === "HCC § 351-7");
    expect(s).toBeDefined();
    expect(s!.deadline_value).toBe(3);
    expect(s!.deadline_type).toBe("business_days");
    expect(s!.deadline_direction).toBe("max");
    expect(s!.category).toBe("notice");
    expect(s!.title).toBe("Citation Mailing Deadline");
  });

  it("HCC § 311-3 is the 30-day nuisance abatement notice period", () => {
    const s = STATUTES.find((x) => x.ref === "HCC § 311-3");
    expect(s).toBeDefined();
    expect(s!.deadline_value).toBe(30);
    expect(s!.deadline_type).toBe("calendar_days");
    expect(s!.deadline_direction).toBe("min");
    expect(s!.category).toBe("enforcement");
  });

  it("CA Gov Code § 65852.2 is the 60-day ADU review period (max)", () => {
    const s = STATUTES.find((x) => x.ref === "CA Gov Code § 65852.2");
    expect(s).toBeDefined();
    expect(s!.deadline_value).toBe(60);
    expect(s!.deadline_direction).toBe("max");
    expect(s!.category).toBe("permit");
  });

  it("CA CCP § 1094.5 is the 90-day writ of mandate filing deadline", () => {
    const s = STATUTES.find((x) => x.ref === "CA CCP § 1094.5");
    expect(s).toBeDefined();
    expect(s!.deadline_value).toBe(90);
    expect(s!.deadline_direction).toBe("max");
    expect(s!.category).toBe("appeal");
  });

  it("getStatutesByCategory returns correct statutes", () => {
    const noticeStatutes = getStatutesByCategory("notice");
    expect(noticeStatutes.length).toBeGreaterThan(0);
    expect(noticeStatutes.every((s) => s.category === "notice")).toBe(true);
  });

  it("findStatute returns the correct statute by ref", () => {
    const s = findStatute("HCC § 351-7");
    expect(s).toBeDefined();
    expect(s!.title).toBe("Citation Mailing Deadline");
  });

  it("findStatute returns undefined for unknown ref", () => {
    const s = findStatute("FAKE §999");
    expect(s).toBeUndefined();
  });

  it("every category has at least one statute", () => {
    const categories = ["notice", "hearing", "appeal", "permit", "enforcement", "recording"];
    for (const cat of categories) {
      const statutes = getStatutesByCategory(cat);
      expect(statutes.length).toBeGreaterThan(0);
    }
  });
});

describe("Calendar Day Calculations", () => {
  it("calculates 30 calendar days", () => {
    const result = calendarDaysBetween("2026-01-01", "2026-01-31");
    expect(result).toBe(30);
  });

  it("calculates 0 days for same date", () => {
    const result = calendarDaysBetween("2026-01-01", "2026-01-01");
    expect(result).toBe(0);
  });

  it("handles month boundaries", () => {
    const result = calendarDaysBetween("2026-01-30", "2026-02-05");
    expect(result).toBe(6);
  });

  it("calculates 90 days for writ of mandate", () => {
    const result = calendarDaysBetween("2026-01-01", "2026-04-01");
    expect(result).toBe(90);
  });
});

describe("evaluateDeadline — Min Direction (HCC § 311-3: 30 calendar days min)", () => {
  const statute = STATUTES.find((s) => s.ref === "HCC § 311-3")!;

  it("flags deviation when notice period is too short (5 days, need 30)", () => {
    const result = evaluateDeadline("2026-01-01", "2026-01-05", statute);
    expect(result.status).toBe("deviation detected");
    expect(result.elapsedDays).toBe(4);
    expect(result.note).toContain("Does not meet");
  });

  it("passes when notice period meets minimum (35 days)", () => {
    const result = evaluateDeadline("2026-01-01", "2026-02-05", statute);
    expect(result.status).toBe("matches expected window");
    expect(result.elapsedDays).toBe(35);
    expect(result.note).toContain("Meets");
  });

  it("passes when notice period exactly meets minimum (30 days)", () => {
    const result = evaluateDeadline("2026-01-01", "2026-01-31", statute);
    expect(result.status).toBe("matches expected window");
    expect(result.elapsedDays).toBe(30);
  });
});

describe("evaluateDeadline — Max Direction (CA Gov Code § 65852.2: 60 calendar days max)", () => {
  const statute = STATUTES.find((s) => s.ref === "CA Gov Code § 65852.2")!;

  it("flags deviation when review takes 120 days (exceeds 60)", () => {
    const result = evaluateDeadline("2026-01-01", "2026-05-01", statute);
    expect(result.status).toBe("deviation detected");
    expect(result.elapsedDays).toBe(120);
    expect(result.note).toContain("Exceeds");
  });

  it("passes when review takes 29 days (within 60)", () => {
    const result = evaluateDeadline("2026-01-01", "2026-01-30", statute);
    expect(result.status).toBe("matches expected window");
    expect(result.elapsedDays).toBe(29);
    expect(result.note).toContain("Within");
  });

  it("passes when review takes exactly 60 days", () => {
    const result = evaluateDeadline("2026-01-01", "2026-03-02", statute);
    expect(result.status).toBe("matches expected window");
    expect(result.elapsedDays).toBe(60);
  });
});

describe("evaluateDeadline — Max Direction (HCC § 351-7: 3 business days max)", () => {
  const statute = STATUTES.find((s) => s.ref === "HCC § 351-7")!;

  it("flags deviation when citation mailing takes 10 business days (exceeds 3)", () => {
    const result = evaluateDeadline("2026-08-03", "2026-08-14", statute);
    expect(result.status).toBe("deviation detected");
    // businessDaysBetween is inclusive — will be >= 10
    expect(result.elapsedDays).toBeGreaterThanOrEqual(10);
  });

  it("passes when citation mailed within 3 business days", () => {
    // Aug 3 (Mon) to Aug 5 (Wed) = 3 business days inclusive
    const result = evaluateDeadline("2026-08-03", "2026-08-05", statute);
    expect(result.status).toBe("matches expected window");
    expect(result.elapsedDays).toBeGreaterThanOrEqual(3);
  });
});

describe("evaluateDeadline — Missing Start Date", () => {
  it("returns 'unable to determine' when start date is missing", () => {
    const statute = STATUTES.find((s) => s.ref === "HCC § 311-3")!;
    const result = evaluateDeadline("", "2026-08-14", statute);
    expect(result.status).toBe("unable to determine");
  });
});

describe("Guardrail Language (neutrality)", () => {
  it("uses 'deviation detected' instead of 'violation' in status", () => {
    const statute = STATUTES.find((s) => s.ref === "HCC § 311-3")!; // 30 calendar days min
    const result = evaluateDeadline("2026-01-01", "2026-01-05", statute);
    expect(result.status).not.toContain("violation");
    expect(result.status).not.toContain("compliant");
    expect(result.status).not.toContain("guilty");
    expect(result.status).toContain("deviation");
  });

  it("uses 'matches expected window' instead of 'compliant' in status", () => {
    const statute = STATUTES.find((s) => s.ref === "HCC § 311-3")!;
    const result = evaluateDeadline("2026-01-01", "2026-02-15", statute);
    expect(result.status).not.toContain("compliant");
    expect(result.status).toContain("matches expected window");
  });
});
