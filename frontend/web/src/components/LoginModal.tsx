"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Shield } from "lucide-react";

export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
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
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await signUp(name, email, password);
      }
      setName("");
      setEmail("");
      setPassword("");
      onClose();
    } catch (err: any) {
      setError(err.message || (mode === "signin" ? "Authentication failed" : "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: "signin" | "signup") => {
    setMode(newMode);
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-fp-bg/80 backdrop-blur-md p-4 animate-[fade-in_0.2s_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={mode === "signin" ? "Sign in" : "Create account"}
    >
      <div
        className="w-full max-w-sm glass rounded-xl p-5 shadow-2xl shadow-black/50 animate-[scale-in_0.2s_cubic-bezier(0.16,1,0.3,1)] space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center shadow-lg shadow-fp-blue/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-fp-text">
            {mode === "signin" ? "Welcome Back" : "Create Account"}
          </h2>
          <p className="text-xs text-fp-text-dim uppercase tracking-wide">FairProcess Workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="block text-xs text-fp-text-dim mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg bg-fp-surface border border-fp-border px-3 py-2.5 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue focus:ring-2 focus:ring-fp-blue/10 transition-all"
                  required
                  minLength={2}
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-fp-text-dim mb-1">Email Address</label>
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-fp-surface border border-fp-border px-3 py-2.5 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue focus:ring-2 focus:ring-fp-blue/10 transition-all"
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
                className="w-full rounded-lg bg-fp-surface border border-fp-border px-3 py-2.5 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue focus:ring-2 focus:ring-fp-blue/10 transition-all"
                required
                minLength={8}
              />
            </div>
          </div>

          {error && <p className="text-xs text-fp-red p-3 rounded-lg bg-fp-red/10 border border-fp-red/20">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-fp-blue text-white text-sm font-semibold py-2.5 hover:bg-fp-blue/90 transition-all disabled:opacity-50"
          >
            {loading
              ? mode === "signin" ? "Authenticating…" : "Creating account…"
              : mode === "signin" ? "Sign In to Workspace" : "Create Account"}
          </button>
        </form>

        <div className="text-center">
          {mode === "signin" ? (
            <p className="text-xs text-fp-text-dim">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="text-fp-blue hover:underline font-medium transition-all"
              >
                Create one
              </button>
            </p>
          ) : (
            <p className="text-xs text-fp-text-dim">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="text-fp-blue hover:underline font-medium transition-all"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
