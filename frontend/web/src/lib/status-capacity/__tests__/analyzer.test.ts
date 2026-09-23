import { describe, expect, it } from "vitest";
import { analyzeStatusClaim } from "../analyzer";

describe("status-capacity analyzer", () => {
  it("does not treat California State National as an automatically recognized federal nationality class", () => {
    const result = analyzeStatusClaim({ statusId: "california-state-national" });
    expect(result.status.recognition).toBe("asserted_term");
    expect(result.canBeChangedByDeclarationAlone).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/label alone/i);
  });

  it("distinguishes capacity from citizenship status", () => {
    const result = analyzeStatusClaim({ statusId: "trustee" });
    expect(result.status.recognition).toBe("recognized_capacity");
    expect(result.status.category).toBe("capacity");
    expect(result.questions.join(" ")).toMatch(/scope of authority/i);
  });

  it("requires separate authority for a claimed consequence even when the underlying status is recognized", () => {
    const result = analyzeStatusClaim({
      statusId: "us-citizen",
      claimedConsequence: "This changes the court's jurisdiction.",
    });
    expect(result.status.recognition).toBe("recognized_status");
    expect(result.consequenceNeedsSeparateAuthority).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/researched independently/i);
  });
});
