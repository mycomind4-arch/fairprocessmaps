import { describe, it, expect } from "vitest";
import {
  applyGuardrail,
  sha256,
  GUARDRAIL,
} from "@/lib/analysis-agents";

describe("Neutrality Guardrail", () => {
  it("replaces 'violation' with 'deviation detected'", () => {
    const { text, blocks } = applyGuardrail("This is a violation of the notice period requirement.");
    expect(text).not.toContain("violation");
    expect(text).toContain("deviation detected");
    expect(blocks.some((b) => b.blocked === "violation")).toBe(true);
  });

  it("replaces 'compliant' with 'matches expected window'", () => {
    const { text, blocks } = applyGuardrail("The process is compliant with the statute.");
    expect(text).not.toContain("compliant");
    expect(text).toContain("matches expected window");
    expect(blocks.some((b) => b.blocked === "compliant")).toBe(true);
  });

  it("replaces 'guilty' with 'evidence suggests'", () => {
    const { text } = applyGuardrail("The property owner is guilty of non-compliance.");
    expect(text).not.toContain("guilty");
    expect(text).toContain("evidence suggests");
  });

  it("replaces 'non-compliant' with 'deviation detected'", () => {
    const { text } = applyGuardrail("The process was non-compliant.");
    expect(text).not.toContain("non-compliant");
    expect(text).toContain("deviation detected");
  });

  it("replaces 'unlawful' with 'deviation detected'", () => {
    const { text } = applyGuardrail("The abatement was unlawful.");
    expect(text).not.toContain("unlawful");
    expect(text).toContain("deviation detected");
  });

  it("replaces 'invalid' with 'conflict identified'", () => {
    const { text } = applyGuardrail("The notice was invalid.");
    expect(text).not.toContain("invalid");
    expect(text).toContain("conflict identified");
  });

  it("replaces 'void' with 'conflict identified'", () => {
    const { text } = applyGuardrail("The decision was void.");
    expect(text).not.toContain("void");
    expect(text).toContain("conflict identified");
  });

  it("replaces 'liable' with 'evidence suggests'", () => {
    const { text } = applyGuardrail("The owner was found liable.");
    expect(text).not.toContain("liable");
    expect(text).toContain("evidence suggests");
  });

  it("preserves neutral language unchanged", () => {
    const input = "The timeline shows a deviation detected in the notice period.";
    const { text, blocks } = applyGuardrail(input);
    expect(text).toBe(input);
    expect(blocks).toHaveLength(0);
  });

  it("handles multiple terms in one text", () => {
    const { text, blocks } = applyGuardrail(
      "The violation made the process non-compliant and the owner was guilty."
    );
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(text).not.toContain("violation");
    expect(text).not.toContain("non-compliant");
    expect(text).not.toContain("guilty");
  });

  it("is case-insensitive", () => {
    const { text } = applyGuardrail("This is a VIOLATION and also a Violation.");
    expect(text.toLowerCase()).not.toContain("violation");
  });
});

describe("SHA-256 Audit Hashing", () => {
  it("generates a consistent 64-character hex hash for the same input", async () => {
    const data = "statute_matching|2026-01-01T00:00:00Z|deviation";
    const hash1 = await sha256(data);
    const hash2 = await sha256(data);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).toMatch(/^[0-9a-f]+$/);
  });

  it("generates different hashes for different inputs", async () => {
    const hash1 = await sha256("agent_a|deviation");
    const hash2 = await sha256("agent_b|deviation");
    expect(hash1).not.toBe(hash2);
  });

  it("generates different hashes for same agent different result", async () => {
    const hash1 = await sha256("statute_matching|matches");
    const hash2 = await sha256("statute_matching|deviation");
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", async () => {
    const hash = await sha256("");
    expect(hash).toHaveLength(64);
    // SHA-256 of empty string is e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("Guardrail Constant", () => {
  it("defines the guardrail mission", () => {
    expect(GUARDRAIL).toContain("evidentiary status");
    expect(GUARDRAIL).toContain("legal conclusions");
  });
});
