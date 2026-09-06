"use client";

/**
 * Case Assistant — a chat with a Claude session scoped to this case. It can
 * read the timeline, evidence, findings, property intelligence, and saved
 * documents, and it can propose changes to the timeline or draft a document
 * on demand.
 *
 * Proposed changes (add/edit/remove a timeline event) show as cards with
 * Approve/Reject buttons and never apply on their own — see
 * src/lib/case-assistant.ts for why.
 */

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, AlertCircle, Bot, User, CheckCircle2, XCircle, Sparkles } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface PendingAction {
  id: string;
  toolName: string;
  preview: string;
}

const TOOL_LABEL: Record<string, string> = {
  add_timeline_event: "Add timeline event",
  edit_timeline_event: "Edit timeline event",
  remove_timeline_event: "Remove timeline event",
};

function extractText(blocks: Array<Record<string, unknown>>): string {
  return blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text as string)
    .join("\n")
    .trim();
}

export default function CaseAssistantPanel({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${projectId}/assistant/history`);
      if (!res.ok) throw new Error(`Failed to load conversation (${res.status})`);
      const json: { messages?: { role: "user" | "assistant"; content: Array<Record<string, unknown>> }[]; pendingActions?: PendingAction[] } = await res.json();
      const chat: ChatMessage[] = (json.messages ?? [])
        .map((m) => ({ role: m.role, text: extractText(m.content) }))
        .filter((m) => m.text.length > 0);
      setMessages(chat);
      setPending(json.pendingActions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadHistory(); /* eslint-disable-next-line */ }, [projectId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, pending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${projectId}/assistant/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const json: { reply?: string; pendingActions?: PendingAction[]; error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      if (json.reply) setMessages((m) => [...m, { role: "assistant", text: json.reply! }]);
      setPending(json.pendingActions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const resolve = async (actionId: string, approve: boolean) => {
    setResolvingId(actionId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${projectId}/assistant/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId, approve }),
      });
      const json: { reply?: string; pendingActions?: PendingAction[]; error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setPending((prev) => prev.filter((p) => p.id !== actionId));
      if (json.reply) setMessages((m) => [...m, { role: "assistant", text: json.reply! }]);
      setPending(json.pendingActions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve action");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] max-h-[900px]">
      <div className="mb-3">
        <h2 className="text-xl font-semibold tracking-tight text-fp-text flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-fp-blue" /> Case Assistant
        </h2>
        <p className="text-sm text-fp-text-muted mt-0.5">
          Ask about the record, or ask it to add a timeline event or draft a document. Nothing changes the case without your approval.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3 text-fp-red text-sm p-3 rounded-lg bg-fp-red/10 border border-fp-red/20 mb-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto rounded-xl surface-flat p-4 space-y-4">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-fp-text-muted">
            <Loader2 className="w-4 h-4 animate-spin text-fp-blue" /> Loading conversation…
          </div>
        )}

        {!loading && messages.length === 0 && pending.length === 0 && (
          <div className="text-center py-10 text-sm text-fp-text-dim">
            Ask something like "what's missing from this case?" or "draft an appeal letter."
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-fp-blue/15 border border-fp-blue/30 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-fp-blue" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === "user"
                  ? "bg-fp-blue text-white"
                  : "bg-fp-surface-2 text-fp-text border border-fp-border"
              }`}
            >
              {m.text}
            </div>
            {m.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-fp-surface-2 border border-fp-border flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-fp-text-muted" />
              </div>
            )}
          </div>
        ))}

        {pending.map((p) => (
          <div key={p.id} className="rounded-xl border border-fp-amber/40 bg-fp-amber/10 p-3.5 ml-9">
            <div className="text-xs font-semibold uppercase tracking-wide text-fp-amber mb-1">
              {TOOL_LABEL[p.toolName] ?? p.toolName} — needs your approval
            </div>
            <p className="text-sm text-fp-text mb-3">{p.preview}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => resolve(p.id, true)}
                disabled={resolvingId === p.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-green text-white text-xs font-medium hover:bg-fp-green/90 disabled:opacity-50"
              >
                {resolvingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Approve
              </button>
              <button
                onClick={() => resolve(p.id, false)}
                disabled={resolvingId === p.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-fp-text-muted text-xs font-medium hover:text-fp-red hover:border-fp-red/40 disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject
              </button>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-fp-blue/15 border border-fp-blue/30 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-fp-blue" />
            </div>
            <div className="rounded-xl px-3.5 py-2.5 bg-fp-surface-2 border border-fp-border">
              <Loader2 className="w-4 h-4 animate-spin text-fp-text-dim" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 mt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask about this case…"
          disabled={sending}
          className="flex-1 px-3.5 py-2.5 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue transition-colors disabled:opacity-60"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="p-2.5 rounded-lg bg-fp-blue text-white hover:bg-fp-blue/90 disabled:opacity-50 transition-colors"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
