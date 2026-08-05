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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fade-in_0.2s_ease-out]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm glass rounded-2xl p-6 shadow-2xl animate-[scale-in_0.25s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center mb-3 shadow-lg shadow-fp-blue/20">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-fp-text">Welcome back</h2>
          <p className="text-xs text-fp-text-dim mt-0.5">FairProcess 2.0</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl bg-fp-surface border border-fp-border px-3 py-2.5 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue/50 focus:ring-2 focus:ring-fp-blue/10 transition-all"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl bg-fp-surface border border-fp-border px-3 py-2.5 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue/50 focus:ring-2 focus:ring-fp-blue/10 transition-all"
            required
            minLength={8}
          />
          {error && <p className="text-sm text-fp-red">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-fp-blue to-fp-cyan text-white text-sm font-medium py-2.5 hover:shadow-lg hover:shadow-fp-blue/25 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? "Loading..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
