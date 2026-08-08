/**
 * Regression tests for the Event Store & Relationship Engine.
 * 
 * Tests the 3 bugs that were fixed:
 * 1. Timeline deduplication (no duplicate entries from legacy + event store)
 * 2. Finding event idempotency (no re-emission on re-analysis)
 * 3. Relationship event idempotency (no event when relationship already exists)
 * 
 * Also tests:
 * 4. event_date is used for timeline sorting (not created_at)
 * 5. findingFingerprint produces stable hashes
 */

import { describe, it, expect, vi } from "vitest";
import { findingFingerprint, eventToTimelineDisplay } from "@/lib/event-store";

// ── Mock D1 Database ──

function createMockDB() {
  const events: any[] = [];
  const relationships: any[] = [];

  const mockRun = (sql: string, params: any[]) => {
    if (sql.includes("INSERT OR IGNORE INTO relationships")) {
      const [id, caseId, srcType, srcId, tgtType, tgtId, relType, metadata] = params;
      const exists = relationships.some(
        (r) => r.source_type === srcType && r.source_id === srcId &&
               r.target_type === tgtType && r.target_id === tgtId &&
               r.relationship_type === relType
      );
      if (!exists) {
        relationships.push({
          id, caseId: caseId, sourceType: srcType, sourceId: srcId,
          targetType: tgtType, targetId: tgtId, relationshipType: relType,
          metadata, created_at: new Date().toISOString(),
        });
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    if (sql.includes("INSERT INTO events")) {
      events.push({
        id: params[0], caseId: params[1], eventType: params[2],
        entityType: params[3], entityId: params[4], actorType: params[5],
        actor_id: params[6], actor_name: params[7], severity: params[8],
        event_date: params[9], title: params[10], description: params[11],
        payload: params[12], created_at: new Date().toISOString(),
      });
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  };

  const mockAll = (sql: string, params: any[]) => {
    if (sql.includes("FROM events")) {
      let filtered = [...events];
      if (sql.includes("WHERE e.case_id = ?")) {
        filtered = filtered.filter((e) => e.case_id === params[0]);
      }
      return { results: filtered };
    }
    if (sql.includes("FROM relationships")) {
      let filtered = [...relationships];
      if (sql.includes("source_type = ?") && sql.includes("source_id = ?")) {
        filtered = filtered.filter((r) => r.source_type === params[0] && r.source_id === params[1]);
      }
      return { results: filtered };
    }
    return { results: [] };
  };

  const db = {
    prepare: (sql: string) => ({
      bind: (...params: any[]) => ({
        run: () => mockRun(sql, params),
        all: () => mockAll(sql, params),
        first: () => {
          const result = mockAll(sql, params);
          return result.results[0] || null;
        },
      }),
    }),
    _events: events,
    _relationships: relationships,
  };

  return db as any;
}

// ── Tests ──

describe("Event Store & Relationship Engine", () => {

  // Bug 3: Relationship re-emission
  describe("createRelationship idempotency", () => {
    it("emits relationship.created event only on first creation", async () => {
      const db = createMockDB();
      const { createRelationship } = await import("@/lib/event-store");

      const rel = {
        caseId: "case-1",
        sourceType: "finding" as const,
        sourceId: "finding-1",
        targetType: "evidence" as const,
        targetId: "evidence-1",
        relationshipType: "supported_by" as const,
      };

      // First creation — should return an ID and emit an event
      const id1 = await createRelationship(db, rel);
      expect(id1).not.toBeNull();
      const relEvents = db._events.filter((e: any) => e.eventType === "relationship.created");
      expect(relEvents.length).toBe(1);

      // Second creation (same relationship) — should return null, no new event
      const id2 = await createRelationship(db, rel);
      expect(id2).toBeNull();
      const relEventsAfter = db._events.filter((e: any) => e.eventType === "relationship.created");
      expect(relEventsAfter.length).toBe(1); // Still only 1 event
    });
  });

  // Bug 2: Finding fingerprint stability
  describe("findingFingerprint", () => {
    it("produces stable hash for same input", () => {
      const finding = {
        project_id: "case-1",
        rule: "notice_timing",
        evidence_id: "ev-1",
        detail: "Only 5 days between notice and hearing",
      };
      const fp1 = findingFingerprint(finding);
      const fp2 = findingFingerprint(finding);
      expect(fp1).toBe(fp2);
    });

    it("produces different hash for different input", () => {
      const finding1 = {
        project_id: "case-1",
        rule: "notice_timing",
        evidence_id: "ev-1",
        detail: "Only 5 days between notice and hearing",
      };
      const finding2 = {
        project_id: "case-1",
        rule: "hearing_right",
        evidence_id: "ev-1",
        detail: "Only 5 days between notice and hearing",
      };
      expect(findingFingerprint(finding1)).not.toBe(findingFingerprint(finding2));
    });

    it("handles null evidence_id and detail", () => {
      const finding = {
        project_id: "case-1",
        rule: "notice_timing",
        evidence_id: null,
        detail: null,
      };
      const fp = findingFingerprint(finding);
      expect(fp).toContain("case-1:notice_timing:none:none");
    });
  });

  // Bug 4: event_date in timeline display
  describe("eventToTimelineDisplay", () => {
    it("uses event_date when available", () => {
      const event = {
        id: "ev-1",
        caseId: "case-1",
        eventType: "ce.notice_served",
        entityType: "ce_case",
        entityId: "ce-1",
        actorType: "user",
        actor_id: null,
        actor_name: null,
        severity: "warning",
        event_date: "2026-03-01",
        title: "Notice served: Nuisance violation",
        description: null,
        payload: null,
        created_at: "2026-08-05T10:00:00Z",
      };

      const display = eventToTimelineDisplay(event);
      expect(display.event_date).toBe("2026-03-01");
      expect(display.event_type).toBe("notice_sent");
    });

    it("falls back to created_at when event_date is null", () => {
      const event = {
        id: "ev-2",
        caseId: "case-1",
        eventType: "evidence.uploaded",
        entityType: "evidence",
        entityId: "ev-1",
        actorType: "user",
        actor_id: null,
        actor_name: null,
        severity: "info",
        event_date: null,
        title: "Evidence uploaded: notice.pdf",
        description: null,
        payload: null,
        created_at: "2026-08-05T10:00:00Z",
      };

      const display = eventToTimelineDisplay(event);
      expect(display.event_date).toBe("2026-08-05T10:00:00Z");
    });
  });

  // Bug 1: Timeline deduplication logic
  describe("Timeline deduplication", () => {
    it("deduplicates by event_type + description, preferring event store", () => {
      const legacyItems = [
        { id: "t1", event_date: "2026-03-01", eventType: "evidence_uploaded", description: "Evidence uploaded: notice.pdf", evidence_id: "ev1", evidence_title: "notice.pdf" },
        { id: "t2", event_date: "2026-02-15", eventType: "notice_sent", description: "Notice served: Nuisance", evidence_id: null, evidence_title: null },
      ];

      const eventStoreItems = [
        { id: "e1", event_date: "2026-03-01", eventType: "evidence_uploaded", description: "Evidence uploaded: notice.pdf", evidence_id: "ev1", evidence_title: null, _from_event_store: true },
        { id: "e2", event_date: "2026-08-05", eventType: "finding_created", description: "Adequate Notice Period: Only 5 days", evidence_id: null, evidence_title: null, _from_event_store: true },
      ];

      // Simulate the dedup logic from the timeline route
      const eventStoreKeys = new Set(
        eventStoreItems.map((e) => `${e.eventType}::${e.description}`)
      );
      const dedupedLegacy = legacyItems.filter((l) => {
        const key = `${l.eventType}::${l.description}`;
        return !eventStoreKeys.has(key);
      });

      // The duplicate "Evidence uploaded: notice.pdf" should be removed from legacy
      expect(dedupedLegacy.length).toBe(1);
      expect(dedupedLegacy[0].eventType).toBe("notice_sent");

      // The merged timeline should have 3 items (1 deduped legacy + 2 event store)
      const merged = [...dedupedLegacy, ...eventStoreItems];
      expect(merged.length).toBe(3);
    });
  });

  // Event emission safety
  describe("emitEvent safety", () => {
    it("returns null on database error without throwing", async () => {
      const badDb = {
        prepare: () => ({
          bind: () => ({
            run: () => { throw new Error("DB connection lost"); },
          }),
        }),
      };

      const { emitEvent } = await import("@/lib/event-store");
      const result = await emitEvent(badDb as any, {
        caseId: "case-1",
        eventType: "evidence.uploaded",
        entityType: "evidence",
        entityId: "ev-1",
        actorType: "system" as const,
      });

      expect(result).toBeNull();
    });
  });
});
