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
      <div className="flex items-center gap-1.5 text-[11px] text-fp-text-dim animate-[fade-in_0.2s_ease-out]">
        <Loader2 className="w-3 h-3 animate-spin" />
        Saving…
      </div>
    );
  }
  if (saved) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 animate-[fade-in_0.2s_ease-out]">
        <Check className="w-3 h-3" />
        Saved
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-fp-red animate-[fade-in_0.2s_ease-out]">
        <AlertCircle className="w-3 h-3" />
        {error}
      </div>
    );
  }
  return null;
}
