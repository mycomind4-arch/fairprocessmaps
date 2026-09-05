/**
 * Routes any uploaded file to the right reader.
 *
 * People send what they have: a phone photo of a placard, a scanned PDF from a
 * records request, a Word document from a paralegal, a text file. All of it is
 * evidence and all of it has to land in the same case file.
 *
 * ## Why there is no PDF parser here
 *
 * Cloudflare Workers cannot realistically run pdf.js or pdfkit — which is why
 * `response-pdf.ts` hand-writes PDF bytes rather than using a library. So local
 * PDF parsing was never available.
 *
 * The Anthropic API accepts PDFs as native `document` blocks and reads them
 * directly, scanned ones included. That removes the entire dependency: a PDF is
 * handled by the same call as a photograph, and a scanned PDF needs no separate
 * OCR path. This is the reason the intake surface can be small.
 *
 * DOCX is the one format needing local work, because it is a ZIP of XML and no
 * model reads the container. `fflate` is small and Workers-safe; we unzip,
 * take `word/document.xml`, and strip tags — enough for the text of a letter,
 * which is all a notice ever is.
 */

import type { ClaudeDocument } from "@/lib/claude";

export type IntakeKind = "model_readable" | "text" | "docx" | "unsupported";

export interface RoutedDocument {
  kind: IntakeKind;
  /** Present for model_readable: hand straight to callClaudeDocuments. */
  claudeDocument?: ClaudeDocument;
  /** Present for text/docx: already-extracted text. */
  text?: string;
  /** Why an unsupported file was refused, in words a user can act on. */
  reason?: string;
}

/** Formats Claude reads natively — no local parsing at all. */
const MODEL_READABLE = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/** Formats that are already text. */
const PLAIN_TEXT = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/json",
  "application/xml",
  "text/xml",
]);

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** Legacy binary .doc — genuinely not parseable here; say so plainly. */
const LEGACY_DOC = "application/msword";

/** Anthropic rejects oversized payloads; catch it before the round trip. */
const MAX_MODEL_BYTES = 30 * 1024 * 1024;

/**
 * Normalize a content type, falling back to the file extension.
 *
 * Browsers and phones are unreliable about this — an uploaded PDF often arrives
 * as application/octet-stream, and refusing it on that basis would reject
 * perfectly readable evidence.
 */
export function resolveContentType(contentType: string, fileName: string): string {
  const ct = (contentType || "").toLowerCase().split(";")[0].trim();
  if (ct && ct !== "application/octet-stream" && ct !== "binary/octet-stream") return ct;

  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const byExt: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    xml: "application/xml",
    html: "text/html",
    docx: DOCX,
    doc: LEGACY_DOC,
  };
  return byExt[ext] ?? ct ?? "application/octet-stream";
}

/** Extract readable text from a .docx buffer. */
export async function extractDocxText(data: Uint8Array): Promise<string> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(data);

  // Main body, plus headers/footers, which is where agencies put case numbers.
  const parts: string[] = [];
  for (const name of ["word/document.xml", ...Object.keys(files).filter((f) => /^word\/(header|footer)\d*\.xml$/.test(f))]) {
    const entry = files[name];
    if (!entry) continue;
    parts.push(strFromU8(entry));
  }
  if (parts.length === 0) throw new Error("No document body found inside the .docx container");

  return parts
    .join("\n")
    // Paragraph and line breaks become real breaks before tags are stripped,
    // otherwise the whole letter collapses into one line and dates run together.
    .replace(/<w:p\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br\b[^>]*\/?>/g, "\n")
    .replace(/<w:tab\b[^>]*\/?>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Decide how a file should be read.
 *
 * Never throws for an unreadable file — an unsupported upload is a normal
 * situation with a useful answer ("re-save as PDF"), not an error.
 */
export async function routeDocument(
  data: Uint8Array,
  contentType: string,
  fileName: string,
): Promise<RoutedDocument> {
  const ct = resolveContentType(contentType, fileName);

  if (MODEL_READABLE.has(ct)) {
    if (data.byteLength > MAX_MODEL_BYTES) {
      return {
        kind: "unsupported",
        reason: `This file is ${(data.byteLength / 1024 / 1024).toFixed(1)}MB, above the ${MAX_MODEL_BYTES / 1024 / 1024}MB limit for automated reading. Split it into separate pages, or reduce the scan resolution.`,
      };
    }
    return {
      kind: "model_readable",
      claudeDocument: { data, mediaType: ct === "image/jpg" ? "image/jpeg" : ct },
    };
  }

  if (PLAIN_TEXT.has(ct)) {
    return { kind: "text", text: new TextDecoder().decode(data) };
  }

  if (ct === DOCX) {
    try {
      return { kind: "docx", text: await extractDocxText(data) };
    } catch (err) {
      return {
        kind: "unsupported",
        reason: `This .docx could not be opened (${String(err)}). Re-save it as a PDF and upload that.`,
      };
    }
  }

  if (ct === LEGACY_DOC) {
    return {
      kind: "unsupported",
      reason:
        "Legacy .doc files cannot be read here. Open it in Word or Google Docs and save as PDF or .docx, then upload that.",
    };
  }

  return {
    kind: "unsupported",
    reason: `Files of type ${ct} are not read automatically. Supported: PDF, JPG, PNG, GIF, WebP, DOCX, and plain text. Re-saving as PDF works for almost anything.`,
  };
}

/** True when this file can be read without a model call. */
export function isTextual(routed: RoutedDocument): routed is RoutedDocument & { text: string } {
  return routed.kind === "text" || routed.kind === "docx";
}
