import { describe, it, expect } from "vitest";
import { snippetAround, matchedIn } from "../evidence-search";

describe("snippetAround", () => {
  it("returns a window of text centered on the match", () => {
    const text = "The notice was served on April 15, 2026, by certified mail to the property owner at the listed address.";
    const snippet = snippetAround(text, "certified mail");
    expect(snippet).toContain("certified mail");
  });

  it("prefixes with an ellipsis when the match isn't at the start", () => {
    const text = "x".repeat(200) + " needle " + "y".repeat(200);
    const snippet = snippetAround(text, "needle");
    expect(snippet?.startsWith("…")).toBe(true);
    expect(snippet?.endsWith("…")).toBe(true);
  });

  it("has no leading ellipsis when the match is at the very start", () => {
    const text = "needle right at the start of a short document.";
    const snippet = snippetAround(text, "needle");
    expect(snippet?.startsWith("…")).toBe(false);
  });

  it("is case-insensitive", () => {
    const text = "The Notice of Violation was posted.";
    expect(snippetAround(text, "notice of violation")).toContain("Notice of Violation");
  });

  it("returns null when there's no match, no text, or no term", () => {
    expect(snippetAround("some text", "absent term")).toBeNull();
    expect(snippetAround(null, "term")).toBeNull();
    expect(snippetAround("some text", "")).toBeNull();
  });
});

describe("matchedIn", () => {
  it("prefers title over ai_summary or extracted_text", () => {
    expect(
      matchedIn("deadline", { title: "Deadline Notice", aiSummary: "mentions deadline too", extractedText: "and here" }),
    ).toBe("title");
  });

  it("falls back to ai_summary when the title doesn't match", () => {
    expect(
      matchedIn("hearing", { title: "Notice of Violation", aiSummary: "Schedules a hearing for June 1", extractedText: "no mention" }),
    ).toBe("ai_summary");
  });

  it("falls back to extracted_text when neither title nor ai_summary match", () => {
    expect(
      matchedIn("lien", { title: "Notice of Violation", aiSummary: "A routine notice", extractedText: "...a lien may be filed..." }),
    ).toBe("extracted_text");
  });

  it("is case-insensitive across all three fields", () => {
    expect(matchedIn("APN", { title: "apn 123-456-789", aiSummary: null, extractedText: null })).toBe("title");
  });
});
