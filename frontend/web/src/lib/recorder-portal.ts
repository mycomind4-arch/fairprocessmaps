/**
 * Humboldt County Clerk-Recorder self-service portal — authenticated access.
 *
 * The anonymous search on this portal (humboldtcountyca-web.tylerhost.net)
 * only confirms whether a name exists in the index; it does not return the
 * actual documents unless the requester is logged in. This module logs in
 * with credentials the operator configures (never hardcoded, never logged)
 * and runs the same name search authenticated.
 *
 * Wire format below was captured directly from the real portal (browser
 * network inspection, disclaimer already accepted, throwaway credentials
 * used only to observe the request/response shape — never real ones):
 *
 *   POST /web/user/login            field_UserId, field_Password (form-encoded)
 *     -> {"success": bool, "message": string, ...}
 *   POST /web/searchPost/DOCSEARCH201S5
 *     field_BothNamesID-searchInput = "Last First"
 *     field_BothNamesID-containsInput = "Contains Any"
 *     field_RecordingDateID_DOT_StartDate / _EndDate (optional, MM/DD/YYYY)
 *   GET  /web/searchResults/DOCSEARCH201S5?page=1
 *     -> an HTML fragment; either a "No results found" notice or a results
 *        table. Result-row parsing below is best-effort — it has not been
 *        verified against a real authenticated result set (that requires a
 *        real account, which this module deliberately never creates — see
 *        docs/policy-packs.md-style reasoning in recon-agents.ts). Treat a
 *        parse that comes back empty on a real search as a signal to check
 *        this parser against the actual HTML before trusting "no records."
 */

const BASE_URL = "https://humboldtcountyca-web.tylerhost.net";

export interface RecorderCredentials {
  userId: string;
  password: string;
}

export interface RecorderSession {
  cookie: string;
}

export interface RecorderDocument {
  documentNumber: string | null;
  documentType: string | null;
  recordingDate: string | null;
  grantor: string | null;
  grantee: string | null;
  raw: string;
}

export interface RecorderLoginResult {
  ok: boolean;
  message: string;
  session: RecorderSession | null;
}

function mergeSetCookie(existing: string, response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return existing;
  // Multiple Set-Cookie headers may arrive folded into one string by fetch;
  // keep only the name=value pairs, drop attributes (Path, HttpOnly, etc).
  const pairs = setCookie.split(/,(?=[^;]+?=)/).map((c) => c.split(";")[0].trim());
  const merged = new Map<string, string>();
  for (const pair of existing.split(";").map((c) => c.trim()).filter(Boolean)) {
    const [k, v] = pair.split("=");
    if (k) merged.set(k, v ?? "");
  }
  for (const pair of pairs) {
    const [k, v] = pair.split("=");
    if (k) merged.set(k, v ?? "");
  }
  return Array.from(merged.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * Accept the disclaimer (establishes the session), then log in.
 *
 * Never call this with anything but credentials the operator explicitly
 * configured (RECORDER_USER_ID / RECORDER_PASSWORD) — this module does not
 * create accounts and does not prompt for or accept credentials from
 * anywhere else.
 */
export async function recorderLogin(creds: RecorderCredentials): Promise<RecorderLoginResult> {
  let cookie = "";
  const ua = { "User-Agent": "FairProcess-PropertyIntel/1.0" };

  const homeResp = await fetch(`${BASE_URL}/web/`, { headers: ua });
  cookie = mergeSetCookie(cookie, homeResp);
  const homeHtml = await homeResp.text();

  // Accept the disclaimer if it's shown (idempotent — already-accepted
  // sessions just redirect straight through).
  if (/Accept Disclaimer/i.test(homeHtml)) {
    const acceptResp = await fetch(`${BASE_URL}/web/user/disclaimer/accept`, {
      method: "POST",
      headers: { ...ua, Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
    });
    cookie = mergeSetCookie(cookie, acceptResp);
  }

  const loginResp = await fetch(`${BASE_URL}/web/user/login`, {
    method: "POST",
    headers: { ...ua, Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      field_UserId: creds.userId,
      field_Password: creds.password,
    }).toString(),
  });
  cookie = mergeSetCookie(cookie, loginResp);

  let payload: { success?: boolean; message?: string } = {};
  try {
    payload = (await loginResp.json()) as typeof payload;
  } catch {
    return { ok: false, message: "Login response was not valid JSON — the portal may have changed.", session: null };
  }

  if (!payload.success) {
    return { ok: false, message: payload.message ?? "Login failed.", session: null };
  }

  return { ok: true, message: "Logged in.", session: { cookie } };
}

/** Parse the searchResults HTML fragment into document rows, best-effort. */
export function parseResultsFragment(html: string): RecorderDocument[] {
  if (/No results found/i.test(html)) return [];

  const docs: RecorderDocument[] = [];
  const rowPattern = /<tr[^>]*class=["'][^"']*(?:result|AltRow|row)[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(html)) !== null) {
    const rowHtml = match[1];
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim());
    }
    if (cells.length === 0) continue;
    docs.push({
      documentNumber: cells[0] || null,
      documentType: cells[1] || null,
      recordingDate: cells[2] || null,
      grantor: cells[3] || null,
      grantee: cells[4] || null,
      raw: cells.join(" | "),
    });
  }
  return docs;
}

/**
 * Search the recorder index by name while authenticated.
 *
 * `name` should be "Last First" per the portal's own instructions (a bare
 * last name broadens the search).
 */
export async function searchRecorderAuthenticated(
  session: RecorderSession,
  name: string,
  opts: { dateStart?: string; dateEnd?: string } = {},
): Promise<{ documents: RecorderDocument[]; rawFragment: string }> {
  const ua = { "User-Agent": "FairProcess-PropertyIntel/1.0", Cookie: session.cookie };

  const searchBody = new URLSearchParams({
    "field_BothNamesID-searchInput": name,
    "field_BothNamesID-containsInput": "Contains Any",
    field_BothNamesID: "",
    field_RecordingDateID_DOT_StartDate: opts.dateStart ?? "",
    field_RecordingDateID_DOT_EndDate: opts.dateEnd ?? "",
  });

  await fetch(`${BASE_URL}/web/searchPost/DOCSEARCH201S5`, {
    method: "POST",
    headers: { ...ua, "Content-Type": "application/x-www-form-urlencoded" },
    body: searchBody.toString(),
  });

  const resultsResp = await fetch(`${BASE_URL}/web/searchResults/DOCSEARCH201S5?page=1`, { headers: ua });
  const rawFragment = await resultsResp.text();

  return { documents: parseResultsFragment(rawFragment), rawFragment };
}
