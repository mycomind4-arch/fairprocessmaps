"use client";

import { Loader2, Check, AlertCircle } from "lucide-react";

export function AutoSaveIndicator({
  saving,
  saved,
  error,
}: {
  saving: boolean;
  saved: boolean;
  error: string | null;
}) {
  if (saving) {
    return (
      <div className="flex items-center gap-2 text-xs font-medium text-fp-blue animate-[fade-in_0.2s_ease-out]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Saving changes…</span>
      </div>
    );
  }
  if (saved) {
    return (
      <div className="flex items-center gap-2 text-xs font-medium text-fp-green animate-[fade-in_0.2s_ease-out]">
        <Check className="w-3.5 h-3.5" />
        <span>All changes saved</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs font-medium text-fp-red animate-[fade-in_0.2s_ease-out]">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>{error}</span>
      </div>
    );
  }
  return null;
}
