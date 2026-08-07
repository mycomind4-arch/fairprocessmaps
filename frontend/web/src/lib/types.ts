// Shared TypeScript types — mirrors backend Pydantic schemas

export type EvidenceType =
  | "code_enforcement_notice"
  | "permit_application"
  | "court_filing"
  | "hearing_notice"
  | "appeal_document"
  | "inspector_report"
  | "photograph"
  | "video"
  | "audio"
  | "correspondence"
  | "public_record"
  | "other";

export type EvidenceStatus =
  | "raw"
  | "ocr_pending"
  | "ocr_complete"
  | "extraction_pending"
  | "extracted"
  | "normalized"
  | "linked"
  | "analyzed"
  | "flagged"
  | "archived";

export interface Property {
  id: string;
  parcel_id: string;
  address: string;
  city: string;
  county: string;
  state: string;
  zip_code: string;
  country: string;
  property_type: string | null;
  lot_size_sqft: number | null;
  year_built: number | null;
  owner_name: string | null;
  assessed_value: number | null;
  jurisdiction_id: string | null;
  zoning: string | null;
  source_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  geom?: GeoJSONGeometry;
  centroid?: GeoJSONPoint;
}

export interface GeoJSONGeometry {
  type: string;
  coordinates: number[][][];
}

export interface GeoJSONPoint {
  type: "Point";
  coordinates: [number, number];
}

// ── Project (an enforcement/permitting matter on a Property) ──
// A Property can have zero, one, or many Projects over time.

export type CaseType = "code_enforcement" | "building" | "adu_permit" | "other";
export type ProjectStatus = "open" | "closed" | "archived";

export interface Project {
  id: string;
  property_id: string;
  name: string;
  case_type: CaseType;
  department: string | null;
  status: ProjectStatus;
  due_process_score: number | null;
  opened_at: string;
  closed_at: string | null;
}

export interface ProjectSummary extends Project {
  property: Pick<Property, "address" | "city"> & { apn: string; centroid: GeoJSONPoint | null; geom: GeoJSONGeometry | null };
  openFindingsCount: number;
  criticalFindingsCount: number;
  evidenceCount: number;
  timelineEventCount: number;
  timelineCount?: number;
  reconCompleted?: boolean;
  lastReconAt?: string | null;
}

export interface PropertyCreate {
  parcel_id: string;
  address: string;
  city: string;
  county: string;
  state: string;
  zip_code: string;
  country?: string;
  property_type?: string;
  lot_size_sqft?: number;
  year_built?: number;
  owner_name?: string;
  assessed_value?: number;
  jurisdiction_id?: string;
  zoning?: string;
}

export interface Evidence {
  id: string;
  property_id: string;
  title: string;
  description: string | null;
  evidence_type: EvidenceType;
  status: EvidenceStatus;
  source_url: string | null;
  source_portal: string | null;
  source_record_id: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  ocr_text: string | null;
  ocr_confidence: number | null;
  extracted_markdown: string | null;
  extracted_entities: Record<string, unknown>[];
  extracted_dates: Record<string, unknown>[];
  extracted_parties: Record<string, unknown>[];
  extracted_violations: Record<string, unknown>[];
  extracted_fines: Record<string, unknown>[];
  due_process_flags: DueProcessFlag[];
  due_process_score: number | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

export interface EvidenceCreate {
  property_id: string;
  title: string;
  description?: string;
  evidence_type: EvidenceType;
  source_url?: string;
  source_portal?: string;
  source_record_id?: string;
}

export interface TimelineEvent {
  id: string;
  property_id: string;
  evidence_id: string | null;
  event_type: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  deadline_date: string | null;
  initiating_party: string | null;
  receiving_party: string | null;
  jurisdiction: string | null;
  venue: string | null;
  is_due_process_critical: boolean;
  discrepancy_flags: Record<string, unknown>[];
  sequence_order: number | null;
  source_text: string | null;
  source_page: number | null;
  created_at: string;
}

export interface DueProcessFlag {
  rule_id: string;
  rule_name: string;
  severity: "critical" | "warning" | "info";
  description: string;
  evidence_ids: string[];
  suggested_action: string | null;
  relevant_statute: string | null;
}

export interface DueProcessReport {
  property_id: string;
  overall_score: number;
  flags: DueProcessFlag[];
  summary: string;
  recommendations: string[];
}

export interface SearchResult {
  id: string;
  type: "property" | "evidence" | "timeline";
  title: string;
  snippet: string;
  score: number;
  property_id: string | null;
  evidence_id: string | null;
  highlight: Record<string, unknown>;
}

export interface UploadResponse {
  status: string;
  storage_key: string;
}
