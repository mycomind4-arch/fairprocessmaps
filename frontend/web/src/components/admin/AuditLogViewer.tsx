"use client";

import { useState, useEffect } from "react";
import {
  History, Search, Loader2, User, Bot, Server, Download,
  Shield, FileText, MapPin, Calendar, Filter
} from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import type { AuditLog } from "@/lib/types/identity";

const ACTOR_ICONS: Record<string, typeof User> = {
  user: User,
  ai_agent: Bot,
  system: Server,
  scraper: Download,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  warning: "text-yellow-400",
  info: "text-fp-text-dim",
};

interface AuditLogViewerProps {
  orgId?: string;
}

export function AuditLogViewer({ orgId }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterActor, setFilterActor] = useState("");

  useEffect(() => {
    loadLogs();
  }, [orgId, filterAction, filterActor]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await adminApi.auditLogs.list({
        org_id: orgId,
        action: filterAction || undefined,
        actor_type: filterActor || undefined,
        limit: 100,
      });
      setLogs(data);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = logs.filter((log) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.actor_name?.toLowerCase().includes(q) ||
      log.resource_name?.toLowerCase().includes(q) ||
      log.resource_type?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-fp-text-dim" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-fp-cyan" />
        <h3 className="text-sm font-semibold text-fp-text">Audit Logs</h3>
        <span className="text-xs text-fp-text-dim">({filtered.length} entries)</span>
        <Shield className="w-3 h-3 text-fp-text-dim ml-1" />
        <span className="text-xs text-fp-text-dim">Append-only</span>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fp-text-dim" />
          <input
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg bg-fp-surface-2 border border-fp-border pl-9 pr-3 py-2 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue"
          />
        </div>
        <select
          value={filterActor}
          onChange={(e) => setFilterActor(e.target.value)}
          className="rounded-lg bg-fp-surface-2 border border-fp-border px-3 py-2 text-sm text-fp-text focus:outline-none focus:border-fp-blue"
        >
          <option value="">All actors</option>
          <option value="user">Users</option>
          <option value="ai_agent">AI Agents</option>
          <option value="system">System</option>
          <option value="scraper">Scrapers</option>
        </select>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="rounded-lg bg-fp-surface-2 border border-fp-border px-3 py-2 text-sm text-fp-text focus:outline-none focus:border-fp-blue"
        >
          <option value="">All actions</option>
          <option value="login">Login</option>
          <option value="logout">Logout</option>
          <option value="evidence.upload">Evidence Upload</option>
          <option value="evidence.export">Evidence Export</option>
          <option value="evidence.delete">Evidence Delete</option>
          <option value="ai.run">AI Analysis</option>
          <option value="mail.certified">Certified Mail</option>
          <option value="permission.change">Permission Change</option>
        </select>
      </div>

      {/* Log entries */}
      <div className="rounded-xl border border-fp-border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-fp-text-dim">No audit log entries</div>
        ) : (
          filtered.map((log, i) => {
            const ActorIcon = ACTOR_ICONS[log.actor_type] || Server;
            return (
              <div
                key={log.id}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-fp-surface-2 transition-colors ${i > 0 ? "border-t border-fp-border" : ""}`}
              >
                <div className="w-8 h-8 rounded-lg bg-fp-surface-2 flex items-center justify-center shrink-0 mt-0.5">
                  <ActorIcon className="w-3.5 h-3.5 text-fp-cyan" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-fp-text">{log.action}</span>
                    {log.resource_type && (
                      <span className="text-xs text-fp-text-dim">
                        · {log.resource_type}
                        {log.resource_name && `: ${log.resource_name}`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-fp-text-dim">
                    {log.actor_name && <span>by {log.actor_name}</span>}
                    {log.case_id && (
                      <span className="flex items-center gap-0.5">
                        <FileText className="w-2.5 h-2.5" /> Case
                      </span>
                    )}
                    <span className="flex items-center gap-0.5">
                      <Calendar className="w-2.5 h-2.5" />
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  {log.details && (
                    <div className="mt-1 text-xs text-fp-text-dim bg-fp-surface-2 rounded px-2 py-1 font-mono">
                      {typeof log.details === "string" ? log.details : JSON.stringify(log.details)}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="text-xs text-fp-text-dim text-center">
        Showing {filtered.length} of {logs.length} entries · Audit logs are immutable and append-only
      </div>
    </div>
  );
}
