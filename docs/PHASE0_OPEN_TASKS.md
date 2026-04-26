# Phase 0 - Open Tasks

Last update: 2026-03-05
Status: Carry-over list after Phase 0 signoff

## Summary
Phase 0 goals (urgent bug stabilization, UTF-8 cleanup, menu/responsive review baseline, and open-task inventory) are complete.
Items below are non-blocking carry-over tasks for Phase 1+.

## Open Tasks
| ID | Priority | Area | Status | Task | Why it remains open |
|---|---|---|---|---|---|
| P0-OT-01 | High | QA | Completed | Run manual responsive QA on real devices for key breakpoints (`320`, `375`, `768`, `1024`, `1440`) across home/menu/dashboard pages. | Closed for Phase 0 by stakeholder approval based on automated matrix/report evidence. Physical-device pass moved to Phase 1 release gate. |
| P0-OT-02 | High | QA/Automation | Completed | Add automated UI smoke tests for top routes (`/`, `/login`, `/dashboard`, `/admin`, `/chat`, `/profile`). | Implemented via route smoke script + Playwright Chromium smoke tests. |
| P0-OT-03 | Medium | Tooling | Completed | Add `lint` and `test` scripts to frontend/backend `package.json` and run in CI. | `lint`, smoke scripts, and GitHub Actions CI pipeline are implemented. |
| P0-OT-04 | Medium | Performance | Completed | Add Lighthouse baseline report (mobile + desktop) and track metrics trend. | Baseline report + rolling history are now stored under `docs/performance/`. |
| P0-OT-05 | Medium | Security | Completed | Audit secrets handling and ensure no runtime credentials are hardcoded in tracked files. | Added automated security audit + runtime hardening; latest report has zero findings. |
| P0-OT-06 | Low | Documentation | Ongoing | Keep `docs/UI_CONSISTENCY_MATRIX.md` synced whenever nav/layout behavior changes. | Synced on 2026-03-05; remains ongoing as a continuous documentation guardrail. |

## Progress Log
- 2026-03-05: Added `frontend/scripts/smokeRoutes.mjs` and frontend scripts `check:routes`, `test:smoke`.
- 2026-03-05: Added `backend/scripts/checkSyntax.js` and backend scripts `check:syntax`, `test:smoke`.
- 2026-03-05: Verified new smoke checks pass in both frontend and backend.
- 2026-03-05: Added lint gates in frontend/backend and verified `npm run lint` passes in both.
- 2026-03-05: Added Playwright smoke tests for critical routes and verified pass on Chromium.
- 2026-03-05: Added CI workflow `.github/workflows/ci.yml` (backend quality, frontend quality, frontend e2e smoke).
- 2026-03-05: Added responsive Playwright checks on breakpoints `320/375/768/1024/1440` and verified pass.
- 2026-03-05: Added responsive QA checklist/report and closed `P0-OT-01` with stakeholder signoff.
- 2026-03-05: Added Lighthouse baseline + trend tracking (`docs/performance/lighthouse-baseline-2026-03-05.md`, `docs/performance/lighthouse-history.json`).
- 2026-03-05: Added security hardening (`backend/utils/env.js`), audit script (`backend/scripts/securityAudit.js`), rotated weak local JWT secret, and closed `P0-OT-05` with zero findings (`docs/security/security-audit-latest.json`).
- 2026-03-05: Synced `docs/UI_CONSISTENCY_MATRIX.md` with current desktop mega menu + mobile drawer behavior (single baseline for nav/layout rules).

## Exit Rule For This List
Move an item out of this file only when it has:
1. Implementation done
2. Verification evidence (command output or screenshot set)
3. Short release note entry
