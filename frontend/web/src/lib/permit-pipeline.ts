/**
 * Building Permit Data Pipeline — Accela Citizen Access (Humboldt County)
 *
 * Queries Humboldt County's public Accela portal for building permits by
 * parcel number / address and syncs results to D1 — mirroring ce-pipeline.ts
 * (auto-creates timeline events, callable from a dedicated sync endpoint).
 *
 * UNLIKE the ArcGIS Code Enforcement layer (verified live, stable JSON REST
 * API, schema confirmed against production), Accela is a plain ASP.NET
 * WebForms application with no public REST API. This module submits its
 * search form the same way a browser POST would, then parses the results
 * table out of the returned HTML.
 *
 * KNOWN LIMITATION — read before trusting a "no permits found" result:
 * Accela redesigned this search form at some point after this scraper was
 * first written. The control names below (`generalSearchForm$txtGSParcelNo`
 * etc.) were captured from the *current* live search page, replacing the
 * previous namespace this scraper used to submit
 * (`MainContent$drpSearchType` / `MainContent$txtParcel`), which no longer
 * exists on the page at all. Submitting the corrected field names still
 * redirects to the portal's own Error.aspx in testing — there is additional
 * session or anti-automation state involved (this looks like an UpdatePanel
 * partial-postback under a ScriptManager; a full postback that impersonates
 * a click may need more than ViewState + cookies + the visible form fields)
 * that has NOT been reverse-engineered. Concretely:
 *
 *   - `scrapeStatus: "found"` — verified: a permit was parsed out of an
 *     actual results grid. Trust this.
 *   - `scrapeStatus: "no_results"` — the search round-trip completed and
 *     Accela's own page said so explicitly (not just "we found zero rows
 *     in a grid we may have mis-parsed"). Trust this.
 *   - `scrapeStatus: "parse_failed"` — the request didn't reach a
 *     recognizable results state (error redirect, or a response body that
 *     doesn't look like either a results grid or an explicit empty-search
 *     notice). Do NOT read this as "no permits" — it means the search could
 *     not be completed and needs to be re-verified against the live portal,
 *     the same caution recorder-portal.ts documents for its own unverified
 *     authenticated-result parsing.
 *   - `scrapeStatus: "unreachable"` — the portal itself didn't respond.
 *
 * Every caller (the sync endpoint, the recon agent) surfaces this status
 * rather than collapsing it into a single boolean, specifically so a
 * property is never reported as permit-free on the strength of a broken
 * scraper.
 */

// ── Types ──

export interface PermitRecord {
  permit_number: string;
  permit_type: string;
  address: string;
  status: string;
}

export type PermitScrapeStatus = "found" | "no_results" | "parse_failed" | "unreachable";

export interface PermitFetchResult {
  scrapeStatus: PermitScrapeStatus;
  permits: PermitRecord[];
  detail: string;
}

export interface PermitSyncResult {
  success: boolean;
  scrapeStatus: PermitScrapeStatus;
  permitsFound: number;
  permitsCreated: number;
  timelineEventsCreated: number;
  permits: PermitRecord[];
  detail: string;
  error?: string;
}

// ── HTML helpers (shared style with recon-agents-records.ts) ────────────────

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

export function extractRowCells(rowHtml: string): string[] {
  const cellMatches = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
  return cellMatches.map(c => stripHtml(c));
}

function extractPartialPostbackHtml(responseText: string): string {
  if (!/^\d+\|/.test(responseText)) return responseText;
  let html = "";
  let pos = 0;
  while (pos < responseText.length) {
    const pipeIdx = responseText.indexOf("|", pos);
    if (pipeIdx === -1) break;
    const len = parseInt(responseText.slice(pos, pipeIdx), 10);
    if (isNaN(len)) break;
    pos = pipeIdx + 1;
    const idPipeIdx = responseText.indexOf("|", pos);
    if (idPipeIdx === -1) break;
    const id = responseText.slice(pos, idPipeIdx);
    pos = idPipeIdx + 1;
    if (pos + len > responseText.length) break;
    const content = responseText.slice(pos, pos + len);
    pos += len;
    if (id && (id.includes("UpdatePanel") || id.includes("panel") || id === "")) {
      html += content;
    }
  }
  return html || responseText;
}

/**
 * Parse permit rows out of an Accela results fragment. Returns both the
 * rows found AND whether the fragment looked like a results grid at all —
 * that second signal is what lets a caller tell "zero permits" apart from
 * "this isn't the page shape we know how to read."
 */
export function parsePermitRows(html: string): { permits: PermitRecord[]; gridRecognized: boolean } {
  const permits: PermitRecord[] = [];
  const rowPattern = /<tr[^>]*class=["'][^"']*(?:AltRow|row)[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  let sawAnyRow = false;
  while ((match = rowPattern.exec(html)) !== null) {
    sawAnyRow = true;
    const cellTexts = extractRowCells(match[1]);
    if (cellTexts.length >= 2 && cellTexts[0]) {
      permits.push({
        permit_number: cellTexts[0],
        permit_type: cellTexts[1] || "Building",
        address: cellTexts[2] || "",
        status: cellTexts[3] || "Unknown",
      });
    }
  }
  // Accela's explicit "nothing found" notice, when the search round-trip
  // completes but matches zero records — distinct from a page we simply
  // failed to parse.
  const explicitNoResults = /no (?:records|results|matches) (?:were )?found/i.test(html);
  return { permits, gridRecognized: sawAnyRow || explicitNoResults };
}

async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 3): Promise<Response | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.ok || (resp.status >= 300 && resp.status < 500)) return resp;
    } catch {
      // network error — retry
    }
    if (attempt < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  return null;
}

// ── Live search ──────────────────────────────────────────────────────────────

const SEARCH_URL = "https://aca-prod.accela.com/HUMBOLDT/Cap/CapHome.aspx?module=Building";

/**
 * Search Humboldt County's Accela portal for building permits by APN and/or
 * street address. See the module doc — a "no_results" here is trustworthy;
 * a "parse_failed" is not the same thing as "no permits" and should be
 * surfaced to a person, not treated as a fact about the property.
 */
export async function fetchPermitsForProperty(apn: string, address: string): Promise<PermitFetchResult> {
  const apnClean = apn?.replace(/-/g, "") || "";
  const streetName = address ? address.split(" ").slice(1).join(" ").trim() : "";

  let pageResp: Response | null;
  try {
    pageResp = await fetchWithRetry(SEARCH_URL, { headers: { "User-Agent": "FairProcess-PropertyIntel/1.0" } });
  } catch {
    pageResp = null;
  }
  if (!pageResp || !pageResp.ok) {
    return { scrapeStatus: "unreachable", permits: [], detail: "County permit portal (Accela) did not respond." };
  }

  const cookies = pageResp.headers.get("set-cookie");
  const cookieHeader = cookies ? cookies.split(/,(?=\s*[a-zA-Z0-9_-]+=)/).map(c => c.split(";")[0].trim()).join("; ") : "";

  const pageHtml = await pageResp.text();
  const viewState = pageHtml.match(/id="__VIEWSTATE"\s+value="([^"]*)"/)?.[1];
  const viewStateGen = pageHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"/)?.[1];
  const csField = pageHtml.match(/name="ACA_CS_FIELD"[^>]*value="([^"]*)"/)?.[1];

  if (!viewState) {
    return { scrapeStatus: "parse_failed", permits: [], detail: "Accela search page did not return the expected form state (__VIEWSTATE missing) — the portal page structure may have changed." };
  }

  // Current (as of this writing) field namespace for the General Search
  // form. See module doc: this submits successfully as a request but has
  // NOT been confirmed to return a real results grid.
  const formData = new URLSearchParams();
  formData.append("__EVENTTARGET", "ctl00$PlaceHolderMain$btnNewSearch");
  formData.append("__EVENTARGUMENT", "");
  formData.append("__VIEWSTATE", viewState);
  if (viewStateGen) formData.append("__VIEWSTATEGENERATOR", viewStateGen);
  if (csField) formData.append("ACA_CS_FIELD", csField);
  formData.append("ctl00$PlaceHolderMain$ddlSearchType", "0"); // General Search
  if (apnClean) formData.append("ctl00$PlaceHolderMain$generalSearchForm$txtGSParcelNo", apnClean);
  if (streetName) formData.append("ctl00$PlaceHolderMain$generalSearchForm$txtGSStreetName", streetName);

  let searchResp: Response | null;
  try {
    searchResp = await fetchWithRetry(SEARCH_URL, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "FairProcess-PropertyIntel/1.0",
        "Referer": SEARCH_URL,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: formData.toString(),
    });
  } catch {
    searchResp = null;
  }

  if (!searchResp) {
    return { scrapeStatus: "parse_failed", permits: [], detail: "Accela search request failed." };
  }

  // A redirect to Error.aspx (or any redirect, since a successful search on
  // this form has never been observed to redirect) means the portal
  // rejected the submitted form state.
  if (searchResp.status >= 300 && searchResp.status < 400) {
    const location = searchResp.headers.get("location") || "";
    return {
      scrapeStatus: "parse_failed",
      permits: [],
      detail: `Accela redirected the search request (${location || "no location header"}) instead of returning results — the portal's session/anti-automation requirements are not fully satisfied by this integration. Search Accela directly: ${SEARCH_URL}`,
    };
  }

  const rawResponse = await searchResp.text();
  const resultsHtml = extractPartialPostbackHtml(rawResponse);
  const { permits, gridRecognized } = parsePermitRows(resultsHtml);

  if (!gridRecognized) {
    return {
      scrapeStatus: "parse_failed",
      permits: [],
      detail: `Accela responded, but the page didn't match a known results-grid or "no results" shape. The portal's markup may have changed again. Search directly: ${SEARCH_URL}`,
    };
  }

  if (permits.length === 0) {
    return { scrapeStatus: "no_results", permits: [], detail: `Accela reports no permits for this search.` };
  }

  return { scrapeStatus: "found", permits, detail: `${permits.length} permit(s) found via Accela.` };
}

// ── Sync to D1 ───────────────────────────────────────────────────────────────

/**
 * Fetch permits from Accela and sync new ones into D1, creating a timeline
 * event for each — the same shape as ce-pipeline.ts's syncCECases. Never
 * overwrites manually-entered permits; only adds ones not already on file
 * (matched by permit_number).
 */
export async function syncPermits(
  projectId: string,
  apn: string,
  address: string,
  organizationId: string,
  db: D1Database,
): Promise<PermitSyncResult> {
  let fetchResult: PermitFetchResult;
  try {
    fetchResult = await fetchPermitsForProperty(apn, address);
  } catch (err) {
    return {
      success: false,
      scrapeStatus: "parse_failed",
      permitsFound: 0,
      permitsCreated: 0,
      timelineEventsCreated: 0,
      permits: [],
      detail: "Permit sync failed unexpectedly.",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }

  if (fetchResult.scrapeStatus !== "found") {
    return {
      success: true,
      scrapeStatus: fetchResult.scrapeStatus,
      permitsFound: 0,
      permitsCreated: 0,
      timelineEventsCreated: 0,
      permits: [],
      detail: fetchResult.detail,
    };
  }

  const existingResult = await db
    .prepare("SELECT permit_number FROM building_permits WHERE project_id = ? AND organization_id = ?")
    .bind(projectId, organizationId)
    .all();
  const existingNumbers = new Set((existingResult.results || []).map((r: any) => r.permit_number));

  let permitsCreated = 0;
  let timelineEventsCreated = 0;

  for (const p of fetchResult.permits) {
    if (!p.permit_number || existingNumbers.has(p.permit_number)) continue;

    const permitId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO building_permits (id, project_id, permit_number, permit_type, permit_status, notes, organization_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        permitId, projectId, p.permit_number, p.permit_type, p.status || "unknown",
        `Auto-imported from Humboldt County Accela portal. Address searched: ${p.address || address}.`,
        organizationId,
      )
      .run();
    permitsCreated++;

    await db
      .prepare(
        `INSERT INTO timeline_events (id, project_id, evidence_id, event_date, event_type, description, organization_id)
         VALUES (?, ?, NULL, date('now'), 'inspection', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(), projectId,
        `Building permit on file: ${p.permit_number} (${p.permit_type}) — auto-imported from county Accela portal, status: ${p.status || "unknown"}`,
        organizationId,
      )
      .run();
    timelineEventsCreated++;
  }

  return {
    success: true,
    scrapeStatus: "found",
    permitsFound: fetchResult.permits.length,
    permitsCreated,
    timelineEventsCreated,
    permits: fetchResult.permits,
    detail: `${fetchResult.permits.length} permit(s) found, ${permitsCreated} new.`,
  };
}
