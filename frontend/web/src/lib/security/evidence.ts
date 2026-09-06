/**
 * Evidence security helpers — Phase 1D.
 *
 * Enforces:
 *   - SHA-256 hash on upload
 *   - MIME type allowlist
 *   - Maximum file size
 *   - Filename sanitization
 *   - Safe R2 object keys (never use file.name for storage paths)
 *   - Evidence immutability (withdraw instead of delete)
 */

import type { AuthUser, Actor } from "./types";

// ── Constants ───────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const ALLOWED_MIME_TYPES = new Set<string>([
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "application/json",
  "application/xml",
  "text/xml",
  "text/html",
  "text/markdown",
  "application/rtf",
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/tiff",
  "image/bmp",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  // Video (capped by file size)
  "video/mp4",
  "video/quicktime",
  // Archives (for batch uploads)
  "application/zip",
]);

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationSuccess {
  ok: true;
  contentType: string;
  file: File;
}

export interface ValidationFailure {
  ok: false;
  error: string;
  status: number;
}

/** Extension fallback for browsers (and archive entries) that don't carry a
 * reliable MIME type. Shared between direct upload and ZIP-entry expansion so
 * both apply the same allowlist logic. */
export const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  htm: "text/html",
  html: "text/html",
  md: "text/markdown",
  rtf: "application/rtf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  mov: "video/quicktime",
  zip: "application/zip",
};

/** Resolve a filename to an allowlisted MIME type, or null if none applies. */
export function resolveAllowedMimeType(providedType: string, fileName: string): string | null {
  if (providedType && ALLOWED_MIME_TYPES.has(providedType)) return providedType;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const byExt = EXTENSION_TO_MIME[ext];
  if (byExt && ALLOWED_MIME_TYPES.has(byExt)) return byExt;
  return null;
}

export function validateUpload(file: File): ValidationSuccess | ValidationFailure {
  // Size check
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      status: 413,
    };
  }

  if (file.size === 0) {
    return { ok: false, error: "File is empty", status: 400 };
  }

  const resolved = resolveAllowedMimeType(file.type, file.name);
  if (!resolved) {
    return {
      ok: false,
      error: `File type '${file.type || "unknown"}' is not allowed`,
      status: 415,
    };
  }

  return { ok: true, contentType: resolved, file };
}

// ── Filename sanitization ──────────────────────────────────────────────────────

export function sanitizeFilename(filename: string): string {
  // Remove path components — only keep the base name
  const base = filename.split("/").pop()?.split("\\").pop() ?? filename;

  // Replace dangerous characters
  const cleaned = base
    .replace(/[^\w.\- ]/g, "_") // non-word chars → underscore
    .replace(/\s+/g, "_")       // spaces → underscore
    .replace(/\.{2,}/g, ".")    // no directory traversal via ..
    .slice(0, 200);              // cap length

  return cleaned || "unnamed_file";
}

// ── Safe R2 key ────────────────────────────────────────────────────────────────

export function safeR2Key(
  organizationId: string,
  evidenceId: string,
  originalFilename: string,
): string {
  const safeName = sanitizeFilename(originalFilename);
  // Never use the raw filename as a path — structure by org + evidence ID
  return `evidence/${organizationId}/${evidenceId}/${safeName}`;
}

// ── SHA-256 hash ───────────────────────────────────────────────────────────────

export async function computeSHA256(file: File): Promise<string> {
  return computeSHA256Bytes(await file.arrayBuffer());
}

/**
 * Same hash, for bytes that never went through a File object — ZIP entries
 * unpacked in-memory, for instance.
 */
export async function computeSHA256Bytes(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = data instanceof Uint8Array ? data.slice().buffer : data;
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Evidence status ────────────────────────────────────────────────────────────

export const EVIDENCE_WITHDRAWN = "withdrawn";

export function isWithdrawn(record: { withdrawn?: number; status?: string }): boolean {
  return record.withdrawn === 1 || record.status === EVIDENCE_WITHDRAWN;
}
