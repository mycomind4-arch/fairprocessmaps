"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Shield } from "lucide-react";

export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      onClose();
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-fp-bg/80 backdrop-blur-md p-4 animate-[fade-in_0.2s_ease-out]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm glass rounded-[14px] p-6 shadow-2xl shadow-black/50 animate-[scale-in_0.2s_cubic-bezier(0.16,1,0.3,1)] space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center shadow-lg shadow-fp-blue/20">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-fp-text">Welcome Back</h2>
          <p className="text-xs text-fp-text-dim uppercase tracking-wide">FairProcess Workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-fp-text-dim mb-1">Email Address</label>
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl bg-fp-surface border border-fp-border px-4 py-2.5 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue focus:ring-2 focus:ring-fp-blue/10 transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-fp-text-dim mb-1">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-fp-surface border border-fp-border px-4 py-2.5 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue focus:ring-2 focus:ring-fp-blue/10 transition-all"
                required
                minLength={8}
              />
            </div>
          </div>

          {error && <p className="text-xs text-fp-red p-3 rounded-xl bg-fp-red/10 border border-fp-red/20">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-fp-blue text-white text-sm font-semibold py-3 hover:shadow-lg hover:shadow-fp-blue/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50"
          >
            {loading ? "Authenticating…" : "Sign In to Workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}
