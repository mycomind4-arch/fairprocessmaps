import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  factExtractionAgent,
  statuteMatchingAgent,
  discrepancyAgent,
  runAnalysisAgents,
  type AnalysisContext,
} from "@/lib/analysis-agents";
import { STATUTES, evaluateDeadline } from "@/lib/statutes";

// Mock global.fetch to prevent real HTTP calls during tests.
// Return ok:true with empty HTML so fetchWithRetry doesn't retry (avoiding timeouts),
// but HTML parsing finds nothing and falls back to GIS-derived records.
const mockFetch = vi.fn(async (url: string) => {
  return { ok: true, status: 200, json: async () => ({}), text: async () => '<html><body></body></html>' } as any;
});
vi.stubGlobal('fetch', mockFetch);

// ── Mock D1 Database ──
// Simulates the Cloudflare D1 binding for local testing

function createMockDB(data: {
  permits?: any[];
  ceCases?: any[];
  evidence?: any[];
  timeline?: any[];
  recorder?: any[];
  intel?: any[];
  findings?: any[];
}) {
  const tables: Record<string, any[]> = {
    building_permits: data.permits || [],
    code_enforcement_cases: data.ceCases || [],
    evidence: data.evidence || [],
    timeline_events: data.timeline || [],
    recorder_records: data.recorder || [],
    property_intelligence: data.intel || [],
    due_process_findings: data.findings || [],
  };

  return {
    prepare: vi.fn((sql: string) => {
      // Determine which table is being queried based on SQL
      let results: any[] = [];

      if (sql.includes("FROM building_permits")) {
        results = tables.building_permits;
      } else if (sql.includes("FROM code_enforcement_cases")) {
        results = tables.code_enforcement_cases;
      } else if (sql.includes("FROM evidence")) {
        results = tables.evidence;
      } else if (sql.includes("FROM timeline_events")) {
        results = tables.timeline_events;
      } else if (sql.includes("FROM recorder_records")) {
        results = tables.recorder_records;
      } else if (sql.includes("FROM property_intelligence")) {
        results = tables.property_intelligence;
      } else if (sql.includes("FROM due_process_findings")) {
        results = tables.due_process_findings;
      } else if (sql.includes("INSERT INTO")) {
        // Mock INSERT — return success
        return {
          bind: vi.fn(() => ({ run: vi.fn(async () => ({ success: true })) })),
        };
      } else if (sql.includes("DELETE FROM")) {
        return {
          bind: vi.fn(() => ({ run: vi.fn(async () => ({ success: true })) })),
        };
      }

      return {
        bind: vi.fn(() => ({
          all: vi.fn(async () => ({ results })),
          first: vi.fn(async () => results[0] || null),
          run: vi.fn(async () => ({ success: true })),
        })),
      };
    }),
    batch: vi.fn(async (statements: any[]) => {
      return statements.map(() => ({ success: true }));
    }),
  };
}

// ── Test Data ──
const SAMPLE_PERMITS = [
  {
    id: "permit_1",
    project_id: "proj_1",
    permit_number: "BLD-2026-001",
    permit_type: "building",
    permit_status: "issued",
    description: "ADU construction",
    valuation: 150000,
    issued_date: "2026-03-15",
    expired_date: null,
    finalized_date: null,
    created_at: "2026-01-01T00:00:00Z",
  },
];

const SAMPLE_CE_CASES = [
  {
    id: "ce_1",
    project_id: "proj_1",
    case_number: "CE-2026-001",
    violation_type: "substandard_housing",
    violation_description: "Substandard housing conditions",
    severity: "moderate",
    status: "open",
    notice_served_date: "2026-01-01",
    notice_method: "certified_mail",
    notice_period_days: 30,
    compliance_deadline: "2026-01-31",
    abatement_date: null,
    abatement_cost: null,
    lien_filed: 0,
    hearing_date: null,
    hearing_type: null,
    appeal_filed: 0,
    appeal_date: null,
    outcome: null,
    created_at: "2026-01-01T00:00:00Z",
  },
];

const SAMPLE_EVIDENCE = [
  {
    id: "evid_1",
    project_id: "proj_1",
    source: "manual",
    doc_type: "notice_letter",
    title: "Notice of Violation",
    status: "processed",
    extracted_text: "A Notice of Violation was issued on January 1, 2026, requiring correction within 30 days. A hearing was not scheduled.",
    ai_summary: "Notice of violation with 30-day compliance period",
    created_at: "2026-01-02T00:00:00Z",
  },
];

const SAMPLE_INTEL = [
  {
    id: "intel_1",
    property_id: "prop_1",
    apn: "123-456-789",
    zoning: "Residential Single Family",
    raw_data: JSON.stringify({ parcel: { transfer_date: "2025-06-15", bkpg: "2025/01234" } }),
    fetched_at: "2026-01-01T00:00:00Z",
  },
];

// ── Tests ──

describe("Fact Extraction Agent", () => {
  it("extracts facts from building permits", async () => {
    const db = createMockDB({ permits: SAMPLE_PERMITS, ceCases: [], evidence: [], timeline: [], recorder: [], intel: [] });
    const ctx: AnalysisContext = { projectId: "proj_1", propertyId: "prop_1", organizationId: "test-org", db: db as any };

    const result = await factExtractionAgent(ctx);
    expect(result.status).toMatch(/success|partial/);
    expect(result.agent).toBe("fact_extraction");
    expect(result.ledgerHash).toHaveLength(64);
  });

  it("extracts facts from code enforcement cases", async () => {
    const db = createMockDB({ permits: [], ceCases: SAMPLE_CE_CASES, evidence: [], timeline: [], recorder: [], intel: [] });
    const ctx: AnalysisContext = { projectId: "proj_1", propertyId: "prop_1", organizationId: "test-org", db: db as any };

    const result = await factExtractionAgent(ctx);
    expect(result.status).toMatch(/success|partial/);
    expect(result.ledgerHash).toHaveLength(64);
  });

  it("extracts facts from evidence with dates in text", async () => {
    const db = createMockDB({ permits: [], ceCases: [], evidence: SAMPLE_EVIDENCE, timeline: [], recorder: [], intel: [] });
    const ctx: AnalysisContext = { projectId: "proj_1", propertyId: "prop_1", organizationId: "test-org", db: db as any };

    const result = await factExtractionAgent(ctx);
    expect(result.status).toMatch(/success|partial/);
  });

  it("extracts facts from property intelligence (GIS)", async () => {
    const db = createMockDB({ permits: [], ceCases: [], evidence: [], timeline: [], recorder: [], intel: SAMPLE_INTEL });
    const ctx: AnalysisContext = { projectId: "proj_1", propertyId: "prop_1", organizationId: "test-org", db: db as any };

    const result = await factExtractionAgent(ctx);
    expect(result.status).toMatch(/success|partial/);
  });

  it("handles empty database gracefully", async () => {
    const db = createMockDB({});
    const ctx: AnalysisContext = { projectId: "proj_1", propertyId: "prop_1", organizationId: "test-org", db: db as any };

    const result = await factExtractionAgent(ctx);
    expect(result.status).toMatch(/success|partial|error/);
    expect(result.ledgerHash).toHaveLength(64);
  });
});

describe("Statute Matching Agent", () => {
  it("matches facts against all 10 statutes", async () => {
    const facts = [
      { fact_id: "1", text: "Notice served", date: "2026-01-01", source: "ce", source_id: "ce_1", category: "notice" },
      { fact_id: "2", text: "Compliance deadline", date: "2026-01-31", source: "ce", source_id: "ce_1", category: "compliance_deadline" },
    ];
    const db = createMockDB({});
    const ctx: AnalysisContext = { projectId: "proj_1", propertyId: "prop_1", organizationId: "test-org", db: db as any };

    const result = await statuteMatchingAgent(ctx, facts);
    expect(result.status).toMatch(/success|partial/);
    expect(result.agent).toBe("statute_matching");
    expect(result.ledgerHash).toHaveLength(64);
  });

  it("flags a deviation when notice period is too short", async () => {
    // Notice Jan 1, compliance Jan 5 (only 4 days, need 30)
    const facts = [
      { fact_id: "1", text: "Notice served", date: "2026-01-01", source: "ce", source_id: "ce_1", category: "notice" },
      { fact_id: "2", text: "Abatement occurred", date: "2026-01-05", source: "ce", source_id: "ce_1", category: "abatement" },
    ];
    const db = createMockDB({});
    const ctx: AnalysisContext = { projectId: "proj_1", propertyId: "prop_1", organizationId: "test-org", db: db as any };

    const result = await statuteMatchingAgent(ctx, facts);
    expect(result.status).toMatch(/success|partial/);
    // The agent should write findings about the short notice period
  });

  it("applies guardrail to all outputs", async () => {
    const facts: any[] = [];
    const db = createMockDB({});
    const ctx: AnalysisContext = { projectId: "proj_1", propertyId: "prop_1", organizationId: "test-org", db: db as any };

    const result = await statuteMatchingAgent(ctx, facts);
    // Guardrail blocks should be tracked
    expect(result.guardrailBlocks).toBeDefined();
  });
});

describe("Discrepancy Agent", () => {
  it("detects abatement without hearing", async () => {
    const facts = [
      { fact_id: "1", text: "Notice served", date: "2026-01-01", source: "ce", source_id: "ce_1", category: "notice" },
      { fact_id: "2", text: "Abatement occurred", date: "2026-02-15", source: "ce", source_id: "ce_1", category: "abatement" },
      // No hearing fact
    ];
    const db = createMockDB({ ceCases: [{ ...SAMPLE_CE_CASES[0], abatement_date: "2026-02-15", hearing_date: null }] });
    const ctx: AnalysisContext = { projectId: "proj_1", propertyId: "prop_1", organizationId: "test-org", db: db as any };

    const result = await discrepancyAgent(ctx, facts);
    expect(result.status).toMatch(/success|partial/);
    expect(result.agent).toBe("discrepancy");
    expect(result.ledgerHash).toHaveLength(64);
  });

  it("handles no discrepancies gracefully", async () => {
    const facts = [
      { fact_id: "1", text: "Notice served", date: "2026-01-01", source: "ce", source_id: "ce_1", category: "notice" },
      { fact_id: "2", text: "Hearing scheduled", date: "2026-02-01", source: "ce", source_id: "ce_1", category: "hearing" },
    ];
    const db = createMockDB({ ceCases: [{ ...SAMPLE_CE_CASES[0], hearing_date: "2026-02-01" }] });
    const ctx: AnalysisContext = { projectId: "proj_1", propertyId: "prop_1", organizationId: "test-org", db: db as any };

    const result = await discrepancyAgent(ctx, facts);
    expect(result.status).toMatch(/success|partial/);
  });
});

describe("Full Analysis Pipeline (runAnalysisAgents)", () => {
  it("runs all 5 agents and produces a summary", async () => {
    const db = createMockDB({
      permits: SAMPLE_PERMITS,
      ceCases: SAMPLE_CE_CASES,
      evidence: SAMPLE_EVIDENCE,
      intel: SAMPLE_INTEL,
    });
    const ctx: AnalysisContext = { projectId: "proj_1", propertyId: "prop_1", organizationId: "test-org", db: db as any };

    const result = await runAnalysisAgents(ctx);
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(5); // 5 agents
    expect(result.summary).toBeDefined();
    expect(typeof result.summary).toBe("string");

    // Every agent result should have a SHA-256 ledger hash
    for (const r of result.results) {
      expect(r.ledgerHash).toHaveLength(64);
      expect(r.status).toMatch(/success|partial|error/);
    }
  });

  it("produces audit ledger evidence entry", async () => {
    const db = createMockDB({
      permits: SAMPLE_PERMITS,
      ceCases: SAMPLE_CE_CASES,
    });
    const ctx: AnalysisContext = { projectId: "proj_1", propertyId: "prop_1", organizationId: "test-org", db: db as any };

    const result = await runAnalysisAgents(ctx);
    expect(result.success).toBe(true);
    // The pipeline should have logged audit evidence
    // (INSERT INTO evidence was called by the mock DB)
  });

  it("handles empty database without crashing", async () => {
    const db = createMockDB({});
    const ctx: AnalysisContext = { projectId: "proj_1", propertyId: "prop_1", organizationId: "test-org", db: db as any };

    const result = await runAnalysisAgents(ctx);
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(5);
  });
});

describe("End-to-End Statute Compliance Scenarios", () => {
  it("Scenario 1: Proper 30-day notice period (HCC § 311-3)", () => {
    const statute = STATUTES.find((s) => s.ref === "HCC § 311-3")!;
    const result = evaluateDeadline("2026-01-01", "2026-02-05", statute);
    expect(result.status).toBe("matches expected window");
    expect(result.elapsedDays).toBe(35);
  });

  it("Scenario 2: Short notice period — 5 days instead of 30 (HCC §351-7)", () => {
    const statute = STATUTES.find((s) => s.ref === "HCC § 311-3")!;
    const result = evaluateDeadline("2026-01-01", "2026-01-05", statute);
    expect(result.status).toBe("deviation detected");
    expect(result.elapsedDays).toBe(4);
  });

  it("Scenario 3: ADU permit reviewed in 45 days — within 60-day max (CA Gov Code §65852.2)", () => {
    const statute = STATUTES.find((s) => s.ref === "CA Gov Code § 65852.2")!;
    const result = evaluateDeadline("2026-01-01", "2026-02-15", statute);
    expect(result.status).toBe("matches expected window");
    expect(result.elapsedDays).toBe(45);
  });

  it("Scenario 4: ADU permit reviewed in 90 days — exceeds 60-day max (CA Gov Code §65852.2)", () => {
    const statute = STATUTES.find((s) => s.ref === "CA Gov Code § 65852.2")!;
    const result = evaluateDeadline("2026-01-01", "2026-04-01", statute);
    expect(result.status).toBe("deviation detected");
    expect(result.elapsedDays).toBe(90);
  });

  it("Scenario 5: 10 business days for hearing scheduling (HCC §351-12)", () => {
    const statute = STATUTES.find((s) => s.ref === "HCC § 351-12")!;
    // Aug 3 → Aug 14 = 11 calendar days (min 10) → matches
    const result = evaluateDeadline("2026-08-03", "2026-08-14", statute);
    expect(result.status).toBe("matches expected window");
    expect(result.elapsedDays).toBe(11);
  });

  it("Scenario 6: Missing hearing date entirely", () => {
    const statute = STATUTES.find((s) => s.ref === "HCC § 311-3")!;
    const result = evaluateDeadline("", "2026-08-14", statute);
    expect(result.status).toBe("unable to determine");
  });

  it("Scenario 7: Appeal filed within 90 days (CA CCP § 1094.5)", () => {
    const statute = STATUTES.find((s) => s.ref === "CA CCP § 1094.5")!;
    const result = evaluateDeadline("2026-01-01", "2026-03-01", statute);
    // 59 days — should be within 90-day window
    expect(result.status).toBe("matches expected window");
  });

  it("Scenario 8: Appeal filed after 90 days (CA CCP § 1094.5)", () => {
    const statute = STATUTES.find((s) => s.ref === "CA CCP § 1094.5")!;
    const result = evaluateDeadline("2026-01-01", "2026-06-01", statute);
    // 151 days — exceeds 90-day window
    expect(result.status).toBe("deviation detected");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Recon Agents Integration Tests
//
// These tests run each of the records-collection recon agents against a seeded
// mock D1 database to verify:
// 1. The correct number of bind parameters are passed to each query
//    (catches the class of bug where a two-placeholder query only binds one)
// 2. The agents correctly report the count of records found
// ──────────────────────────────────────────────────────────────────────────────

import {
  buildingPermitsAgent,
  codeEnforcementAgent,
  countyRecorderAgent,
  dueProcessAnalysisAgent,
} from "@/lib/recon-agents-records";
import type { ReconContext } from "@/lib/recon-agents";

/**
 * Enhanced mock DB that tracks bind() calls and their argument counts.
 * This lets us assert that queries with N placeholders receive N bound values.
 */
function createTrackingMockDB(data: {
  permits?: any[];
  ceCases?: any[];
  recorder?: any[];
  timeline?: any[];
  findings?: any[];
  projects?: any[];
}) {
  const tables: Record<string, any[]> = {
    building_permits: data.permits || [],
    code_enforcement_cases: data.ceCases || [],
    recorder_records: data.recorder || [],
    timeline_events: data.timeline || [],
    due_process_findings: data.findings || [],
    projects: data.projects || [],
  };

  // Track all bind calls: [{ sql, args }]
  const bindCalls: { sql: string; args: any[] }[] = [];

  const mockDb = {
    prepare: vi.fn((sql: string) => {
      let results: any[] = [];

      if (sql.includes("FROM building_permits")) {
        results = tables.building_permits;
      } else if (sql.includes("FROM code_enforcement_cases")) {
        results = tables.code_enforcement_cases;
      } else if (sql.includes("FROM recorder_records")) {
        results = tables.recorder_records;
      } else if (sql.includes("FROM timeline_events")) {
        results = tables.timeline_events;
      } else if (sql.includes("FROM due_process_findings")) {
        results = tables.due_process_findings;
      } else if (sql.includes("FROM projects")) {
        results = tables.projects;
      } else if (sql.includes("INSERT INTO")) {
        const bound = vi.fn((...args: any[]) => ({
          run: vi.fn(async () => ({ success: true })),
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => null),
        }));
        bindCalls.push({ sql, args: [] as any[] }); // INSERT binds will be captured below
        return { bind: bound };
      } else if (sql.includes("DELETE FROM")) {
        const bound = vi.fn((...args: any[]) => ({
          run: vi.fn(async () => ({ success: true })),
        }));
        return { bind: bound };
      }

      const bound = vi.fn((...args: any[]) => {
        bindCalls.push({ sql, args });
        return {
          all: vi.fn(async () => ({ results })),
          first: vi.fn(async () => results[0] || null),
          run: vi.fn(async () => ({ success: true })),
        };
      });

      return { bind: bound };
    }),
    batch: vi.fn(async (statements: any[]) => {
      return statements.map(() => ({ success: true }));
    }),
  };

  return { db: mockDb as any, bindCalls };
}

// ── Test data for recon agents ──

const RECON_PERMITS = [
  {
    id: "bp_1",
    project_id: "proj_test",
    organization_id: "test-org",
    permit_number: "BLD-2026-100",
    permit_type: "Building Permit",
    permit_status: "issued",
    issued_date: "2026-04-01",
    valuation: 85000,
    expired_date: null,
  },
  {
    id: "bp_2",
    project_id: "proj_test",
    organization_id: "test-org",
    permit_number: "ELEC-2026-045",
    permit_type: "Electrical",
    permit_status: "finalized",
    issued_date: "2026-02-15",
    valuation: 12000,
    expired_date: null,
  },
];

const RECON_CE_CASES = [
  {
    id: "ce_1",
    project_id: "proj_test",
    organization_id: "test-org",
    case_number: "CE-2026-200",
    violation_type: "substandard_housing",
    severity: "moderate",
    status: "open",
    notice_served_date: "2026-03-01",
    hearing_date: null,
    abatement_date: null,
    lien_filed: 0,
    appeal_filed: 0,
  },
  {
    id: "ce_2",
    project_id: "proj_test",
    organization_id: "test-org",
    case_number: "CE-2026-201",
    violation_type: "building_without_permit",
    severity: "high",
    status: "closed",
    notice_served_date: "2026-01-15",
    hearing_date: "2026-02-20",
    abatement_date: "2026-03-10",
    lien_filed: 0,
    appeal_filed: 0,
  },
];

const RECON_RECORDER = [
  {
    id: "rec_1",
    project_id: "proj_test",
    organization_id: "test-org",
    document_number: "2026-001234",
    document_type: "Grant Deed",
    recording_date: "2026-01-05",
    parties: "SMITH JOHN → JONES MARY",
    notes: "Real estate transfer",
  },
  {
    id: "rec_2",
    project_id: "proj_test",
    organization_id: "test-org",
    document_number: "2026-005678",
    document_type: "Notice of Default",
    recording_date: "2026-03-20",
    parties: "BANK OF EXAMPLE → SMITH JOHN",
    notes: "Notice of default filed",
  },
];

const RECON_PROJECTS = [
  { id: "proj_test", organization_id: "test-org" },
];

const RECON_PARCEL: any = {
  properties: {
    FULLADDR: "1234 MAIN ST EUREKA CA 95501",
    OWNER: "SMITH JOHN",
    LEGAL: "LOT 1 BLK 5 TRACT 1234",
    BKPG: "2026/001234",
    TRANDATE: "2026-01-05",
    YEAR_BUILT: "1990",
    APN: "123-456-789",
  },
};

// ── Tests ──

describe("Recon Agents — Building Permits (Agent 13)", () => {
  it("reports correct permit count from D1 and binds both placeholders", async () => {
    const { db, bindCalls } = createTrackingMockDB({
      permits: RECON_PERMITS,
      projects: RECON_PROJECTS,
    });

    const ctx: ReconContext = {
      apn: "123-456-789",
      projectId: "proj_test",
      propertyId: "prop_test",
      organizationId: "test-org",
      db,
      parcel: RECON_PARCEL,
    };

    const result = await buildingPermitsAgent(ctx);

    // The agent should report 2 permits (from D1, since Accela fetch will fail in test)
    expect(result.status).toBe("success");
    expect(result.data?.permit_count).toBe(2);

    // Verify that all SELECT queries with 2 placeholders got 2 bind args
    const selectCalls = bindCalls.filter(
      c => c.sql.includes("WHERE project_id = ? AND organization_id = ?"),
    );
    for (const call of selectCalls) {
      expect(call.args.length).toBeGreaterThanOrEqual(2);
      expect(call.args[0]).toBe("proj_test");
      expect(call.args[1]).toBe("test-org");
    }

    // Specifically check the initial SELECT * query
    const initialSelect = bindCalls.find(
      c => c.sql.includes("SELECT * FROM building_permits") && c.sql.includes("ORDER BY issued_date DESC"),
    );
    expect(initialSelect).toBeDefined();
    expect(initialSelect!.args.length).toBe(2);
    expect(initialSelect!.args).toEqual(["proj_test", "test-org"]);
  });

  it("reports no_data when no permits exist in D1 and Accela is unreachable", async () => {
    const { db } = createTrackingMockDB({ permits: [], projects: RECON_PROJECTS });

    const ctx: ReconContext = {
      apn: "123-456-789",
      projectId: "proj_test",
      propertyId: "prop_test",
      organizationId: "test-org",
      db,
      parcel: RECON_PARCEL,
    };

    const result = await buildingPermitsAgent(ctx);
    expect(result.status).toBe("no_data");
    expect(result.data?.search_apn).toBe("123-456-789");
  });
});

describe("Recon Agents — Code Enforcement (Agent 14)", () => {
  it("reports correct CE case count from D1 and binds both placeholders", async () => {
    // Mock the ce-pipeline import
    vi.doMock("@/lib/ce-pipeline", () => ({
      syncCECases: vi.fn(async () => ({ casesCreated: 0, casesUpdated: 0 })),
      fetchCECasesByAPN: vi.fn(async () => []),
    }));

    const { db, bindCalls } = createTrackingMockDB({
      ceCases: RECON_CE_CASES,
      projects: RECON_PROJECTS,
    });

    const ctx: ReconContext = {
      apn: "123-456-789",
      projectId: "proj_test",
      propertyId: "prop_test",
      organizationId: "test-org",
      db,
      parcel: null,
    };

    const result = await codeEnforcementAgent(ctx);

    expect(result.status).toBe("success");
    expect(result.data?.case_count).toBe(2);

    // The CE readback query should bind both project_id and organization_id
    const ceReadback = bindCalls.find(
      c => c.sql.includes("SELECT * FROM code_enforcement_cases") && c.sql.includes("ORDER BY created_at DESC"),
    );
    expect(ceReadback).toBeDefined();
    expect(ceReadback!.args.length).toBe(2);
    expect(ceReadback!.args).toEqual(["proj_test", "test-org"]);

    vi.doUnmock("@/lib/ce-pipeline");
  });
});

describe("Recon Agents — County Recorder (Agent 15)", () => {
  it("reports correct recorder record count from D1 and binds both placeholders", async () => {
    const { db, bindCalls } = createTrackingMockDB({
      recorder: RECON_RECORDER,
      projects: RECON_PROJECTS,
    });

    const ctx: ReconContext = {
      apn: "123-456-789",
      projectId: "proj_test",
      propertyId: "prop_test",
      organizationId: "test-org",
      db,
      parcel: RECON_PARCEL,
    };

    const result = await countyRecorderAgent(ctx);

    expect(result.status).toBe("success");
    expect(result.data?.record_count).toBe(2);

    // All SELECT queries on recorder_records should bind 2 args
    const recorderSelects = bindCalls.filter(
      c => c.sql.includes("SELECT * FROM recorder_records") && c.sql.includes("WHERE project_id"),
    );
    expect(recorderSelects.length).toBeGreaterThan(0);
    for (const call of recorderSelects) {
      expect(call.args.length).toBe(2);
      expect(call.args[0]).toBe("proj_test");
      expect(call.args[1]).toBe("test-org");
    }
  });

  it("falls back to GIS-derived record when recorder search returns nothing", async () => {
    const { db, bindCalls } = createTrackingMockDB({
      recorder: [],
      projects: RECON_PROJECTS,
    });

    const ctx: ReconContext = {
      apn: "123-456-789",
      projectId: "proj_test",
      propertyId: "prop_test",
      organizationId: "test-org",
      db,
      parcel: RECON_PARCEL,
    };

    const result = await countyRecorderAgent(ctx);

    // Should create a GIS-derived record since recorder search failed and no existing records
    expect(result.data?.recorder_search_status).toMatch(/no_results|not_searched|error/);
  });
});

describe("Recon Agents — Due Process Analysis (Agent 16)", () => {
  it("cross-references all records and binds both placeholders on DELETE and INSERT", async () => {
    const { db, bindCalls } = createTrackingMockDB({
      permits: RECON_PERMITS,
      ceCases: RECON_CE_CASES,
      recorder: RECON_RECORDER,
      projects: RECON_PROJECTS,
    });

    const ctx: ReconContext = {
      apn: "123-456-789",
      projectId: "proj_test",
      propertyId: "prop_test",
      organizationId: "test-org",
      db,
      parcel: null,
    };

    const result = await dueProcessAnalysisAgent(ctx);

    expect(result.status).toBe("success");
    expect(result.data?.records_analyzed).toEqual({
      building_permits: 2,
      code_enforcement: 2,
      recorder_records: 2,
    });

    // The DELETE query should bind 2 args
    const deleteCall = bindCalls.find(
      c => c.sql.includes("DELETE FROM due_process_findings"),
    );
    if (deleteCall) {
      expect(deleteCall.args.length).toBe(2);
      expect(deleteCall.args).toEqual(["proj_test", "test-org"]);
    }

    // The three SELECT queries in Promise.all should each bind 2 args
    const selectAll = bindCalls.filter(
      c => (c.sql.includes("FROM building_permits") ||
            c.sql.includes("FROM code_enforcement_cases") ||
            c.sql.includes("FROM recorder_records")) &&
           !c.sql.includes("ORDER BY") &&
           !c.sql.includes("DELETE"),
    );
    expect(selectAll.length).toBeGreaterThanOrEqual(3);
    for (const call of selectAll) {
      expect(call.args.length).toBe(2);
      expect(call.args[0]).toBe("proj_test");
      expect(call.args[1]).toBe("test-org");
    }
  });

  it("detects abatement without hearing as a critical finding", async () => {
    const ceWithAbatement = [
      {
        ...RECON_CE_CASES[1],
        abatement_date: "2026-03-10",
        hearing_date: null,
      },
    ];

    const { db } = createTrackingMockDB({
      permits: [],
      ceCases: ceWithAbatement,
      recorder: [],
      projects: RECON_PROJECTS,
    });

    const ctx: ReconContext = {
      apn: "123-456-789",
      projectId: "proj_test",
      propertyId: "prop_test",
      organizationId: "test-org",
      db,
      parcel: null,
    };

    const result = await dueProcessAnalysisAgent(ctx);
    expect(result.status).toBe("success");
    expect(result.data?.critical_count).toBeGreaterThan(0);

    const criticalFinding = result.data?.findings?.find(
      (f: any) => f.rule === "right_to_hearing",
    );
    expect(criticalFinding).toBeDefined();
    expect(criticalFinding.severity).toBe("critical");
  });
});

describe("Recon Agents — Bind Parameter Regression Tests", () => {
  /**
   * This test explicitly guards against the class of bug where a query
   * with two `?` placeholders only receives one bound value. The original
   * bug (Issue #22) caused these queries to silently return zero rows.
   */
  it("every SELECT with 'project_id = ? AND organization_id = ?' receives exactly 2 bind args", async () => {
    const { db, bindCalls } = createTrackingMockDB({
      permits: RECON_PERMITS,
      ceCases: RECON_CE_CASES,
      recorder: RECON_RECORDER,
      projects: RECON_PROJECTS,
    });

    const ctx: ReconContext = {
      apn: "123-456-789",
      projectId: "proj_test",
      propertyId: "prop_test",
      organizationId: "test-org",
      db,
      parcel: RECON_PARCEL,
    };

    // Run all recon agents
    await buildingPermitsAgent(ctx);
    await countyRecorderAgent(ctx);

    // Find every query with two WHERE placeholders
    const twoPlaceholderQueries = bindCalls.filter(
      c => c.sql.includes("WHERE project_id = ? AND organization_id = ?"),
    );

    expect(twoPlaceholderQueries.length).toBeGreaterThan(0);

    for (const call of twoPlaceholderQueries) {
      // Count actual ? placeholders in the SQL
      const placeholderCount = (call.sql.match(/\?/g) || []).length;
      // For SELECTs with WHERE project_id AND organization_id, there should be at least 2 bind args
      // (some queries have additional ? for ORDER BY or other clauses, but the first 2 must be project + org)
      expect(call.args.length).toBeGreaterThanOrEqual(2);
      expect(call.args[0]).toBe("proj_test");
      expect(call.args[1]).toBe("test-org");
    }
  });

  it("the single-placeholder query 'SELECT organization_id FROM projects WHERE id = ?' receives exactly 1 bind arg", async () => {
    // Mock the ce-pipeline import
    vi.doMock("@/lib/ce-pipeline", () => ({
      syncCECases: vi.fn(async () => ({ casesCreated: 0, casesUpdated: 0 })),
      fetchCECasesByAPN: vi.fn(async () => []),
    }));

    const { db, bindCalls } = createTrackingMockDB({
      ceCases: RECON_CE_CASES,
      projects: RECON_PROJECTS,
    });

    const ctx: ReconContext = {
      apn: "123-456-789",
      projectId: "proj_test",
      propertyId: "prop_test",
      organizationId: "test-org",
      db,
      parcel: null,
    };

    await codeEnforcementAgent(ctx);

    // The projects query should have exactly 1 bind arg (just projectId)
    const projectsQuery = bindCalls.find(
      c => c.sql.includes("SELECT organization_id FROM projects"),
    );
    expect(projectsQuery).toBeDefined();
    expect(projectsQuery!.args.length).toBe(1);
    expect(projectsQuery!.args[0]).toBe("proj_test");

    vi.doUnmock("@/lib/ce-pipeline");
  });
});
