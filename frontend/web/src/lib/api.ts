import type {
  Property,
  PropertyCreate,
  Evidence,
  EvidenceCreate,
  TimelineEvent,
  DueProcessReport,
  SearchResult,
  UploadResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

class ApiError extends Error {
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
      const body = (await res.json()) as { detail?: string };
      detail = body.detail || detail;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // ── Properties ──
  properties: {
    list(params?: {
      county?: string;
      state?: string;
      city?: string;
      lat?: number;
      lon?: number;
      radius_meters?: number;
      limit?: number;
      offset?: number;
    }): Promise<Property[]> {
      const qs = new URLSearchParams();
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v != null) qs.append(k, String(v));
        }
      }
      return request<Property[]>(`/api/v1/properties?${qs}`);
    },

    get(id: string): Promise<Property> {
      return request<Property>(`/api/v1/properties/${id}`);
    },

    create(data: PropertyCreate): Promise<Property> {
      return request<Property>("/api/v1/properties", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
  },

  // ── Evidence ──
  evidence: {
    list(params?: {
      property_id?: string;
      evidence_type?: string;
      status?: string;
      has_due_process_flags?: boolean;
      limit?: number;
      offset?: number;
    }): Promise<Evidence[]> {
      const qs = new URLSearchParams();
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v != null) qs.append(k, String(v));
        }
      }
      return request<Evidence[]>(`/api/v1/evidence?${qs}`);
    },

    get(id: string): Promise<Evidence> {
      return request<Evidence>(`/api/v1/evidence/${id}`);
    },

    update(id: string, data: Partial<Evidence>): Promise<Evidence> {
      return request<Evidence>(`/api/v1/evidence/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
  },

  // ── Timeline ──
  timeline: {
    get(propertyId: string, flagsOnly?: boolean): Promise<TimelineEvent[]> {
      const qs = flagsOnly ? "?include_flags_only=true" : "";
      return request<TimelineEvent[]>(`/api/v1/timeline/${propertyId}${qs}`);
    },
  },

  // ── Search ──
  search(
    q: string,
    options?: { property_type?: string; county?: string; limit?: number }
  ): Promise<SearchResult[]> {
    const qs = new URLSearchParams({ q });
    if (options) {
      for (const [k, v] of Object.entries(options)) {
        if (v != null) qs.append(k, String(v));
      }
    }
    return request<SearchResult[]>(`/api/v1/search?${qs}`);
  },

  // ── Due Process ──
  dueProcess: {
    analyze(propertyId: string): Promise<DueProcessReport> {
      return request<DueProcessReport>(
        `/api/v1/due-process/property/${propertyId}`
      );
    },
  },

  // ── Upload ──
  upload(
    propertyId: string,
    file: File,
    evidenceType: string = "other"
  ): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("evidence_type", evidenceType);

    return fetch(`${API_BASE}/api/v1/upload/property/${propertyId}`, {
      method: "POST",
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const body = (await res.json()) as { detail?: string };
          detail = body.detail || detail;
        } catch {
          // not JSON
        }
        throw new ApiError(res.status, detail);
      }
      return res.json();
    });
  },
};

export { ApiError };
