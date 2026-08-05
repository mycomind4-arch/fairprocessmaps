"use client";

import { useEffect, useState, useRef } from "react";
import {
  FolderArchive, FileText, Loader2, AlertCircle, RefreshCw,
  Upload, Filter, Search,
} from "lucide-react";

interface EvidenceItem {
  id: string;
  title: string | null;
  source: string;
  doc_type: string | null;
  status: string;
  extracted_text: string | null;
  ai_summary: string | null;
  created_at: string;
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-fp-surface-2 text-fp-text-dim",
    processed: "bg-fp-cyan/15 text-fp-cyan",
    flagged: "bg-fp-red/20 text-fp-red",
  };
  return styles[status] ?? styles.pending;
}

function sourceBadge(source: string) {
  const styles: Record<string, string> = {
    upload: "bg-fp-blue/15 text-fp-blue",
    building_dept: "bg-fp-cyan/15 text-fp-cyan",
    code_enforcement: "bg-fp-red/15 text-fp-red",
    ai_research: "bg-fp-purple/15 text-fp-purple",
  };
  return styles[source] ?? "bg-fp-surface-2 text-fp-text-dim";
}

export default function EvidenceVaultPanel({ projectId }: { projectId: string }) {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/evidence?projectId=${projectId}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json: { items?: EvidenceItem[] } = await res.json();
      setEvidence(json.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load evidence");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [projectId]);

  const filtered = evidence.filter((e) => {
    if (filter !== "all" && e.source !== filter) return false;
    if (search && e.title && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    formData.append("projectId", projectId);
    for (const file of Array.from(files)) {
      formData.append("files", file);
    }
    try {
      const res = await fetch("/api/v1/evidence/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${res.status} ${txt.slice(0, 200)}`);
      }
      fetchData(); // refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <div className="space-y-8 pb-12 max-w-5xl">
      {/* ── Page Header ── */}
      <div className="fp-page-header flex items-start justify-between">
        <div>
          <h2 className="fp-page-title">Document Vault</h2>
          <p className="fp-page-subtitle">Evidence files, extracted text, and AI analysis.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2.5 rounded-lg fp-card fp-card-lift text-fp-text-muted hover:text-fp-text"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          {["all", "upload", "building_dept", "code_enforcement", "ai_research"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/30"
                  : "bg-fp-surface/40 text-fp-text-muted hover:text-fp-text border border-fp-border"
              }`}
            >
              {f === "all" ? "All" : f.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <div className="flex-1 max-w-xs relative">
          <Search className="w-3.5 h-3.5 text-fp-text-dim absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search evidence…"
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-fp-surface/40 border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue/40"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-fp-red text-sm p-3 rounded-lg bg-fp-red/10 border border-fp-red/20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-fp-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading evidence…
        </div>
      )}

      {/* Evidence list */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="fp-card fp-card-lift p-5 cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-fp-surface-2 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-fp-text-muted" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-fp-text truncate group-hover:text-fp-cyan transition-colors">
                      {item.title ?? "Untitled document"}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${sourceBadge(item.source)}`}>
                        {item.source.replace(/_/g, " ")}
                      </span>
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${statusBadge(item.status)}`}>
                        {item.status}
                      </span>
                      {item.doc_type && (
                        <span className="text-[11px] text-fp-text-dim">{item.doc_type}</span>
                      )}
                      <span className="text-[11px] text-fp-text-dim">{item.created_at?.slice(0, 10)}</span>
                    </div>
                    {item.ai_summary && (
                      <p className="text-xs text-fp-text-muted mt-2 line-clamp-2">{item.ai_summary}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && !error && (
        <div className="fp-card p-12 text-center" style={{ borderStyle: "dashed" }}>
          <FolderArchive className="w-10 h-10 text-fp-text-dim mx-auto mb-4" />
          <h3 className="text-sm font-medium text-fp-text">No documents have been uploaded yet.</h3>
          <p className="text-xs text-fp-text-dim mt-1.5 mb-6">
            Upload PDFs, photos, or correspondence to build your evidence file.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload Evidence
          </button>
        </div>
      )}
    </div>
  );
}
