"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[FairProcess] Global error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#070b14",
          color: "#e2e8f0",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went wrong
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            A client-side error occurred. Your data is safe — try reloading the page.
          </p>
          {error?.message && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "#64748b",
                marginBottom: "1rem",
                fontFamily: "monospace",
                background: "rgba(255,255,255,0.05)",
                padding: "0.5rem",
                borderRadius: "6px",
              }}
            >
              {error.message}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              background: "#3b82f6",
              color: "white",
              border: "none",
              padding: "0.5rem 1.5rem",
              borderRadius: "8px",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
