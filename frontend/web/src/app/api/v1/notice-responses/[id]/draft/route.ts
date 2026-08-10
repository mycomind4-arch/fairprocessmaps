import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";

export const runtime = "nodejs";

const SYSTEM = `You draft formal responses to government or organizational notices for human review.
Never invent facts, dates, citations, attachments, admissions, legal conclusions, or promises. Use only supplied notice analysis and user facts. If a fact is missing, use a clear bracketed placeholder. Do not state that an agency acted unlawfully. The draft should be concise, respectful, specific, and preserve the sender's position without unnecessary admissions.
Return JSON: {"subject": string, "body": string, "open_questions": string[]}.`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = await req.json() as { user_facts?: string; desired_outcome?: string };
    const { env } = getCloudflareContext();
    const row: any = await env.DB.prepare(`SELECT * FROM notice_responses WHERE id = ? AND organization_id = ? LIMIT 1`).bind(id, auth.user.organization_id).first();
    if (!row) return NextResponse.json({ error: "Notice response not found" }, { status: 404 });
    if (!row.analysis_json) return NextResponse.json({ error: "Analyze the notice before drafting." }, { status: 409 });
    const key = env.ANTHROPIC_API_KEY;
    if (!key) return NextResponse.json({ error: "AI drafting is not configured." }, { status: 503 });

    const response = await fetch(env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 3500,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: "user", content: `NOTICE ANALYSIS:\n${row.analysis_json}\n\nNOTICE TEXT:\n${String(row.notice_text || "").slice(0, 80000)}\n\nUSER FACTS:\n${String(body.user_facts || "").slice(0, 20000)}\n\nDESIRED OUTCOME:\n${String(body.desired_outcome || "").slice(0, 5000)}` }],
      }),
    });
    if (!response.ok) throw new Error(`Claude draft request failed (${response.status})`);
    const payload = await response.json() as { content?: { type?: string; text?: string }[] };
    const text = payload.content?.find((p) => p.type === "text")?.text?.trim();
    if (!text) throw new Error("Claude returned no draft");
    const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim()) as { subject: string; body: string; open_questions: string[] };
    if (!parsed.subject || !parsed.body || !Array.isArray(parsed.open_questions)) throw new Error("Invalid draft response");

    const now = new Date().toISOString();
    const draftId = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO response_drafts (id, case_id, organization_id, title, recipient_name, recipient_address1, recipient_address2, recipient_city, recipient_state, recipient_postal_code, recipient_country, subject, body, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'US', ?, ?, 'draft', ?, ?, ?)`)
      .bind(draftId, row.case_id, auth.user.organization_id, parsed.subject, row.recipient_name, row.recipient_address1, row.recipient_address2, row.recipient_city, row.recipient_state, row.recipient_postal_code, parsed.subject, parsed.body, auth.user.id, now, now).run();

    await env.DB.prepare(`UPDATE notice_responses SET response_status = 'drafted', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(now, id, auth.user.organization_id).run();
    return NextResponse.json({ draft: { id: draftId, subject: parsed.subject, body: parsed.body }, open_questions: parsed.open_questions });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
