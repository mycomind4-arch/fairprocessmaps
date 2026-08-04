"use client";

import { useState, useEffect } from "react";
import {
  Plug,
  Database,
  Globe,
  Brain,
  Webhook,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  Settings,
  Trash2,
  ChevronRight,
  Zap,
  Link2,
  Cloud,
  FileSearch,
  Bot,
  X,
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
  { name: "GPT-4 Evidence Analyzer", type: "ai_tool", description: "AI analysis of uploaded documents for legal relevance, due process issues, and evidence strength", icon: Brain },
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-fp-accent" />
        <span className="ml-2 text-fp-text-muted">Loading connectors…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-fp-text">Connectors & Skills</h2>
          <p className="text-sm text-fp-text-muted mt-0.5">County data integrations, scraping pipelines, and AI analysis tools</p>
        </div>
        <button
          onClick={() => setShowCatalog(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-fp-accent px-3 py-1.5 text-sm font-medium text-black hover:bg-fp-accent/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Connector
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-fp-border bg-fp-card p-4">
          <div className="flex items-center justify-between">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-2xl font-semibold text-fp-text">{connectedCount}</span>
          </div>
          <p className="text-xs text-fp-text-muted mt-1">Connected</p>
        </div>
        <div className="rounded-lg border border-fp-border bg-fp-card p-4">
          <div className="flex items-center justify-between">
            <Loader2 className="h-4 w-4 text-amber-500" />
            <span className="text-2xl font-semibold text-fp-text">{pendingCount}</span>
          </div>
          <p className="text-xs text-fp-text-muted mt-1">Pending</p>
        </div>
        <div className="rounded-lg border border-fp-border bg-fp-card p-4">
          <div className="flex items-center justify-between">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-2xl font-semibold text-fp-text">{errorCount}</span>
          </div>
          <p className="text-xs text-fp-text-muted mt-1">Errors</p>
        </div>
        <div className="rounded-lg border border-fp-border bg-fp-card p-4">
          <div className="flex items-center justify-between">
            <Plug className="h-4 w-4 text-fp-accent" />
            <span className="text-2xl font-semibold text-fp-text">{connectors.length}</span>
          </div>
          <p className="text-xs text-fp-text-muted mt-1">Total</p>
        </div>
      </div>

      {/* Connector List */}
      {connectors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-fp-border p-12 text-center">
          <Plug className="mx-auto h-10 w-10 text-fp-text-muted/40" />
          <p className="mt-3 text-sm font-medium text-fp-text">No connectors configured</p>
          <p className="text-xs text-fp-text-muted mt-1">Add a data source, scraper, or AI tool to start pulling county data automatically.</p>
          <button
            onClick={() => setShowCatalog(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-fp-accent px-3 py-1.5 text-sm font-medium text-black hover:bg-fp-accent/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Browse Catalog
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {connectors.map((c) => {
            const Icon = TYPE_ICONS[c.type];
            return (
              <button
                key={c.id}
                onClick={() => setSelectedConnector(c)}
                className="w-full flex items-center gap-3 rounded-lg border border-fp-border bg-fp-card p-3 hover:border-fp-accent/30 transition-colors text-left"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-fp-bg">
                  <Icon className="h-5 w-5 text-fp-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-fp-text truncate">{c.name}</span>
                    <span className="text-xs text-fp-text-muted px-1.5 py-0.5 rounded bg-fp-bg">{TYPE_LABELS[c.type]}</span>
                  </div>
                  <p className="text-xs text-fp-text-muted truncate mt-0.5">{c.description}</p>
                  {c.last_sync && (
                    <p className="text-xs text-fp-text-muted/60 mt-0.5">Last sync: {new Date(c.last_sync).toLocaleString()}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={c.status} />
                  <ChevronRight className="h-4 w-4 text-fp-text-muted" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Catalog Modal */}
      {showCatalog && (
        <Modal onClose={() => setShowCatalog(false)} title="Connector Catalog">
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {CATALOG.map((item) => {
              const Icon = item.icon;
              const alreadyAdded = connectors.some((c) => c.name === item.name);
              return (
                <div
                  key={item.name}
                  className="flex items-center gap-3 rounded-lg border border-fp-border bg-fp-card p-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-fp-bg">
                    <Icon className="h-5 w-5 text-fp-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-fp-text">{item.name}</span>
                      <span className="text-xs text-fp-text-muted px-1.5 py-0.5 rounded bg-fp-bg">{TYPE_LABELS[item.type]}</span>
                    </div>
                    <p className="text-xs text-fp-text-muted mt-0.5">{item.description}</p>
                  </div>
                  <button
                    disabled={alreadyAdded}
                    onClick={() => addConnector(item)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-fp-accent text-black hover:bg-fp-accent/90"
                  >
                    {alreadyAdded ? "Added" : "Add"}
                  </button>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Connector Detail Modal */}
      {selectedConnector && (
        <Modal onClose={() => setSelectedConnector(null)} title={selectedConnector.name}>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <StatusBadge status={selectedConnector.status} />
              <span className="text-xs text-fp-text-muted">{TYPE_LABELS[selectedConnector.type]}</span>
            </div>
            <p className="text-sm text-fp-text-muted">{selectedConnector.description}</p>

            {selectedConnector.endpoint && (
              <div>
                <p className="text-xs font-medium text-fp-text-muted mb-1">Endpoint</p>
                <div className="rounded-md border border-fp-border bg-fp-bg p-2 font-mono text-xs text-fp-text-muted break-all">
                  {selectedConnector.endpoint}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-fp-text-muted mb-1">Last Sync</p>
              <p className="text-sm text-fp-text">{selectedConnector.last_sync ? new Date(selectedConnector.last_sync).toLocaleString() : "Never"}</p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => toggleStatus(selectedConnector.id)}
                className="inline-flex items-center gap-1.5 rounded-md bg-fp-accent px-3 py-1.5 text-sm font-medium text-black hover:bg-fp-accent/90 transition-colors"
              >
                <Zap className="h-4 w-4" />
                {selectedConnector.status === "connected" ? "Disconnect" : "Connect"}
              </button>
              <button
                onClick={() => removeConnector(selectedConnector.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-800/40 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-950/30 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Remove
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
    connected: { color: "text-emerald-500 bg-emerald-950/40", label: "Connected", icon: CheckCircle2 },
    disconnected: { color: "text-fp-text-muted bg-fp-bg", label: "Disconnected", icon: XCircle },
    error: { color: "text-red-500 bg-red-950/40", label: "Error", icon: XCircle },
    pending: { color: "text-amber-500 bg-amber-950/40", label: "Pending", icon: Loader2 },
  };
  const { color, label, icon: Icon } = config[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      <Icon className={`h-3 w-3 ${status === "pending" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-fp-border bg-fp-card p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-fp-text">{title}</h3>
          <button onClick={onClose} className="text-fp-text-muted hover:text-fp-text transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
