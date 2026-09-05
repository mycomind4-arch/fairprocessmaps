/**
 * Recorder portal result-fragment parsing.
 *
 * The login and search request shapes were captured directly from the real
 * portal (see recorder-portal.ts's header comment); what's tested here is
 * the one piece verifiable offline — that the "no results" fragment the
 * anonymous search actually returned parses to an empty list rather than a
 * false-positive row, and that a well-formed result row extracts cleanly.
 * Full authenticated result parsing has NOT been verified against a real
 * result set (that needs a real account) — see the module doc for why that
 * matters before trusting an empty parse as "no records."
 */

import { describe, it, expect } from "vitest";
import { parseResultsFragment } from "../recorder-portal";

describe("parseResultsFragment", () => {
  it("returns an empty list for the portal's real 'no results' fragment", () => {
    // Captured verbatim from an anonymous search against the live portal.
    const fragment = `
	<div class="ss-utility-box">
		<h2>No results found, please try a new search or remove applied Filters</h2>
		<h3>Name Search  Name contains Ferrington Bonnie*</h3>
	</div>
`;
    expect(parseResultsFragment(fragment)).toEqual([]);
  });

  it("extracts a well-formed result row", () => {
    const fragment = `
      <table>
        <tr class="row">
          <td>2023-001234</td>
          <td>Grant Deed</td>
          <td>04/04/2023</td>
          <td>Ferrington Bonnie</td>
          <td>Ferrington Estate</td>
        </tr>
      </table>
    `;
    const docs = parseResultsFragment(fragment);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      documentNumber: "2023-001234",
      documentType: "Grant Deed",
      recordingDate: "04/04/2023",
      grantor: "Ferrington Bonnie",
      grantee: "Ferrington Estate",
    });
  });

  it("never returns a row when there is no table at all", () => {
    expect(parseResultsFragment("<div>Please log in to view results.</div>")).toEqual([]);
  });
});
