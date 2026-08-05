/**
 * Agent Registry — Phase 3.1
 *
 * Maps agent_type → agent implementation.
 *
 * Phase 3.1: infrastructure only. No agents are registered.
 * Phase 3.2: timeline_anomaly agent registered
 * Phase 3.3: statute_matcher agent registered
 * Phase 3.4: evidence_extractor agent registered
 * Phase 3.5: authority_mapper agent registered
 *
 * To register an agent:
 *   1. Implement the Agent interface in lib/agents/{name}.ts
 *   2. Import it here and add to the REGISTRY map
 *   3. Create an agent_definitions row (via migration or bootstrap)
 */

import type { Agent, AgentType } from "./types";

// Phase 3.1: no agents registered yet
const REGISTRY: Partial<Record<AgentType, Agent>> = {
  // Phase 3.2: timeline_anomaly will be registered here
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
