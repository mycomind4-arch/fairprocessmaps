"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import AiSettingsPanel from "@/components/panels/AiSettingsPanel";

export default function PersonalAiSettingsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="min-h-screen bg-fp-bg flex items-center justify-center text-sm text-fp-text-muted">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-fp-bg text-fp-text">
      <header className="h-16 bg-white border-b border-fp-border flex items-center justify-between px-5 sm:px-8 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="p-2 rounded-lg hover:bg-fp-surface-2" aria-label="Back to dashboard"><ArrowLeft className="w-4 h-4" /></button>
          <div className="w-8 h-8 rounded-lg bg-fp-text flex items-center justify-center"><ShieldAlert className="w-4 h-4 text-white" /></div>
          <div><div className="font-semibold text-sm">FairProcessMaps</div><div className="text-[10px] text-fp-text-dim uppercase tracking-[0.12em]">Personal AI settings</div></div>
        </div>
        <span className="hidden sm:block text-xs text-fp-text-muted">{user.email}</span>
      </header>
      <main className="max-w-[900px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
        <AiSettingsPanel />
      </main>
    </div>
  );
}
