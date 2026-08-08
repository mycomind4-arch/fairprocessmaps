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
  Cloud,
  FileSearch,
  X,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

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
      await fetchConnectors();
      setError(err instanceof Error ? err.message : "Failed to update connector");
    }
  };

  const connectedCount = connectors.filter((c) => c.status === "connected").length;
  const errorCount = connectors.filter((c) => c.status === "error").length;
  const pendingCount = connectors.filter((c) => c.status === "pending").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-fp-text-muted text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-fp-blue mr-2" />
        <span>Loading integrations…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8 max-w-5xl" role="region" aria-label="Connectors and Skills">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fp-text">Connectors &amp; Skills</h2>
          <p className="text-sm text-fp-text-muted mt-0.5">County data integrations, scraping pipelines, and AI tools</p>
        </div>
        <button
          onClick={() => setShowCatalog(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all"
        >
          <Plus className="h-4 w-4" />
          Add Connector
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-fp-red/30 bg-fp-red/10 p-3">
          <AlertTriangle className="h-4 w-4 text-fp-red shrink-0 mt-0.5" />
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

      {/* Compact Stats Bar */}
      <div className="flex items-center gap-4 flex-wrap surface-flat rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-fp-green" />
          <span className="text-sm font-semibold text-fp-text">{connectedCount}</span>
          <span className="text-xs text-fp-text-dim uppercase tracking-wide">Connected</span>
        </div>
        <div className="w-px h-5 bg-fp-border" />
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-4 w-4 text-fp-amber" />
          <span className="text-sm font-semibold text-fp-text">{pendingCount}</span>
          <span className="text-xs text-fp-text-dim uppercase tracking-wide">Pending</span>
        </div>
        <div className="w-px h-5 bg-fp-border" />
        <div className="flex items-center gap-1.5">
          <XCircle className="h-4 w-4 text-fp-red" />
          <span className="text-sm font-semibold text-fp-text">{errorCount}</span>
          <span className="text-xs text-fp-text-dim uppercase tracking-wide">Errors</span>
        </div>
        <div className="w-px h-5 bg-fp-border" />
        <div className="flex items-center gap-1.5">
          <Plug className="h-4 w-4 text-fp-blue" />
          <span className="text-sm font-semibold text-fp-text">{connectors.length}</span>
          <span className="text-xs text-fp-text-dim uppercase tracking-wide">Total</span>
        </div>
      </div>

      {/* Connector List */}
      {!loading && connectors.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-xl surface-flat flex items-center justify-center mb-3">
            <Plug className="w-6 h-6 text-fp-text-dim" />
          </div>
          <p className="text-sm text-fp-text-muted">No connectors configured</p>
          <p className="text-xs text-fp-text-dim mt-1">Add a data source, scraper, or AI tool to get started.</p>
        </div>
      )}

      {connectors.length > 0 && (
        <div className="space-y-2">
          {connectors.map((connector) => {
            const Icon = TYPE_ICONS[connector.type];
            return (
              <div key={connector.id} className="rounded-xl surface-flat p-3 transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-fp-surface-2 border border-fp-border flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-fp-blue" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-fp-text">{connector.name}</h3>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        connector.status === "connected" ? "text-fp-green border-fp-green/30 bg-fp-green/10" :
                        connector.status === "pending" ? "text-fp-amber border-fp-amber/30 bg-fp-amber/10" :
                        connector.status === "error" ? "text-fp-red border-fp-red/30 bg-fp-red/10" :
                        "text-fp-text-dim border-fp-border bg-fp-surface-2"
                      }`}>
                        {connector.status}
                      </span>
                    </div>
                    <p className="text-xs text-fp-text-muted mt-0.5 line-clamp-1">{connector.description}</p>
                    {connector.last_sync && (
                      <p className="text-[10px] text-fp-text-dim mt-0.5">Last sync: {connector.last_sync.slice(0, 16).replace("T", " ")}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleStatus(connector.id)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        connector.status === "connected" ? "text-fp-green hover:bg-fp-green/10" : "text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2"
                      }`}
                      title={connector.status === "connected" ? "Disconnect" : "Connect"}
                      aria-label={connector.status === "connected" ? "Disconnect" : "Connect"}
                    >
                      <Plug className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeConnector(connector.id)}
                      className="p-1.5 rounded-lg text-fp-text-dim hover:text-fp-red hover:bg-fp-red/10 transition-colors"
                      title="Remove"
                      aria-label="Remove connector"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Catalog Modal */}
      {showCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-fp-bg/80 backdrop-blur-md p-4 animate-[fade-in_0.2s_ease-out]" onClick={() => setShowCatalog(false)}>
          <div className="w-full max-w-2xl rounded-xl glass p-4 shadow-2xl shadow-black/50 animate-[scale-in_0.2s_cubic-bezier(0.16,1,0.3,1)] space-y-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-fp-text">Add Connector</h2>
              <button
                onClick={() => setShowCatalog(false)}
                className="p-1.5 rounded-lg text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {CATALOG.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.name}
                    onClick={() => addConnector(item)}
                    className="w-full flex items-start gap-3 p-3 rounded-xl surface-flat hover:border-fp-blue/40 text-left transition-all"
                  >
                    <div className="w-9 h-9 rounded-lg bg-fp-surface-2 border border-fp-border flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-fp-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-fp-text">{item.name}</h3>
                        <span className="text-[10px] text-fp-text-dim uppercase tracking-wide bg-fp-surface-2 px-2 py-0.5 rounded-md border border-fp-border">
                          {TYPE_LABELS[item.type]}
                        </span>
                      </div>
                      <p className="text-xs text-fp-text-muted mt-0.5">{item.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
