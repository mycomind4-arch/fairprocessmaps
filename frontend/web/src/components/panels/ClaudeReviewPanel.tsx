"use client";

import { useState } from "react";
import { AlertCircle, Bot, CheckCircle2, FileQuestion, Loader2, RefreshCw, Scale, Search, ShieldAlert } from "lucide-react";

interface Review {
  summary: string;
  established_facts: string[];
  procedural_observations: string[];
  contradictions: string[];
  missing_evidence: string[];
  questions_to_verify: string[];
  potential_arguments: string[];
  confidence: "low" | "medium" | "high";
}

function ListSection({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="surface-flat rounded-xl p-4">
      <h3 className="text-sm font-semibold text-fp-text flex items-center gap-2 mb-3">{icon}{title}</h3>
      <ul className="space-y-2">
        {items.map((item, index) => <li key={`${index}-${item}`} className="text-sm text-fp-text-muted leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-fp-blue">{item}</li>)}
      </ul>
    </section>
  );
}

export default function ClaudeReviewPanel({ caseId }: { caseId: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runReview() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/cases/${caseId}/ai-review`, { method: "POST", headers: { "Cache-Control": "no-cache" } });
      const json = await response.json() as { review?: Review; error?: { message?: string } };
      if (!response.ok || !json.review) throw new Error(json.error?.message ?? `Claude review failed (${response.status})`);
      setReview(json.review);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claude review failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 pb-8" role="region" aria-label="Claude Case Review">
      <div className="glass rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fp-text flex items-center gap-2"><Bot className="w-5 h-5 text-fp-blue" /> Claude Case Review</h2>
          <p className="text-xs text-fp-text-dim mt-1 max-w-2xl">Claude synthesizes the existing evidence, timeline, and deterministic findings. It proposes observations and questions; it does not replace the source record or render legal conclusions.</p>
        </div>
        <button onClick={() => void runReview()} disabled={loading} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium disabled:opacity-50 shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : review ? <RefreshCw className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
          {review ? "Run Again" : "Run Claude Review"}
        </button>
      </div>

      {error && <div className="rounded-lg border border-fp-red/30 bg-fp-red/10 text-fp-red text-sm p-3 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

      {!review && !loading && !error && <div className="surface-flat rounded-xl p-10 text-center"><Bot className="w-8 h-8 text-fp-text-dim mx-auto mb-3" /><p className="text-sm text-fp-text-muted">No Claude synthesis has been run for this case.</p><p className="text-xs text-fp-text-dim mt-1">Run it after recon and deterministic analysis for the most useful review.</p></div>}

      {review && (
        <>
          <div className="surface-flat rounded-xl p-4 border border-fp-blue/20">
            <div className="flex items-center justify-between gap-3 mb-2"><div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-semibold">Synthesis</div><span className="text-xs font-semibold text-fp-blue uppercase">{review.confidence} confidence</span></div>
            <p className="text-sm text-fp-text leading-relaxed">{review.summary}</p>
          </div>
          <ListSection title="Established Facts" icon={<CheckCircle2 className="w-4 h-4 text-fp-green" />} items={review.established_facts} />
          <ListSection title="Procedural Observations" icon={<Search className="w-4 h-4 text-fp-blue" />} items={review.procedural_observations} />
          <ListSection title="Contradictions & Anomalies" icon={<ShieldAlert className="w-4 h-4 text-fp-red" />} items={review.contradictions} />
          <ListSection title="Missing Evidence" icon={<FileQuestion className="w-4 h-4 text-fp-amber" />} items={review.missing_evidence} />
          <ListSection title="Questions to Verify" icon={<Scale className="w-4 h-4 text-fp-blue" />} items={review.questions_to_verify} />
          <ListSection title="Potential Defense Arguments" icon={<ShieldAlert className="w-4 h-4 text-fp-purple" />} items={review.potential_arguments} />
          <div className="text-[11px] text-fp-text-dim px-1">AI synthesis is a review proposal. Verify each item against the underlying evidence before relying on it.</div>
        </>
      )}
    </div>
  );
}
