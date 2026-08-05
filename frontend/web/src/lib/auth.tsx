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
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FairProcessUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Resolve current user from session cookie via /api/v1/auth/me
  useEffect(() => {
    let cancelled = false;

    fetch("/api/v1/auth/me", { credentials: "same-origin" })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data?.user ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Login failed");
    }

    const data = await res.json();
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
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
