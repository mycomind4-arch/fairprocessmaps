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
import { findingFingerprint } from "./finding-utils";

// ── Shared helpers ──

/**
 * Fetch with retry and exponential backoff.
 * Retries on network errors and 5xx responses.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
): Promise<Response> {
  let lastErr: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.ok || resp.status < 500) return resp;
      // 5xx — retry with backoff
      lastErr = new Error(`HTTP ${resp.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < maxRetries - 1) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000); // 1s, 2s, 4s
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

/**
 * Strip HTML tags and decode common entities.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Extract all <td> cell texts from a table row HTML string.
 */
function extractRowCells(rowHtml: string): string[] {
  // Match <td>...</td> including nested tags, non-greedy per cell
  const cellMatches = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
  return cellMatches.map(c => stripHtml(c));
}

/**
 * Parse an ASP.NET AJAX partial-postback response into its HTML content.
 * Partial postbacks return length-prefixed chunks like:
 *   len|id|content|len|id|content|...
 * If the response doesn't match this format, return it as-is (full postback).
 */
function extractPartialPostbackHtml(responseText: string): string {
  // Partial postback responses start with a digit followed by |
  if (!/^\d+\|/.test(responseText)) return responseText;

  let html = "";
  let pos = 0;
  while (pos < responseText.length) {
    // Read length
    const pipeIdx = responseText.indexOf("|", pos);
    if (pipeIdx === -1) break;
    const len = parseInt(responseText.slice(pos, pipeIdx), 10);
    if (isNaN(len)) break;
    pos = pipeIdx + 1;

    // Read id (up to next |)
    const idPipeIdx = responseText.indexOf("|", pos);
    if (idPipeIdx === -1) break;
    const id = responseText.slice(pos, idPipeIdx);
    pos = idPipeIdx + 1;

    // Read content
    if (pos + len > responseText.length) break;
    const content = responseText.slice(pos, pos + len);
    pos += len;

    // Accumulate HTML content from update panels
    if (id && (id.includes("UpdatePanel") || id.includes("panel") || id === "")) {
      html += content;
    }
  }

  // If we extracted nothing meaningful, fall back to full response
  return html || responseText;
}

// ── Agent 13: Building Permits (Accela) ──

const buildingPermitsAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  const { db, projectId, apn, parcel } = ctx;

  try {
    const address = parcel?.properties?.FULLADDR?.trim() || "";
    const streetNum = address ? address.split(" ")[0] : "";
    // Don't strip suffix with a fragile regex — keep the full street name
    // and let Accela match on the base name. Split number from the rest.
    const streetName = address ? address.split(" ").slice(1).join(" ").trim() : "";

    // Try Accela search via POST (WebForms with ViewState)
    let permitsFound = 0;
    let permitRecords: any[] = [];
    let accelaStatus = "unreachable";

    // Normalize APN for Accela (strip dashes — Accela typically uses unformatted or formatted APN)
    const apnForAccela = apn?.replace(/-/g, "") || "";

    try {
      // Step 1: GET the search page to extract ViewState
      const searchPageUrl = "https://aca-prod.accela.com/HUMBOLDT/Cap/CapHome.aspx?module=Building";
      const pageResp = await fetchWithRetry(searchPageUrl, {
        headers: { "User-Agent": "FairProcess-PropertyIntel/1.0" },
      });

      if (pageResp.ok) {
        accelaStatus = "reachable";
        const pageHtml = await pageResp.text();

        // Extract __VIEWSTATE and __EVENTVALIDATION
        const viewStateMatch = pageHtml.match(/__VIEWSTATE[^>]*value="([^"]*)"/);
        const eventValMatch = pageHtml.match(/__EVENTVALIDATION[^>]*value="([^"]*)"/);

        if (viewStateMatch) {
          // Step 2: POST the search form
          // Strategy: search by Parcel Number (APN) first — more precise than address.
          // If APN is not available, fall back to address search.
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
          // Also search by parcel number if available
          if (apnForAccela) {
            formData.append("ctl00$MainContent$txtParcel", apnForAccela);
          }
          formData.append("ctl00$MainContent$btnSearch", "Search");

          const searchResp = await fetchWithRetry(searchPageUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "FairProcess-PropertyIntel/1.0",
            },
            body: formData.toString(),
          });

          if (searchResp.ok) {
            const rawResponse = await searchResp.text();
            // Handle both full HTML postback and AJAX partial-postback responses
            const resultsHtml = extractPartialPostbackHtml(rawResponse);

            // Parse results — look for table rows with data.
            // ACA renders results in a grid with class "AltRow" or "row" (alternating).
            // Use a more robust pattern that captures the full row including nested tables.
            const rowPattern = /<tr[^>]*class=["'][^"']*(?:AltRow|row)[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
            let match: RegExpExecArray | null;
            while ((match = rowPattern.exec(resultsHtml)) !== null) {
              const rowHtml = match[1];
              const cellTexts = extractRowCells(rowHtml);
              if (cellTexts.length >= 2) {
                const record = {
                  permit_number: cellTexts[0] || "",
                  permit_type: cellTexts[1] || "Building",
                  address: cellTexts[2] || address,
                  status: cellTexts[3] || "Unknown",
                };
                // Only push if it looks like a real permit record (has a non-empty first cell)
                if (record.permit_number) {
                  permitRecords.push(record);
                }
              }
            }

            permitsFound = permitRecords.length;

            // Pagination: if results have a "Next" page link, follow it
            // ACA pagination uses __doPostBack with a page index argument.
            // We follow up to 5 pages of results.
            let pageCount = 0;
            let currentPageHtml = resultsHtml;
            let currentViewState = viewStateMatch[1];
            let currentEventVal = eventValMatch?.[1] || "";

            while (pageCount < 5) {
              // Look for the next-page link/button in the result HTML
              // ACA uses a pager with link buttons like:
              // <a href="javascript:__doPostBack('ctl00$MainContent$gvResult','Page$2')">
              const nextPageMatch = currentPageHtml.match(
                /__doPostBack\('([^']+)',\s*'Page\$([^']+)'\)/,
              );
              if (!nextPageMatch) break;

              const eventTarget = nextPageMatch[1];
              const pageArg = nextPageMatch[2];

              // Need fresh ViewState from the current response for the next page
              const vsMatch = currentPageHtml.match(/__VIEWSTATE[^>]*value="([^"]*)"/);
              const evMatch = currentPageHtml.match(/__EVENTVALIDATION[^>]*value="([^"]*)"/);
              if (vsMatch) currentViewState = vsMatch[1];
              if (evMatch) currentEventVal = evMatch[1];

              pageCount++;
              const pageFormData = new URLSearchParams();
              pageFormData.append("__VIEWSTATE", currentViewState);
              if (currentEventVal) pageFormData.append("__EVENTVALIDATION", currentEventVal);
              pageFormData.append("__EVENTTARGET", eventTarget);
              pageFormData.append("__EVENTARGUMENT", `Page$${pageArg}`);
              pageFormData.append("ScriptManager1", `UpdatePanel1|${eventTarget}`);
              pageFormData.append("ctl00$MainContent$drpSearchType", "AddressSearch");

              try {
                const pageResp2 = await fetchWithRetry(searchPageUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "FairProcess-PropertyIntel/1.0",
                  },
                  body: pageFormData.toString(),
                });

                if (!pageResp2.ok) break;
                const pageRaw = await pageResp2.text();
                currentPageHtml = extractPartialPostbackHtml(pageRaw);

                // Parse additional rows from this page
                const pageRowPattern = /<tr[^>]*class=["'][^"']*(?:AltRow|row)[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
                let pageMatch: RegExpExecArray | null;
                while ((pageMatch = pageRowPattern.exec(currentPageHtml)) !== null) {
                  const rowHtml = pageMatch[1];
                  const cellTexts = extractRowCells(rowHtml);
                  if (cellTexts.length >= 2 && cellTexts[0]) {
                    permitRecords.push({
                      permit_number: cellTexts[0] || "",
                      permit_type: cellTexts[1] || "Building",
                      address: cellTexts[2] || address,
                      status: cellTexts[3] || "Unknown",
                    });
                  }
                }
                permitsFound = permitRecords.length;
              } catch {
                break; // stop pagination on error
              }
            }
          }
        }
      }
    } catch (e) {
      accelaStatus = "error";
    }

    // Also check for existing permits in D1 — FIX: bind both placeholders
    const existingPermits = await db.prepare(
      `SELECT * FROM building_permits WHERE project_id = ? AND organization_id = ? ORDER BY issued_date DESC`
    ).bind(projectId, ctx.organizationId).all() as any;

    const d1Count = existingPermits.results?.length || 0;

    // If we found new permits from Accela, store them in D1
    if (permitsFound > 0) {
      for (const p of permitRecords) {
        // Check if already exists — FIX: bind both placeholders + permit_number
        const existing = await db.prepare(
          `SELECT id FROM building_permits WHERE project_id = ? AND organization_id = ? AND permit_number = ?`
        ).bind(projectId, ctx.organizationId, p.permit_number).first();

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
      // FIX: bind both placeholders
      const allPermits = await db.prepare(
        `SELECT * FROM building_permits WHERE project_id = ? AND organization_id = ? ORDER BY issued_date DESC`
      ).bind(projectId, ctx.organizationId).all() as any;

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

    // Get org ID from project — single placeholder, already correct
    const project = await db.prepare(
      `SELECT organization_id FROM projects WHERE id = ?`
    ).bind(projectId).first();
    const orgId = (project?.organization_id as string) || "";

    // Sync CE cases to D1 (creates records + timeline events)
    const syncResult = await syncCECases(projectId, apn, orgId, db);

    // Read back all CE cases (including pre-existing)
    // FIX: bind both placeholders
    const allCases = await db.prepare(
      `SELECT * FROM code_enforcement_cases WHERE project_id = ? AND organization_id = ? ORDER BY created_at DESC`
    ).bind(projectId, ctx.organizationId).all() as any;

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

/**
 * Search the Humboldt County Clerk-Recorder's Tyler Technologies self-service portal
 * for official records (deeds, liens, notices of default, easements, etc.) by
 * grantor/grantee name.
 *
 * The portal at humboldtcountyca-web.tylerhost.net requires:
 * 1. GET the disclaimer page (establishes a session via cookie)
 * 2. POST the disclaimer acceptance (carries the session cookie)
 * 3. GET the Advanced Search page
 * 4. POST the search form with grantor/grantee name
 * 5. Parse the results table
 *
 * There is no REST/JSON API — the Tyler system is entirely HTML/session-based.
 */
async function searchRecorderByName(
  ownerName: string,
  searchType: "grantor" | "grantee" | "both" = "both",
): Promise<any[]> {
  const baseUrl = "https://humboldtcountyca-web.tylerhost.net";
  const headers: Record<string, string> = {
    "User-Agent": "FairProcess-PropertyIntel/1.0",
  };

  // Step 1: GET the disclaimer/home page to establish a session
  const homeResp = await fetchWithRetry(`${baseUrl}/web/`, { headers });
  // Extract session cookies from the response
  const setCookies = homeResp.headers.get("set-cookie");
  if (setCookies) {
    headers["Cookie"] = parseSetCookie(setCookies);
  }

  const homeHtml = await homeResp.text();

  // Step 2: POST the disclaimer acceptance
  // The Tyler system has an "I Accept" button that posts back.
  // Extract form fields (ViewState equivalent, any hidden fields)
  const hiddenFields: Record<string, string> = {};
  const hiddenMatches = homeHtml.matchAll(/<input[^>]*type=["']hidden["'][^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gi);
  for (const m of hiddenMatches) {
    hiddenFields[m[1]] = m[2];
  }

  // Also look for any form action to post to
  const formActionMatch = homeHtml.match(/<form[^>]*action=["']([^"']+)["']/i);
  const formAction = formActionMatch
    ? formActionMatch[1].startsWith("http")
      ? formActionMatch[1]
      : `${baseUrl}${formActionMatch[1]}`
    : `${baseUrl}/web/`;

  // Build the acceptance POST — the Tyler system typically uses an accept button
  // named something like "btnAccept" or "ctl00$MainContent$btnAccept"
  const acceptFormData = new URLSearchParams();
  for (const [k, v] of Object.entries(hiddenFields)) {
    acceptFormData.append(k, v);
  }
  // Try common Tyler accept button names
  const acceptBtnMatch = homeHtml.match(/<(?:button|input)[^>]*name=["']([^"']*(?:[Aa]ccept|agree)[^"']*)["']/);
  if (acceptBtnMatch) {
    acceptFormData.append(acceptBtnMatch[1], "I Accept");
  } else {
    acceptFormData.append("btnAccept", "I Accept");
  }

  const acceptResp = await fetchWithRetry(formAction, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: acceptFormData.toString(),
  });

  // Update cookies
  const acceptSetCookies = acceptResp.headers.get("set-cookie");
  if (acceptSetCookies) {
    const existing = headers["Cookie"] || "";
    headers["Cookie"] = mergeCookies(existing, parseSetCookie(acceptSetCookies));
  }

  // Step 3: Navigate to the Advanced Search page
  // The search URL pattern for Tyler is /web/search/DOCSEARCH{NNN}S{N}
  // For Humboldt County Official Records, the search endpoint is typically
  // /web/search/DOCSEARCH199S4 (Official Records search)
  const searchPageUrl = `${baseUrl}/web/search/DOCSEARCH199S4`;
  const searchPageResp = await fetchWithRetry(searchPageUrl, { headers });

  // Update cookies
  const searchSetCookies = searchPageResp.headers.get("set-cookie");
  if (searchSetCookies) {
    const existing = headers["Cookie"] || "";
    headers["Cookie"] = mergeCookies(existing, parseSetCookie(searchSetCookies));
  }

  const searchPageHtml = await searchPageResp.text();

  // Extract hidden fields from the search page
  const searchHiddenFields: Record<string, string> = {};
  const searchHiddenMatches = searchPageHtml.matchAll(
    /<input[^>]*type=["']hidden["'][^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gi,
  );
  for (const m of searchHiddenMatches) {
    searchHiddenFields[m[1]] = m[2];
  }

  // Also capture input fields with id-based naming (Tyler uses ASP.NET-style IDs)
  const allInputMatches = searchPageHtml.matchAll(
    /<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gi,
  );
  for (const m of allInputMatches) {
    if (!searchHiddenFields[m[1]]) {
      searchHiddenFields[m[1]] = m[2];
    }
  }

  // Find the search form action
  const searchFormActionMatch = searchPageHtml.match(/<form[^>]*action=["']([^"']+)["']/i);
  const searchFormAction = searchFormActionMatch
    ? searchFormActionMatch[1].startsWith("http")
      ? searchFormActionMatch[1]
      : searchFormActionMatch[1].startsWith("/")
        ? `${baseUrl}${searchFormActionMatch[1]}`
        : `${baseUrl}/${searchFormActionMatch[1]}`
    : searchPageUrl;

  // Step 4: POST the search form
  // The Tyler Advanced Search has fields for: Grantor, Grantee, Both Names,
  // Document Number, Recording Date range, Document Types.
  // Names should be entered "Last First" (e.g., "Smith James").
  const searchFormData = new URLSearchParams();
  for (const [k, v] of Object.entries(searchHiddenFields)) {
    searchFormData.append(k, v);
  }

  // Set the name search field(s). Tyler field names vary by deployment but
  // typically include named inputs for grantor/grantee.
  // We try common Tyler field name patterns.
  const ownerNameFormatted = formatOwnerName(ownerName);

  // Try to find the actual input field names from the search page HTML
  const grantorFieldMatch = searchPageHtml.match(
    /<input[^>]*(?:name|id)=["']([^"']*(?:rantor|Grantor)[^"']*)["']/i,
  );
  const granteeFieldMatch = searchPageHtml.match(
    /<input[^>]*(?:name|id)=["']([^"']*(?:rantee|Grantee)[^"']*)["']/i,
  );
  const bothNamesFieldMatch = searchPageHtml.match(
    /<input[^>]*(?:name|id)=["']([^"']*(?:oth|Both|names|Names)[^"']*)["']/i,
  );

  if (searchType === "both" && bothNamesFieldMatch) {
    searchFormData.append(bothNamesFieldMatch[1], ownerNameFormatted);
  } else if (grantorFieldMatch && (searchType === "grantor" || searchType === "both")) {
    searchFormData.append(grantorFieldMatch[1], ownerNameFormatted);
  }
  if (granteeFieldMatch && (searchType === "grantee" || searchType === "both")) {
    searchFormData.append(granteeFieldMatch[1], ownerNameFormatted);
  }

  // If we couldn't find specific field names, try generic Tyler field names
  if (!grantorFieldMatch && !granteeFieldMatch && !bothNamesFieldMatch) {
    // Common Tyler field name patterns
    searchFormData.append("txtGrantor", ownerNameFormatted);
    searchFormData.append("txtGrantee", ownerNameFormatted);
  }

  // Look for the search button
  const searchBtnMatch = searchPageHtml.match(
    /<(?:button|input|a)[^>]*(?:name|id)=["']([^"']*(?:[Ss]earch|btnSearch)[^"']*)["']/,
  );
  if (searchBtnMatch) {
    searchFormData.append(searchBtnMatch[1], "Search");
  }

  const searchResp = await fetchWithRetry(searchFormAction, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": searchPageUrl,
    },
    body: searchFormData.toString(),
  });

  const resultsHtml = await searchResp.text();

  // Step 5: Parse the results table
  // Tyler results are in a table with document number, type, recording date,
  // grantor, grantee columns.
  const records: any[] = [];

  // Look for result table rows — Tyler uses various CSS classes
  // Common patterns: <tr class="dataRow">, <tr class="altRow">, or plain <tr> in a results table
  const rowPattern = /<tr[^>]*(?:class=["'][^"']*(?:data|alt|grid|result)[^"']*["'])?[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(resultsHtml)) !== null) {
    const rowHtml = match[1];
    const cellTexts = extractRowCells(rowHtml);

    // Tyler results typically have: Document Number, Document Type, Recording Date, Grantor, Grantee
    // Skip header rows (which have <th> instead of <td>) and empty rows
    if (cellTexts.length >= 3) {
      const docNumber = cellTexts[0] || "";
      // Only add if the first cell looks like a document number (not a header)
      if (docNumber && !/^(document|doc\s*#|number)$/i.test(docNumber)) {
        records.push({
          document_number: docNumber,
          document_type: cellTexts[1] || "Unknown",
          recording_date: cellTexts[2] || "",
          grantor: cellTexts[3] || "",
          grantee: cellTexts[4] || "",
          source: "recorder_search",
        });
      }
    }
  }

  return records;
}

/**
 * Parse Set-Cookie header into a simple cookie string.
 */
function parseSetCookie(setCookie: string): string {
  return setCookie
    .split(/,(?=\s*[a-zA-Z_-]+=)/) // Split on commas that start a new cookie
    .map(c => c.split(";")[0].trim())
    .join("; ");
}

/**
 * Merge existing cookies with new ones (new ones take precedence on key collision).
 */
function mergeCookies(existing: string, newCookies: string): string {
  const merged: Record<string, string> = {};
  for (const pair of (existing + ";" + newCookies).split(";")) {
    const [k, ...v] = pair.trim().split("=");
    if (k) merged[k] = v.join("=");
  }
  return Object.entries(merged).map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * Format an owner name for Tyler recorder search.
 * Tyler expects "Last First" format (e.g., "Smith James").
 * GIS data often has "SMITH JAMES" or "SMITH, JAMES" or "Smith James".
 */
function formatOwnerName(name: string): string {
  let formatted = name.trim();

  // Handle "Last, First" format
  if (formatted.includes(",")) {
    const [last, first] = formatted.split(",");
    formatted = `${last.trim()} ${first?.trim() || ""}`.trim();
  }
  // Handle "First Last" format (check if two words and no comma — assume GIS gives last first)
  // GIS parcel data typically gives owner as "LASTNAME FIRSTNAME" or "LASTNAME FIRSTNAME INITIAL"
  // Tyler expects "Last First" so this should work directly

  // Remove any special characters that could break the search
  formatted = formatted.replace(/[&%#@*]/g, " ").replace(/\s+/g, " ").trim();

  return formatted;
}

const countyRecorderAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  const { db, projectId, apn, parcel } = ctx;

  try {
    // Extract data from the GIS parcel record (already fetched by parcelAgent)
    const legal = parcel?.properties?.LEGAL?.trim() || "";
    const bkpg = parcel?.properties?.BKPG || "";
    const trandate = parcel?.properties?.TRANDATE || "";
    const yearBuilt = parcel?.properties?.YEAR_BUILT?.trim() || "";
    // Owner name from GIS — used to search the recorder
    const ownerName = parcel?.properties?.OWNER?.trim() || "";

    // Try to reach the county recorder and assessor
    const recorderUrl = "https://humboldtcountyca-web.tylerhost.net/web/";
    const assessorUrl = "https://www.humboldtgov.org/206/Assessor";

    let recorderReachable = false;
    let assessorReachable = false;

    try {
      const resp = await fetchWithRetry(recorderUrl, {
        headers: { "User-Agent": "FairProcess-PropertyIntel/1.0" },
      });
      recorderReachable = resp.ok;
    } catch { recorderReachable = false; }

    try {
      const resp = await fetchWithRetry(assessorUrl, {
        headers: { "User-Agent": "FairProcess-PropertyIntel/1.0" },
      });
      assessorReachable = resp.ok;
    } catch { assessorReachable = false; }

    // Check for existing recorder records in D1 — FIX: bind both placeholders
    const existingRecords = await db.prepare(
      `SELECT * FROM recorder_records WHERE project_id = ? AND organization_id = ? ORDER BY recording_date DESC`
    ).bind(projectId, ctx.organizationId).all() as any;

    const recordCount = existingRecords.results?.length || 0;

    // Search the county recorder's Tyler Technologies portal by owner name
    let recorderRecords: any[] = [];
    let recorderSearchStatus = "not_searched";

    if (ownerName && recorderReachable) {
      try {
        recorderRecords = await searchRecorderByName(ownerName, "both");
        recorderSearchStatus = recorderRecords.length > 0 ? "found" : "no_results";
      } catch (e: any) {
        recorderSearchStatus = `error: ${e.message?.slice(0, 50) || "unknown"}`;
      }
    }

    // Build recorder context from GIS parcel data
    const recorderInfo: string[] = [];
    if (bkpg) recorderInfo.push(`Book/Page: ${bkpg}`);
    if (trandate) {
      const transferDate = new Date(trandate).toISOString().slice(0, 10);
      recorderInfo.push(`Last Transfer: ${transferDate}`);
    }
    if (legal) recorderInfo.push(`Legal: ${legal}`);
    if (yearBuilt) recorderInfo.push(`Year Built: ${yearBuilt}`);

    // Store real recorder search results in D1
    if (recorderRecords.length > 0) {
      for (const rec of recorderRecords) {
        // Check if already exists — FIX: bind both placeholders + doc number
        const existing = await db.prepare(
          `SELECT id FROM recorder_records WHERE project_id = ? AND organization_id = ? AND document_number = ?`
        ).bind(projectId, ctx.organizationId, rec.document_number).first();

        if (!existing) {
          await db.prepare(
            `INSERT INTO recorder_records (id, project_id, document_number, document_type, recording_date, parties, notes, organization_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
          ).bind(
            crypto.randomUUID(), projectId,
            rec.document_number,
            rec.document_type,
            rec.recording_date || null,
            `${rec.grantor || "N/A"} → ${rec.grantee || "N/A"}`,
            `Retrieved from Humboldt County Clerk-Recorder search. Grantor: ${rec.grantor || "N/A"}, Grantee: ${rec.grantee || "N/A"}.`,
            ctx.organizationId,
          ).run();
        }
      }
    }

    // Only fall back to GIS-derived record if recorder search returned nothing
    // and no existing records exist. Clearly label as GIS-derived.
    if (recorderSearchStatus === "no_results" && recordCount === 0 && trandate) {
      const transferDate = new Date(trandate).toISOString().slice(0, 10);
      const recId = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO recorder_records (id, project_id, document_number, document_type, recording_date, parties, notes, organization_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).bind(
        recId, projectId,
        bkpg || `GIS-${apn}`,
        "Grant Deed (GIS-derived)",
        transferDate,
        null,
        `Auto-extracted from County GIS parcel data (NOT recorder-verified). Book/Page: ${bkpg}. APN: ${apn}. Recorder search returned no results for owner: ${ownerName}.`,
        ctx.organizationId,
      ).run();

      // Create a timeline event for the transfer
      await db.prepare(
        `INSERT INTO timeline_events (id, project_id, evidence_id, event_date, event_type, description, organization_id)
         VALUES (?, ?, NULL, ?, 'correspondence', ?, ?)`
      ).bind(
        crypto.randomUUID(), projectId, transferDate,
        `Property transfer recorded (Book/Page: ${bkpg || "Unknown"}) — GIS-derived, not recorder-verified`,
        ctx.organizationId,
      ).run();
    }

    // Re-read after potential inserts — FIX: bind both placeholders
    const allRecords = await db.prepare(
      `SELECT * FROM recorder_records WHERE project_id = ? AND organization_id = ? ORDER BY recording_date DESC`
    ).bind(projectId, ctx.organizationId).all() as any;

    const finalCount = allRecords.results?.length || 0;

    if (finalCount > 0) {
      const recordList = (allRecords.results || []).map((r: any) =>
        `- ${r.document_number || "No #"} | ${r.document_type || "Document"} | Recorded: ${r.recording_date || "N/A"} | Parties: ${r.parties || "N/A"}`
      ).join("\n");

      const gisDerivedCount = (allRecords.results || []).filter((r: any) =>
        (r.document_type || "").includes("GIS-derived") || (r.notes || "").includes("GIS-derived"),
      ).length;

      return {
        agent: "county_recorder",
        status: "success",
        message: `${finalCount} recorder record(s) on file (${gisDerivedCount} GIS-derived). Recorder search: ${recorderSearchStatus}. ${recorderInfo.join(", ") || "No parcel transfer data"}.`,
        data: {
          record_count: finalCount,
          records: allRecords.results,
          summary: recordList,
          recorder_reachable: recorderReachable,
          assessor_reachable: assessorReachable,
          gis_transfer_data: recorderInfo.length > 0,
          recorder_search_status: recorderSearchStatus,
          gis_derived_count: gisDerivedCount,
          recorder_verified_count: finalCount - gisDerivedCount,
        },
      };
    }

    return {
      agent: "county_recorder",
      status: "no_data",
      message: `No recorder records found. Recorder search: ${recorderSearchStatus}. GIS data: ${recorderInfo.join(", ") || "No parcel transfer data"}. Recorder: ${recorderReachable ? "reachable" : "unreachable"} at humboldtcountyca-web.tylerhost.net. Assessor: ${assessorReachable ? "reachable" : "unreachable"} at humboldoldtgov.org/206/Assessor.`,
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
        owner_name: ownerName,
        recorder_search_status: recorderSearchStatus,
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

    // FIX: Use fingerprint-based upsert instead of destructive DELETE ALL.
    // The old code wiped ALL findings (including from other engines) on every recon.
    // Now we only touch findings whose rules this agent produces, and preserve
    // review state (status, reviewed_by, reviewed_at) on matching fingerprints.
    const reconRuleScope = [
      "notice_timing", "right_to_hearing", "hearing_notice_adequacy",
      "lien_without_due_process", "appeal_rights", "work_without_permit",
      "expired_permit", "permit_after_ce_notice", "lien_without_ce_case",
      "incomplete_records",
    ];

    // Generate fingerprints for new findings
    const newFindingsWithFp = findings.map(f => {
      const isMissingInfo = f.rule === 'missing_data_sources' ||
        (f.detail?.toLowerCase().includes('missing') ?? false) ||
        (f.detail?.toLowerCase().includes('no corresponding') ?? false) ||
        (f.detail?.toLowerCase().includes('not found') ?? false) ||
        (f.detail?.toLowerCase().includes('absent') ?? false);
      return {
        ...f,
        fingerprint: findingFingerprint(f.rule, null, f.detail),
        missing_info: isMissingInfo,
      };
    });

    // Fetch existing findings for our rules only (preserving other engines' findings)
    const placeholders = reconRuleScope.map(() => "?").join(", ");
    const existingResult = await db.prepare(
      `SELECT id, finding_fingerprint, status FROM due_process_findings
       WHERE project_id = ? AND organization_id = ? AND rule IN (${placeholders}) AND status != 'superseded'`
    ).bind(projectId, ctx.organizationId, ...reconRuleScope).all();
    const existingByFp = new Map(
      (existingResult.results ?? []).map((ef: any) => [ef.finding_fingerprint, ef])
    );

    const toInsert: any[] = [];
    const toSupersede: string[] = [];
    let preserved = 0;

    for (const f of newFindingsWithFp) {
      const existing = existingByFp.get(f.fingerprint);
      if (existing) {
        preserved++;
        existingByFp.delete(f.fingerprint);
      } else {
        toInsert.push(f);
      }
    }
    for (const [_fp, ef] of existingByFp) {
      toSupersede.push((ef as any).id);
    }

    // Insert new findings with fingerprints
    if (toInsert.length > 0) {
      const stmts = toInsert.map(f =>
        db.prepare(
          `INSERT INTO due_process_findings (id, project_id, rule, rule_name, severity, status, detail, organization_id, missing_info, finding_fingerprint)
           VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`
        ).bind(crypto.randomUUID(), projectId, f.rule, f.rule_name, f.severity, f.detail, ctx.organizationId, f.missing_info ? 1 : 0, f.fingerprint)
      );
      await db.batch(stmts);
    }

    // Mark stale findings as superseded
    if (toSupersede.length > 0) {
      const stmts = toSupersede.map(id =>
        db.prepare("UPDATE due_process_findings SET status = 'superseded' WHERE id = ?").bind(id)
      );
      await db.batch(stmts);
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

// ── Named exports for testing ──
export { buildingPermitsAgent, codeEnforcementAgent, countyRecorderAgent, dueProcessAnalysisAgent };
