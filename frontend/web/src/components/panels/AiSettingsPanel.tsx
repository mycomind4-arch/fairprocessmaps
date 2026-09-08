"use client";

import { useEffect, useState } from "react";
import {
  KeyRound, Loader2, ShieldCheck, AlertTriangle, Check, Trash2,
  Activity, ChevronDown, ChevronRight,
} from "lucide-react";

interface AiSettings {
  provider: string;
  model: string | null;
  keyConfigured: boolean;
  keyLast4: string | null;
  updatedAt: string | null;
  fallback: "organization" | "platform";
  organizationKeyConfigured?: boolean;
  supportedProviders: string[];
}

interface UsageItem {
  id: string;
  provider: string;
  model: string | null;
  credentialScope: "user" | "organization" | "platform";
  operation: string;
  resourceType: string | null;
  resourceId: string | null;
  populatedPaths: string[];
  createdAt: string;
}

export default function AiSettingsPanel() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [usage, setUsage] = useState<UsageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    const [settingsRes, usageRes] = await Promise.all([
      fetch("/api/v1/settings/ai", { credentials: "include" }),
      fetch("/api/v1/settings/ai/usage", { credentials: "include" }),
    ]);
    if (settingsRes.ok) {
      const data = (await settingsRes.json()) as AiSettings;
      setSettings(data);
      setModelInput(data.model ?? "");
    }
    if (usageRes.ok) {
      const data = (await usageRes.json()) as { items: UsageItem[] };
      setUsage(data.items ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function save(payload: { apiKey?: string; model?: string | null; clearKey?: boolean }) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/settings/ai", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as AiSettings & { error?: string };
      if (!res.ok) {
        setMessage({ tone: "error", text: body.error ?? "Save failed." });
        return;
      }
      setSettings((current) => ({ ...(current ?? body), ...body }));
      setApiKeyInput("");
      setMessage({ tone: "ok", text: "Saved. New AI calls will use this personal setting first." });
    } catch (err) {
      setMessage({ tone: "error", text: String(err) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-48 rounded-[10px] shimmer" />;

  const personalUsage = usage.filter((item) => item.credentialScope === "user");

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-fp-text">Your Anthropic key</h1>
        <p className="text-sm text-fp-text-muted mt-2 leading-relaxed">
          Add your own Anthropic key to use your billing and rate limits for AI work you initiate.
          Your personal key takes priority over an organization or platform key.
        </p>
      </div>

      {message && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm flex items-center gap-2 ${message.tone === "ok" ? "border-fp-green/30 bg-fp-green/[0.05] text-fp-green" : "border-fp-red/30 bg-fp-red/[0.05] text-fp-red"}`}>
          {message.tone === "ok" ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      <div className="fp-panel p-6 space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-fp-text-dim" />
          <span className="text-sm font-medium text-fp-text">Personal Anthropic API key</span>
        </div>

        {settings?.keyConfigured ? (
          <div className="flex items-center justify-between gap-4 rounded-lg bg-fp-surface-2/60 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-fp-text">
              <ShieldCheck className="w-4 h-4 text-fp-green" />
              Configured — ending in <span className="font-mono">{settings.keyLast4}</span>
            </div>
            <button onClick={() => void save({ clearKey: true })} disabled={saving} className="flex items-center gap-1.5 text-xs text-fp-text-dim hover:text-fp-red disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-fp-border bg-fp-surface-2/40 px-4 py-3 text-xs text-fp-text-muted">
            No personal key configured. AI calls currently fall back to the {settings?.fallback === "organization" ? "organization key" : "platform key"}.
          </div>
        )}

        <div>
          <label htmlFor="apiKey" className="block text-xs font-medium text-fp-text mb-2">
            {settings?.keyConfigured ? "Replace your key" : "Add your key"}
          </label>
          <div className="flex gap-2">
            <input id="apiKey" type="password" autoComplete="off" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="sk-ant-..." className="flex-1 rounded-lg border border-fp-border px-3 py-2 text-sm font-mono focus:border-fp-blue focus:outline-none" />
            <button onClick={() => void save({ apiKey: apiKeyInput })} disabled={saving || !apiKeyInput.trim()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium disabled:opacity-40">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </button>
          </div>
          <p className="text-xs text-fp-text-dim mt-2 leading-relaxed">
            The Worker encrypts the key with AES-GCM before D1 storage. It is write-only: after saving, the UI receives only its last four characters.
          </p>
        </div>
      </div>

      <div className="fp-panel p-6 space-y-4">
        <span className="text-sm font-medium text-fp-text">Personal model override</span>
        <div className="flex gap-2">
          <input value={modelInput} onChange={(e) => setModelInput(e.target.value)} placeholder="Leave blank for the current default" className="flex-1 rounded-lg border border-fp-border px-3 py-2 text-sm font-mono focus:border-fp-blue focus:outline-none" />
          <button onClick={() => void save({ model: modelInput.trim() || null })} disabled={saving} className="px-4 py-2 rounded-lg border border-fp-border text-sm font-medium hover:bg-fp-surface-2 disabled:opacity-50">Save</button>
        </div>
      </div>

      <div className="fp-panel overflow-hidden">
        <div className="p-6 border-b border-fp-border flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-fp-blue" /><h2 className="text-sm font-semibold text-fp-text">What your key populated</h2></div>
            <p className="text-xs text-fp-text-muted mt-2">A provenance log of AI operations initiated with your personal credential. It stores field paths, not the generated values or your API key.</p>
          </div>
          <span className="text-xs font-medium rounded-full bg-fp-surface-2 px-2.5 py-1">{personalUsage.length}</span>
        </div>

        {personalUsage.length === 0 ? (
          <div className="p-6 text-sm text-fp-text-muted">Nothing has been populated using your personal key yet.</div>
        ) : (
          <div className="divide-y divide-fp-border">
            {personalUsage.map((item) => {
              const isOpen = expanded === item.id;
              return (
                <div key={item.id}>
                  <button onClick={() => setExpanded(isOpen ? null : item.id)} className="w-full p-4 text-left flex items-center gap-3 hover:bg-fp-surface-2/40">
                    {isOpen ? <ChevronDown className="w-4 h-4 text-fp-text-dim" /> : <ChevronRight className="w-4 h-4 text-fp-text-dim" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-fp-text">{item.operation}</div>
                      <div className="text-xs text-fp-text-dim mt-1">{new Date(item.createdAt).toLocaleString()} · {item.model ?? "default model"} · {item.populatedPaths.length} populated paths</div>
                    </div>
                    {item.resourceType && <span className="hidden sm:inline text-[10px] uppercase tracking-wide text-fp-text-dim">{item.resourceType}</span>}
                  </button>
                  {isOpen && (
                    <div className="px-11 pb-4">
                      <div className="rounded-lg bg-fp-surface-2/60 p-3 flex flex-wrap gap-1.5">
                        {item.populatedPaths.length > 0 ? item.populatedPaths.map((path) => <span key={path} className="rounded border border-fp-border bg-white px-2 py-1 text-[11px] font-mono text-fp-text-muted">{path}</span>) : <span className="text-xs text-fp-text-dim">The operation returned no structured field paths.</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
