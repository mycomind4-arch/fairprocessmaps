"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { LoginModal } from "@/components/LoginModal";
import { Shield, Map, FileText, Scale, ArrowRight, AlertTriangle, Clock, Network, CheckCircle2 } from "lucide-react";

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

  const features = [
    { icon: Map, title: "Property-Centric GIS", desc: "Parcel boundaries, zoning overlays, and ownership data from county ArcGIS APIs." },
    { icon: FileText, title: "AI Evidence Extraction", desc: "OCR and LLM-powered analysis of uploaded documents for legal relevance." },
    { icon: Clock, title: "Timeline Reconstruction", desc: "Automated chronological sequencing of notices, hearings, and enforcement actions." },
    { icon: Scale, title: "Due-Process Detection", desc: "Statute matching and procedural discrepancy detection against California code." },
  ];

  return (
    <div className="min-h-screen bg-fp-bg flex flex-col">
      <header className="h-14 sm:h-16 flex items-center justify-between px-4 sm:px-6 glass shrink-0 z-20 border-b border-fp-border">
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

      <main className="flex-1 flex flex-col">
        {/* Hero — background image with dark overlay for legibility */}
        <div className="relative flex flex-col items-center justify-center px-4 py-16 sm:py-28 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url(/images/hero-fairprocess.png)" }}
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-fp-bg/70" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-t from-fp-bg via-fp-bg/40 to-transparent" aria-hidden="true" />

          <div className="relative max-w-2xl w-full text-center">
            <h1 className="text-2xl sm:text-4xl font-bold text-white tracking-tight mb-3 drop-shadow-sm">
              Evidence-First Due-Process Analysis
            </h1>
            <p className="text-sm sm:text-base text-white/80 mb-8 max-w-xl mx-auto">
              Property-centric GIS, public-record ingestion, AI extraction, timeline generation,
              and automated due-process discrepancy detection.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowLogin(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-fp-blue text-white font-medium text-sm hover:bg-fp-blue/90 transition-colors"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowLogin(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/30 text-white/90 font-medium text-sm hover:text-white hover:border-white/50 transition-colors"
              >
                View Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* Feature highlights — below the fold, on normal surface */}
        <div className="flex-1 px-4 sm:px-6 py-8 sm:py-12">
          <div className="max-w-3xl w-full mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="surface-flat rounded-xl p-4 flex items-start gap-3 transition-all">
                  <div className="w-9 h-9 rounded-lg bg-fp-blue/15 border border-fp-blue/30 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-fp-blue" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-fp-text">{f.title}</h3>
                    <p className="text-xs text-fp-text-muted mt-1 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
