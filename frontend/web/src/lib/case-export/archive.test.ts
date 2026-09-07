import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readCaseFile } from "./archive";

const manifest = () => ({
  formatVersion: 1, project: { id: "p", name: "Portable case" }, property: null, legacyCase: null,
  evidence: [], timelineEvents: [], findings: [], workflowRuns: [], workflowStageResults: [],
  workflowAuthorizations: [], workflowMailings: [], responseDrafts: [], caseCommunications: [],
});
const archive = (value: unknown, files = {}) => zipSync({ "manifest.json": strToU8(JSON.stringify(value)), ...files });

describe("case file validation", () => {
  it("accepts a case manifest", () => expect(readCaseFile(archive(manifest())).manifest.project.name).toBe("Portable case"));
  it("rejects malformed manifests before any storage writes", () => {
    expect(() => readCaseFile(archive(null))).toThrow();
    expect(() => readCaseFile(archive({ ...manifest(), evidence: {} }))).toThrow();
  });
  it("rejects missing evidence files and duplicate IDs", () => {
    expect(() => readCaseFile(archive({ ...manifest(), evidence: [{ id: "e", filePath: "files/missing.pdf" }] }))).toThrow(/missing/i);
    expect(() => readCaseFile(archive({ ...manifest(), evidence: [{ id: "e" }, { id: "e" }] }))).toThrow(/duplicate/i);
  });
  it("rejects oversized expanded data before inflation", () => {
    const bytes = archive(manifest(), { "files/big.txt": new Uint8Array(1024) });
    expect(() => readCaseFile(bytes, 512)).toThrow(/size/i);
  });
  it("rejects dangling internal links", () => {
    expect(() => readCaseFile(archive({ ...manifest(), timelineEvents: [{ id: "t", evidenceId: "unknown" }] }))).toThrow(/reference/i);
  });
});
