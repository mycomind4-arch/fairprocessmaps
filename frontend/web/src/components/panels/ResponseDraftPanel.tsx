"use client";

import { useEffect, useState } from "react";
import { FileSignature, Loader2, Save, Printer } from "lucide-react";

type Argument = { title: string; description: string; statutoryRef?: string };
type Finding = { rule: string; rule_name?: string | null; detail?: string | null; status: string };

export default function ResponseDraftPanel({ caseId }: { caseId: string }) {
  const [arguments_, setArguments] = useState<Argument[]>([]);
  const [title, setTitle] = useState("Response to Notice / Enforcement Action");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("Request for review and correction of procedural record");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/v1/findings?projectId=${encodeURIComponent(caseId)}`, { headers: { "Cache-Control": "no-cache" } })
      .then(r => r.ok ? r.json() as Promise<{ items?: Finding[] }> : Promise.reject(new Error("Could not load findings")))
      .then(({ items = [] }) => {
        const args = items.filter(f => f.status === "open").map(f => ({
          title: f.rule_name || f.rule.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          description: f.detail || "The case record contains a finding requiring clarification.",
          statutoryRef: f.rule.startsWith("statute_") ? f.rule_name ?? undefined : undefined,
        }));
        setArguments(args); setBody(buildDraft(args));
      })
      .catch(err => setError(err instanceof Error ? err.message : "Could not load findings"));
  }, [caseId]);

  async function saveDraft() {
    setSaving(true); setSaved(false); setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/response-drafts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, recipient_name: recipient || undefined, subject, body }) });
      const json = await res.json() as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? "Could not save draft");
      setSaved(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save draft"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-3 rounded-xl surface-flat p-4 border border-fp-border" role="region" aria-label="Response Draft">
      <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-fp-text flex items-center gap-2"><FileSignature className="w-4 h-4 text-fp-blue" />Response Draft</h3><p className="text-xs text-fp-text-muted mt-0.5">Human-reviewable work product. Nothing is mailed until explicitly authorized.</p></div><button onClick={() => window.print()} className="p-2 rounded-lg bg-fp-surface-2 border border-fp-border text-fp-text-muted hover:text-fp-text" title="Print or save as PDF" aria-label="Print or save as PDF"><Printer className="w-4 h-4" /></button></div>
      <div className="text-xs text-fp-text-dim">Built from {arguments_.length} open findings. Review every statement against the evidence before sending.</div>
      <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-fp-text-muted">Document title<input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full rounded-lg bg-fp-surface-2 border border-fp-border px-3 py-2 text-sm text-fp-text" /></label><label className="text-xs text-fp-text-muted">Recipient<input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Agency / hearing officer" className="mt-1 w-full rounded-lg bg-fp-surface-2 border border-fp-border px-3 py-2 text-sm text-fp-text" /></label></div>
      <label className="block text-xs text-fp-text-muted">Subject<input value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 w-full rounded-lg bg-fp-surface-2 border border-fp-border px-3 py-2 text-sm text-fp-text" /></label>
      <label className="block text-xs text-fp-text-muted">Response<textarea value={body} onChange={e => setBody(e.target.value)} rows={16} className="mt-1 w-full rounded-lg bg-fp-surface-2 border border-fp-border px-3 py-2 text-sm leading-6 text-fp-text resize-y" /></label>
      {error && <div className="text-xs text-fp-red bg-fp-red/10 border border-fp-red/30 rounded-lg px-3 py-2">{error}</div>}{saved && <div className="text-xs text-fp-green bg-fp-green/10 border border-fp-green/30 rounded-lg px-3 py-2">Draft saved to this case.</div>}
      <div className="flex justify-end"><button onClick={saveDraft} disabled={saving || !body.trim()} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save to Case</button></div>
    </div>
  );
}

function buildDraft(args: Argument[]) {
  const lines = ["To Whom It May Concern,", "", "I am writing regarding the matter identified above and request review of the agency record, the sequence of procedural actions, and any action taken against the property.", "", "Based on the evidence currently assembled in this case, the following issues require clarification:", ""];
  args.forEach((a, i) => { lines.push(`${i + 1}. ${a.title}`); lines.push(`   ${a.description}`); if (a.statutoryRef) lines.push(`   Authority to review: ${a.statutoryRef}`); lines.push(""); });
  lines.push("I respectfully request that the agency identify the records and procedural authority supporting each challenged action, provide any omitted notices or hearing records, and correct the record where the documented sequence does not support the action taken.", "", "Please treat this correspondence as a formal request for review and preserve all records relating to this matter.", "", "Sincerely,", "[Your name]");
  return lines.join("\n");
}
