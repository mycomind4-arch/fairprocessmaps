/**
 * Deadline engine tests.
 *
 * A wrong deadline here is worse than no deadline: someone relaxes, the window
 * closes, and the case is over regardless of its merits. So these test not only
 * the arithmetic but the conservatism — that we round toward acting sooner and
 * never present an unverified date as settled.
 */

import { describe, it, expect } from "vitest";
import { computeDeadlines, primaryDeadline, urgencyOf, urgencyMessage } from "../deadlines";
import { defaultPack } from "@/lib/policy/registry";

const pack = defaultPack();

describe("computation", () => {
  it("derives the date from the pack rule, not a hardcoded number", () => {
    const [d] = computeDeadlines({
      serviceDate: "2026-04-02",
      noticeType: "notice",
      pack,
      referenceDate: "2026-04-05",
    });
    expect(d.dueDate).toBeTruthy();
    expect(d.citation).toBeTruthy();
    expect(d.sourceUrl).toMatch(/^https?:\/\//);
    expect(d.basis).toContain(d.citation!);
  });

  it("leads with the tightest window when several apply", () => {
    const all = computeDeadlines({
      serviceDate: "2026-04-02",
      noticeType: "notice",
      pack,
      referenceDate: "2026-04-05",
    });
    expect(all.length).toBeGreaterThan(1);
    const dates = all.map((d) => d.dueDate);
    expect([...dates].sort()).toEqual(dates);
    expect(primaryDeadline({
      serviceDate: "2026-04-02",
      noticeType: "notice",
      pack,
      referenceDate: "2026-04-05",
    }).dueDate).toBe(dates[0]);
  });

  it("computes days remaining from the reference date", () => {
    const d = primaryDeadline({
      serviceDate: "2026-04-02",
      noticeType: "notice",
      pack,
      referenceDate: "2026-04-05",
    });
    // 10-day rule from 04-02 is 04-12; three days have elapsed.
    expect(d.dueDate).toBe("2026-04-12");
    expect(d.daysRemaining).toBe(7);
  });

  it("reports a passed deadline as negative rather than hiding it", () => {
    const d = primaryDeadline({
      serviceDate: "2026-04-02",
      noticeType: "notice",
      pack,
      referenceDate: "2026-06-01",
    });
    expect(d.daysRemaining).toBeLessThan(0);
    expect(urgencyOf(d)).toBe("passed");
    expect(urgencyMessage(d)).toMatch(/may still be worth filing/i);
  });
});

describe("honesty about what it does not know", () => {
  it("returns unknown — never a guess — with no service date", () => {
    const d = primaryDeadline({ serviceDate: null, noticeType: "notice", pack });
    expect(d.dueDate).toBeNull();
    expect(d.confidence).toBe("unknown");
    expect(d.caveats[0]).toMatch(/may be imminent/i);
  });

  it("returns unknown when no rule covers the notice type", () => {
    const d = primaryDeadline({
      serviceDate: "2026-04-02",
      noticeType: "parking_ticket",
      pack,
    });
    expect(d.dueDate).toBeNull();
    expect(d.confidence).toBe("unknown");
    expect(d.basis).toMatch(/No checkpoint/i);
    // Must not imply the absence of a modeled rule means no deadline exists.
    expect(d.caveats.join(" ")).toMatch(/may still apply/i);
  });

  it("marks dates provisional while the pack is unreviewed", () => {
    const d = primaryDeadline({
      serviceDate: "2026-04-02",
      noticeType: "notice",
      pack,
      referenceDate: "2026-04-05",
    });
    expect(d.confidence).toBe("provisional");
    expect(d.caveats.join(" ")).toMatch(/not completed legal review/i);
  });

  it("always warns that calendar-day math may not be the real rule", () => {
    const d = primaryDeadline({
      serviceDate: "2026-04-02",
      noticeType: "notice",
      pack,
      referenceDate: "2026-04-05",
    });
    expect(d.caveats.join(" ")).toMatch(/business days/i);
    expect(d.caveats.join(" ")).toMatch(/notice itself states a response date/i);
  });
});

describe("urgency banding is pessimistic", () => {
  const base = { serviceDate: "2026-04-02", noticeType: "notice", pack };

  it("treats an uncomputable deadline as unknown, not as slack", () => {
    const d = primaryDeadline({ ...base, serviceDate: null });
    expect(urgencyOf(d)).toBe("unknown");
    expect(urgencyMessage(d)).toMatch(/time-sensitive/i);
  });

  it("escalates as the window closes", () => {
    // 10-day rule from 04-02 → due 04-12.
    expect(urgencyOf(primaryDeadline({ ...base, referenceDate: "2026-04-11" }))).toBe("critical");
    expect(urgencyOf(primaryDeadline({ ...base, referenceDate: "2026-04-05" }))).toBe("urgent");
    expect(urgencyOf(primaryDeadline({ ...base, referenceDate: "2026-04-01" }))).toBe("upcoming");
  });

  it("tells someone to mail today when the window is nearly closed", () => {
    const d = primaryDeadline({ ...base, referenceDate: "2026-04-11" });
    expect(urgencyMessage(d)).toMatch(/proof of mailing/i);
  });
});
