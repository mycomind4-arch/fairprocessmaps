"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, Loader2, Mail, Plus, RefreshCw, Truck, XCircle, Send } from "lucide-react";

interface Communication {
  id: string;
  case_id: string;
  purpose: string;
  status: string;
  mail_class: string;
  source_document_id?: string | null;
  provider: string | null;
  provider_job_id: string | null;
  recipient_name: string;
  recipient_company?: string | null;
  recipient_city: string;
  recipient_state: string;
  matter_reference?: string | null;
  tracking_number?: string | null;
  proof_url?: string | null;
  created_at: string;
  delivered_at?: string | null;
}

interface EvidenceItem {
  id: string;
  title: string | null;
  original_filename?: string | null;
  status: string;
  withdrawn?: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  payment_pending: "Payment pending",
  queued: "Queued",
  submitted: "Submitted",
  accepted: "Accepted",
  in_transit: "In transit",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
};

function statusIcon(status: string) {
  if (status === "delivered") return <CheckCircle2 className="w-4 h-4 text-fp-green" />;
  if (status === "failed" || status === "cancelled") return <XCircle className="w-4 h-4 text-fp-red" />;
  if (status === "in_transit" || status === "submitted" || status === "accepted") return <Truck className="w-4 h-4 text-fp-blue" />;
  return <Mail className="w-4 h-4 text-fp-text-dim" />;
}

export default function CommunicationsPanel({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<Communication[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    purpose: "Response to government notice",
    recipient_name: "",
    recipient_company: "",
    recipient_address1: "",
    recipient_address2: "",
    recipient_city: "",
    recipient_state: "CA",
    recipient_postal_code: "",
    matter_reference: "",
    source_document_id: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [communicationsResponse, evidenceResponse] = await Promise.all([
        fetch(`/api/v1/cases/${caseId}/communications`, { cache: "no-store" }),
        fetch(`/api/v1/cases/${caseId}/evidence`, { cache: "no-store" }),
      ]);
      if (!communicationsResponse.ok) throw new Error(`Could not load communications (${communicationsResponse.status})`);
      if (!evidenceResponse.ok) throw new Error(`Could not load case evidence (${evidenceResponse.status})`);
      const communicationsJson = await communicationsResponse.json() as { data?: Communication[] };
      const evidenceJson = await evidenceResponse.json() as { data?: EvidenceItem[] };
      setItems(communicationsJson.data ?? []);
      setEvidence((evidenceJson.data ?? []).filter((item) => item.status !== "withdrawn" && item.withdrawn !== 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load communications");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch(`/api/v1/cases/${caseId}/communications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          purpose: form.purpose,
          mail_class: "certified",
          source_document_id: form.source_document_id || undefined,
          recipient_name: form.recipient_name,
          recipient_company: form.recipient_company || undefined,
          recipient_address1: form.recipient_address1,
          recipient_address2: form.recipient_address2 || undefined,
          recipient_city: form.recipient_city,
          recipient_state: form.recipient_state,
          recipient_postal_code: form.recipient_postal_code,
          matter_reference: form.matter_reference || undefined,
        }),
      });
      const json = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(json.error?.message || `Could not prepare mail (${response.status})`);
      setShowForm(false);
      setForm((current) => ({ ...current, recipient_name: "", recipient_company: "", recipient_address1: "", recipient_address2: "", recipient_city: "", recipient_postal_code: "", source_document_id: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare mail");
    } finally {
      setCreating(false);
    }
  }

  async function sendCommunication(item: Communication) {
    if (!item.source_document_id) {
      setError("Attach a response document to this communication before sending.");
      return;
    }
    if (!confirm("Send this response through MailMyPDF for physical mailing?")) return;
    setSendingId(item.id);
    setError(null);
    try {
      const response = await fetch(`/api/v1/cases/${caseId}/communications/${item.id}/send`, { method: "POST" });
      const json = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(json.error?.message || `Could not send mail (${response.status})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send mail");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <section className="space-y-4" aria-label="Communications and mailing">
      <div className="glass rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-fp-text flex items-center gap-2"><Mail className="w-4 h-4 text-fp-blue" /> Communications & Proof</h2>
          <p className="text-xs text-fp-text-muted mt-1">Prepare formal responses, send through MailMyPDF, track physical delivery, and keep proof attached to the case.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => void load()} className="p-2 rounded-lg bg-fp-surface-2 border border-fp-border text-fp-text-muted hover:text-fp-text" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowForm((value) => !value)} className="px-3 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium flex items-center gap-2"><Plus className="w-4 h-4" /> Prepare Mail</button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={createDraft} className="surface-flat rounded-xl p-4 border border-fp-border space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-fp-text"><FileText className="w-4 h-4 text-fp-blue" /> Certified-mail preparation</div>
          <p className="text-xs text-fp-text-muted">Select the response/evidence document that will become the physical-mail source file. The send step remains explicit.</p>
          <select required value={form.source_document_id} onChange={(e) => setForm({ ...form, source_document_id: e.target.value })} className="w-full rounded-lg border border-fp-border bg-fp-surface px-3 py-2 text-sm text-fp-text">
            <option value="">Select response document…</option>
            {evidence.map((item) => <option key={item.id} value={item.id}>{item.title || item.original_filename || item.id}</option>)}
          </select>
          {evidence.length === 0 && <p className="text-xs text-fp-amber">No usable case documents are available yet. Add the response to the Evidence Vault first.</p>}
          <input required value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Purpose" className="w-full rounded-lg border border-fp-border bg-fp-surface px-3 py-2 text-sm" />
          <div className="grid sm:grid-cols-2 gap-3">
            <input required value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} placeholder="Recipient name" className="rounded-lg border border-fp-border bg-fp-surface px-3 py-2 text-sm" />
            <input value={form.recipient_company} onChange={(e) => setForm({ ...form, recipient_company: e.target.value })} placeholder="Agency / company" className="rounded-lg border border-fp-border bg-fp-surface px-3 py-2 text-sm" />
          </div>
          <input required value={form.recipient_address1} onChange={(e) => setForm({ ...form, recipient_address1: e.target.value })} placeholder="Street address" className="w-full rounded-lg border border-fp-border bg-fp-surface px-3 py-2 text-sm" />
          <input value={form.recipient_address2} onChange={(e) => setForm({ ...form, recipient_address2: e.target.value })} placeholder="Suite / unit (optional)" className="w-full rounded-lg border border-fp-border bg-fp-surface px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <input required value={form.recipient_city} onChange={(e) => setForm({ ...form, recipient_city: e.target.value })} placeholder="City" className="rounded-lg border border-fp-border bg-fp-surface px-3 py-2 text-sm" />
            <input required value={form.recipient_state} onChange={(e) => setForm({ ...form, recipient_state: e.target.value })} placeholder="State" maxLength={2} className="rounded-lg border border-fp-border bg-fp-surface px-3 py-2 text-sm uppercase" />
            <input required value={form.recipient_postal_code} onChange={(e) => setForm({ ...form, recipient_postal_code: e.target.value })} placeholder="ZIP" className="rounded-lg border border-fp-border bg-fp-surface px-3 py-2 text-sm" />
          </div>
          <input value={form.matter_reference} onChange={(e) => setForm({ ...form, matter_reference: e.target.value })} placeholder="Matter / agency reference (optional)" className="w-full rounded-lg border border-fp-border bg-fp-surface px-3 py-2 text-sm" />
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 rounded-lg border border-fp-border text-sm text-fp-text-muted">Cancel</button>
            <button type="submit" disabled={creating || !form.source_document_id} className="px-3 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50">{creating && <Loader2 className="w-4 h-4 animate-spin" />} Create Draft</button>
          </div>
        </form>
      )}

      {error && <div className="rounded-lg border border-fp-red/30 bg-fp-red/10 text-fp-red text-sm p-3">{error}</div>}

      {loading ? (
        <div className="py-10 flex items-center justify-center text-fp-text-muted text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading communications…</div>
      ) : items.length === 0 ? (
        <div className="surface-flat rounded-xl p-8 text-center"><Mail className="w-7 h-7 mx-auto text-fp-text-dim mb-2" /><p className="text-sm text-fp-text-muted">No case communications yet.</p><p className="text-xs text-fp-text-dim mt-1">Prepare the first formal response when the defense is ready.</p></div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <article key={item.id} className="surface-flat rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-fp-surface-2 flex items-center justify-center shrink-0">{statusIcon(item.status)}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-fp-text truncate">{item.purpose}</div>
                <div className="text-xs text-fp-text-muted truncate">{item.recipient_name}{item.recipient_company ? ` · ${item.recipient_company}` : ""} · {item.recipient_city}, {item.recipient_state}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-semibold text-fp-text">{STATUS_LABELS[item.status] ?? item.status}</div>
                <div className="text-xs text-fp-text-dim">{item.mail_class === "certified" ? "Certified" : item.mail_class}</div>
              </div>
              {item.tracking_number && <div className="hidden md:block font-mono text-xs text-fp-blue">{item.tracking_number}</div>}
              {item.status === "draft" && <button onClick={() => void sendCommunication(item)} disabled={sendingId === item.id} className="px-2.5 py-1.5 rounded-lg bg-fp-blue text-white text-xs font-medium flex items-center gap-1.5 disabled:opacity-50" title="Send through MailMyPDF"><Send className="w-3.5 h-3.5" />{sendingId === item.id ? "Sending…" : "Send"}</button>}
              {item.proof_url && <a href={item.proof_url} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 rounded-lg border border-fp-border text-xs text-fp-text-muted hover:text-fp-blue">Proof</a>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
