# Phase 10 - Home Page and CMS Execution Backlog

Last update: 2026-03-07
Status: Complete
Phase owner: Public home experience / content CMS / responsive and performance guardrails

## Objective

Close Phase 10 with these deliverables:

1. Admin-managed home slider
2. Admin-managed home CTA, stats, cards, and short-news content
3. Full footer CMS from admin
4. Fast, responsive home experience with QA evidence

## Current Baseline

- Backend already had:
  - `SiteSettings` as the canonical public-settings model
  - public/admin settings routes
  - brand, hero, stats, features, short news, menu blueprints, and footer fields in the settings surface
- Frontend already had:
  - `Home.jsx` consuming hero, stats, and feature settings
  - `AdminSettings.jsx` for menu and public-site settings
  - responsive home styling and general responsive Playwright coverage
- Known gaps before closure:
  - no first-class `homeSlides` model or admin UI
  - `homeCta*` and `homeNews` were editable but not actually rendered on the home page
  - footer controls in admin were incomplete compared with what `Footer.jsx` already supported
  - no Phase 10-specific workflow or signoff doc

## Exit Criteria

Phase 10 is done only when all of these are true:

1. Home slider content is editable in admin and rendered on `/`.
2. CTA and short news on `/` come from CMS settings instead of hardcoded fallbacks.
3. Footer titles, lists, social links, hours, notes, and visibility toggles are editable from admin.
4. Home page remains responsive with no horizontal overflow on supported breakpoints.
5. A current Lighthouse baseline report is generated for the home page.
6. Phase 10 Playwright and signoff evidence are documented.

## Backlog

| ID | Priority | Stream | Status | Task | Expected output | Depends on | Key files |
|---|---|---|---|---|---|---|---|
| `P10-ARC-01` | High | Architecture | Completed | Freeze the canonical CMS scope for home content and footer ownership. | `SiteSettings` remains the single source of truth for public home and footer content. | None | `docs/PHASE10_EXECUTION_BACKLOG.md`, `backend/models/SiteSettings.js`, `backend/routes/settingsRoutes.js` |
| `P10-BE-01` | High | Backend | Completed | Add first-class `homeSlides` support and backfill settings defaults. | Existing and new settings documents expose `homeSlides` and complete footer defaults through `/api/settings/public` and `/api/settings`. | `P10-ARC-01` | `backend/models/SiteSettings.js`, `backend/routes/settingsRoutes.js` |
| `P10-FE-01` | High | Frontend | Completed | Render a real home slider from CMS settings. | `/` now renders CMS-backed slides with CTA buttons and responsive slide navigation. | `P10-BE-01` | `frontend/src/pages/Home.jsx`, `frontend/src/pages/Home.css` |
| `P10-FE-02` | High | Frontend | Completed | Wire CMS CTA and short-news content into the home page. | Home CTA and short-news cards now prefer `settings.homeCta*` and `settings.homeNews`. | `P10-BE-01` | `frontend/src/pages/Home.jsx` |
| `P10-FE-03` | High | Frontend | Completed | Complete footer CMS controls in admin. | `AdminSettings` now manages footer visibility toggles, titles, links, social links, hours, notes, and copyright. | `P10-BE-01` | `frontend/src/pages/AdminSettings.jsx` |
| `P10-QA-01` | High | QA | Completed | Add a Phase 10 Playwright workflow for public rendering and admin save flows. | Home rendering plus admin slider/footer save behavior verified end-to-end. | Frontend tasks | `frontend/tests/e2e/home.workflow.spec.js`, `frontend/package.json` |
| `P10-QA-02` | High | QA | Completed | Re-run responsive and performance guardrails after the home/CMS changes. | Responsive matrix stays green and an updated Lighthouse baseline is generated. | Frontend tasks | `frontend/tests/e2e/responsive.layout.spec.js`, `docs/performance/lighthouse-baseline-2026-03-06.md` |
| `P10-DOC-01` | Medium | Docs | Completed | Sync matrix, backlog, and final signoff. | Phase 10 status, evidence, and closure decision are documented. | All tasks | `docs/PROJECT_PROGRESS_MATRIX.md`, `docs/PHASE10_EXECUTION_BACKLOG.md`, `docs/PHASE10_SIGNOFF.md` |

## Recommended Implementation Order

All tracked Phase 10 backlog items are complete.

## Progress Log

- 2026-03-06: Opened Phase 10 execution backlog around the four closure gaps: slider, CTA/news wiring, footer CMS completion, and QA/signoff.
- 2026-03-06: Completed `P10-BE-01` with `homeSlides` schema/default support and settings backfill for older documents.
- 2026-03-06: Completed `P10-FE-01` and `P10-FE-02` by rendering the CMS slider and wiring `homeCta*` plus `homeNews` into the public home page.
- 2026-03-06: Completed `P10-FE-03` by turning the contact/admin settings surface into the full footer CMS control center.
- 2026-03-06: Completed `P10-QA-01` and `P10-QA-02` with a Phase 10 Playwright workflow, responsive rerun, and updated Lighthouse baseline.
- 2026-03-07: Completed `P10-DOC-01` with matrix sync and final signoff.

## Notes

- Home short news now intentionally prefers CMS-managed entries. The live news feed remains as a fallback when CMS news is empty.
- The home slider uses settings-defined image URLs when provided; otherwise it renders the built-in visual treatment so the CMS can still operate without a dedicated image-upload flow.
