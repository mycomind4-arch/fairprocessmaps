"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, AlertTriangle, Check, Trash2 } from "lucide-react";

/**
 * AI provider settings.
 *
 * The one rule that shapes every line here: the plaintext key is typed once,
 * sent once, and never comes back. This component never receives it from the
 * server after saving — only "configured, ending in ab12" — so there is
 * nothing here that could leak it back onto a screen, a log, or a screenshot.
 */

interface AiSettings {
  provider: string;
  model: string | null;
  keyConfigured: boolean;
  keyLast4: string | null;
  updatedAt: string | null;
  supportedProviders: string[];
}

export default function AiSettingsPanel() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function load() {
    const res = await fetch("/api/v1/settings/ai", { credentials: "include" });
    if (res.ok) {
      const data = (await res.json()) as AiSettings;
      setSettings(data);
      setModelInput(data.model ?? "");
    } else if (res.status === 403) {
      setMessage({ tone: "error", text: "Only an administrator can view or change these settings." });
    }
    setLoading(false);
  }

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

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
      setSettings(body);
      setApiKeyInput("");
      setMessage({ tone: "ok", text: "Saved." });
    } catch (err) {
      setMessage({ tone: "error", text: String(err) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="h-40 rounded-[10px] shimmer" />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-medium text-fp-text">AI provider</h2>
        <p className="text-sm text-fp-text-muted mt-2 leading-relaxed">
          This applies across your whole organization, not just this case — every
          document reading, draft, and recon step in any case calls this key. Bring
          your own to use your own Anthropic billing and rate limits instead of the
          platform default.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm flex items-center gap-2 ${
            message.tone === "ok"
              ? "border-fp-green/30 bg-fp-green/[0.05] text-fp-green"
              : "border-fp-red/30 bg-fp-red/[0.05] text-fp-red"
          }`}
        >
          {message.tone === "ok" ? (
            <Check className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      <div className="fp-panel p-6 space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-fp-text-dim" />
          <span className="text-sm font-medium text-fp-text">Anthropic API key</span>
        </div>

        {settings?.keyConfigured ? (
          <div className="flex items-center justify-between gap-4 rounded-lg bg-fp-surface-2/60 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-fp-text">
              <ShieldCheck className="w-4 h-4 text-fp-green shrink-0" />
              Configured — ending in <span className="font-mono">{settings.keyLast4}</span>
            </div>
            <button
              onClick={() => save({ clearKey: true })}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs text-fp-text-dim hover:text-fp-red transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
        ) : (
          <p className="text-xs text-fp-text-dim">
            No key configured — this org is using the platform's shared key.
          </p>
        )}

        <div>
          <label htmlFor="apiKey" className="block text-xs font-medium text-fp-text mb-2">
            {settings?.keyConfigured ? "Replace with a new key" : "Add your key"}
          </label>
          <div className="flex gap-2">
            <input
              id="apiKey"
              type="password"
              autoComplete="off"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              className="flex-1 rounded-lg border border-fp-border px-3 py-2 text-sm font-mono focus:border-fp-blue focus:outline-none transition-colors"
            />
            <button
              onClick={() => save({ apiKey: apiKeyInput })}
              disabled={saving || !apiKeyInput.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </button>
          </div>
          <p className="text-xs text-fp-text-dim mt-2 leading-relaxed">
            Encrypted before it is stored. It is never shown again after saving —
            only its last 4 characters, so you can confirm which key is active.
          </p>
        </div>
      </div>

      <div className="fp-panel p-6 space-y-4">
        <span className="text-sm font-medium text-fp-text">Model</span>
        <div className="flex gap-2">
          <input
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            placeholder="claude-sonnet-4-20250514 (platform default)"
            className="flex-1 rounded-lg border border-fp-border px-3 py-2 text-sm font-mono focus:border-fp-blue focus:outline-none transition-colors"
          />
          <button
            onClick={() => save({ model: modelInput.trim() || null })}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-fp-border text-sm font-medium text-fp-text hover:bg-fp-surface-2 transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </div>
        <p className="text-xs text-fp-text-dim leading-relaxed">
          Leave blank to use the platform default. This is a text field, not a fixed
          list — Anthropic's model names change over time and this should not need
          an app update to follow them. Enter the exact model id from Anthropic's
          documentation.
        </p>
      </div>

      <div className="rounded-lg border border-fp-amber/25 bg-fp-amber/[0.04] p-4">
        <p className="text-xs text-fp-amber leading-relaxed">
          <span className="font-medium">Anthropic only, today.</span> Other providers
          (OpenAI, Gemini) would need a real per-provider adapter — they don't share
          Anthropic's request format, and none of them read PDFs the same way this
          product does. Swapping the reading pipeline to a different provider without
          that adapter would silently change how documents get read. Ask if you need
          this and it can be scoped properly rather than bolted on.
        </p>
      </div>
    </div>
  );
}
