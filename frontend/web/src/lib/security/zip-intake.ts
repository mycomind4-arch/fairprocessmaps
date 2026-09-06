/**
 * Safe expansion of an uploaded ZIP bundle.
 *
 * People hand over a case file the way they received it: a folder of scans and
 * phone photos, zipped up by whatever tool was closest. Reading that means
 * unzipping it — and unzipping something a stranger built is exactly the kind
 * of operation this file exists to make boring.
 *
 * Three things `unzipSync` will happily do if we let it:
 *
 *   1. Decompress a zip bomb into memory. A ZIP's central directory declares
 *      each entry's uncompressed size before any bytes are inflated, so we use
 *      `fflate`'s `filter` callback to reject entries by that declared size
 *      *before* decompression — never inflating past the caps below. (A
 *      maliciously false declared size that undercounts the real output is a
 *      known residual risk of any size check performed pre-inflation; the caps
 *      here are the standard mitigation, not a hermetic guarantee.)
 *   2. Hand back whatever path the archive claims for an entry, including
 *      `../../etc/passwd`. Every path is sanitized before it is used for
 *      anything.
 *   3. Contain another ZIP. We do not recurse — a nested archive is skipped,
 *      not expanded.
 *
 * This module only decides what gets extracted and what its safe name is. It
 * does not touch R2 or D1 — the route wires storage and dedupe around it.
 */

import { unzipSync, type UnzipFileInfo } from "fflate";

/** Reuse the platform's per-file cap so a ZIP entry can't smuggle in a file
 * larger than a direct upload would ever be allowed to be. */
export const DEFAULT_MAX_ENTRY_BYTES = 50 * 1024 * 1024; // 50MB, matches MAX_FILE_SIZE

/** A 40-file case bundle is normal; a 200-file one is already unusual or a
 * misclick. Past that, the grouping and review UI stop being usable anyway. */
export const DEFAULT_MAX_ENTRIES = 200;

/** Total inflated bytes across the whole archive. */
export const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 500 * 1024 * 1024; // 500MB

const JUNK_NAMES = new Set(["__macosx", ".ds_store", "thumbs.db", "desktop.ini"]);

export interface ZipExpansionLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalUncompressedBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipExpansionLimits = {
  maxEntries: DEFAULT_MAX_ENTRIES,
  maxEntryBytes: DEFAULT_MAX_ENTRY_BYTES,
  maxTotalUncompressedBytes: DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES,
};

export interface ExpandedZipEntry {
  /** Sanitized, forward-slash path relative to the archive root. No leading
   * slash, no ".." segments, no junk directories. Used as the grouping
   * signal's folder structure. */
  path: string;
  /** Basename only, sanitized — this is what becomes the evidence title. */
  baseName: string;
  data: Uint8Array;
}

export interface SkippedZipEntry {
  /** The raw, unsanitized path as the archive declared it — kept only for a
   * human-readable skip report, never used for storage or lookups. */
  rawPath: string;
  reason: string;
}

export interface ZipExpansionResult {
  ok: true;
  entries: ExpandedZipEntry[];
  skipped: SkippedZipEntry[];
  totalUncompressedBytes: number;
}

export interface ZipExpansionFailure {
  ok: false;
  error: string;
}

/**
 * Turn an archive-declared path into something safe to store and display.
 *
 * Strips traversal (`..`), absolute-path leading slashes, backslashes, and
 * empty segments, but keeps the folder structure — a ZIP delivered as one
 * folder per document is a grouping signal the caller should not have to
 * rediscover from filenames alone.
 */
export function sanitizeZipPath(rawPath: string): string | null {
  const segments = rawPath
    .split(/[\\/]+/)
    .map((s) => s.trim())
    // Strip control characters and null bytes a crafted archive might embed.
    .map((s) => s.replace(/[\x00-\x1f]/g, ""))
    .filter((s) => s.length > 0 && s !== "." && s !== "..");

  if (segments.length === 0) return null;

  // Cap each segment's length so a pathological name can't blow out a storage
  // key or a UI row.
  const capped = segments.map((s) => s.slice(0, 150));
  return capped.join("/");
}

function isJunkPath(segments: string[]): boolean {
  return segments.some((s) => JUNK_NAMES.has(s.toLowerCase()));
}

/**
 * Expand a ZIP's bytes into individually-readable entries.
 *
 * Never throws for a merely-oversized or partially-junk archive — those are
 * ordinary situations reflected in `skipped`. Throws only for a corrupt
 * archive that cannot be parsed at all, which the caller turns into an error
 * response.
 */
export function expandZipSafely(
  data: Uint8Array,
  limits: Partial<ZipExpansionLimits> = {},
): ZipExpansionResult | ZipExpansionFailure {
  const { maxEntries, maxEntryBytes, maxTotalUncompressedBytes } = {
    ...DEFAULT_ZIP_LIMITS,
    ...limits,
  };

  const skipped: SkippedZipEntry[] = [];
  let acceptedCount = 0;
  let totalBytes = 0;
  // Once true, an aggregate cap has already been reported once; stay quiet
  // for the remaining entries instead of repeating the same skip reason for
  // every one of them.
  let aggregateCapHit = false;

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter(file: UnzipFileInfo) {
        const rawName = file.name;

        // Directory entries carry a trailing slash and no useful bytes.
        if (rawName.endsWith("/")) return false;

        const segments = rawName.split(/[\\/]+/).filter(Boolean);
        const base = segments[segments.length - 1] ?? "";
        if (!base) return false;

        if (isJunkPath(segments)) {
          skipped.push({ rawPath: rawName, reason: "system/junk file, not evidence" });
          return false;
        }

        if (/\.zip$/i.test(base)) {
          skipped.push({
            rawPath: rawName,
            reason: "nested ZIP archives are rejected rather than expanded recursively",
          });
          return false;
        }

        if (file.originalSize === 0) {
          skipped.push({ rawPath: rawName, reason: "empty file" });
          return false;
        }

        if (file.originalSize > maxEntryBytes) {
          skipped.push({
            rawPath: rawName,
            reason: `exceeds the ${Math.round(maxEntryBytes / 1024 / 1024)}MB per-file limit`,
          });
          return false;
        }

        // Aggregate caps are checked last and are cumulative across the
        // entries seen so far, in central-directory order — this is what
        // keeps a bomb from ever being inflated past the limit.
        if (acceptedCount + 1 > maxEntries) {
          if (!aggregateCapHit) {
            skipped.push({
              rawPath: rawName,
              reason: `archive exceeds the ${maxEntries}-entry limit; remaining entries were not expanded`,
            });
            aggregateCapHit = true;
          }
          return false;
        }

        if (totalBytes + file.originalSize > maxTotalUncompressedBytes) {
          if (!aggregateCapHit) {
            skipped.push({
              rawPath: rawName,
              reason: `archive exceeds the ${Math.round(maxTotalUncompressedBytes / 1024 / 1024)}MB total-size limit; remaining entries were not expanded`,
            });
            aggregateCapHit = true;
          }
          return false;
        }

        acceptedCount += 1;
        totalBytes += file.originalSize;
        return true;
      },
    });
  } catch (err) {
    return { ok: false, error: `Could not read this ZIP archive: ${String(err)}` };
  }

  const entries: ExpandedZipEntry[] = [];
  for (const [rawName, bytes] of Object.entries(files)) {
    const path = sanitizeZipPath(rawName);
    if (!path) {
      skipped.push({ rawPath: rawName, reason: "path could not be sanitized" });
      continue;
    }
    const baseName = path.split("/").pop()!;
    entries.push({ path, baseName, data: bytes });
  }

  return { ok: true, entries, skipped, totalUncompressedBytes: totalBytes };
}
