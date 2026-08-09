"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { LoginModal } from "@/components/LoginModal";
import { ArrowRight, AlertTriangle, CheckCircle2, Clock, FileText, Scale, Search, ShieldAlert } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const { user, loading, authError, retry } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-fp-bg"><div className="w-8 h-8 rounded-lg bg-fp-text flex items-center justify-center animate-pulse"><ShieldAlert className="w-4 h-4 text-white" /></div></div>;

  if (authError) return <div className="min-h-screen flex items-center justify-center bg-fp-bg px-6"><div className="max-w-sm text-center space-y-4"><div className="w-10 h-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center mx-auto"><AlertTriangle className="w-5 h-5 text-red-700" /></div><h2 className="text-lg font-semibold">Something went wrong</h2><p className="text-sm text-fp-text-muted">{authError}</p><button onClick={retry} className="px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-semibold">Retry</button></div></div>;

  const features = [
    { icon: Search, title: "Build the record", desc: "Property records, agency documents, notices, permits, and other evidence in one case." },
    { icon: Clock, title: "Reconstruct what happened", desc: "Turn scattered records into a chronological, evidence-linked timeline." },
    { icon: Scale, title: "Find procedural problems", desc: "Compare the documented sequence against applicable process and authority." },
    { icon: FileText, title: "Build the response", desc: "Turn verified findings into a human-reviewed defense and formal response." },
  ];

  return (
    <div className="min-h-screen bg-fp-bg text-fp-text">
      <header className="h-16 bg-white border-b border-fp-border flex items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-fp-text flex items-center justify-center"><ShieldAlert className="w-4 h-4 text-white" /></div><div><div className="font-semibold text-sm tracking-tight">FairProcessMaps</div><div className="text-[10px] text-fp-text-dim uppercase tracking-[0.12em]">Build your case</div></div></div>
        <button onClick={() => setShowLogin(true)} className="text-sm font-medium text-fp-text-muted hover:text-fp-text">Sign in</button>
      </header>

      <main>
        <section className="relative overflow-hidden bg-white border-b border-fp-border">
          <div className="absolute inset-0 bg-cover bg-center opacity-[0.10]" style={{ backgroundImage: "url(/images/hero-fairprocess.png)" }} aria-hidden="true" />
          <div className="relative max-w-5xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
            <div className="max-w-3xl">
              <div className="fp-eyebrow">Evidence-first case workspace</div>
              <h1 className="text-4xl sm:text-6xl font-semibold tracking-[-0.04em] leading-[1.03] mt-4 max-w-3xl">Build the record.<br />Find the process problem.<br /><span className="text-fp-blue">Build your defense.</span></h1>
              <p className="text-base sm:text-lg text-fp-text-muted leading-7 mt-6 max-w-2xl">FairProcessMaps brings evidence, public records, timelines, procedural analysis, defense building, and certified-mail proof into one disciplined case file.</p>
              <div className="flex flex-wrap items-center gap-3 mt-8"><button onClick={() => setShowLogin(true)} className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-fp-blue text-white text-sm font-semibold hover:bg-blue-700">Start a case <ArrowRight className="w-4 h-4" /></button><button onClick={() => setShowLogin(true)} className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-fp-border bg-white text-sm font-semibold hover:bg-fp-surface-2">View workspace</button></div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-7 text-xs text-fp-text-muted"><span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-fp-green" /> Source-linked evidence</span><span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-fp-green" /> Human-reviewed responses</span><span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-fp-green" /> Mailing proof</span></div>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <div className="mb-8"><div className="fp-eyebrow">One workflow</div><h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-2">From evidence to proof.</h2></div>
          <div className="grid sm:grid-cols-2 gap-px bg-fp-border border border-fp-border rounded-xl overflow-hidden">
            {features.map((feature) => { const Icon = feature.icon; return <div key={feature.title} className="bg-white p-6"><div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center mb-4"><Icon className="w-4 h-4 text-fp-blue" /></div><h3 className="text-sm font-semibold">{feature.title}</h3><p className="text-sm text-fp-text-muted leading-6 mt-2">{feature.desc}</p></div>; })}
          </div>
        </section>
      </main>

      <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
