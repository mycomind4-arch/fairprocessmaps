"use client";

import { useCallback, useState } from "react";
import { Upload, FileText, X, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { EvidenceType } from "@/lib/types";

interface DocumentUploadProps {
  propertyId: string;
  onUploaded?: () => void;
}

const EVIDENCE_TYPES: { value: EvidenceType; label: string }[] = [
  { value: "code_enforcement_notice", label: "Code Enforcement Notice" },
  { value: "hearing_notice", label: "Hearing Notice" },
  { value: "court_filing", label: "Court Filing" },
  { value: "appeal_document", label: "Appeal Document" },
  { value: "inspector_report", label: "Inspector Report" },
  { value: "permit_application", label: "Permit Application" },
  { value: "correspondence", label: "Correspondence" },
  { value: "public_record", label: "Public Record" },
  { value: "photograph", label: "Photograph" },
  { value: "other", label: "Other" },
];

type UploadStatus = "idle" | "uploading" | "success" | "error";

export default function DocumentUpload({ propertyId, onUploaded }: DocumentUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("code_enforcement_notice");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const upload = async () => {
    if (files.length === 0) return;
    setStatus("uploading");
    setErrorMsg("");
    try {
      for (const file of files) await api.upload(propertyId, file, evidenceType);
      setStatus("success");
      setFiles([]);
      setTimeout(() => setStatus("idle"), 3000);
      onUploaded?.();
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof ApiError ? e.detail : "Upload failed");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-4 space-y-3 animate-[fade-in_0.3s_ease-out]">
      <h2 className="text-xs font-semibold text-fp-text-muted uppercase tracking-wider">Upload Evidence</h2>

      <div>
        <label className="text-xs text-fp-text-dim block mb-1">Evidence Type</label>
        <select
          value={evidenceType}
          onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
          className="w-full text-sm rounded-lg bg-fp-surface border border-fp-border px-3 py-2 focus:outline-none focus:border-fp-blue/50 focus:ring-2 focus:ring-fp-blue/10 transition-all"
        >
          {EVIDENCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
          dragOver ? "border-fp-blue bg-fp-blue/10" : "border-fp-border hover:border-fp-border-hover surface-flat"
        }`}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2 transition-all ${dragOver ? "bg-fp-blue/20" : "bg-fp-surface-2"}`}>
          <Upload className={`w-5 h-5 transition-colors ${dragOver ? "text-fp-blue" : "text-fp-text-dim"}`} />
        </div>
        <p className="text-sm text-fp-text-muted">Drag & drop files here, or click to browse</p>
        <p className="text-xs text-fp-text-dim mt-1">PDF, images, documents — up to 50MB each</p>
        <input id="file-input" type="file" multiple className="hidden" onChange={handleFileInput} />
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5 animate-[slide-down_0.2s_ease-out]">
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center gap-2.5 surface-flat rounded-lg px-3 py-2">
              <div className="w-7 h-7 rounded-lg bg-fp-surface-2 flex items-center justify-center shrink-0">
                <FileText className="w-3.5 h-3.5 text-fp-text-muted" />
              </div>
              <span className="text-sm flex-1 truncate text-fp-text">{file.name}</span>
              <span className="text-xs text-fp-text-dim shrink-0 tabular-nums">{formatSize(file.size)}</span>
              <button onClick={() => removeFile(idx)} className="text-fp-text-dim hover:text-fp-red transition-colors p-1" aria-label="Remove file">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && status !== "uploading" && (
        <button onClick={upload} className="w-full bg-fp-blue text-white text-sm font-medium py-2.5 rounded-lg hover:bg-fp-blue/90 transition-all">
          Upload {files.length} file{files.length > 1 ? "s" : ""}
        </button>
      )}

      {status === "uploading" && (
        <div className="flex items-center justify-center gap-2 text-sm text-fp-text-muted surface-flat rounded-lg px-3 py-2.5">
          <Loader2 className="w-4 h-4 animate-spin" />
          Uploading & queuing for processing...
        </div>
      )}

      {status === "success" && (
        <div className="flex items-center gap-2 text-sm text-fp-green bg-fp-green/10 border border-fp-green/20 rounded-lg px-3 py-2.5 animate-[scale-in_0.25s_ease-out]">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Upload complete — processing queued
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-2 text-sm text-fp-red bg-fp-red/10 border border-fp-red/20 rounded-lg px-3 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}
    </div>
  );
}
