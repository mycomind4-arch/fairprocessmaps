import { unzipSync, strFromU8 } from "fflate";
import { CASE_FILE_FORMAT_VERSION, MAX_CASE_FILE_BYTES, type CaseFileManifest } from "./manifest";

const collections = ["evidence", "timelineEvents", "findings", "workflowRuns", "workflowStageResults", "workflowAuthorizations", "workflowMailings", "responseDrafts", "caseCommunications"] as const;

export function readCaseFile(bytes: Uint8Array, maxBytes = MAX_CASE_FILE_BYTES) {
  if (bytes.length > maxBytes) throw new Error("Case file exceeds the size limit");
  let total = 0;
  const names = new Set<string>();
  const entries = unzipSync(bytes, { filter(file) {
    if (file.name.endsWith("/")) return false;
    if (names.has(file.name)) throw new Error("Duplicate archive entry");
    names.add(file.name);
    total += file.originalSize;
    if (names.size > 2001 || total > maxBytes || (file.name === "manifest.json" && file.originalSize > 5 * 1024 * 1024)) throw new Error("Expanded case file exceeds the size limit");
    if (file.name !== "manifest.json" && !/^files\/[^/\\]+$/.test(file.name)) throw new Error("Unexpected case file path");
    return true;
  } });
  if (!entries["manifest.json"]) throw new Error("Missing manifest.json");
  const value = JSON.parse(strFromU8(entries["manifest.json"]));
  if (!value || value.formatVersion !== CASE_FILE_FORMAT_VERSION) throw new Error("Unsupported case file format");
  if (!value.project || typeof value.project.name !== "string" || !value.project.name.trim()) throw new Error("Case name is required");
  const ids: Record<string, Set<string>> = {};
  for (const collection of collections) {
    if (!Array.isArray(value[collection]) || value[collection].length > 2000) throw new Error(`Invalid ${collection}`);
    ids[collection] = new Set();
    for (const row of value[collection]) {
      if (!row || typeof row.id !== "string" || !row.id) throw new Error(`Invalid ${collection} ID`);
      if (ids[collection].has(row.id)) throw new Error(`Duplicate ${collection} ID`);
      ids[collection].add(row.id);
    }
  }
  // Every row is an allowlisted set of scalar fields; never pass objects into D1.
  for (const row of [value.project, value.property, value.legacyCase, ...collections.flatMap((key) => value[key])]) {
    if (row == null) continue;
    if (typeof row !== "object" || Array.isArray(row)) throw new Error("Invalid case record");
    if (Object.values(row).some((field) => field !== null && !["string", "number", "boolean"].includes(typeof field))) throw new Error("Invalid case field");
  }
  for (const row of value.evidence) {
    if (row.filePath && (!row.filePath.startsWith("files/") || !entries[row.filePath])) throw new Error("Missing evidence file");
  }
  const links = { evidenceId: "evidence", sourceEvidenceId: "evidence", proofEvidenceId: "evidence", sourceDocumentId: "evidence", runId: "workflowRuns", authorizationId: "workflowAuthorizations" };
  for (const collection of collections) for (const row of value[collection]) {
    for (const [field, target] of Object.entries(links)) if (row[field] && !ids[target].has(row[field])) throw new Error(`Unknown ${field} reference`);
  }
  return { manifest: value as CaseFileManifest, entries };
}
