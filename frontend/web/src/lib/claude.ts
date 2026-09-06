/**
 * Server-only Claude client for FairProcessMaps.
 *
 * The deterministic analysis engine remains the source of procedural facts.
 * Claude is a synthesis layer: it identifies patterns, contradictions,
 * missing evidence, and possible lines of inquiry without rendering a legal
 * conclusion as fact.
 */

export interface ClaudeBindingEnv {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_API_URL?: string;
}

export interface ClaudeCaseReview {
  summary: string;
  established_facts: string[];
  procedural_observations: string[];
  contradictions: string[];
  missing_evidence: string[];
  questions_to_verify: string[];
  potential_arguments: string[];
  confidence: "low" | "medium" | "high";
}

const SYSTEM_PROMPT = `You are the evidence-analysis layer for FairProcessMaps.

Your job is to synthesize supplied case records, not to invent facts and not to render a legal conclusion as established truth.

STRICT TRUST BOUNDARIES:
- A fact must be traceable to supplied evidence or structured records.
- A procedural observation is an evidence-backed observation about sequence, timing, contradiction, absence, or uncertainty.
- A legal analysis or potential argument is a hypothesis for human review, not a conclusion.
- If the record is insufficient, say so explicitly.
- Never claim that a government action is unlawful, void, invalid, unconstitutional, or a due-process violation as an established fact.
- Do not fabricate statutes, citations, dates, documents, people, or agency actions.

Return ONLY valid JSON matching the requested shape.`;

function getBinding(env: ClaudeBindingEnv, key: keyof ClaudeBindingEnv): string | null {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Generic single-turn Claude call.
 *
 * Extracted from synthesizeCaseReview so callers that need a different schema
 * (the policy compiler, for one) share one transport, one set of bindings, and
 * one place where temperature is pinned to 0. Returns raw text; parsing and
 * validation are the caller's job, because each caller's schema differs and
 * validation is where the safety lives.
 */
export async function callClaude(
  env: ClaudeBindingEnv,
  opts: { system: string; user: string; maxTokens?: number },
): Promise<string> {
  const apiKey = getBinding(env, "ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const model = getBinding(env, "ANTHROPIC_MODEL") ?? "claude-sonnet-4-5-20250929";
  const apiUrl = getBinding(env, "ANTHROPIC_API_URL") ?? "https://api.anthropic.com/v1/messages";

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 3500,
      temperature: 0,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const payload = (await response.json()) as {
    content?: { type?: string; text?: string }[];
  };
  const text = payload.content?.find((part) => part.type === "text")?.text?.trim();
  if (!text) throw new Error("Claude returned no text content");
  return text;
}

export interface ClaudeImage {
  /** Raw image bytes. */
  data: Uint8Array;
  /** image/jpeg | image/png | image/gif | image/webp */
  mediaType: string;
}

/**
 * A source document handed to Claude for reading.
 *
 * PDFs go up as native `document` blocks rather than being parsed locally.
 * That matters a lot here: Cloudflare Workers cannot realistically run pdf.js
 * or pdfkit, so local PDF parsing was never an option — and the native block
 * handles scanned PDFs too, since the model reads them visually. It removes an
 * entire class of dependency from the intake path.
 */
export interface ClaudeDocument {
  data: Uint8Array;
  /** application/pdf, or any supported image media type. */
  mediaType: string;
}

function toBase64(bytes: Uint8Array): string {
  // Chunked to avoid blowing the argument limit on large scans.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Multimodal Claude call — images plus a text instruction.
 *
 * Exists because the people this product serves photograph their notices. They
 * do not arrive as tidy machine-readable text; they arrive as phone pictures of
 * paper, sometimes skewed, sometimes shadowed. A pipeline that only reads
 * text/* files is a pipeline that cannot read the actual evidence.
 *
 * Images are sent in order and referred to by position, so a caller can pass
 * the pages of one document and have them read as a single record.
 */
/**
 * Read source documents — PDFs and images together — with one instruction.
 *
 * Prefer this over callClaudeVision for anything that might be a PDF. Pages are
 * labelled by position so extracted facts can cite which page they came from.
 */
export async function callClaudeDocuments(
  env: ClaudeBindingEnv,
  opts: { system: string; user: string; documents: ClaudeDocument[]; maxTokens?: number },
): Promise<string> {
  const apiKey = getBinding(env, "ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  if (opts.documents.length === 0) {
    throw new Error("callClaudeDocuments requires at least one document");
  }

  const model = getBinding(env, "ANTHROPIC_MODEL") ?? "claude-sonnet-4-5-20250929";
  const apiUrl = getBinding(env, "ANTHROPIC_API_URL") ?? "https://api.anthropic.com/v1/messages";

  const content: Record<string, unknown>[] = [];
  opts.documents.forEach((doc, i) => {
    content.push({ type: "text", text: `--- DOCUMENT ${i + 1} ---` });
    content.push({
      // PDFs use the document block; everything else is an image block.
      type: doc.mediaType === "application/pdf" ? "document" : "image",
      source: {
        type: "base64",
        media_type: doc.mediaType,
        data: toBase64(doc.data),
      },
    });
  });
  content.push({ type: "text", text: opts.user });

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: 0,
      system: opts.system,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude document request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const payload = (await response.json()) as { content?: { type?: string; text?: string }[] };
  const text = payload.content?.find((p) => p.type === "text")?.text?.trim();
  if (!text) throw new Error("Claude returned no text content");
  return text;
}

export async function callClaudeVision(
  env: ClaudeBindingEnv,
  opts: { system: string; user: string; images: ClaudeImage[]; maxTokens?: number },
): Promise<string> {
  const apiKey = getBinding(env, "ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  if (opts.images.length === 0) throw new Error("callClaudeVision requires at least one image");

  const model = getBinding(env, "ANTHROPIC_MODEL") ?? "claude-sonnet-4-5-20250929";
  const apiUrl = getBinding(env, "ANTHROPIC_API_URL") ?? "https://api.anthropic.com/v1/messages";

  const content: Record<string, unknown>[] = [];
  opts.images.forEach((img, i) => {
    // Label each page so the model can cite which page a fact came from.
    content.push({ type: "text", text: `--- PAGE ${i + 1} ---` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: toBase64(img.data) },
    });
  });
  content.push({ type: "text", text: opts.user });

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: 0,
      system: opts.system,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude vision request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const payload = (await response.json()) as { content?: { type?: string; text?: string }[] };
  const text = payload.content?.find((p) => p.type === "text")?.text?.trim();
  if (!text) throw new Error("Claude returned no text content");
  return text;
}

export async function synthesizeCaseReview(
  env: ClaudeBindingEnv,
  context: {
    caseRecord: Record<string, unknown>;
    evidence: Record<string, unknown>[];
    timeline: Record<string, unknown>[];
    findings: Record<string, unknown>[];
  },
): Promise<ClaudeCaseReview> {
  const apiKey = getBinding(env, "ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const model = getBinding(env, "ANTHROPIC_MODEL") ?? "claude-sonnet-4-5-20250929";
  const apiUrl = getBinding(env, "ANTHROPIC_API_URL") ?? "https://api.anthropic.com/v1/messages";

  const userPrompt = `Analyze this case record.

CASE:
${JSON.stringify(context.caseRecord)}

EVIDENCE:
${JSON.stringify(context.evidence)}

TIMELINE:
${JSON.stringify(context.timeline)}

DETERMINISTIC FINDINGS:
${JSON.stringify(context.findings)}

Return JSON with exactly these keys:
{
  "summary": string,
  "established_facts": string[],
  "procedural_observations": string[],
  "contradictions": string[],
  "missing_evidence": string[],
  "questions_to_verify": string[],
  "potential_arguments": string[],
  "confidence": "low" | "medium" | "high"
}

Keep every item concise and grounded in the supplied record.`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 3500,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const payload = await response.json() as {
    content?: { type?: string; text?: string }[];
  };
  const text = payload.content?.find((part) => part.type === "text")?.text?.trim();
  if (!text) throw new Error("Claude returned no text content");

  const jsonText = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Claude returned invalid JSON");
  }

  if (!parsed || typeof parsed !== "object") throw new Error("Claude returned an invalid review object");
  const result = parsed as Record<string, unknown>;
  const arrayFields = [
    "established_facts",
    "procedural_observations",
    "contradictions",
    "missing_evidence",
    "questions_to_verify",
    "potential_arguments",
  ];
  for (const field of arrayFields) {
    if (!Array.isArray(result[field]) || !result[field].every((item) => typeof item === "string")) {
      throw new Error(`Claude review field ${field} is invalid`);
    }
  }
  if (typeof result.summary !== "string") throw new Error("Claude review summary is invalid");
  if (!["low", "medium", "high"].includes(String(result.confidence))) {
    throw new Error("Claude review confidence is invalid");
  }

  return {
    summary: result.summary as string,
    established_facts: result.established_facts as string[],
    procedural_observations: result.procedural_observations as string[],
    contradictions: result.contradictions as string[],
    missing_evidence: result.missing_evidence as string[],
    questions_to_verify: result.questions_to_verify as string[],
    potential_arguments: result.potential_arguments as string[],
    confidence: result.confidence as "low" | "medium" | "high",
  };
}
