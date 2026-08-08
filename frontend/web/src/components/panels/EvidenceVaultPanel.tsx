"use client";

import { useEffect, useState, useRef } from "react";
import {
  FileText,
  Loader2,
  AlertCircle,
  RefreshCw,
  Upload,
  Search,
  Image as ImageIcon,
  Map,
  FileCheck,
  Mail,
  Download,
  Ban,
  Eye,
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
    pending: "bg-fp-amber/15 text-fp-amber border border-fp-amber/30",
    processed: "bg-fp-green/15 text-fp-green border border-fp-green/30",
    flagged: "bg-fp-red/15 text-fp-red border border-fp-red/30",
  };
  return styles[status] ?? "bg-fp-surface-2 text-fp-text-dim border border-fp-border";
}

function sourceBadge(source: string) {
  const styles: Record<string, string> = {
    upload: "bg-fp-blue/15 text-fp-blue border border-fp-blue/30",
    building_dept: "bg-fp-blue/15 text-fp-blue border border-fp-blue/30",
    code_enforcement: "bg-fp-amber/15 text-fp-amber border border-fp-amber/30",
    ai_research: "bg-fp-surface-2 text-fp-text-muted border border-fp-border",
  };
  return styles[source] ?? "bg-fp-surface-2 text-fp-text-dim border border-fp-border";
}

function getEvidenceTypeIcon(docType: string | null, source: string) {
  const dt = (docType || "").toLowerCase();
  const src = (source || "").toLowerCase();

  if (dt.includes("gis") || dt.includes("map") || dt.includes("parcel") || src.includes("building_dept")) {
    return Map;
  }
  if (dt.includes("permit") || dt.includes("license") || dt.includes("approval")) {
    return FileCheck;
  }
  if (dt.includes("notice") || dt.includes("citation") || dt.includes("warning") || src.includes("code_enforcement")) {
    return Mail;
  }
  if (dt.includes("photo") || dt.includes("image") || dt.includes("jpg") || dt.includes("png")) {
    return ImageIcon;
  }
  return FileText;
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
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const handleDownload = async (evidenceId: string, title: string) => {
    try {
      const res = await fetch(`/api/v1/evidence/download?id=${evidenceId}`);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = title || "evidence";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  const handleWithdraw = async (evidenceId: string, title: string) => {
    if (!confirm(`Withdraw "${title}"? This marks the evidence as withdrawn but preserves the file for chain-of-custody.`)) return;
    try {
      const res = await fetch(`/api/v1/evidence/withdraw?id=${evidenceId}&projectId=${projectId}`, { method: "POST" });
      if (!res.ok) {
        const data: any = await res.json().catch(() => ({}));
        throw new Error(data.error || `Withdraw failed: ${res.status}`);
      }
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
    }
  };

  return (
    <div className="space-y-4 pb-8 max-w-5xl" role="region" aria-label="Evidence Vault">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fp-text">Document Vault</h2>
          <p className="text-sm text-fp-text-muted mt-0.5">
            Evidence files, extracted text, and AI due process analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-colors border border-fp-border"
            title="Refresh"
            aria-label="Refresh evidence"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all"
          >
            <Upload className="w-4 h-4" /> Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            aria-label="Upload document files"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {["all", "upload", "building_dept", "code_enforcement", "ai_research"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === f
                  ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/40"
                  : "bg-fp-surface/60 text-fp-text-muted hover:text-fp-text border border-fp-border hover:border-fp-border-hover"
              }`}
            >
              {f === "all" ? "All Sources" : f.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <div className="flex-1 max-w-sm relative min-w-[200px]">
          <Search className="w-4 h-4 text-fp-text-dim absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search evidence…"
            aria-label="Search evidence documents"
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue transition-all"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 text-fp-red text-sm p-3 rounded-lg bg-fp-red/10 border border-fp-red/20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-12 text-fp-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-fp-blue" />
          <span>Loading evidence vault…</span>
        </div>
      )}

      {/* Evidence list */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-2.5">
          {filtered.map((item) => {
            const TypeIcon = getEvidenceTypeIcon(item.doc_type, item.source);
            return (
              <div
                key={item.id}
                className="rounded-xl surface-flat hover:border-fp-blue/40 cursor-pointer group p-3 transition-all"
              >
                <div className="flex items-start gap-3">
                  {/* Compact icon */}
                  <div className="w-10 h-10 rounded-lg bg-fp-surface-2 border border-fp-border flex items-center justify-center shrink-0 group-hover:border-fp-blue/40 transition-colors">
                    <TypeIcon className="w-5 h-5 text-fp-blue" />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-fp-text truncate group-hover:text-fp-blue transition-colors">
                          {item.title ?? "Untitled Document"}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceBadge(item.source)}`}>
                            {item.source.replace(/_/g, " ")}
                          </span>
                          {item.doc_type && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-fp-text-dim uppercase tracking-wide bg-fp-surface-2 px-2 py-0.5 rounded-md border border-fp-border font-medium">
                              <TypeIcon className="w-3 h-3 text-fp-blue" />
                              {item.doc_type}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(item.status)}`}>
                          {item.status}
                        </span>
                        <span className="text-xs text-fp-text-dim tabular-nums">
                          {item.created_at?.slice(0, 10)}
                        </span>
                      </div>
                    </div>

                    {item.ai_summary && (
                      <p className="text-xs text-fp-text-muted mt-2 leading-relaxed line-clamp-2">
                        {item.ai_summary}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDownload(item.id, item.title || "evidence")}
                        className="px-2 py-1 rounded-lg text-[10px] font-medium text-fp-text-muted hover:text-fp-blue hover:bg-fp-blue/10 border border-fp-border transition-colors flex items-center gap-1"
                        title="Download original file"
                      >
                        <Download className="w-3 h-3" /> Download
                      </button>
                      {item.status !== "withdrawn" && (
                        <button
                          onClick={() => handleWithdraw(item.id, item.title || "Untitled")}
                          className="px-2 py-1 rounded-lg text-[10px] font-medium text-fp-text-muted hover:text-fp-red hover:bg-fp-red/10 border border-fp-border transition-colors flex items-center gap-1"
                          title="Withdraw evidence (preserves file for chain-of-custody)"
                        >
                          <Ban className="w-3 h-3" /> Withdraw
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-xl surface-flat flex items-center justify-center mb-3">
            <FileText className="w-6 h-6 text-fp-text-dim" />
          </div>
          <p className="text-sm text-fp-text-muted">No evidence documents found</p>
          <p className="text-xs text-fp-text-dim mt-1">Upload documents or adjust filters.</p>
        </div>
      )}
    </div>
  );
}
