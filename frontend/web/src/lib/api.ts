/**
 * API client for FairProcess — matches the actual Cloudflare D1/Workers API.
 * All endpoints are project-scoped (not property-scoped).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json() as { detail?: string; error?: string };
      detail = body.detail || body.error || detail;
    } catch { /* not JSON */ }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // ── Properties ──
  properties: {
    get(id: string) {
      return request<any>(`/api/v1/properties?id=${encodeURIComponent(id)}`);
    },
  },

  // ── Search ──
  search(q: string, limit = 10) {
    const qs = new URLSearchParams({ q, limit: String(limit) });
    return request<{ items: any[] }>(`/api/v1/search?${qs}`);
  },

  // ── Projects ──
  projects: {
    get(id: string) {
      return request<any>(`/api/v1/projects?id=${encodeURIComponent(id)}`);
    },
    create(data: { property_id: string; name: string; case_type?: string }) {
      return request<any>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
  },

  // ── Resolve property by APN ──
  resolveProperty(data: { apn: string; address?: string; city?: string; zoning?: string; acres?: number; legal?: string; lng?: number; lat?: number }) {
    return request<any>("/api/v1/properties/resolve", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
