/**
 * Evidence AI Summary Generator
 *
 * Generates a structured summary from extracted evidence text.
 * This is a rule-based summarizer that extracts key phrases, dates, and
 * legal references — designed to work on Cloudflare Workers without an LLM API.
 *
 * Can be extended later with an LLM call by replacing `generateSummary()`.
 */

/**
 * Generate a summary from extracted text.
 *
 * Extracts:
 * - Key sentences containing legal/procedural terms
 * - Dates mentioned in the text
 * - Legal references (code sections, statute citations)
 * - Overall topic classification
 *
 * @param text - The extracted text from the evidence file (max ~50k chars)
 * @param filename - Original filename for context
 * @returns A concise summary string, or null if text is too short
 */
export function generateSummary(text: string | null, filename?: string): string | null {
  if (!text || text.trim().length < 20) {
    return null;
  }

  const cleanText = text.trim();
  const lines = cleanText.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const sentences = cleanText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  const parts: string[] = [];

  // ── Document type classification ──
  const lowerText = cleanText.toLowerCase();
  const docTypes: string[] = [];
  if (lowerText.includes("notice") && (lowerText.includes("violation") || lowerText.includes("compliance"))) {
    docTypes.push("Notice of Violation");
  }
  if (lowerText.includes("hearing") && (lowerText.includes("schedule") || lowerText.includes("conduct"))) {
    docTypes.push("Hearing Notice");
  }
  if (lowerText.includes("appeal") && lowerText.includes("file")) {
    docTypes.push("Appeal Document");
  }
  if (lowerText.includes("permit") && (lowerText.includes("application") || lowerText.includes("issued"))) {
    docTypes.push("Permit Document");
  }
  if (lowerText.includes("lien")) {
    docTypes.push("Lien Document");
  }
  if (lowerText.includes("abatement") && lowerText.includes("notice")) {
    docTypes.push("Abatement Notice");
  }
  if (lowerText.includes("summons") || lowerText.includes("complaint")) {
    docTypes.push("Legal Complaint");
  }
  if (docTypes.length === 0 && filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "pdf" || ext === "doc" || ext === "docx") {
      docTypes.push("Official Document");
    } else {
      docTypes.push("Text Document");
    }
  }

  if (docTypes.length > 0) {
    parts.push(`Document type: ${docTypes.join(", ")}.`);
  }

  // ── Extract legal references ──
  const legalRefs = new Set<string>();
  // Match patterns like "HCC § 123-4", "Gov. Code § 53069.4", "H&S Code § 17980"
  const refPattern = /(?:HCC|Humboldt County Code|Gov\.?\s*Code|Health\s*(?:and|&)\s*Safety\s*Code|H&S\s*Code|Cal\.\s*Gov\.?\s*Code)\s*[§]\s*[\d.\-]+/gi;
  const matches = cleanText.match(refPattern);
  if (matches) {
    for (const m of matches) {
      legalRefs.add(m.trim());
    }
  }

  // Also match standalone section references
  const sectionPattern = /\bsection\s+\d+[\-.]\d+(?:\.\d+)?/gi;
  const sectionMatches = cleanText.match(sectionPattern);
  if (sectionMatches) {
    for (const m of sectionMatches.slice(0, 5)) {
      legalRefs.add(m.trim());
    }
  }

  if (legalRefs.size > 0) {
    parts.push(`Legal references: ${Array.from(legalRefs).slice(0, 5).join(", ")}.`);
  }

  // ── Extract dates ──
  const dates = new Set<string>();
  const datePattern = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,)?\s*\d{4}/gi;
  const dateMatches = cleanText.match(datePattern);
  if (dateMatches) {
    for (const d of dateMatches.slice(0, 5)) {
      dates.add(d);
    }
  }

  if (dates.size > 0) {
    parts.push(`Key dates: ${Array.from(dates).join(", ")}.`);
  }

  // ── Extract key sentences (procedural terms) ──
  const proceduralTerms = [
    "notice", "hearing", "appeal", "compliance", "violation", "permit",
    "deadline", "abatement", "enforcement", "decision", "fine", "penalty",
    "lien", "demolition", "inspection", "condemn", "evict", "revoke",
  ];

  const keySentences = sentences
    .filter((s) => {
      const lower = s.toLowerCase();
      return proceduralTerms.some((term) => lower.includes(term));
    })
    .slice(0, 3);

  if (keySentences.length > 0) {
    // Truncate each sentence to 200 chars
    const truncated = keySentences.map((s) =>
      s.length > 200 ? s.slice(0, 200) + "…" : s
    );
    parts.push(`Key content: ${truncated.join(" ")}`);
  }

  // ── Word count summary ──
  const wordCount = cleanText.split(/\s+/).length;
  if (parts.length === 0) {
    // Fallback: just use the first meaningful sentence
    const firstSentence = sentences.find((s) => s.length > 15 && s.length < 300);
    if (firstSentence) {
      parts.push(`Summary: ${firstSentence.slice(0, 250)}`);
    } else {
      parts.push(`Text document (${wordCount} words). No key procedural terms detected.`);
    }
  }

  // Add word count context
  parts.push(`(${wordCount.toLocaleString()} words extracted)`);

  return parts.join(" ");
}
