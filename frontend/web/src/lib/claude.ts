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

  const model = getBinding(env, "ANTHROPIC_MODEL") ?? "claude-sonnet-4-20250514";
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
