/**
 * Building permit result-fragment parsing.
 *
 * What's tested here is the one piece verifiable offline: that the old
 * results-grid row shape (`<tr class="AltRow"|"row">`) still parses
 * correctly if Accela ever returns it, and — the actual point of this
 * module — that a page which is neither a recognizable grid nor an
 * explicit "no results" notice is reported as unparseable rather than
 * silently read as zero permits. See permit-pipeline.ts's module doc for
 * why that distinction exists: the live search round-trip has NOT been
 * verified to reach a real results page (it currently redirects to the
 * portal's Error.aspx), so an empty parse must never be trusted as "no
 * permits" the way it could be for the verified ArcGIS CE pipeline.
 */

import { describe, it, expect } from "vitest";
import { parsePermitRows, extractRowCells } from "./permit-pipeline";

describe("extractRowCells", () => {
  it("extracts cell text from a table row, stripping tags and entities", () => {
    const row = `<td>BLD-2026-0042</td><td>Building &amp; Alteration</td><td>123 Main St</td><td>Issued</td>`;
    expect(extractRowCells(row)).toEqual(["BLD-2026-0042", "Building & Alteration", "123 Main St", "Issued"]);
  });
});

describe("parsePermitRows", () => {
  it("extracts a well-formed permit row and recognizes the grid", () => {
    const html = `
      <table>
        <tr class="row">
          <td>BLD-2026-0042</td>
          <td>Building</td>
          <td>123 Main St, Eureka</td>
          <td>Issued</td>
        </tr>
        <tr class="AltRow">
          <td>ELC-2026-0011</td>
          <td>Electrical</td>
          <td>123 Main St, Eureka</td>
          <td>Finalized</td>
        </tr>
      </table>
    `;
    const { permits, gridRecognized } = parsePermitRows(html);
    expect(gridRecognized).toBe(true);
    expect(permits).toHaveLength(2);
    expect(permits[0]).toMatchObject({ permit_number: "BLD-2026-0042", permit_type: "Building", status: "Issued" });
    expect(permits[1]).toMatchObject({ permit_number: "ELC-2026-0011", permit_type: "Electrical", status: "Finalized" });
  });

  it("recognizes Accela's explicit 'no records found' notice as a completed (empty) search", () => {
    const html = `<div class="ss-notice"><h2>No records were found matching your search criteria.</h2></div>`;
    const { permits, gridRecognized } = parsePermitRows(html);
    expect(gridRecognized).toBe(true);
    expect(permits).toEqual([]);
  });

  it("does NOT recognize an unrelated page (e.g. an error page) as a completed search", () => {
    const html = `<html><body><h1>An error has occurred.</h1><p>Please try again later.</p></body></html>`;
    const { permits, gridRecognized } = parsePermitRows(html);
    expect(gridRecognized).toBe(false);
    expect(permits).toEqual([]);
  });

  it("does not fabricate a permit from a row with no usable first cell", () => {
    const html = `<table><tr class="row"><td></td><td>Building</td></tr></table>`;
    const { permits } = parsePermitRows(html);
    expect(permits).toEqual([]);
  });
});
