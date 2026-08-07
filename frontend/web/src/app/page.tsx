"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { LoginModal } from "@/components/LoginModal";
import { Shield, Map, FileText, Scale, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const { user, loading, authError, retry } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-fp-bg">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center shadow-lg shadow-fp-blue/20 animate-pulse">
          <Shield className="w-5 h-5 text-white" />
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="h-screen flex items-center justify-center bg-fp-bg">
        <div className="max-w-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-fp-red/15 border border-fp-red/30 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-fp-red" />
          </div>
          <h2 className="text-lg font-semibold text-fp-text">Something went wrong</h2>
          <p className="text-sm text-fp-text-muted">{authError}</p>
          <button
            onClick={retry}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fp-bg flex flex-col">
      <header className="h-16 flex items-center justify-between px-6 glass shrink-0 z-20 border-b border-fp-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center shadow-lg shadow-fp-blue/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight text-fp-text leading-none">FairProcess</div>
            <div className="text-[10px] text-fp-text-dim uppercase tracking-widest mt-0.5">Evidence-First</div>
          </div>
        </div>
        <button
          onClick={() => setShowLogin(true)}
          className="text-sm text-fp-text-muted hover:text-fp-text transition-colors px-4 py-2 rounded-lg hover:bg-fp-surface-2"
        >
          Sign In
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center shadow-xl shadow-fp-blue/30 mx-auto mb-8">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-fp-text tracking-tight mb-4">
            Evidence-First Due-Process Analysis
          </h1>
          <p className="text-lg text-fp-text-muted mb-8">
            Property-centric GIS, public-record ingestion, AI extraction, timeline generation,
            and automated due-process discrepancy detection.
          </p>
          <button
            onClick={() => setShowLogin(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-fp-blue text-white font-medium hover:bg-fp-blue/90 transition-colors"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>

      <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
