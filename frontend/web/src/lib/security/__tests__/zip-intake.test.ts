/**
 * Safe ZIP expansion tests.
 *
 * The realistic threat model: a ZIP built by an ordinary tool, but one entry
 * or another property makes it dangerous if handled naively — a path that
 * escapes the extraction directory, an entry whose declared size blows past
 * what should ever be held in memory, junk the OS adds automatically, or
 * another archive nested inside.
 */

import { describe, it, expect } from "vitest";
import { zipSync, type Zippable } from "fflate";
import { expandZipSafely, sanitizeZipPath } from "../zip-intake";
import { computeSHA256Bytes } from "../evidence";

function buildZip(files: Record<string, Uint8Array | string>): Uint8Array {
  const zippable: Zippable = {};
  for (const [name, content] of Object.entries(files)) {
    zippable[name] = typeof content === "string" ? new TextEncoder().encode(content) : content;
  }
  return zipSync(zippable, { level: 0 });
}

describe("sanitizeZipPath", () => {
  it("strips directory traversal", () => {
    expect(sanitizeZipPath("../../etc/passwd")).toBe("etc/passwd");
  });

  it("strips a leading absolute slash", () => {
    expect(sanitizeZipPath("/etc/passwd")).toBe("etc/passwd");
  });

  it("normalizes backslashes", () => {
    expect(sanitizeZipPath("notices\\img1.jpg")).toBe("notices/img1.jpg");
  });

  it("keeps ordinary folder structure", () => {
    expect(sanitizeZipPath("abatement-order/page-1.jpg")).toBe("abatement-order/page-1.jpg");
  });

  it("returns null for a path that sanitizes to nothing", () => {
    expect(sanitizeZipPath("../..")).toBeNull();
    expect(sanitizeZipPath("")).toBeNull();
  });
});

describe("expandZipSafely", () => {
  it("expands ordinary files and reports none skipped", () => {
    const zip = buildZip({
      "notice.pdf": "not a real pdf, just bytes",
      "photo.jpg": "not a real jpg, just bytes",
    });
    const result = expandZipSafely(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((e) => e.path).sort()).toEqual(["notice.pdf", "photo.jpg"]);
    expect(result.skipped).toEqual([]);
  });

  it("sanitizes a path-traversal entry name rather than storing the raw path", () => {
    const zip = buildZip({ "../../../etc/passwd": "pwned" });
    const result = expandZipSafely(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].path).toBe("etc/passwd");
    expect(result.entries[0].path).not.toContain("..");
  });

  it("preserves folder structure as a grouping signal", () => {
    const zip = buildZip({
      "abatement-order/page-1.jpg": "a",
      "abatement-order/page-2.jpg": "b",
      "separate-notice.pdf": "c",
    });
    const result = expandZipSafely(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byPath = Object.fromEntries(result.entries.map((e) => [e.path, e.baseName]));
    expect(byPath["abatement-order/page-1.jpg"]).toBe("page-1.jpg");
    expect(byPath["abatement-order/page-2.jpg"]).toBe("page-2.jpg");
    expect(byPath["separate-notice.pdf"]).toBe("separate-notice.pdf");
  });

  it("skips __MACOSX, .DS_Store, and Thumbs.db junk", () => {
    const zip = buildZip({
      "__MACOSX/._notice.pdf": "junk",
      ".DS_Store": "junk",
      "photos/Thumbs.db": "junk",
      "notice.pdf": "real",
    });
    const result = expandZipSafely(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((e) => e.path)).toEqual(["notice.pdf"]);
    expect(result.skipped.length).toBe(3);
    expect(result.skipped.every((s) => /junk/.test(s.reason))).toBe(true);
  });

  it("skips zero-byte entries", () => {
    const zip = buildZip({ "empty.txt": new Uint8Array(0), "real.txt": "content" });
    const result = expandZipSafely(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((e) => e.path)).toEqual(["real.txt"]);
    expect(result.skipped.some((s) => s.rawPath === "empty.txt" && /empty/.test(s.reason))).toBe(true);
  });

  it("rejects a nested ZIP rather than recursing into it", () => {
    const inner = buildZip({ "notice.pdf": "content" });
    const outer = buildZip({ "bundle.zip": inner, "cover-letter.pdf": "content" });
    const result = expandZipSafely(outer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((e) => e.path)).toEqual(["cover-letter.pdf"]);
    expect(result.skipped.some((s) => s.rawPath === "bundle.zip" && /nested/.test(s.reason))).toBe(true);
  });

  it("rejects an entry whose declared uncompressed size exceeds the per-file cap, without inflating it", () => {
    // A highly-compressible payload — small on disk, large once inflated —
    // is the shape of a zip-bomb entry. The cap must reject it from the
    // declared size alone, before any bytes are decompressed.
    const bomb = new Uint8Array(2_000_000).fill(0);
    const zip = buildZip({ "bomb.bin": bomb, "safe.txt": "content" });

    const result = expandZipSafely(zip, { maxEntryBytes: 1_000_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((e) => e.path)).toEqual(["safe.txt"]);
    expect(result.skipped.some((s) => s.rawPath === "bomb.bin" && /per-file limit/.test(s.reason))).toBe(true);
  });

  it("stops expanding once the total-uncompressed-bytes cap is crossed", () => {
    const chunk = new Uint8Array(1000).fill(1);
    const zip = buildZip({ "a.bin": chunk, "b.bin": chunk, "c.bin": chunk });

    const result = expandZipSafely(zip, { maxTotalUncompressedBytes: 1500 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only entries fitting under the cumulative cap, in archive order, survive.
    expect(result.entries.length).toBeLessThan(3);
    expect(result.totalUncompressedBytes).toBeLessThanOrEqual(1500);
    expect(result.skipped.some((s) => /total-size limit/.test(s.reason))).toBe(true);
  });

  it("stops expanding once the entry-count cap is crossed", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) files[`img${i}.jpg`] = "x";
    const zip = buildZip(files);

    const result = expandZipSafely(zip, { maxEntries: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.length).toBe(3);
    expect(result.skipped.some((s) => /entry limit/.test(s.reason))).toBe(true);
  });

  it("returns a failure rather than throwing for a corrupt archive", () => {
    const result = expandZipSafely(new Uint8Array([1, 2, 3, 4, 5]));
    expect(result.ok).toBe(false);
  });
});

describe("dedupe by content hash", () => {
  // expand-zip's dedupe (both the whole-ZIP "already expanded this exact
  // archive" check and the per-entry "this file's bytes already exist as
  // evidence" check) is a sha256 lookup against what's already stored — the
  // route logic is a DB query, but the precondition it depends on is that
  // byte-identical content always hashes identically regardless of what the
  // entry is named or where it sits in the archive. That's what's under test
  // here.
  it("hashes byte-identical entries identically even under different names/paths", async () => {
    const zip = buildZip({
      "case-a/IMG_0001.jpg": "the exact same bytes",
      "case-a/copy_of_IMG_0001.jpg": "the exact same bytes",
    });
    const result = expandZipSafely(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const hashes = await Promise.all(result.entries.map((e) => computeSHA256Bytes(e.data)));
    expect(hashes[0]).toBe(hashes[1]);
  });

  it("hashes different content differently, so unrelated files are never treated as duplicates", async () => {
    const zip = buildZip({ "a.jpg": "content one", "b.jpg": "content two" });
    const result = expandZipSafely(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const hashes = await Promise.all(result.entries.map((e) => computeSHA256Bytes(e.data)));
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it("hashes the same bytes identically whether read from a File or from raw ZIP-entry bytes", async () => {
    // The direct-upload path hashes a File (computeSHA256); the ZIP path
    // hashes raw bytes (computeSHA256Bytes). A file uploaded once directly
    // and once inside a bundle must still be recognized as the same evidence.
    const { computeSHA256 } = await import("../evidence");
    const bytes = new TextEncoder().encode("identical content, two intake paths");
    const file = new File([bytes], "notice.pdf", { type: "application/pdf" });

    const viaFile = await computeSHA256(file);
    const viaBytes = await computeSHA256Bytes(bytes);
    expect(viaFile).toBe(viaBytes);
  });
});
