"use client";

import { useState, useEffect } from "react";
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
  const [showCatalog, setShowCatalog] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null);

  useEffect(() => {
    const key = `fairprocess_connectors_${projectId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        setConnectors(JSON.parse(stored));
      } catch {
        setConnectors([]);
      }
    }
    setLoading(false);
  }, [projectId]);

  const saveConnectors = (next: Connector[]) => {
    setConnectors(next);
    const key = `fairprocess_connectors_${projectId}`;
    localStorage.setItem(key, JSON.stringify(next));
  };

  const addConnector = (catalogItem: (typeof CATALOG)[number]) => {
    const newConnector: Connector = {
      id: crypto.randomUUID(),
      name: catalogItem.name,
      type: catalogItem.type,
      status: "pending",
      description: catalogItem.description,
      last_sync: null,
      endpoint: catalogItem.endpoint ?? null,
      config: {},
    };
    saveConnectors([...connectors, newConnector]);
    setShowCatalog(false);
  };

  const removeConnector = (id: string) => {
    saveConnectors(connectors.filter((c) => c.id !== id));
    setSelectedConnector(null);
  };

  const toggleStatus = (id: string) => {
    const next = connectors.map((c) =>
      c.id === id
        ? { ...c, status: c.status === "connected" ? ("disconnected" as const) : ("connected" as const), last_sync: c.status !== "connected" ? new Date().toISOString() : c.last_sync }
        : c
    );
    saveConnectors(next);
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

      {/* Preview — not yet connected to live data */}
      <div className="flex items-start gap-3 rounded-[14px] border border-fp-amber/30 bg-fp-amber/10 p-4">
        <AlertTriangle className="h-5 w-5 text-fp-amber shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-fp-amber">Preview — not yet connected to live data</p>
          <p className="text-xs text-fp-text-muted mt-1 leading-relaxed">
            Connector toggles and configurations are stored locally in your browser only. Toggling a connector does not yet trigger a real OAuth flow, API connection, or data sync. This panel will be wired to live backend endpoints in a future release.
          </p>
        </div>
      </div>

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
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-fp-surface-2 border border-fp-border flex items-center justify-center shrink-0">
                        <Icon className="w-6 h-6 text-fp-blue" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-fp-text leading-snug">{c.name}</h3>
                        <span className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">
                          {TYPE_LABELS[c.type]}
                        </span>
                      </div>
                    </div>

                    <StatusBadge status={c.status} />
                  </div>

                  {/* Description */}
                  <p className="text-sm text-fp-text-muted mt-4 leading-relaxed">
                    {c.description}
                  </p>
                </div>

                {/* Footer Zone: Last Sync & Actions */}
                <div className="pt-4 border-t border-fp-border flex items-center justify-between gap-4">
                  <div className="text-xs text-fp-text-dim">
                    <span className="block uppercase tracking-wide text-[10px]">Last Sync</span>
                    <span className="text-fp-text-muted font-mono mt-0.5 block">
                      {c.status === "connected" && c.last_sync
                        ? new Date(c.last_sync).toLocaleString()
                        : c.status === "connected"
                        ? "Just now"
                        : "Not connected"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedConnector(c)}
                      className="px-4 py-2 rounded-lg bg-fp-surface-2 border border-fp-border hover:bg-fp-surface-2/80 text-xs font-medium text-fp-text transition-colors"
                    >
                      Configure
                    </button>

                    <button
                      onClick={() => toggleStatus(c.id)}
                      className={`px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-sm ${
                        c.status === "connected"
                          ? "bg-fp-surface-2 border border-fp-border hover:bg-fp-red/15 hover:border-fp-red/40 hover:text-fp-red text-fp-text-muted"
                          : "bg-fp-blue text-white hover:bg-fp-blue/90 shadow-fp-blue/20"
                      }`}
                    >
                      {c.status === "connected" ? "Disconnect" : "Connect"}
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
        <Modal onClose={() => setShowCatalog(false)} title="Connector Catalog">
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {CATALOG.map((item) => {
              const Icon = item.icon;
              const alreadyAdded = connectors.some((c) => c.name === item.name);
              return (
                <div
                  key={item.name}
                  className="flex items-start justify-between gap-4 p-4 rounded-[14px] glass border border-fp-border hover:border-fp-blue/30 transition-all"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-fp-surface-2 border border-fp-border flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-5 h-5 text-fp-blue" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-fp-text">{item.name}</span>
                        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-fp-surface-2 text-fp-text-dim border border-fp-border">
                          {TYPE_LABELS[item.type]}
                        </span>
                      </div>
                      <p className="text-xs text-fp-text-muted mt-1 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                  <button
                    disabled={alreadyAdded}
                    onClick={() => addConnector(item)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all shrink-0 ${
                      alreadyAdded
                        ? "bg-fp-surface-2 text-fp-text-dim border border-fp-border cursor-not-allowed"
                        : "bg-fp-blue text-white hover:bg-fp-blue/90 shadow-sm"
                    }`}
                  >
                    {alreadyAdded ? "Added" : "Add"}
                  </button>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Connector Detail / Configure Modal */}
      {selectedConnector && (
        <Modal onClose={() => setSelectedConnector(null)} title={selectedConnector.name}>
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge status={selectedConnector.status} />
              <span className="text-xs uppercase tracking-wide text-fp-text-dim font-medium">
                {TYPE_LABELS[selectedConnector.type]}
              </span>
            </div>

            <p className="text-sm text-fp-text-muted leading-relaxed">{selectedConnector.description}</p>

            {selectedConnector.endpoint && (
              <div>
                <label className="text-xs uppercase tracking-wide text-fp-text-dim font-medium mb-1.5 block">Endpoint</label>
                <div className="rounded-lg border border-fp-border bg-fp-surface-2 p-3 font-mono text-xs text-fp-text-muted break-all">
                  {selectedConnector.endpoint}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs uppercase tracking-wide text-fp-text-dim font-medium mb-1 block">Last Synchronization</label>
              <p className="text-sm font-mono text-fp-text">
                {selectedConnector.last_sync ? new Date(selectedConnector.last_sync).toLocaleString() : "Never synced"}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-4 border-t border-fp-border">
              <button
                onClick={() => removeConnector(selectedConnector.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-fp-red/30 bg-fp-red/10 text-xs font-medium text-fp-red hover:bg-fp-red/20 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>

              <button
                onClick={() => {
                  toggleStatus(selectedConnector.id);
                  setSelectedConnector(null);
                }}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-fp-blue text-white text-xs font-medium hover:bg-fp-blue/90 transition-all shadow-md"
              >
                <Zap className="h-3.5 w-3.5" />
                {selectedConnector.status === "connected" ? "Disconnect" : "Connect"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Connector["status"] }) {
  const config = {
    connected: {
      color: "bg-fp-green/15 text-fp-green border-fp-green/30",
      label: "Connected",
      icon: CheckCircle2,
    },
    disconnected: {
      color: "bg-fp-surface-2 text-fp-text-dim border-fp-border",
      label: "Disconnected",
      icon: XCircle,
    },
    error: {
      color: "bg-fp-red/15 text-fp-red border-fp-red/30",
      label: "Error",
      icon: XCircle,
    },
    pending: {
      color: "bg-fp-amber/15 text-fp-amber border-fp-amber/30",
      label: "Pending",
      icon: Loader2,
    },
  };
  const { color, label, icon: Icon } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${color}`}>
      <Icon className={`w-3.5 h-3.5 ${status === "pending" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-[14px] glass p-6 shadow-2xl shadow-black/50 max-h-[85vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-fp-border">
          <h3 className="text-base font-semibold text-fp-text">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
