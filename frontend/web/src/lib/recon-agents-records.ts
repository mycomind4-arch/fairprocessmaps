/**
 * Records Collection & Due Process Analysis Agents
 * 
 * These agents collect building permits, code enforcement cases, and county
 * recorder records, then cross-reference them to find discrepancies and due
 * process violations.
 * 
 * Data Sources:
 * - Accela Citizen Access (building permits) — aca-prod.accela.com/HUMBOLDT/
 * - Humboldt County Code Enforcement — public records / NextRequest
 * - Humboldt County Clerk-Recorder — humboldtcountyca-web.tylerhost.net/web/
 */

import type { ReconAgentResult, ReconContext, ReconAgent } from "./recon-agents";

// ── Agent 13: Building Permits (Accela) ──

const buildingPermitsAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  const { db, projectId, apn, parcel } = ctx;
  
  try {
    const address = parcel?.properties?.FULLADDR?.trim() || "";
    const streetNum = address ? address.split(" ")[0] : "";
    const streetName = address ? address.split(" ").slice(1).join(" ").replace(/\s+(Rd|St|Ave|Blvd|Dr|Ln|Way|Ct|Pl|Trl|Hwy)\.?$/, "").trim() : "";
    
    // Try Accela search via POST (WebForms with ViewState)
    let permitsFound = 0;
    let permitRecords: any[] = [];
    let accelaStatus = "unreachable";
    
    try {
      // Step 1: GET the search page to extract ViewState
      const searchPageUrl = "https://aca-prod.accela.com/HUMBOLDT/Cap/CapHome.aspx?module=Building";
      const pageResp = await fetch(searchPageUrl, {
        headers: { "User-Agent": "FairProcess-PropertyIntel/1.0" },
      });
      
      if (pageResp.ok) {
        accelaStatus = "reachable";
        const pageHtml = await pageResp.text();
        
        // Extract __VIEWSTATE and __EVENTVALIDATION
        const viewStateMatch = pageHtml.match(/__VIEWSTATE[^>]*value="([^"]*)"/);
        const eventValMatch = pageHtml.match(/__EVENTVALIDATION[^>]*value="([^"]*)"/);
        
        if (viewStateMatch && streetNum && streetName) {
          // Step 2: POST the search form
          const formData = new URLSearchParams();
          formData.append("__VIEWSTATE", viewStateMatch[1]);
          if (eventValMatch) formData.append("__EVENTVALIDATION", eventValMatch[1]);
          formData.append("__EVENTTARGET", "");
          formData.append("__EVENTARGUMENT", "");
          formData.append("ScriptManager1", "UpdatePanel1|ctl00$MainContent$btnSearch");
          formData.append("ctl00$MainContent$drpSearchType", "AddressSearch");
          formData.append("ctl00$MainContent$txtStreetNumFrom", streetNum);
          formData.append("ctl00$MainContent$txtStreetNumTo", streetNum);
          formData.append("ctl00$MainContent$txtStreetName", streetName);
          formData.append("ctl00$MainContent$btnSearch", "Search");
          
          const searchResp = await fetch(searchPageUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "FairProcess-PropertyIntel/1.0",
            },
            body: formData.toString(),
          });
          
          if (searchResp.ok) {
            const resultsHtml = await searchResp.text();
            
            // Parse results — look for table rows with address and permit data
            const rowPattern = /<tr[^>]*class=["']?(?:AltRow|row)[^"']?["']?[^>]*>(.*?)<\/tr>/gis;
            const rows = resultsHtml.match(rowPattern) || [];
            
            for (const row of rows) {
              const cells = row.match(/<td[^>]*>(.*?)<\/td>/gis) || [];
              const cellTexts = cells.map(c => c.replace(/<[^>]+>/g, "").trim());
              if (cellTexts.length >= 2) {
                permitRecords.push({
                  permit_number: cellTexts[0] || "",
                  permit_type: cellTexts[1] || "Building",
                  address: cellTexts[2] || address,
                  status: cellTexts[3] || "Unknown",
                });
              }
            }
            
            permitsFound = permitRecords.length;
          }
        }
      }
    } catch (e) {
      accelaStatus = "error";
    }
    
    // Also check for existing permits in D1
    const existingPermits = await db.prepare(
      `SELECT * FROM building_permits WHERE project_id = ? AND organization_id = ? ORDER BY issued_date DESC`
    ).bind(projectId).all() as any;
    
    const d1Count = existingPermits.results?.length || 0;
    
    // If we found new permits from Accela, store them in D1
    if (permitsFound > 0) {
      for (const p of permitRecords) {
        // Check if already exists
        const existing = await db.prepare(
          `SELECT id FROM building_permits WHERE project_id = ? AND organization_id = ? AND permit_number = ?`
        ).bind(projectId, p.permit_number).first();
        
        if (!existing) {
          await db.prepare(
            `INSERT INTO building_permits (id, project_id, permit_number, permit_type, permit_status, organization_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
          ).bind(crypto.randomUUID(), projectId, p.permit_number, p.permit_type, p.status, ctx.organizationId).run();
        }
      }
    }
    
    const totalCount = Math.max(d1Count, permitsFound);
    
    if (totalCount > 0) {
      const allPermits = await db.prepare(
        `SELECT * FROM building_permits WHERE project_id = ? AND organization_id = ? ORDER BY issued_date DESC`
      ).bind(projectId).all() as any;
      
      const permitList = (allPermits.results || []).map((p: any) => 
        `- ${p.permit_number || "No #"} | ${p.permit_type || "Building"} | Status: ${p.permit_status || "Unknown"} | Issued: ${p.issued_date || "N/A"} | Valuation: $${p.valuation || 0}`
      ).join("\n");
      
      return {
        agent: "building_permits",
        status: "success",
        message: `${totalCount} building permit(s) on file. Accela: ${accelaStatus}.`,
        data: {
          permit_count: totalCount,
          accela_reachable: accelaStatus === "reachable",
          accela_searched: permitsFound > 0,
          permits: allPermits.results,
          summary: permitList,
        },
      };
    }

    return {
      agent: "building_permits",
      status: "no_data",
      message: `No building permits found. Accela ${accelaStatus}. Search by address '${address}' at aca-prod.accela.com/HUMBOLDT or call Planning & Building: (707) 445-7541.`,
      data: {
        accela_reachable: accelaStatus === "reachable",
        accela_url: `https://aca-prod.accela.com/HUMBOLDT/Cap/CapHome.aspx?module=Building`,
        search_address: address,
        search_apn: apn,
        building_dept_phone: "(707) 445-7541",
      },
    };
  } catch (err: any) {
    return {
      agent: "building_permits",
      status: "error",
      message: `Building permits agent error: ${err.message?.slice(0, 100) || "unknown"}`,
    };
  }
};

// ── Agent 14: Code Enforcement Cases ──

const codeEnforcementAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  const { db, projectId, apn } = ctx;
  
  try {
    // Query Humboldt County ArcGIS Code Enforcement layer
    // Layer: Web/Housing_Public/MapServer/7 — "Code Enforcement Cases 1/15/2025"
    // Fields: APN_1, RECORD_ID, Type_of_Case_1, DATE_OPENED_1 (epoch ms)
    // No auth required — public layer.
    const { syncCECases, fetchCECasesByAPN } = await import("./ce-pipeline");
    
    // Get org ID from project
    const project = await db.prepare(
      `SELECT organization_id FROM projects WHERE id = ?`
    ).bind(projectId).first();
    const orgId = (project?.organization_id as string) || "";
    
    // Sync CE cases to D1 (creates records + timeline events)
    const syncResult = await syncCECases(projectId, apn, orgId, db);
    
    // Read back all CE cases (including pre-existing)
    const allCases = await db.prepare(
      `SELECT * FROM code_enforcement_cases WHERE project_id = ? AND organization_id = ? ORDER BY created_at DESC`
    ).bind(projectId).all() as any;
    
    const caseCount = allCases.results?.length || 0;
    
    if (caseCount > 0) {
      const caseList = allCases.results.map((c: any) =>
        `- ${c.case_number || "No #"} | ${c.violation_type || "Unknown"} | Severity: ${c.severity} | Status: ${c.status} | Opened: ${c.notice_served_date || "N/A"} | Hearing: ${c.hearing_date || "N/A"}`
      ).join("\n");
      
      return {
        agent: "code_enforcement",
        status: "success",
        message: `${caseCount} code enforcement case(s) ${syncResult.casesCreated > 0 ? `(${syncResult.casesCreated} new from county GIS, ${syncResult.casesUpdated} updated)` : "on file"}.`,
        data: {
          case_count: caseCount,
          cases: allCases.results,
          summary: caseList,
          sync_result: syncResult,
        },
      };
    }
    
    return {
      agent: "code_enforcement",
      status: "no_data",
      message: `No code enforcement cases found for APN ${apn} in county GIS or D1. County CE phone: (707) 476-2429.`,
      data: {
        ce_phone: "(707) 476-2429",
        records_portal: "https://humboldtgov.nextrequest.com",
        search_apn: apn,
      },
    };
  } catch (err: any) {
    return {
      agent: "code_enforcement",
      status: "error",
      message: `Code enforcement agent error: ${err.message?.slice(0, 100) || "unknown"}`,
    };
  }
};

// ── Agent 15: County Recorder Records ──

const countyRecorderAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  const { db, projectId, apn, parcel } = ctx;
  
  try {
    // Extract data from the GIS parcel record (already fetched by parcelAgent)
    const legal = parcel?.properties?.LEGAL?.trim() || "";
    const bkpg = parcel?.properties?.BKPG || "";
    const trandate = parcel?.properties?.TRANDATE || "";
    const yearBuilt = parcel?.properties?.YEAR_BUILT?.trim() || "";
    
    // Try to reach the county recorder and assessor
    const recorderUrl = "https://humboldtcountyca-web.tylerhost.net/web/";
    const assessorUrl = "https://www.humboldtgov.org/206/Assessor";
    
    let recorderReachable = false;
    let assessorReachable = false;
    
    try {
      const resp = await fetch(recorderUrl, { headers: { "User-Agent": "FairProcess-PropertyIntel/1.0" } });
      recorderReachable = resp.ok;
    } catch { recorderReachable = false; }
    
    try {
      const resp = await fetch(assessorUrl, { headers: { "User-Agent": "FairProcess-PropertyIntel/1.0" } });
      assessorReachable = resp.ok;
    } catch { assessorReachable = false; }
    
    // Check for existing recorder records in D1
    const existingRecords = await db.prepare(
      `SELECT * FROM recorder_records WHERE project_id = ? AND organization_id = ? ORDER BY recording_date DESC`
    ).bind(projectId).all() as any;
    
    const recordCount = existingRecords.results?.length || 0;
    
    // Build recorder context from GIS parcel data
    const recorderInfo: string[] = [];
    if (bkpg) recorderInfo.push(`Book/Page: ${bkpg}`);
    if (trandate) {
      const transferDate = new Date(trandate).toISOString().slice(0, 10);
      recorderInfo.push(`Last Transfer: ${transferDate}`);
      
      // Auto-create a recorder record from GIS transfer data if none exist
      if (recordCount === 0) {
        const recId = crypto.randomUUID();
        await db.prepare(
          `INSERT INTO recorder_records (id, project_id, document_number, document_type, recording_date, parties, notes, organization_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        ).bind(
          recId, projectId,
          bkpg || `GIS-${apn}`,
          "Grant Deed",
          transferDate,
          null,
          `Auto-extracted from County GIS parcel data. Book/Page: ${bkpg}. APN: ${apn}.`,
          ctx.organizationId,
        ).run();
        
        // Create a timeline event for the transfer
        await db.prepare(
          `INSERT INTO timeline_events (id, project_id, evidence_id, event_date, event_type, description, organization_id)
           VALUES (?, ?, NULL, ?, 'correspondence', ?, ?)`
        ).bind(
          crypto.randomUUID(), projectId, transferDate,
          `Property transfer recorded (Book/Page: ${bkpg || "Unknown"})`,
          ctx.organizationId,
        ).run();
      }
    }
    if (legal) recorderInfo.push(`Legal: ${legal}`);
    if (yearBuilt) recorderInfo.push(`Year Built: ${yearBuilt}`);
    
    // Re-read after potential insert
    const allRecords = await db.prepare(
      `SELECT * FROM recorder_records WHERE project_id = ? AND organization_id = ? ORDER BY recording_date DESC`
    ).bind(projectId).all() as any;
    
    const finalCount = allRecords.results?.length || 0;
    
    if (finalCount > 0) {
      const recordList = (allRecords.results || []).map((r: any) =>
        `- ${r.document_number || "No #"} | ${r.document_type || "Document"} | Recorded: ${r.recording_date || "N/A"} | Parties: ${r.parties || "N/A"}`
      ).join("\n");
      
      return {
        agent: "county_recorder",
        status: "success",
        message: `${finalCount} recorder record(s) on file. ${recorderInfo.join(", ") || "No parcel transfer data"}.`,
        data: {
          record_count: finalCount,
          records: allRecords.results,
          summary: recordList,
          recorder_reachable: recorderReachable,
          assessor_reachable: assessorReachable,
          gis_transfer_data: recorderInfo.length > 0,
        },
      };
    }
    
    return {
      agent: "county_recorder",
      status: "no_data",
      message: `No recorder records found. GIS data: ${recorderInfo.join(", ") || "No parcel transfer data"}. Recorder: ${recorderReachable ? "reachable" : "unreachable"} at humboldtcountyca-web.tylerhost.net. Assessor: ${assessorReachable ? "reachable" : "unreachable"} at humboldoldtgov.org/206/Assessor.`,
      data: {
        recorder_reachable: recorderReachable,
        assessor_reachable: assessorReachable,
        recorder_url: recorderUrl,
        assessor_url: assessorUrl,
        book_page: bkpg,
        last_transfer: trandate ? new Date(trandate).toISOString().slice(0, 10) : null,
        legal_desc: legal,
        year_built: yearBuilt,
        search_apn: apn,
      },
    };
  } catch (err: any) {
    return {
      agent: "county_recorder",
      status: "error",
      message: `County recorder agent error: ${err.message?.slice(0, 100) || "unknown"}`,
    };
  }
};

// ── Agent 16: Due Process Analysis (Cross-Reference Engine) ──

const dueProcessAnalysisAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  const { db, projectId, organizationId } = ctx;
  
  try {
    // Gather all records from all three sources
    const [permits, ceCases, recorderRecords] = await Promise.all([
      db.prepare(`SELECT * FROM building_permits WHERE project_id = ? AND organization_id = ?`).bind(projectId, ctx.organizationId).all(),
      db.prepare(`SELECT * FROM code_enforcement_cases WHERE project_id = ? AND organization_id = ?`).bind(projectId, ctx.organizationId).all(),
      db.prepare(`SELECT * FROM recorder_records WHERE project_id = ? AND organization_id = ?`).bind(projectId, ctx.organizationId).all(),
    ]);
    
    const permitList = (permits.results || []) as any[];
    const ceCaseList = (ceCases.results || []) as any[];
    const recorderList = (recorderRecords.results || []) as any[];
    
    const findings: { rule: string; rule_name: string; severity: string; detail: string }[] = [];
    
    // ── Due Process Rule Checks ──
    
    // Rule 1: Adequate Notice Period (CA Gov Code §25845 requires reasonable notice)
    for (const ce of ceCaseList) {
      if (ce.notice_served_date && ce.abatement_date) {
        const noticeDate = new Date(ce.notice_served_date);
        const abateDate = new Date(ce.abatement_date);
        const daysBetween = Math.floor((abateDate.getTime() - noticeDate.getTime()) / (1000 * 60 * 60 * 24));
        const requiredDays = ce.notice_period_days || 10; // default minimum 10 days
        
        if (daysBetween < requiredDays) {
          findings.push({
            rule: "notice_timing",
            rule_name: "Inadequate Notice Period",
            severity: daysBetween < 5 ? "critical" : "warning",
            detail: `Only ${daysBetween} days between notice (${ce.notice_served_date}) and abatement (${ce.abatement_date}). Minimum required: ${requiredDays} days. Case: ${ce.case_number || "Unknown"}.`,
          });
        }
      }
      
      // Rule 2: Right to Hearing — abatement without hearing
      if (ce.abatement_date && !ce.hearing_date) {
        findings.push({
          rule: "right_to_hearing",
          rule_name: "Abatement Without Hearing",
          severity: "critical",
          detail: `Abatement occurred on ${ce.abatement_date} without a recorded hearing. Case: ${ce.case_number || "Unknown"}. This may violate due process rights under the 14th Amendment.`,
        });
      }
      
      // Rule 3: Hearing notice adequacy
      if (ce.hearing_date && ce.notice_served_date) {
        const noticeDate = new Date(ce.notice_served_date);
        const hearingDate = new Date(ce.hearing_date);
        const daysBetween = Math.floor((hearingDate.getTime() - noticeDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysBetween < 10) {
          findings.push({
            rule: "hearing_notice_adequacy",
            rule_name: "Insufficient Hearing Notice",
            severity: "warning",
            detail: `Only ${daysBetween} days between notice (${ce.notice_served_date}) and hearing (${ce.hearing_date}). Due process typically requires 10+ days. Case: ${ce.case_number || "Unknown"}.`,
          });
        }
      }
      
      // Rule 4: Lien filed without due process
      if (ce.lien_filed && !ce.hearing_date && !ce.notice_served_date) {
        findings.push({
          rule: "lien_without_due_process",
          rule_name: "Lien Filed Without Due Process",
          severity: "critical",
          detail: `Lien filed without recorded notice or hearing. Case: ${ce.case_number || "Unknown"}. This may violate procedural due process requirements.`,
        });
      }
      
      // Rule 5: Appeal rights
      if (ce.abatement_date && !ce.appeal_filed) {
        findings.push({
          rule: "appeal_rights",
          rule_name: "Appeal Rights Not Documented",
          severity: "info",
          detail: `No appeal filed after abatement on ${ce.abatement_date}. Case: ${ce.case_number || "Unknown"}. Verify whether appeal rights were properly communicated.`,
        });
      }
    }
    
    // Rule 6: Building permits — work without permit
    for (const ce of ceCaseList) {
      const violationLower = (ce.violation_type || "").toLowerCase();
      if (violationLower.includes("building") || violationLower.includes("permit") || violationLower.includes("construction") || violationLower.includes("structure")) {
        // Check if there's a corresponding building permit
        const hasPermit = permitList.some((p: any) => 
          p.permit_status === "issued" || p.permit_status === "finalized"
        );
        if (!hasPermit) {
          findings.push({
            rule: "work_without_permit",
            rule_name: "Construction Without Building Permit",
            severity: "warning",
            detail: `Code enforcement case ${ce.case_number || "Unknown"} cites building/permit violation but no building permit found in records. This may indicate unpermitted construction.`,
          });
        }
      }
    }
    
    // Rule 7: Expired permits
    for (const permit of permitList) {
      if (permit.expired_date && permit.permit_status !== "finalized" && permit.permit_status !== "closed") {
        const expDate = new Date(permit.expired_date);
        if (expDate < new Date()) {
          findings.push({
            rule: "expired_permit",
            rule_name: "Expired Building Permit",
            severity: "warning",
            detail: `Permit ${permit.permit_number || "Unknown"} expired on ${permit.expired_date} and is not finalized. Type: ${permit.permit_type}.`,
          });
        }
      }
    }
    
    // Rule 8: Cross-department date discrepancies
    // Check if CE notice date is before any building permit issuance
    for (const ce of ceCaseList) {
      if (ce.notice_served_date) {
        const noticeDate = new Date(ce.notice_served_date);
        for (const permit of permitList) {
          if (permit.issued_date) {
            const permitDate = new Date(permit.issued_date);
            // If permit was issued AFTER CE notice, might be corrective action
            if (permitDate > noticeDate) {
              findings.push({
                rule: "permit_after_ce_notice",
                rule_name: "Permit Issued After CE Notice",
                severity: "info",
                detail: `Permit ${permit.permit_number || "Unknown"} issued on ${permit.issued_date}, after CE notice on ${ce.notice_served_date}. Case: ${ce.case_number || "Unknown"}. This may indicate the permit was obtained in response to the CE action.`,
              });
            }
          }
        }
      }
    }
    
    // Rule 9: Recorder records — check for liens or notices
    for (const rec of recorderList) {
      const docType = (rec.document_type || "").toLowerCase();
      if (docType.includes("lien") || docType.includes("notice")) {
        // Check if there's a corresponding CE case
        const hasCECase = ceCaseList.length > 0;
        if (!hasCECase) {
          findings.push({
            rule: "lien_without_ce_case",
            rule_name: "Recorded Lien Without CE Case",
            severity: "warning",
            detail: `Recorder record ${rec.document_number || "Unknown"} (${rec.document_type}) recorded on ${rec.recording_date} but no corresponding code enforcement case found. This may indicate an administrative error or missing records.`,
          });
        }
      }
    }
    
    // Rule 10: Overall completeness check
    const dataSources = {
      building_permits: permitList.length,
      code_enforcement: ceCaseList.length,
      recorder_records: recorderList.length,
    };
    const missingSources = Object.entries(dataSources).filter(([_, count]) => count === 0).map(([src]) => src);
    
    if (missingSources.length > 0) {
      findings.push({
        rule: "incomplete_records",
        rule_name: "Incomplete Property Records",
        severity: "info",
        detail: `Missing data sources: ${missingSources.join(", ")}. Complete records from all three departments (building permits, code enforcement, county recorder) are needed for full due process analysis.`,
      });
    }
    
    // ── Store findings in D1 ──
    
    // Delete ALL old due process findings for this project (we're regenerating them)
    await db.prepare(
      `DELETE FROM due_process_findings WHERE project_id = ? AND organization_id = ?`
    ).bind(projectId, ctx.organizationId).run();
    
    for (const finding of findings) {
      await db.prepare(
        `INSERT INTO due_process_findings (id, project_id, rule, rule_name, severity, status, detail, organization_id)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
      ).bind(
        crypto.randomUUID(),
        projectId,
        finding.rule,
        finding.rule_name,
        finding.severity,
        finding.detail,
        ctx.organizationId,
      ).run();
    }
    
    // Build summary
    const critical = findings.filter(f => f.severity === "critical").length;
    const warnings = findings.filter(f => f.severity === "warning").length;
    const info = findings.filter(f => f.severity === "info").length;
    
    const summary = findings.length === 0
      ? "No due process violations detected. All records appear procedurally compliant."
      : `Found ${findings.length} finding(s): ${critical} critical, ${warnings} warning, ${info} informational. ${findings.map(f => `[${f.severity.toUpperCase()}] ${f.rule_name}: ${f.detail}`).join(" | ")}`;
    
    return {
      agent: "due_process_analysis",
      status: "success",
      message: summary.slice(0, 200),
      data: {
        findings_count: findings.length,
        critical_count: critical,
        warning_count: warnings,
        info_count: info,
        findings,
        records_analyzed: {
          building_permits: permitList.length,
          code_enforcement: ceCaseList.length,
          recorder_records: recorderList.length,
        },
      },
    };
  } catch (err: any) {
    return {
      agent: "due_process_analysis",
      status: "error",
      message: `Due process analysis error: ${err.message?.slice(0, 100) || "unknown"}`,
    };
  }
};

// ── Export all records agents ──

export const RECORDS_AGENTS: { name: string; agent: ReconAgent; description: string }[] = [
  { name: "building_permits", agent: buildingPermitsAgent, description: "Building permits from Accela Citizen Access" },
  { name: "code_enforcement", agent: codeEnforcementAgent, description: "Code enforcement cases and violations" },
  { name: "county_recorder", agent: countyRecorderAgent, description: "County recorder records (deeds, liens, notices)" },
  { name: "due_process_analysis", agent: dueProcessAnalysisAgent, description: "Cross-references all records for due process violations" },
];
