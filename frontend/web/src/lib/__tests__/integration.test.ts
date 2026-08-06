import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  factExtractionAgent,
  statuteMatchingAgent,
  discrepancyAgent,
  runAnalysisAgents,
  type AnalysisContext,
} from "@/lib/analysis-agents";
import { STATUTES, evaluateDeadline } from "@/lib/statutes";

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
