# MailMyPDF integration setup

FairProcessMaps calls MailMyPDF only from server-side API routes. The browser never receives the MailMyPDF API key.

## Production configuration

Set the service endpoint in `frontend/web/wrangler.toml` with `MAILMYPDF_API_URL`.

Store the service credential as a Cloudflare secret:

```bash
cd frontend/web
wrangler secret put MAILMYPDF_API_KEY
```

The value must be an API key authorized for the MailMyPDF tenant used by the FairProcessMaps integration.

Configure a second secret for the signed webhook callback:

```bash
wrangler secret put MAILMYPDF_WEBHOOK_SECRET
```

Use the same random secret in MailMyPDF's `proof_tenants.webhook_secret` and set its `webhook_url` to:

```text
https://<fairprocessmaps-domain>/api/v1/integrations/mailmypdf/webhook
```

## Sending flow

1. User creates a case communication with an `Idempotency-Key`.
2. FairProcessMaps stores the communication as `draft`.
3. The send endpoint verifies the case, organization, and source evidence.
4. The source file is uploaded to MailMyPDF over HTTPS.
5. FairProcessMaps creates the MailMyPDF communication using the same idempotency key.
6. MailMyPDF performs its own address verification and physical-mail fulfillment.
7. The MailMyPDF job ID is stored against the FairProcessMaps communication.
8. MailMyPDF sends signed lifecycle events to the FairProcessMaps webhook.
9. FairProcessMaps verifies the signature, records the provider event exactly once, updates the communication, and appends a case timeline event.

## Current integration endpoints

```text
POST /api/v1/cases/:id/communications
POST /api/v1/cases/:id/communications/:communicationId/send
POST /api/v1/integrations/mailmypdf/webhook
```

## Security boundary

Never put the MailMyPDF key in:

- `NEXT_PUBLIC_*` variables
- client components
- browser requests
- committed `.env` files
- D1 records

Never put the webhook secret in client-side code or D1.

FairProcessMaps must not hold Stripe or Lob credentials. Those remain entirely inside MailMyPDF.
