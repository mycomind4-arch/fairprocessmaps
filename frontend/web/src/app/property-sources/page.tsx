"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Database, ExternalLink, Search, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";

const SOURCES = [
  { name: "Humboldt County Assessor", url: "https://www.humboldtgov.org/230/Property-Assessment-Inquiry", detail: "Official assessment lookup by parcel number or street address. Best place to verify property characteristics and ownership-related assessment records." },
  { name: "Humboldt County Accela", url: "https://aca-prod.accela.com/HUMBOLDT/APO/APOLookup.aspx?TabName=Home", detail: "Public property lookup with Address, Parcel, Owner, and Record Information search modes." },
  { name: "Humboldt County LIS / GIS downloads", url: "https://www.humboldtgov.org/276/GIS-Data-Download", detail: "Official APN, zoning, land-use, site-address and parcel data. Useful for corroborating non-owner property facts." },
  { name: "Humboldt County Recorder index", url: "https://humboldtcountyca-web.tylerhost.net/web/", detail: "Recorded instruments can reveal grantor/grantee and transfer history. A recent grantee is an owner lead, not automatic proof of current title." },
];

interface Candidate {
  field: string;
  value: string;
  source: string;
  confidence: number;
  explanation: string;
  sourceUrl?: string;
}

export default function PropertySourcesPage() {
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const apn = useMemo(() => params.get("apn")?.trim() ?? "", [params]);
  const address = useMemo(() => params.get("address")?.trim() ?? "", [params]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading || !user || !apn) return;
    setLoading(true);
    fetch(`/api/v1/properties/enrichment?apn=${encodeURIComponent(apn)}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((data: { candidates?: Candidate[] }) => setCandidates(data.candidates ?? []))
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, [apn, user, authLoading]);

  return (
    <div className="min-h-screen bg-fp-bg text-fp-text">
      <header className="border-b border-fp-border bg-white px-5 py-5 sm:px-8">
        <div className="mx-auto max-w-[980px]">
          <a href="/map" className="text-xs font-semibold text-fp-blue hover:underline">← Back to map</a>
          <h1 className="mt-3 text-2xl font-semibold">Owner & property source check</h1>
          <p className="mt-2 text-sm text-fp-text-muted">Cross-check several no-cost public sources before treating any owner name or property fact as authoritative.</p>
        </div>
      </header>

      <main className="mx-auto max-w-[980px] space-y-6 px-5 py-8 sm:px-8">
        <div className="rounded-xl border border-fp-border bg-white p-5">
          <div className="flex items-start gap-3">
            <Search className="mt-0.5 h-5 w-5 text-fp-blue" />
            <div><div className="text-xs uppercase tracking-wide text-fp-text-dim">Parcel being checked</div><div className="mt-1 font-mono text-lg font-semibold">{apn || "No APN supplied"}</div>{address && <div className="mt-1 text-sm text-fp-text-muted">{address}</div>}</div>
          </div>
        </div>

        {user && (
          <section className="rounded-xl border border-fp-border bg-white overflow-hidden">
            <div className="border-b border-fp-border p-5"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-fp-blue" /><h2 className="font-semibold">FairProcess owner candidates</h2></div><p className="mt-2 text-xs text-fp-text-muted">These are leads collected from already available FairProcess/Recorder data and source-backed enrichment. Verify before relying on them.</p></div>
            {loading ? <div className="p-5 text-sm text-fp-text-muted">Checking cached and Recorder-derived data…</div> : candidates.length === 0 ? <div className="p-5 text-sm text-fp-text-muted">No owner candidate is cached yet. Use the free official sources below, then FairProcess can retain source-backed results later.</div> : <div className="divide-y divide-fp-border">{candidates.map((candidate, index) => <div key={`${candidate.source}-${index}`} className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] uppercase tracking-wide text-fp-text-dim">{candidate.field.replace(/_/g, " ")}</div><div className="mt-1 font-semibold">{candidate.value}</div></div><span className="rounded-full bg-fp-surface-2 px-2.5 py-1 text-xs">{Math.round(candidate.confidence * 100)}% confidence</span></div><div className="mt-2 text-xs font-medium text-fp-text-muted">{candidate.source}</div><p className="mt-1 text-xs leading-relaxed text-fp-text-dim">{candidate.explanation}</p>{candidate.sourceUrl && <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-fp-blue">Open source <ExternalLink className="h-3 w-3" /></a>}</div>)}</div>}
          </section>
        )}

        {!authLoading && !user && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Sign in to see any source-backed owner candidates FairProcess has already captured. The official public sources below remain available without an account.</div>}

        <section>
          <div className="mb-3 flex items-center gap-2"><Database className="h-4 w-4 text-fp-blue" /><h2 className="font-semibold">Free public sources</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SOURCES.map((source, index) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer" className="rounded-xl border border-fp-border bg-white p-5 transition hover:border-fp-blue/40 hover:shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-fp-surface-2 text-xs font-bold">{index + 1}</div><ExternalLink className="h-4 w-4 text-fp-text-dim" /></div><h3 className="mt-4 text-sm font-semibold">{source.name}</h3><p className="mt-2 text-xs leading-relaxed text-fp-text-muted">{source.detail}</p></a>)}
          </div>
        </section>

        <div className="rounded-xl border border-fp-green/25 bg-fp-green/[0.04] p-4 text-xs leading-relaxed text-fp-text-muted"><div className="mb-1 flex items-center gap-2 font-semibold text-fp-text"><ShieldCheck className="h-4 w-4 text-fp-green" />Evidence rule</div>Owner names are stored as source-backed candidates with provenance and confidence. A deed grantee, permit contact, or cached name should not silently overwrite a verified owner-of-record field.</div>
      </main>
    </div>
  );
}
