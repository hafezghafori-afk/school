# Release Checklist

Last update: 2026-03-18
Owner: Release manager

## Pre-Release

- [ ] Confirm scope and target release date.
- [ ] Confirm `MONGO_URI` and production environment variables are correct.
- [ ] Create a pre-release backup from `backend`:
  - `npm run backup:create -- --label pre-release`
- [ ] Confirm the backup directory contains `manifest.json`.
- [ ] Run backend preflight:
  - `npm run release:preflight`
- [ ] Run frontend verification:
  - `npm run release:verify`
- [ ] Review the latest security audit:
  - `docs/security/SECURITY_AUDIT_2026-03-05.md`
- [ ] Review the latest Lighthouse baseline:
  - `docs/performance/lighthouse-baseline-2026-03-06.md`
- [ ] Confirm Phase 1 device QA gate evidence exists:
  - `docs/PHASE1_DEVICE_QA_GATE.md`
  - `docs/PHASE1_SIGNOFF.md`
- [ ] Confirm Phase 10 and Phase 11 signoffs exist.

## Deploy

- [ ] Deploy backend build/config.
- [ ] Deploy `frontend/dist/` to the production static host.
- [ ] Validate reverse proxy rules for `/api`, `/uploads`, and websocket traffic.
- [ ] Confirm health routes and core pages load.

## Post-Deploy

- [ ] Admin login works.
- [ ] Student dashboard works.
- [ ] Instructor dashboard works.
- [ ] Finance review center works.
- [ ] Canonical student finance overview works at `/api/student-finance/me/overviews`.
- [ ] Retired finance/payment compatibility routes return `410` plus `X-Replacement-Endpoint`.
- [ ] `PAYMENT_SIMULATION_ENABLED` is disabled for production unless there is an approved support window.
- [ ] Chat connects.
- [ ] One uploaded attachment can be opened.
- [ ] No emergency rollback trigger exists after smoke checks.

## Rollback Trigger

Rollback immediately if any of these occur:
- login failure across roles
- finance approval workflow broken
- uploaded files inaccessible
- chat/websocket connection failure in production
- schema or migration issue causing data corruption risk

## Rollback Steps

- [ ] Stop new write traffic.
- [ ] Redeploy previous backend/frontend artifacts.
- [ ] Restore pre-release backup if data repair is required.
- [ ] Re-run smoke checks before reopening traffic.
