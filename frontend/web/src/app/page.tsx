"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { LoginModal } from "@/components/LoginModal";
import { Shield, Map, FileText, Scale, ArrowRight, CheckCircle2 } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  // If Supabase not configured (dev mode), go straight to dashboard
  useEffect(() => {
    const envConfigured = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!loading && !envConfigured) {
      router.replace("/dashboard");
    }
  }, [loading, router]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-fp-bg">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center shadow-lg shadow-fp-blue/20 animate-pulse">
          <Shield className="w-5 h-5 text-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fp-bg flex flex-col">
      {/* ── Header ── */}
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

      {/* ── Hero ── */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-fp-blue/10 blur-[120px]" />
          <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-fp-cyan/8 blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-3xl text-center animate-[fade-in_0.6s_ease-out]">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass mb-6 text-xs text-fp-text-muted">
            <CheckCircle2 className="w-3.5 h-3.5 text-fp-cyan" />
            Humboldt County Pilot — Live
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-fp-text tracking-tight leading-tight mb-4">
            Evidence-First Platform for
            <br />
            <span className="bg-gradient-to-r from-fp-blue to-fp-cyan bg-clip-text text-transparent">
              Property Due-Process Analysis
            </span>
          </h1>
          <p className="text-base text-fp-text-muted max-w-xl mx-auto mb-8 leading-relaxed">
            Combine property-centric GIS, an evidence vault, automatic timeline generation,
            and automated detection of due-process discrepancies — all on a globally distributed edge network.
          </p>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setShowLogin(true)}
              className="group flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-fp-blue to-fp-cyan text-white text-sm font-medium hover:shadow-xl hover:shadow-fp-blue/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Get Started
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <a
              href="https://github.com/mycomind4-arch/fairprocessmaps"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 rounded-xl glass text-fp-text-muted hover:text-fp-text text-sm font-medium transition-all hover:scale-[1.02]"
            >
              View on GitHub
            </a>
          </div>
        </div>

        {/* ── Feature Cards ── */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4 mt-16 max-w-4xl w-full px-2">
          {[
            {
              icon: Map,
              title: "GIS Parcel Mapping",
              desc: "Interactive parcel map with click-to-identify. Humboldt County ArcGIS integration for APN, zoning, acreage, and legal description lookup.",
            },
            {
              icon: FileText,
              title: "Evidence Vault",
              desc: "Upload and organize documents, photos, and notices. R2-backed storage with extracted text and AI-generated summaries for every item.",
            },
            {
              icon: Scale,
              title: "Due-Process Analysis",
              desc: "Automated rule engine checks notice timing, hearing rights, appeal pathways, abatement compliance, and permit review rights.",
            },
          ].map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="glass rounded-2xl p-6 hover:scale-[1.02] transition-transform animate-[fade-in_0.5s_ease-out]"
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-fp-blue/20 to-fp-cyan/20 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-fp-cyan" />
                </div>
                <h3 className="text-sm font-semibold text-fp-text mb-2">{feature.title}</h3>
                <p className="text-xs text-fp-text-muted leading-relaxed">{feature.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="h-16 flex items-center justify-center px-6 border-t border-fp-border text-xs text-fp-text-dim shrink-0">
        &copy; 2026 FairProcess Contributors — Apache 2.0
      </footer>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
