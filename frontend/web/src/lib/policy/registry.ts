/**
 * Policy pack registry.
 *
 * Packs are JSON imported at build time — no network, no DB read on the hot
 * path, and the Worker bundle carries its own rule text. Adding a jurisdiction
 * means adding a pack file and one line here.
 */

import type { PolicyPack, PolicyRule } from "./types";
import humboldtCodeEnforcement from "./packs/humboldt-code-enforcement.json";

const PACKS: PolicyPack[] = [humboldtCodeEnforcement as PolicyPack];

/** Every registered pack. */
export function allPacks(): PolicyPack[] {
  return PACKS;
}

export function getPack(packId: string): PolicyPack | null {
  return PACKS.find((p) => p.id === packId) ?? null;
}

/**
 * Resolve the pack governing a case.
 *
 * Jurisdiction match is the primary key; case type narrows when a jurisdiction
 * has more than one pack. Returns null rather than guessing — a case in an
 * unsupported county produces no findings, which is the correct behavior.
 */
export function resolvePack(
  jurisdiction: string | null | undefined,
  caseType?: string | null,
): PolicyPack | null {
  if (!jurisdiction) return null;
  const needle = jurisdiction.toLowerCase();

  const candidates = PACKS.filter((p) => {
    const j = p.jurisdiction.toLowerCase();
    return j.includes(needle) || needle.includes(j.split(",")[0].trim());
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (caseType) {
    const byType = candidates.find((p) => p.caseTypes.includes(caseType));
    if (byType) return byType;
  }
  return candidates[0];
}

/**
 * Default pack for the current pilot. Cases created before jurisdiction was
 * captured fall back to Humboldt, which is the only county with a pack.
 */
export function defaultPack(): PolicyPack {
  return PACKS[0];
}

export function getRule(pack: PolicyPack, ruleId: string): PolicyRule | null {
  return pack.rules.find((r) => r.id === ruleId) ?? null;
}

/**
 * Every rule across every pack, keyed by id — for rendering a finding whose
 * pack is no longer resolvable, and for the legal-review admin view.
 */
export function ruleIndex(): Record<string, { rule: PolicyRule; pack: PolicyPack }> {
  const index: Record<string, { rule: PolicyRule; pack: PolicyPack }> = {};
  for (const pack of PACKS) {
    for (const rule of pack.rules) {
      index[rule.id] = { rule, pack };
    }
  }
  return index;
}

/**
 * Packs are unusable in an export until a human clears them. Callers building
 * court-facing output must check this.
 */
export function isActivated(pack: PolicyPack): boolean {
  return pack.activationStatus === "active";
}
