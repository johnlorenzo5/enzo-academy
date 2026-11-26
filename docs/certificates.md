# Certificates and achievements

The Firebase application now issues one module certificate per learner, course and module. The existing `learner`/`admin` account values and configured Admin UID are unchanged. The browser-local `?demo=1` prototype remains separate.

## Implementation and data migration

- `apps/api/src/academy.ts`: calls certificate issuance inside the same transaction as validated progress; enrollment captures verified account details in the existing learner collection.
- `apps/api/src/certificates.ts`: completion evidence checks, unique certificate keys, persistence, ownership checks, public verification, revocation history, email outbox and retry leases.
- `apps/api/src/certificate-pdf.ts` and `apps/api/assets/`: PDF layout, vector academy logo, bundled OFL Noto Sans font, QR code and clickable verification link. Keep `assets/` alongside the API's `dist/` directory when deploying.
- `apps/api/src/firebase-app.ts`: learner, Admin and public verification routes; retry worker runs on startup, after mutations and every minute while the API is running.
- `apps/web/src/certificates.js`, `cloud.js`, `learning-workspace.js`, `style.css`: profile achievements, completion links, PDF preview/download/printing, Admin search and date/status filters, notification status, resend, revocation and history.
- API/web certificate tests, API dependencies and the root lockfile are updated.

Firestore is schemaless and this project has no SQL migration framework. New collections are created transactionally on first issuance:

| Collection | Purpose |
| --- | --- |
| `academyCertificates` | Immutable holder/module snapshots, IDs, completion and issuance dates, validity, revocation reason, email state |
| `academyCertificatePdfs` | Saved PDF bytes, encoded as base64; accessed only through authenticated API routes |
| `academyCertificateEvents` | Issuance, notification attempts/results, revocation and requesting actor |
| `academyCertificateRequests` | Idempotency records for explicit Admin resend requests |

Enrollments gain an optional `certificates` map from module ID to certificate ID. Existing documents and deny-all Firestore browser rules remain compatible. No composite indexes or new roles are required. Certificate IDs use SHA-256 over the existing user/course/module key, so concurrent submissions and retries address the same document. The public ID is not authorization for private details or PDFs.

To backfill historical completions, use the existing Firebase server credentials and run from `school/`:

```sh
npm run migrate:certificates -w @enzo/api
npm run migrate:certificates -w @enzo/api -- --apply
```

The first command is read-only. The second creates missing certificates and queues notifications. Repeating it preserves existing certificates, PDFs and revocations. It requires activity completion timestamps or legacy passing quiz/practice evidence; an unsupported `done` flag alone is insufficient. Historical completion dates use stored timestamps where available; old legacy practice records without timestamps use the course completion date or migration time. Accounts lacking a real display name use “Learner” to avoid publishing an email address; keep learner display names current before backfilling. No live migration is run by the test suite.

## Email setup

No existing application email sender was present. This feature uses Resend's HTTPS email API; Firebase Authentication password reset emails remain unchanged.

Add server-only values to `apps/api/.env` or the API hosting environment, then restart:

```dotenv
PUBLIC_APP_URL=https://your-academy.example
RESEND_API_KEY=re_your_server_api_key
CERTIFICATE_EMAIL_FROM=enzoAcademy <certificates@your-verified-domain.example>
```

Create a Resend API key with sending permissions, verify the sender domain in Resend and publish its required DNS records. Set the public application origin **before issuing production certificates**; saved PDFs and verification links are immutable. A same-origin `/api` reverse proxy must point to Fastify, as for the existing application. Without `PUBLIC_APP_URL`, local PDFs use `http://127.0.0.1:5173` for verification, and email remains `not_configured`. Never put email credentials in Vite/web variables.

Missing configuration is shown as `not_configured`; no successful send is claimed. Enabling the configuration lets the running API worker pick up those records. Failed sends retry with bounded exponential backoff. `accepted` means the provider accepted the message, not that it reached the inbox. Certificates remain downloadable regardless of email failure.

The worker claims sends with transactional leases and reuses the same provider idempotency key after transport errors. Resend retains keys for 24 hours; after 23 hours of uncertainty, a record becomes `needs_review` rather than risking another send. Admins should inspect the provider's logs before requesting a fresh notification. An explicit resend after an accepted send creates a new notification generation, rate limited to once per minute. Repeated requests with the same request ID share one operation. See [Resend idempotency](https://resend.com/blog/engineering-idempotency-keys).

## Use and verification

Learners: complete a module, follow **View Certificate**, or open **Account → Certificates and Achievements**. Certificates support PDF preview, download and printing through the embedded PDF viewer's print control. They remain available after signing out and back in, expiry, or course archiving. Revoked certificates remain visible with their status, and PDF access is disabled.

Admins: open the existing dashboard's **Certificates** tab. Search by holder name, user ID, module or certificate ID, and filter by issue dates or validity. Open details for notification status, resend, a required revocation reason, and the event history. Public `/#verify/<certificate-id>` links show status, holder name, module and dates only; private downloads require the owner or existing Admin.

Run from `school/`:

```sh
npm run check
```

Certificate tests cover failed assessments, all-activity completion, duplicate/concurrent issuance, Firestore read-before-write ordering, persistent valid PDFs, owner/Admin permissions, public data minimization, email failure and recovery, parallel workers, resend idempotency, expired deduplication windows, revocation, backfill evidence, profile empty/error states, filtering and UI actions. Tests use isolated stores and a fake email provider; they do not send live emails or write to Firebase. For a deployment smoke test, use a test learner and verified test email recipient, complete an authored module, inspect its PDF/QR, log back in, verify the public link, and use Admin resend/revoke. No real email delivery is claimed by local tests.

The certificate renderer uses [pdf-lib custom fonts](https://pdf-lib.js.org/docs/api/classes/pdfdocument). Noto Sans covers Latin, Greek and Cyrillic names; additional font fallback is needed for scripts outside its bundled glyph coverage.
