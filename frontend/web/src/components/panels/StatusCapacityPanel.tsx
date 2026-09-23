"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  BookOpen,
  ChevronRight,
  CircleAlert,
  FileSearch,
  GitBranch,
  Landmark,
  RefreshCw,
  Scale,
  ShieldCheck,
  UserRoundCog,
} from "lucide-react";
import { analyzeStatusClaim } from "@/lib/status-capacity/analyzer";
import { STATUS_CATALOG, STATUS_CHANGE_WORKFLOWS } from "@/lib/status-capacity/catalog";
import type { RecognitionLevel, StatusCategory } from "@/lib/status-capacity/types";

type Tab = "analyze" | "change" | "reference";

const TABS: { id: Tab; label: string; icon: typeof Scale }[] = [
  { id: "analyze", label: "Status analysis", icon: FileSearch },
  { id: "change", label: "Change workflows", icon: GitBranch },
  { id: "reference", label: "Status & capacity map", icon: BookOpen },
];

const RECOGNITION_STYLE: Record<RecognitionLevel, string> = {
  recognized_status: "bg-emerald-50 text-emerald-800 border-emerald-200",
  recognized_capacity: "bg-blue-50 text-blue-800 border-blue-200",
  context_dependent: "bg-amber-50 text-amber-800 border-amber-200",
  asserted_term: "bg-slate-50 text-slate-700 border-slate-200",
};

const CATEGORY_LABEL: Record<StatusCategory, string> = {
  citizenship: "Citizenship",
  nationality: "Nationality",
  immigration: "Immigration",
  domicile: "Domicile",
  tribal: "Tribal citizenship",
  capacity: "Capacity",
  entity: "Entity",
  property_financial: "Property / financial",
};

export default function StatusCapacityPanel({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<Tab>("analyze");
  const [statusId, setStatusId] = useState("california-state-national");
  const [claimedConsequence, setClaimedConsequence] = useState("");
  const [matterContext, setMatterContext] = useState("");
  const [analysisKey, setAnalysisKey] = useState(0);

  const analysis = useMemo(
    () =>
      analyzeStatusClaim({
        statusId,
        claimedConsequence,
        matterContext,
      }),
    // analysisKey is intentional: the button creates a visible re-analysis step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusId, claimedConsequence, matterContext, analysisKey]
  );

  return (
    <div className="space-y-5 pb-10" role="region" aria-label="Status, capacity, and jurisdiction">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="fp-eyebrow">Identity & authority</div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-fp-text">Status, Capacity & Jurisdiction</h2>
          <p className="mt-1 max-w-3xl text-sm text-fp-text-muted">
            Separate legally recognized status, the capacity in which a person acts, and the jurisdictional consequence actually claimed.
            FairProcess does not infer a legal result from a label alone.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-xl border border-fp-border bg-white px-3 py-2 text-xs text-fp-text-muted">
          <ShieldCheck className="h-4 w-4 text-fp-blue" />
          Matter-scoped analysis
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-fp-border" role="tablist">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active ? "border-fp-blue text-fp-blue" : "border-transparent text-fp-text-muted hover:text-fp-text"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "analyze" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-xl border border-fp-border bg-white p-5">
            <div className="flex items-center gap-2">
              <UserRoundCog className="h-4 w-4 text-fp-blue" />
              <h3 className="text-sm font-semibold text-fp-text">Claim being tested</h3>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-fp-text-dim">
              Pick the label the person is using. Then state the consequence they believe follows from it.
            </p>

            <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-fp-text-dim">
              Status or capacity
            </label>
            <select
              value={statusId}
              onChange={(e) => setStatusId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-fp-border bg-white px-3 py-2.5 text-sm text-fp-text outline-none focus:border-fp-blue"
            >
              {STATUS_CATALOG.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label} — {CATEGORY_LABEL[status.category]}
                </option>
              ))}
            </select>

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-fp-text-dim">
              Claimed consequence
            </label>
            <textarea
              value={claimedConsequence}
              onChange={(e) => setClaimedConsequence(e.target.value)}
              placeholder="Example: I believe this changes which court has jurisdiction."
              rows={3}
              className="mt-2 w-full resize-y rounded-lg border border-fp-border bg-white px-3 py-2.5 text-sm text-fp-text outline-none placeholder:text-fp-text-dim focus:border-fp-blue"
            />

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-fp-text-dim">
              Matter context
            </label>
            <textarea
              value={matterContext}
              onChange={(e) => setMatterContext(e.target.value)}
              placeholder="Example: California county code-enforcement notice involving residential property."
              rows={3}
              className="mt-2 w-full resize-y rounded-lg border border-fp-border bg-white px-3 py-2.5 text-sm text-fp-text outline-none placeholder:text-fp-text-dim focus:border-fp-blue"
            />

            <button
              onClick={() => setAnalysisKey((v) => v + 1)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-fp-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-fp-blue/90"
            >
              <RefreshCw className="h-4 w-4" />
              Analyze claim
            </button>

            <div className="mt-5 rounded-lg border border-fp-border bg-fp-surface-2/40 p-3 text-xs leading-relaxed text-fp-text-dim">
              Case ID: <span className="font-mono text-fp-text-muted">{projectId}</span>. This first version analyzes the claim in the matter workspace;
              persistence to the evidence graph is the next integration point.
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-fp-border bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-fp-text">{analysis.status.label}</h3>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${RECOGNITION_STYLE[analysis.status.recognition]}`}>
                  {analysis.recognitionLabel}
                </span>
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wide text-fp-text-dim">
                {CATEGORY_LABEL[analysis.status.category]}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-fp-text-muted">{analysis.status.summary}</p>

              {analysis.warnings.length > 0 && (
                <div className="mt-4 space-y-2">
                  {analysis.warnings.map((warning) => (
                    <div key={warning} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                      <p className="text-xs leading-relaxed text-amber-900">{warning}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <InfoCard title="How it is established" items={analysis.status.establishment} />
              <InfoCard title="How it can change" items={analysis.status.changeMechanisms} />
            </div>

            <div className="rounded-xl border border-fp-border bg-white p-5">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-fp-blue" />
                <h3 className="text-sm font-semibold text-fp-text">Questions FairProcess must resolve</h3>
              </div>
              <div className="mt-3 space-y-2">
                {analysis.questions.map((question, index) => (
                  <div key={question} className="flex gap-3 rounded-lg border border-fp-border/70 bg-fp-surface-2/30 p-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-fp-blue">
                      {index + 1}
                    </span>
                    <span className="text-xs leading-relaxed text-fp-text-muted">{question}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-fp-border bg-white p-5">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-fp-blue" />
                <h3 className="text-sm font-semibold text-fp-text">Primary authority</h3>
              </div>
              {analysis.status.authorities.length === 0 ? (
                <p className="mt-3 text-xs leading-relaxed text-fp-text-dim">
                  No universal authority is attached to this capacity because the governing instrument and jurisdiction must be identified from the matter.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {analysis.status.authorities.map((source) => (
                    <a
                      key={source.citation}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 rounded-lg border border-fp-border p-3 hover:border-fp-blue/40 hover:bg-blue-50/30"
                    >
                      <div>
                        <div className="text-sm font-medium text-fp-text">{source.label}</div>
                        <div className="mt-0.5 text-xs text-fp-text-dim">{source.citation}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-fp-text-dim" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === "change" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-fp-border bg-white p-5">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-fp-blue" />
              <h3 className="text-sm font-semibold text-fp-text">Status-change workflow catalog</h3>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fp-text-muted">
              These are mechanisms that can actually alter a legal status or capacity when their governing requirements are satisfied.
              A declaration is not treated as a substitute for a statute, court order, tribal process, private instrument, or required fact pattern.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {STATUS_CHANGE_WORKFLOWS.map((workflow) => (
              <article key={workflow.id} className="rounded-xl border border-fp-border bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-fp-text">{workflow.title}</h3>
                    <div className="mt-1 text-xs text-fp-text-dim">
                      {workflow.from} <span className="px-1 text-fp-blue">→</span> {workflow.to}
                    </div>
                  </div>
                  {workflow.irreversibleOrHighConsequence && (
                    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700">
                      High consequence
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-fp-text-muted">{workflow.summary}</p>
                <div className="mt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-fp-text-dim">Workflow</div>
                  <ol className="mt-2 space-y-2">
                    {workflow.steps.map((step, index) => (
                      <li key={step} className="flex gap-2 text-xs leading-relaxed text-fp-text-muted">
                        <span className="font-semibold text-fp-blue">{index + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {tab === "reference" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {STATUS_CATALOG.map((status) => (
            <article key={status.id} className="rounded-xl border border-fp-border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-fp-text">{status.label}</div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wide text-fp-text-dim">{CATEGORY_LABEL[status.category]}</div>
                </div>
                <BadgeCheck className={`h-4 w-4 shrink-0 ${status.recognition === "asserted_term" ? "text-fp-text-dim" : "text-fp-blue"}`} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-fp-text-muted">{status.summary}</p>
              <div className={`mt-3 inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${RECOGNITION_STYLE[status.recognition]}`}>
                {status.recognition.replaceAll("_", " ")}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-fp-border bg-white p-5">
      <h3 className="text-sm font-semibold text-fp-text">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-relaxed text-fp-text-muted">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fp-blue/70" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
