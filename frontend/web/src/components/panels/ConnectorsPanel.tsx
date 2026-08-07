"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plug,
  Database,
  Brain,
  Webhook,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  Trash2,
  Zap,
  Cloud,
  FileSearch,
  X,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

// ── Types ──
interface Connector {
  id: string;
  name: string;
  type: "data_source" | "scraping" | "ai_tool" | "webhook";
  status: "connected" | "disconnected" | "error" | "pending";
  description: string;
  last_sync: string | null;
  endpoint: string | null;
  config: Record<string, string>;
}

// ── Available connectors catalog ──
const CATALOG: { name: string; type: Connector["type"]; description: string; icon: typeof Database; endpoint?: string }[] = [
  { name: "Humboldt County GIS", type: "data_source", description: "Parcel boundaries, zoning, and ownership data from Humboldt County's ArcGIS REST API", icon: Database, endpoint: "https://services.arcgis.com/..." },
  { name: "Regrid Parcel API", type: "data_source", description: "Nationwide parcel data with APN lookup, owner info, and land use", icon: Database },
  { name: "Humboldt Building Dept", type: "scraping", description: "Scrape permit applications and inspection schedules from the county building department portal", icon: FileSearch },
  { name: "Humboldt Code Enforcement", type: "scraping", description: "Monitor code enforcement case filings and status changes", icon: FileSearch },
  { name: "Court Records Scraper", type: "scraping", description: "Scrape civil court filings for due process violations and case timelines", icon: FileSearch },
  { name: "Llama 3.1 Evidence Analyzer", type: "ai_tool", description: "AI analysis of uploaded documents for legal relevance, due process issues, and evidence strength — powered by Cloudflare Workers AI (Llama 3.1 8B)", icon: Brain },
  { name: "OCR Pipeline", type: "ai_tool", description: "Extract text from scanned documents, photos, and PDFs for searchable evidence", icon: Brain },
  { name: "Slack Notifications", type: "webhook", description: "Send alerts when new code enforcement actions are detected or deadlines approach", icon: Webhook },
  { name: "Email Digest", type: "webhook", description: "Weekly summary of project activity and approaching deadlines", icon: Webhook },
  { name: "Cloud Storage Sync", type: "data_source", description: "Sync documents from Google Drive or Dropbox into the evidence vault", icon: Cloud },
];

const TYPE_LABELS: Record<Connector["type"], string> = {
  data_source: "Data Source",
  scraping: "Scraping Pipeline",
  ai_tool: "AI Tool",
  webhook: "Webhook",
};

const TYPE_ICONS: Record<Connector["type"], typeof Database> = {
  data_source: Database,
  scraping: FileSearch,
  ai_tool: Brain,
  webhook: Webhook,
};

// ── Component ──
export default function ConnectorsPanel({ projectId }: { projectId: string }) {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null);

  const fetchConnectors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/connectors?projectId=${projectId}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error(`Failed to load connectors (${res.status})`);
      const data = await res.json() as { items?: Connector[] };
      setConnectors(data.items ?? []);
    } catch (err) {
      setConnectors([]);
      setError(err instanceof Error ? err.message : "Failed to load connectors");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchConnectors();
  }, [fetchConnectors]);

  const addConnector = async (catalogItem: (typeof CATALOG)[number]) => {
    try {
      const res = await fetch("/api/v1/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          name: catalogItem.name,
          type: catalogItem.type,
          status: "pending",
          description: catalogItem.description,
          endpoint: catalogItem.endpoint ?? null,
          config: {},
        }),
      });
      if (!res.ok) throw new Error("Failed to add connector");
      setShowCatalog(false);
      await fetchConnectors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add connector");
    }
  };

  const removeConnector = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/connectors?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove connector");
      setSelectedConnector(null);
      await fetchConnectors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove connector");
    }
  };

  const toggleStatus = async (id: string) => {
    const connector = connectors.find((c) => c.id === id);
    if (!connector) return;
    const newStatus = connector.status === "connected" ? "disconnected" : "connected";
    // Optimistic update
    setConnectors((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, status: newStatus as Connector["status"], last_sync: newStatus === "connected" ? new Date().toISOString() : c.last_sync }
          : c
      )
    );
    try {
      const res = await fetch("/api/v1/connectors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update connector");
    } catch (err) {
      // Revert on failure
      await fetchConnectors();
      setError(err instanceof Error ? err.message : "Failed to update connector");
    }
  };

  const connectedCount = connectors.filter((c) => c.status === "connected").length;
  const errorCount = connectors.filter((c) => c.status === "error").length;
  const pendingCount = connectors.filter((c) => c.status === "pending").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-fp-text-muted text-sm">
        <Loader2 className="h-5 w-5 animate-spin text-fp-blue mr-3" />
        <span>Loading integrations &amp; connectors…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-fp-text">Connectors &amp; Skills</h2>
          <p className="text-sm text-fp-text-muted mt-1">County data integrations, scraping pipelines, and AI tools</p>
        </div>
        <button
          onClick={() => setShowCatalog(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all shadow-md hover:shadow-fp-blue/20"
        >
          <Plus className="h-4 w-4" />
          Add Connector
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 rounded-[14px] border border-fp-red/30 bg-fp-red/10 p-4">
          <AlertTriangle className="h-5 w-5 text-fp-red shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-fp-red">Something went wrong</p>
            <p className="text-xs text-fp-text-muted mt-1">{error}</p>
          </div>
          <button
            onClick={() => { setError(null); fetchConnectors(); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-surface-2 text-fp-text text-xs font-medium hover:bg-fp-surface-2/80 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-[14px] glass p-6 shadow-lg shadow-black/20 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">Connected</span>
            <CheckCircle2 className="h-4 w-4 text-fp-green" />
          </div>
          <p className="text-2xl font-semibold text-fp-text mt-2">{connectedCount}</p>
        </div>

        <div className="rounded-[14px] glass p-6 shadow-lg shadow-black/20 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">Pending</span>
            <Loader2 className="h-4 w-4 text-fp-amber" />
          </div>
          <p className="text-2xl font-semibold text-fp-text mt-2">{pendingCount}</p>
        </div>

        <div className="rounded-[14px] glass p-6 shadow-lg shadow-black/20 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">Errors</span>
            <XCircle className="h-4 w-4 text-fp-red" />
          </div>
          <p className="text-2xl font-semibold text-fp-text mt-2">{errorCount}</p>
        </div>

        <div className="rounded-[14px] glass p-6 shadow-lg shadow-black/20 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">Total Active</span>
            <Plug className="h-4 w-4 text-fp-blue" />
          </div>
          <p className="text-2xl font-semibold text-fp-text mt-2">{connectors.length}</p>
        </div>
      </div>

      {/* Connector List / Grid */}
      {connectors.length === 0 ? (
        <div className="rounded-[14px] glass border-dashed border-fp-border p-12 text-center shadow-lg shadow-black/20">
          <Plug className="mx-auto h-12 w-12 text-fp-text-dim mb-4" />
          <h3 className="text-base font-semibold text-fp-text">No connectors configured</h3>
          <p className="text-sm text-fp-text-muted mt-2 mb-6 max-w-md mx-auto">
            Connect Humboldt County GIS, court record scrapers, or AI analysis tools to automatically sync project data.
          </p>
          <button
            onClick={() => setShowCatalog(true)}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all shadow-md hover:shadow-fp-blue/20"
          >
            <Plus className="h-4 w-4" /> Browse Catalog
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {connectors.map((c) => {
            const Icon = TYPE_ICONS[c.type];
            return (
              <div
                key={c.id}
                className="rounded-[14px] glass p-6 shadow-lg shadow-black/20 flex flex-col justify-between space-y-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-fp-blue/40"
              >
                <div>
                  {/* Top row: Icon, Title, Type label & Status Badge */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-fp-surface-2 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-fp-blue" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-fp-text leading-tight">{c.name}</h3>
                        <span className="text-xs text-fp-text-dim uppercase tracking-wide">{TYPE_LABELS[c.type]}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleStatus(c.id)}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        c.status === "connected"
                          ? "bg-fp-green/15 text-fp-green hover:bg-fp-green/25"
                          : "bg-fp-surface-2 text-fp-text-dim hover:bg-fp-surface-2/80"
                      }`}
                    >
                      {c.status === "connected" ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" /> Connect
                        </>
                      )}
                    </button>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-fp-text-muted mt-4 leading-relaxed">{c.description}</p>

                  {/* Metadata */}
                  <div className="flex items-center gap-4 text-xs text-fp-text-dim mt-4">
                    {c.last_sync && (
                      <span className="flex items-center gap-1.5">
                        <RefreshCw className="w-3 h-3" />
                        Last sync: {new Date(c.last_sync).toLocaleDateString()}
                      </span>
                    )}
                    {c.endpoint && (
                      <span className="flex items-center gap-1.5 truncate">
                        <Cloud className="w-3 h-3" />
                        <span className="truncate">{c.endpoint}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Row */}
                <div className="flex items-center justify-between pt-4 border-t border-fp-border">
                  <button
                    onClick={() => setSelectedConnector(c)}
                    className="text-xs text-fp-text-dim hover:text-fp-text transition-colors"
                  >
                    Configure
                  </button>
                  <button
                    onClick={() => removeConnector(c.id)}
                    className="text-xs text-fp-text-dim hover:text-fp-red transition-colors inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Catalog Modal */}
      {showCatalog && (
        <div
          className="fixed inset-0 z-40 bg-fp-bg/80 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setShowCatalog(false)}
        >
          <div
            className="bg-fp-surface rounded-2xl border border-fp-border shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-fp-border shrink-0">
              <h3 className="text-lg font-semibold text-fp-text">Connector Catalog</h3>
              <button onClick={() => setShowCatalog(false)} className="text-fp-text-dim hover:text-fp-text transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4">
              {CATALOG.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.name}
                    onClick={() => addConnector(item)}
                    className="w-full flex items-start gap-4 p-4 rounded-xl bg-fp-surface-2 hover:bg-fp-surface-2/80 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-fp-surface flex items-center justify-center shrink-0 group-hover:bg-fp-blue/20 transition-colors">
                      <Icon className="w-5 h-5 text-fp-blue" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-fp-text">{item.name}</h4>
                      <p className="text-xs text-fp-text-muted mt-1 leading-relaxed">{item.description}</p>
                      <span className="text-xs text-fp-text-dim uppercase tracking-wide mt-2 inline-block">{TYPE_LABELS[item.type]}</span>
                    </div>
                    <Plus className="w-4 h-4 text-fp-text-dim group-hover:text-fp-blue transition-colors shrink-0 mt-2" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Config Drawer */}
      {selectedConnector && (
        <div
          className="fixed inset-0 z-40 bg-fp-bg/80 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setSelectedConnector(null)}
        >
          <div
            className="bg-fp-surface rounded-2xl border border-fp-border shadow-2xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-fp-border">
              <h3 className="text-lg font-semibold text-fp-text">{selectedConnector.name}</h3>
              <button onClick={() => setSelectedConnector(null)} className="text-fp-text-dim hover:text-fp-text transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">Status</label>
                <p className="text-sm text-fp-text mt-1 capitalize">{selectedConnector.status}</p>
              </div>
              <div>
                <label className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">Endpoint</label>
                <p className="text-sm text-fp-text mt-1 break-all">{selectedConnector.endpoint || "—"}</p>
              </div>
              <div>
                <label className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">Last Sync</label>
                <p className="text-sm text-fp-text mt-1">{selectedConnector.last_sync ? new Date(selectedConnector.last_sync).toLocaleString() : "Never"}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
