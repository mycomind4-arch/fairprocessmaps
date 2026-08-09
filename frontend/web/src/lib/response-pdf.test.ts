import { describe, expect, it } from "vitest";
import { renderResponsePdf } from "./response-pdf";

describe("renderResponsePdf", () => {
  it("creates a readable PDF artifact with the response title and body", () => {
    const pdf = renderResponsePdf({
      title: "Response to Notice",
      recipientName: "Planning Department",
      subject: "Request for review",
      body: "Please review the procedural record and supporting evidence.",
      finalizedAt: "2026-08-09T12:00:00.000Z",
    });

    expect(pdf.byteLength).toBeGreaterThan(500);
    const text = new TextDecoder().decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("Response to Notice");
    expect(text).toContain("Please review the procedural record");
    expect(text).toContain("%%EOF");
  });

  it("escapes PDF control characters in user-authored text", () => {
    const pdf = renderResponsePdf({
      title: "A (final) response",
      body: "Use (the record) carefully.",
      finalizedAt: "2026-08-09T12:00:00.000Z",
    });
    const text = new TextDecoder().decode(pdf);
    expect(text).toContain("A \\(final\\) response");
    expect(text).toContain("Use \\(the record\\) carefully.");
  });
});
