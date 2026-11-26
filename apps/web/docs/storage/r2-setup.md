# File storage on Cloudflare R2

All uploaded files (photos, documents, generated PDFs) live in Cloudflare R2.
The code is in `src/lib/storage.ts`; this page is the operator's guide.

## How files are organised

Files are grouped into **six buckets by security domain**, and each file category
has its **own folder** inside its bucket. A bucket decides *who/what may touch the
data* (credentials, public or private, CORS, retention). A folder decides
*which category* it is, so a bucket stays browsable and a retention rule can
target one category.

| Bucket (`<prefix>-…`) | Visibility | Folder → category | Why it is its own bucket |
|---|---|---|---|
| `public-media` | **Public** | `announcements/` news cover images · `gallery/` school gallery · `leadership/` leadership photos · `discover/` landing-page cards · `assignment-images/` pictures inside assignments | The only bucket that is world-readable. Everything in it is already shown on the public site or inside an `<img>` tag, so it must load without a login. Nothing sensitive may ever be mapped here (a unit test enforces it). |
| `student-records` | Private | `student-photos/` · `report-cards/` · `transcripts/` · `applications/` | Personal data about children and their academic record. Served only through `/api/files/<id>` after a role / guardian check. |
| `finance` | Private | `receipts/` fee receipts · `expense-receipts/` · `financial-reports/` | Money records auditors look at; keeps uniform, long retention separate from everything else. No browser uploads at all (receipts are server-generated or received through our API), so it gets no CORS rule. |
| `hr` | Private | `staff-photos/` · `payslips/` · `contracts/` · `loan-documents/` | Staff-confidential. Its audience (admin, HR, finance, the owner) is far smaller than student records, so a leak or a mis-scoped token here is contained. |
| `coursework` | Private | `assignment-files/` teacher material · `submissions/` student work | High-churn data scoped to a class; the natural place for a term-based clean-up rule later. |
| `library` | Private | `digital-resources/` · `ebooks/` · `past-papers/` | Shared learning material: long-lived, read by many, low sensitivity. |

Rules the code guarantees:

- **The file id never changes meaning.** Ids in the database stay exactly as they
  were (`payslip_…`). The id's prefix decides bucket + folder, the object key is
  `<folder>/<id>`, and an id cannot contain `/`, so it can only ever address its
  own category's folder.
- **Private buckets have no public access.** Private files are read only by the
  server (`/api/files/<id>` → role check → R2). There is no URL that bypasses it.
- **Browser uploads are validated server-side first.** The browser asks
  `…/upload-ticket` with `{ filename, contentType, size }`; the server checks the
  category's allowed types and size limit and returns a presigned URL that is valid
  for 15 minutes, for that one key, signed to that exact content type and size.
  Server-generated documents (payslips, report cards, transcripts, receipts,
  financial reports) cannot be uploaded from a browser at all.

## One-time setup in Cloudflare

1. **Get your Account ID**: Cloudflare dashboard → R2 → the *Account ID* on the right.
2. **Create two API tokens** (R2 → *Manage API tokens* → *Create API token*):
   - **Runtime token** — permission *Object Read & Write*, scope *All buckets*
     (or the six buckets once they exist). This is what the app uses.
     Copy the **Access Key ID** and **Secret Access Key** (shown once).
   - **Provisioning token** — permission *Admin Read & Write*. Used only to run
     `pnpm r2:provision`; do not put it in Vercel.
3. **Create the buckets and their CORS rule** (from `apps/web`, with the variables
   exported or in `.env.local`):

   ```bash
   R2_ACCOUNT_ID=…  R2_ADMIN_ACCESS_KEY_ID=…  R2_ADMIN_SECRET_ACCESS_KEY=… \
   R2_BUCKET_PREFIX=sms-malawi  NEXT_PUBLIC_APP_URL=https://sms-malawi.vercel.app \
   pnpm r2:provision
   ```
   It is safe to re-run. `R2_CORS_ORIGINS` (comma-separated) overrides the allowed
   upload origins; add your preview/custom domains there. Without CORS the browser
   cannot upload and shows "Could not upload the file".
4. **Make only `sms-malawi-public-media` public** (R2 → that bucket → *Settings* →
   *Public access*):
   - **Custom domain (recommended for production)**: *Connect Domain* and use a
     hostname on a domain whose DNS is in Cloudflare, e.g. `media.yourschool.org`.
     This gives caching and no rate limit.
   - **r2.dev subdomain**: *Allow Access* gives `https://pub-<hash>.r2.dev`. Works
     without a domain, but Cloudflare marks it non-production (rate limited, no
     cache). Fine for a first deployment.
   Leave the other five buckets private.

## Vercel environment variables

Project → *Settings* → *Environment Variables* (Production **and** Preview):

| Add | Value |
|---|---|
| `R2_ACCOUNT_ID` | your Cloudflare account id |
| `R2_ACCESS_KEY_ID` | runtime token access key id |
| `R2_SECRET_ACCESS_KEY` | runtime token secret |
| `R2_BUCKET_PREFIX` | `sms-malawi` (must match what you passed to provisioning) |
| `R2_PUBLIC_URL_MEDIA` | public URL of `sms-malawi-public-media`, **no trailing slash** |

After the cutover is verified, delete every variable that belonged to the previous
storage provider (the migration tool's README lists them).

### Content-Security-Policy

`vercel.json` allows images from `https://*.r2.dev` and uploads to
`https://*.r2.cloudflarestorage.com`. **If you use a custom domain for
`public-media`, add it to `img-src` in `vercel.json`** (for example
`https://media.yourschool.org`), otherwise the browser blocks the images.

## Checking it works

```bash
pnpm r2:smoke
```

Runs the real flow against your buckets: browser-style presigned upload (private and
public), metadata, read-back, public URL, wrong size / wrong type refused, server
upload, delete, bucket health. It cleans up after itself. Run it before and after
every deployment that touches storage.

## Migrating existing files from the old storage

Existing files and image links inside saved text must be moved once. The one-off
tool is deliberately **not** part of this repository. Run it with `--dry-run`
first; it copies every file to its new bucket under the same id, rewrites embedded
image URLs, and verifies that every file id referenced by the database exists in R2.
It is safe to re-run.

Recommended order:

1. Provision (above) and set the env vars on a **Preview** deployment.
2. `pnpm r2:smoke` → all green.
3. Deploy this code to Preview; run the migration tool `--dry-run`, then for real.
4. Click through: gallery, announcements, an assignment with a picture, a student
   photo, a payslip, a report card, a library PDF, a submission.
5. Promote to Production (set the same env vars first), run the migration tool
   once more (it only copies what changed), then delete the old env vars and
   revoke the old storage API key.

Until the migration has been run, files uploaded before the switch will not open.

## Optional hardening

- Add R2 *lifecycle rules* per folder: e.g. `coursework/submissions/` after N
  years, or abort incomplete multipart uploads.
- Scope the runtime token to exactly the six buckets.
- Rotate the runtime token yearly; the provisioning token can be deleted when not in use.
