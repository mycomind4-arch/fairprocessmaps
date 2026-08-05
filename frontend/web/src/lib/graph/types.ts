/**
 * Graph domain types — Phase 2.1
 *
 * These are the domain shapes the API returns to the frontend.
 * The frontend never sees table rows — only these types.
 */

export type NodeType =
  | "property"
  | "case"
  | "evidence"
  | "finding"
  | "event"
  | "statute"
  | "official"
  | "department"
  | "authority"
  | "permit"
  | "ce_case"
  | "owner";

export interface GraphNode {
  type: NodeType;
  id: string;
  label: string;
  data: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  type_label?: string;
  valid_from?: string | null;
  valid_to?: string | null;
}

export interface CaseGraph {
  case: {
    id: string;
    name: string;
    status: string;
    property: {
      id: string;
      apn: string;
      address: string;
    };
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TimelineEntry {
  id: string;
  date: string;
  type: string;
  type_label: string;
  description: string;
  severity: string;
  actor: {
    type: string;
    id: string;
    organization_id: string | null;
  };
  resource_organization_id: string | null;
  evidence_id: string | null;
  agent_version: string | null;
  entity_type: string | null;
  entity_id: string | null;
}

export interface CaseTimeline {
  case_id: string;
  events: TimelineEntry[];
}

export interface EntityRelationships {
  entity: {
    type: string;
    id: string;
  };
  outgoing: RelationshipEdge[];
  incoming: RelationshipEdge[];
}

export interface RelationshipEdge {
  type: string;
  type_label: string;
  target_type: string;
  target_id: string;
  target_label: string;
  valid_from: string | null;
  valid_to: string | null;
}

export interface IncomingEdge {
  type: string;
  type_label: string;
  source_type: string;
  source_id: string;
  source_label: string;
}

export interface EntityHistory {
  entity: {
    type: string;
    id: string;
  };
  history: HistoryEntry[];
}

export interface HistoryEntry {
  id: string;
  date: string;
  type: string;
  type_label: string;
  actor_type: string;
  actor_id: string;
  actor_name: string;
  severity: string;
  title: string | null;
  description: string | null;
}

// API envelope
export interface ApiSuccess<T> {
  ok: true;
  data: T;
  error: null;
}

export interface ApiError {
  ok: false;
  data: null;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
