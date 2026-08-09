import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createMailMyPDFCommunication, uploadDocumentToMailMyPDF } from "@/lib/mailmypdf";

describe("MailMyPDF service client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads a document using base64 JSON and service authentication", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "doc-1", filename: "response.pdf", mime_type: "application/pdf", sha256: "abc" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await uploadDocumentToMailMyPDF(
      { MAILMYPDF_API_URL: "https://mail.example", MAILMYPDF_API_KEY: "secret" },
      { filename: "response.pdf", mimeType: "application/pdf", bytes: new TextEncoder().encode("PDF") },
    );

    expect(result.id).toBe("doc-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mail.example/api/v1/documents");
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body)).toMatchObject({ filename: "response.pdf", mime_type: "application/pdf" });
  });

  it("sends the idempotency key when creating a physical mailing", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "comm-1", status: "submitted", provider_job_id: "job-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await createMailMyPDFCommunication(
      { MAILMYPDF_API_URL: "https://mail.example", MAILMYPDF_API_KEY: "secret" },
      {
        idempotencyKey: "case-123-response",
        documentId: "doc-1",
        legalReference: { type: "other", citation: "CASE-123", description: "Response" },
        recipient: {
          name: "County Clerk",
          address_line1: "1 Main St",
          city: "Eureka",
          state: "CA",
          postal_code: "95501",
          country: "US",
        },
        mailType: "certified",
        matterReference: "CASE-123",
        matterType: "fairprocessmaps_case",
      },
    );

    expect(result.provider_job_id).toBe("job-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mail.example/api/v1/communications");
    expect(init.headers["Idempotency-Key"]).toBe("case-123-response");
    expect(JSON.parse(init.body).idempotency_key).toBe("case-123-response");
  });

  it("fails clearly when the integration secret is missing", async () => {
    await expect(
      uploadDocumentToMailMyPDF(
        { MAILMYPDF_API_URL: "https://mail.example" },
        { filename: "response.pdf", mimeType: "application/pdf", bytes: new Uint8Array([1]) },
      ),
    ).rejects.toThrow("MailMyPDF integration is not configured");
  });
});
