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
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const upload = async () => {
    if (files.length === 0) return;
    setStatus("uploading");
    setErrorMsg("");

    try {
      for (const file of files) {
        await api.upload(propertyId, file, evidenceType);
      }
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
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-semibold text-fp-gray-700 uppercase tracking-wide">
        Upload Evidence
      </h2>

      {/* Evidence type selector */}
      <div>
        <label className="text-xs text-fp-gray-500 block mb-1">Evidence Type</label>
        <select
          value={evidenceType}
          onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
          className="w-full text-sm border border-fp-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-fp-blue/20 focus:border-fp-blue"
        >
          {EVIDENCE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
          dragOver ? "border-fp-blue bg-fp-blue/5" : "border-fp-gray-300 hover:border-fp-gray-400"
        }`}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <Upload className="w-6 h-6 text-fp-gray-400 mx-auto mb-2" />
        <p className="text-sm text-fp-gray-500">
          Drag & drop files here, or click to browse
        </p>
        <p className="text-xs text-fp-gray-400 mt-1">
          PDF, images, documents — up to 50MB each
        </p>
        <input
          id="file-input"
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 bg-fp-gray-50 rounded-md px-2 py-1.5"
            >
              <FileText className="w-4 h-4 text-fp-gray-400 shrink-0" />
              <span className="text-sm flex-1 truncate">{file.name}</span>
              <span className="text-xs text-fp-gray-400 shrink-0">
                {formatSize(file.size)}
              </span>
              <button
                onClick={() => removeFile(idx)}
                className="text-fp-gray-400 hover:text-fp-red transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {files.length > 0 && status !== "uploading" && (
        <button
          onClick={upload}
          className="w-full bg-fp-blue text-white text-sm font-medium py-2 rounded-lg hover:bg-fp-blue/90 transition-colors"
        >
          Upload {files.length} file{files.length > 1 ? "s" : ""}
        </button>
      )}

      {/* Status indicators */}
      {status === "uploading" && (
        <div className="flex items-center justify-center gap-2 text-sm text-fp-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Uploading & queuing for processing...
        </div>
      )}

      {status === "success" && (
        <div className="flex items-center gap-2 text-sm text-fp-green bg-green-50 rounded-md px-3 py-2">
          <CheckCircle className="w-4 h-4" />
          Upload complete — processing queued
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-2 text-sm text-fp-red bg-red-50 rounded-md px-3 py-2">
          <AlertCircle className="w-4 h-4" />
          {errorMsg}
        </div>
      )}
    </div>
  );
}
