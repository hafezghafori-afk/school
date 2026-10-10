# Deployment Runbook

Last update: 2026-03-18
Owner: Operations / release manager

## Deployment Shape

The project is deployed as two surfaces:
- `backend`: Node.js API and realtime server
- `frontend`: Vite production build served by a static host or reverse proxy

Recommended topology:
- serve `frontend/dist/` as static files
- proxy `/api/*`, `/uploads/*`, and websocket traffic to the backend service
- keep backend and frontend on the same public origin when possible to simplify CORS and cookies

## Required Backend Environment

Set these before starting the backend service:
- `MONGO_URI`
- `JWT_SECRET`

Common production settings:
- `CORS_ORIGIN`
- `BREVO_API_KEY` + `MAIL_FROM` — mail over Brevo's HTTPS API. Required on
  Render's free plan, which blocks outbound SMTP ports 25/465/587; when the key
  is set it takes precedence over `SMTP_*`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `CONTACT_EMAIL`
- `ADMIN_2FA_*`
- `FINANCE_FOUR_EYES_ENABLED`
- `PAYMENT_SIMULATION_ENABLED=false`
- `SLA_AUTOMATION_*`

## Uploaded Files

A hosted server's disk is not storage: Render wipes it on every deploy, every
restart and — on the free plan — whenever the service spins down after 15 idle
minutes. Every file the routes accept (finance receipts, student and staff
documents, homework, chat files, avatars, news/gallery images, lessons,
recordings) is therefore copied to a private Cloudflare R2 bucket and served back
from it by `GET /uploads/*` (see `backend/services/uploadStorageService.js`).

- bucket: `R2_UPLOADS_BUCKET_NAME`, or `R2_STUDENT_BUCKET_NAME` when unset — a
  private bucket with no public r2.dev domain
- credentials: the same `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT`
  as the logo and student-document storage
- check after a deploy: `GET /api/health` reports `uploads.storage` — `r2` is
  durable; `local` on Render means uploads will vanish; `misconfigured` means a
  bucket is named but a credential is missing, and uploads are refused
- `npm run audit:upload-references -- --uri=<mongo uri>` lists records whose
  files no longer exist (read-only; run it with the server's R2 variables)

## Release Preparation

1. Take a fresh backup:

```bash
cd backend
npm run backup:create -- --label pre-release
```

2. Run backend release preflight:

```bash
cd backend
npm run release:preflight
```

3. Run frontend release verification:

```bash
cd frontend
npm run release:verify
```

## Build and Start

Backend:

```bash
cd backend
cmd /c npm install
node server.js
```

Frontend:

```bash
cd frontend
cmd /c npm install
npm run build
```

Serve the generated `frontend/dist/` folder with your production static server.
Do not use `vite preview` as the long-term production server.

## Reverse Proxy Expectations

Your proxy or edge layer should:
- route `/api/` to the backend Node service
- route `/uploads/` to the backend Node service
- allow websocket upgrades for chat and virtual-class realtime traffic
- serve `frontend/dist/` for all public SPA routes

## Post-Deploy Validation

Minimum production checks:
- home page loads and CMS content renders
- admin login succeeds
- student dashboard loads
- finance pending receipts page loads
- one attachment-backed flow still opens uploaded files
- websocket-dependent pages (`/chat`) can connect

Finance route cutover checks:
- `/api/student-finance/me/overviews` serves the student finance summary used by the dashboard and student finance page
- retired compatibility routes return `410` with replacement metadata:
  - `/api/finance/student/me` -> `/api/student-finance/me/overviews`
  - `/api/finance/admin/reports/by-course` -> `/api/finance/admin/reports/by-class`
  - `/api/payments/init` -> `/api/finance/student/receipts`
  - `/api/payments/bank-info` -> `/api/finance/student/receipts`
- deprecated helper route `/api/payments/simulate` is still allowed for dev/support use, but must keep deprecation headers and class-first behavior
- in production, `/api/payments/simulate` must stay disabled unless there is a short-lived, explicitly approved support need with `PAYMENT_SIMULATION_ENABLED=true`
- every approved use of `/api/payments/simulate` should create an activity log entry such as `payment_simulate_receipt` or `payment_simulate_blocked`

## Rollback

Use this order if the release must be rolled back:
1. Stop new write traffic.
2. Redeploy the previous backend and frontend build.
3. If data repair is required, restore from the pre-release backup using the backup runbook.
4. Run smoke checks again before reopening traffic.

## Notes

- The backend server entry point is `backend/server.js`.
- Final production host hardening such as TLS termination, process supervision, and OS-level firewall rules remains the responsibility of the target infrastructure.
