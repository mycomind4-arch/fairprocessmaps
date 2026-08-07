/**
 * FairProcess Authentication — Phase 1E
 *
 * Replaces Supabase auth with the standalone D1-based session system.
 * Uses httpOnly cookies set by /api/v1/auth/login and /api/v1/auth/logout.
 * The client just needs to know if the user is logged in and their identity.
 */

"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface FairProcessUser {
  id: string;
  email: string;
  name: string;
  organization_id: string;
  role: string;
}

interface AuthContextValue {
  user: FairProcessUser | null;
  loading: boolean;
  authError: string | null;
  retry: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_TIMEOUT_MS = 10_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FairProcessUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // Resolve current user from session cookie via /api/v1/auth/me
  useEffect(() => {
    let cancelled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (!cancelled) {
        setAuthError("We couldn't verify your session. Please check your connection and try again.");
        setLoading(false);
      }
    }, AUTH_TIMEOUT_MS);

    fetch("/api/v1/auth/me", { credentials: "same-origin" })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data: any) => {
        if (!cancelled && !timedOut) {
          clearTimeout(timer);
          setUser(data?.user ?? null);
          setAuthError(null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled && !timedOut) {
          clearTimeout(timer);
          setUser(null);
          setAuthError("Network error — couldn't reach the authentication server.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [retryToken]);

  const retry = () => {
    setLoading(true);
    setAuthError(null);
    setRetryToken((t) => t + 1);
  };

  const signIn = async (email: string, password: string) => {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as any;
      throw new Error(data.error ?? "Login failed");
    }

    const data = await res.json() as any;
    setUser(data.user);
  };

  const signUp = async (name: string, email: string, password: string) => {
    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as any;
      throw new Error(data.error ?? "Registration failed");
    }

    const data = await res.json() as any;
    setUser(data.user);
  };

  const signOut = async () => {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, retry, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
