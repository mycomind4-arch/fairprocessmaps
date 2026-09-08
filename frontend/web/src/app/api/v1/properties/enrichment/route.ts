import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";

export const runtime = "nodejs";

interface Candidate {
  field: string;
  value: string;
  source: string;
  confidence: number;
  explanation: string;
  sourceUrl?: string;
}

const FREE_SOURCES = [
  {
    id: "humboldt-assessor",
    name: "Humboldt County Assessor — Property Assessment Inquiry",
    url: "https://www.humboldtgov.org/230/Property-Assessment-Inquiry",
    cost: "free",
    canProvide: ["assessment", "property characteristics", "ownership verification"],
    note: "Official county assessment search by fee parcel number or street address. Name-based searching is intentionally disabled.",
  },
  {
    id: "humboldt-accela",
    name: "Humboldt County Accela — Property Lookup",
    url: "https://aca-prod.accela.com/HUMBOLDT/APO/APOLookup.aspx?TabName=Home",
    cost: "free",
    canProvide: ["owner", "parcel", "address", "permit/record links"],
    note: "The county's public Accela lookup exposes Address, Parcel, Owner, and Record Information search modes. It is useful as a second independent source but its web form may change.",
  },
  {
    id: "humboldt-lis",
    name: "Humboldt County GIS — Land Information System",
    url: "https://www.humboldtgov.org/276/GIS-Data-Download",
    cost: "free",
    canProvide: ["APN", "zoning", "land use", "site address", "parcel geometry"],
    note: "Official downloadable LIS and parcel datasets. Excellent for property facts; the published LIS description does not promise owner names.",
  },
  {
    id: "recorder-index",
    name: "Humboldt County Recorder index",
    url: "https://humboldtcountyca-web.tylerhost.net/web/",
    cost: "free/index access varies",
    canProvide: ["deeds", "grantor/grantee", "recording date", "document type"],
    note: "A recent grantee can be an owner candidate, not proof of current ownership. Trust transfers, probate, partial interests, and later instruments can change the answer.",
  },
] as const;

function textCandidateFromParties(parties: unknown): string | null {
  if (!parties) return null;
  if (typeof parties === "object") {
    const obj = parties as Record<string, unknown>;
    const value = obj.grantee ?? obj.grantees ?? obj.owner ?? obj.owners;
    if (Array.isArray(value)) return value.filter(Boolean).join(", ") || null;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (typeof parties !== "string") return null;
  try {
    return textCandidateFromParties(JSON.parse(parties));
  } catch {
    const match = parties.match(/(?:grantee|buyer|transferee)\s*[:=|-]\s*([^;|\n]+)/i);
    return match?.[1]?.trim() || null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const apn = (req.nextUrl.searchParams.get("apn") ?? "").trim();
  if (!apn) return NextResponse.json({ error: "apn is required" }, { status: 400 });

  const { env } = getCloudflareContext();
  const db = env.DB;
  const property = await db.prepare("SELECT * FROM properties WHERE apn = ? LIMIT 1").bind(apn).first<Record<string, unknown>>();
  const candidates: Candidate[] = [];

  // Some existing/live property rows already carry enriched owner_name even
  // though the historical schema snapshot does not. SELECT * lets us consume
  // it when present without making the endpoint depend on that optional column.
  const cachedOwner = typeof property?.owner_name === "string" ? property.owner_name.trim() : "";
  if (cachedOwner) {
    candidates.push({
      field: "owner_name",
      value: cachedOwner,
      source: "FairProcess property cache",
      confidence: 0.9,
      explanation: "Previously populated owner value. Verify it against a current county source before materially relying on it.",
    });
  }

  if (property?.id) {
    try {
      const recorder = await db.prepare(
        `SELECT r.parties, r.recording_date, r.document_type, r.source_url
           FROM recorder_records r
           JOIN projects p ON p.id = r.project_id
          WHERE p.property_id = ? AND p.organization_id = ?
          ORDER BY COALESCE(r.recording_date, r.created_at) DESC
          LIMIT 20`,
      ).bind(property.id as string, auth.user.organization_id).all();

      for (const row of recorder.results ?? []) {
        const possibleOwner = textCandidateFromParties((row as any).parties);
        if (!possibleOwner) continue;
        candidates.push({
          field: "owner_name",
          value: possibleOwner,
          source: "Recorder latest grantee candidate",
          confidence: 0.62,
          explanation: `Derived from a recorded ${String((row as any).document_type ?? "instrument")} dated ${String((row as any).recording_date ?? "unknown")}. A grantee is only a candidate for current ownership until independently verified.`,
          sourceUrl: typeof (row as any).source_url === "string" ? (row as any).source_url : undefined,
        });
        break;
      }
    } catch {
      // Recorder enrichment is optional. A schema/import gap should not make
      // the official-source directory unavailable.
    }
  }

  const stored = property?.id
    ? await db.prepare(
        `SELECT field_name, value, source, source_url, confidence, source_date
           FROM property_enrichment_candidates
          WHERE property_id = ?
          ORDER BY confidence DESC, updated_at DESC LIMIT 50`,
      ).bind(property.id as string).all().catch(() => ({ results: [] as unknown[] }))
    : { results: [] as unknown[] };

  for (const row of stored.results ?? []) {
    candidates.push({
      field: String((row as any).field_name),
      value: String((row as any).value),
      source: String((row as any).source),
      confidence: Number((row as any).confidence ?? 0.5),
      explanation: `Cached source-backed enrichment${(row as any).source_date ? ` from ${(row as any).source_date}` : ""}.`,
      sourceUrl: (row as any).source_url ? String((row as any).source_url) : undefined,
    });
  }

  return NextResponse.json(
    {
      apn,
      property: property ? {
        id: property.id,
        address: property.address ?? null,
        city: property.city ?? null,
        zoning: property.zoning ?? null,
        acres: property.acres ?? null,
      } : null,
      candidates,
      freeSources: FREE_SOURCES,
      guidance: "Owner candidates are leads, not legal conclusions. Prefer current assessor/official property records and corroborate recorder-derived names.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
