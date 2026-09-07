/**
 * Pure helpers for evidence full-text search
 * (/api/v1/evidence/search) — extracted so they're unit-testable without a
 * D1/NextRequest harness, matching admin-validation.ts's pattern.
 */

const SNIPPET_RADIUS = 120;

/**
 * A short window of text around the first match, so a search result reads
 * as "here's why this document matched" rather than just a bare title.
 * Returns null when there's no text or no match — the caller decides what
 * to show instead (e.g. nothing, or a title-only result).
 */
export function snippetAround(text: string | null, term: string): string | null {
  if (!text || !term) return null;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + term.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

export type MatchLocation = "title" | "ai_summary" | "extracted_text";

/** Which field a query matched in, checked in the order a reader would find
 * most meaningful — the title first, then the summary, then the raw text. */
export function matchedIn(
  query: string,
  fields: { title: string | null; aiSummary: string | null; extractedText: string | null },
): MatchLocation {
  const q = query.toLowerCase();
  if (fields.title?.toLowerCase().includes(q)) return "title";
  if (fields.aiSummary?.toLowerCase().includes(q)) return "ai_summary";
  return "extracted_text";
}
