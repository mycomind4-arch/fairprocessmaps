/**
 * Agent Registry — Phase 3.2
 *
 * Maps agent_type → agent implementation.
 *
 * Registered agents:
 *   Phase 3.2: timeline_anomaly (Timeline Anomaly Detector)
 *
 * Coming soon:
 *   Phase 3.3: statute_matcher (Statute Matcher)
 *   Phase 3.4: evidence_extractor (Evidence Extractor)
 *   Phase 3.5: authority_mapper (Authority Mapper)
 */

import type { Agent, AgentType } from "./types";
import { TIMELINE_ANOMALY_AGENT } from "./timeline-anomaly";

const REGISTRY: Partial<Record<AgentType, Agent>> = {
  timeline_anomaly: TIMELINE_ANOMALY_AGENT,
  // Phase 3.3: statute_matcher will be registered here
  // Phase 3.4: evidence_extractor will be registered here
  // Phase 3.5: authority_mapper will be registered here
};

export function getAgent(agentType: string): Agent | null {
  return REGISTRY[agentType as AgentType] ?? null;
}

export function listRegisteredAgents(): AgentType[] {
  return Object.keys(REGISTRY) as AgentType[];
}
