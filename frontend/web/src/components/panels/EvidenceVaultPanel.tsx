"use client";

import { useEffect, useState, useRef } from "react";
import {
  FolderArchive,
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
      fetchData(); // refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <div className="space-y-6 pb-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-fp-text">Document Vault</h2>
          <p className="text-sm text-fp-text-muted mt-1">
            Evidence files, extracted text, and AI due process analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2.5 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-colors border border-fp-border"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all shadow-md hover:shadow-fp-blue/20"
          >
            <Upload className="w-4 h-4" /> Upload Document
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

      {/* Filters and Search */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {["all", "upload", "building_dept", "code_enforcement", "ai_research"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                filter === f
                  ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/40 shadow-sm"
                  : "bg-fp-surface/60 text-fp-text-muted hover:text-fp-text border border-fp-border hover:border-fp-border-hover"
              }`}
            >
              {f === "all" ? "All Sources" : f.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <div className="flex-1 max-w-sm relative min-w-[200px]">
          <Search className="w-4 h-4 text-fp-text-dim absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search evidence documents…"
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue focus:ring-1 focus:ring-fp-blue transition-all"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 text-fp-red text-sm p-4 rounded-[14px] bg-fp-red/10 border border-fp-red/20 shadow-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-16 text-fp-text-muted text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-fp-blue" />
          <span>Loading evidence vault…</span>
        </div>
      )}

      {/* Evidence list */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-4">
          {filtered.map((item) => {
            const TypeIcon = getEvidenceTypeIcon(item.doc_type, item.source);
            return (
              <div
                key={item.id}
                className="rounded-[14px] glass p-6 shadow-lg shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:border-fp-blue/40 cursor-pointer group"
              >
                <div className="flex items-start gap-5">
                  {/* Larger Thumbnail Preview Tile */}
                  <div className="w-16 h-16 rounded-xl bg-fp-surface-2 border border-fp-border flex items-center justify-center shrink-0 group-hover:border-fp-blue/40 transition-colors shadow-inner">
                    <TypeIcon className="w-8 h-8 text-fp-blue group-hover:scale-105 transition-transform" />
                  </div>

                  {/* Document Details */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold text-fp-text truncate group-hover:text-fp-blue transition-colors">
                          {item.title ?? "Untitled Document"}
                        </h3>
                        
                        {/* Type & Source Metadata */}
                        <div className="flex items-center gap-2 flex-wrap mt-2">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${sourceBadge(item.source)}`}>
                            {item.source.replace(/_/g, " ")}
                          </span>

                          {item.doc_type && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-fp-text-dim uppercase tracking-wide bg-fp-surface-2 px-2.5 py-0.5 rounded-md border border-fp-border font-medium">
                              <TypeIcon className="w-3.5 h-3.5 text-fp-blue" />
                              {item.doc_type}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Consistently Aligned Status Badge & Right-Aligned Date */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusBadge(item.status)}`}>
                          {item.status}
                        </span>
                        <span className="text-xs text-fp-text-dim tracking-wide font-mono">
                          {item.created_at?.slice(0, 10)}
                        </span>
                      </div>
                    </div>

                    {item.ai_summary && (
                      <p className="text-sm text-fp-text-muted mt-3 line-clamp-2 leading-relaxed">
                        {item.ai_summary}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && !error && (
        <div className="rounded-[14px] glass border-dashed border-fp-border p-12 text-center shadow-lg shadow-black/20">
          <FolderArchive className="w-12 h-12 text-fp-text-dim mx-auto mb-4" />
          <h3 className="text-base font-semibold text-fp-text">No documents in vault</h3>
          <p className="text-sm text-fp-text-muted mt-2 mb-6 max-w-md mx-auto">
            Upload PDFs, photos, or correspondence to build your evidence file and evaluate due process compliance.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all shadow-md hover:shadow-fp-blue/20"
          >
            <Upload className="w-4 h-4" /> Upload Evidence
          </button>
        </div>
      )}
    </div>
  );
}
