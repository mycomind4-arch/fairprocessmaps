/**
 * Agent Registry — Phase 3.5+
 *
 * Registered agents:
 *   Phase 3.2: timeline_anomaly (Timeline Anomaly Detector)
 *   Phase 3.3: statute_matcher (Statute Matcher)
 *   Phase 3.4: evidence_extractor (Evidence Extractor)
 *   Phase 3.5: authority_mapper (Authority Mapper)
 *
 * All four agents planned in migration 012 are now implemented.
 */

import type { Agent, AgentType } from "./types";
import { TIMELINE_ANOMALY_AGENT } from "./timeline-anomaly";
import { STATUTE_MATCHER_AGENT } from "./statute-matcher";
import { EVIDENCE_EXTRACTOR_AGENT } from "./evidence-extractor";
import { AUTHORITY_MAPPER_AGENT } from "./authority-mapper";

const REGISTRY: Partial<Record<AgentType, Agent>> = {
  timeline_anomaly: TIMELINE_ANOMALY_AGENT,
  statute_matcher: STATUTE_MATCHER_AGENT,
  evidence_extractor: EVIDENCE_EXTRACTOR_AGENT,
  authority_mapper: AUTHORITY_MAPPER_AGENT,
};

export function getAgent(agentType: string): Agent | null {
  return REGISTRY[agentType as AgentType] ?? null;
}

export function listRegisteredAgents(): AgentType[] {
  return Object.keys(REGISTRY) as AgentType[];
}
