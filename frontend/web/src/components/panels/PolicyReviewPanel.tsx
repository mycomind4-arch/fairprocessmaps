"use client";

import { useEffect, useState } from "react";
import {
  Scale, ShieldCheck, AlertTriangle, Loader2, ChevronDown,
  ExternalLink, ClipboardCheck,
} from "lucide-react";

/**
 * Policy review panel.
 *
 * When a finding renders as "provisional", this is where someone goes to find
 * out what is actually unverified about it. Without this, the provisional badge
 * is a dead end — it tells a user to be careful without telling them what to
 * check, which is worse than saying nothing.
 *
 * It is also the working surface for the activation review: the checklist here
 * is the same one the compiler emits, so drafting and reviewing a pack use one
 * vocabulary.
 */

interface PolicyRuleView {
  id: string;
  kind: string;
  name: string;
  description: string;
  severity: string;
  citation: string;
  sourceUrl: string;
  authority: string;
  minCalendarDays: number | null;
  notes: string | null;
  unverified: boolean;
}

interface PolicyPackView {
  id: string;
  jurisdiction: string;
  caseTypes: string[];
  policyVersion: string;
  activationStatus: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  ruleCount: number;
  unverifiedCount: number;
  rules: PolicyRuleView[];
  reviewChecklist: string[];
}

function RuleRow({ rule }: { rule: PolicyRuleView }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`rounded-xl border bg-fp-surface/40 overflow-hidden ${
        rule.unverified ? "border-fp-amber/40" : "border-fp-border"
      }`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-fp-surface-2/40 transition-colors"
      >
        {rule.unverified ? (
          <AlertTriangle className="w-4 h-4 text-fp-amber shrink-0" />
        ) : (
          <ShieldCheck className="w-4 h-4 text-fp-green shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-fp-text">{rule.name}</div>
          <div className="text-xs text-fp-text-dim mt-0.5 truncate">
            {rule.citation}
            {rule.minCalendarDays !== null && ` · ${rule.minCalendarDays} days`}
          </div>
        </div>
        {rule.unverified && (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-fp-amber/15 text-fp-amber shrink-0">
            Unverified
          </span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-fp-text-dim transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-fp-border/30 space-y-3">
          <p className="text-sm text-fp-text-muted leading-relaxed">{rule.description}</p>

          <div className="text-xs text-fp-text-dim">
            <span className="text-fp-text-muted">Issued by:</span> {rule.authority}
          </div>

          <a
            href={rule.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-fp-blue hover:underline"
          >
            Read the cited text <ExternalLink className="w-3 h-3" />
          </a>

          {rule.notes && (
            <div
              className={`rounded-lg p-3 text-xs leading-relaxed ${
                rule.unverified
                  ? "bg-fp-amber/10 text-fp-amber border border-fp-amber/25"
                  : "bg-fp-surface-2/50 text-fp-text-dim"
              }`}
            >
              {rule.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PackCard({ pack }: { pack: PolicyPackView }) {
  const [showChecklist, setShowChecklist] = useState(false);
  const activated = pack.activationStatus === "active";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-fp-border bg-fp-surface/40 p-6">
        <div className="flex items-start gap-4">
          <Scale className="w-5 h-5 text-fp-blue shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-fp-text">{pack.jurisdiction}</h3>
            <div className="text-xs text-fp-text-dim mt-1 font-mono">
              {pack.id} · {pack.policyVersion}
            </div>
            <div className="text-xs text-fp-text-dim mt-1">
              {pack.ruleCount} checkpoint{pack.ruleCount === 1 ? "" : "s"} ·{" "}
              applies to {pack.caseTypes.join(", ").replace(/_/g, " ")}
            </div>
          </div>
          <span
            className={`px-3 py-1 rounded-lg text-xs font-medium shrink-0 ${
              activated
                ? "bg-fp-green/15 text-fp-green"
                : "bg-fp-amber/15 text-fp-amber border border-fp-amber/30"
            }`}
          >
            {activated ? "Active" : "Legal review required"}
          </span>
        </div>

        {!activated && (
          <div className="mt-5 rounded-lg border border-fp-amber/30 bg-fp-amber/10 p-4">
            <p className="text-sm font-medium text-fp-amber">
              Findings from this pack are provisional
            </p>
            <p className="text-xs text-fp-amber/90 mt-2 leading-relaxed">
              {pack.unverifiedCount > 0 ? (
                <>
                  {pack.unverifiedCount} of {pack.ruleCount} checkpoints carry a
                  parameter that has not been confirmed against currently codified
                  text. Until a qualified attorney works the checklist below, these
                  results are a starting point for research — not a basis for a
                  filing, a demand letter, or a client assurance.
                </>
              ) : (
                <>
                  This pack has not completed legal review. Its results are a
                  starting point for research, not a basis for a filing.
                </>
              )}
            </p>
          </div>
        )}

        {activated && pack.reviewedBy && (
          <div className="mt-4 text-xs text-fp-text-dim">
            Reviewed by {pack.reviewedBy}
            {pack.reviewedAt && ` on ${pack.reviewedAt.slice(0, 10)}`}
          </div>
        )}

        <button
          onClick={() => setShowChecklist(!showChecklist)}
          className="mt-5 flex items-center gap-2 text-xs text-fp-text-dim hover:text-fp-text transition-colors"
        >
          <ClipboardCheck className="w-4 h-4" />
          {showChecklist ? "Hide" : "Show"} activation checklist ({pack.reviewChecklist.length} items)
        </button>

        {showChecklist && (
          <ol className="mt-4 space-y-2 border-t border-fp-border/30 pt-4">
            {pack.reviewChecklist.map((item, i) => (
              <li key={i} className="flex gap-3 text-xs text-fp-text-muted leading-relaxed">
                <span className="text-fp-text-dim font-mono shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="space-y-3">
        {pack.rules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} />
        ))}
      </div>
    </div>
  );
}

export default function PolicyReviewPanel() {
  const [packs, setPacks] = useState<PolicyPackView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v1/policy/packs", { credentials: "include" });
        if (!res.ok) throw new Error(`Failed to load policy packs (${res.status})`);
        const data = (await res.json()) as { packs: PolicyPackView[] };
        setPacks(data.packs ?? []);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-sm text-fp-text-dim p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading procedural rules…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-fp-red/30 bg-fp-red/10 p-4 text-sm text-fp-red">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-medium text-fp-text">Procedural rules in force</h2>
        <p className="text-sm text-fp-text-muted mt-2 max-w-2xl leading-relaxed">
          Every checkpoint this system applies, the authority it rests on, and
          whether that authority has been confirmed by a human. Findings are only
          as good as the rules below — this page exists so you can check them
          rather than take them on trust.
        </p>
      </div>

      {packs.length === 0 ? (
        <div className="text-sm text-fp-text-dim">No policy packs are registered.</div>
      ) : (
        packs.map((pack) => <PackCard key={pack.id} pack={pack} />)
      )}
    </div>
  );
}
