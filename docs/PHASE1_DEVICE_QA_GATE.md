# Phase 1 - Real-Device QA Gate

Status: In progress
Last update: 2026-03-09
Owner: QA / Release manager
Goal: Close `P1-QA-02` with real-device evidence before final Phase 1 signoff.

## Why This Gate Exists
- Phase 1 moved role and access behavior to canonical `orgRole`.
- Automated coverage is green, but release closure still requires a physical-device check inherited from Phase 0.
- This gate confirms that responsive behavior and key role-aware pages remain usable on actual hardware and browsers.

## Required Prerequisites
- Backend smoke is green:
  - `cd backend && npm run test:smoke`
- Frontend build is green:
  - `cd frontend && npm run build`
- Frontend admin e2e is green:
  - `cd frontend && npm run test:e2e:admin`
- Frontend responsive e2e is green:
  - `cd frontend && npm run test:e2e:responsive`

## Required Devices
At minimum, record one pass for each of these:

| Group | Required device/browser |
|---|---|
| Android low-end | Chrome on a low-end Android phone |
| Android mid-range | Chrome on a mid-range Android phone |
| iOS | Safari on iPhone |
| Desktop Chrome | Latest stable Chrome |
| Desktop Edge or Firefox | Latest stable Edge or Firefox |

## Required Routes
- `/`
- `/login`
- `/dashboard`
- `/admin`
- `/admin-users`
- `/admin-logs`
- `/profile`
- `/chat`

## Core Checks Per Device
For every route above, confirm:

1. Page loads with meaningful content and no white screen.
2. No horizontal overflow or clipped main layout.
3. Navigation is usable for that viewport.
4. Text remains readable and actionable controls are reachable.

Additional route-specific checks:

| Route | Required check |
|---|---|
| `/` | Public navigation works, mobile drawer opens/closes correctly on small screens |
| `/login` | Form is visible without layout breakage |
| `/dashboard` | Student dashboard cards are readable and not overlapping |
| `/admin` | Alerts, search, and access matrix render without overlap |
| `/admin-users` | Role/status table and actions remain usable |
| `/admin-logs` | `orgRole` filter is usable and result rows remain readable |
| `/profile` | Canonical role label is visible and profile blocks do not collapse |
| `/chat` | Layout loads, thread list and composer remain reachable |

## Evidence To Capture
- Screenshot set for each device:
  - home
  - admin
  - admin-users
  - admin-logs
  - profile
- Optional short screen recording for mobile nav and admin logs filter
- Browser version
- OS version
- Tester name
- Date/time

## Execution Record
Fill one row per device/browser actually tested.

| Date | Tester | Device | Browser | Routes checked | Result | Notes |
|---|---|---|---|---|---|---|
| _pending_ | _pending_ | Android low-end | Chrome | `/`, `/login`, `/dashboard`, `/admin`, `/admin-users`, `/admin-logs`, `/profile`, `/chat` | Pending | |
| _pending_ | _pending_ | Android mid-range | Chrome | `/`, `/login`, `/dashboard`, `/admin`, `/admin-users`, `/admin-logs`, `/profile`, `/chat` | Pending | |
| 2026-03-09 | Stakeholder | iPhone | Safari | `/`, `/login`, `/admin`, `/admin-users`, `/admin-logs`, `/profile`, `/chat` | Partial pass | LAN access and admin login were verified after the development CORS/LAN fix. Home, mobile drawer, admin, admin-users, admin-logs, profile, and chat are readable on iPhone Safari. `/dashboard` is still pending on iPhone, so the gate remains open. |
| 2026-03-09 | Stakeholder | Desktop | Chrome/Brave | `/`, `/login`, `/admin`, `/admin-users`, `/admin-logs`, `/profile`, `/chat` | Pass | Screenshot evidence captured and readable for the admin scope. Remaining gate work is now limited to Android, iPhone, and a second desktop browser pass. |
| _pending_ | _pending_ | Desktop | Edge/Firefox | `/`, `/login`, `/dashboard`, `/admin`, `/admin-users`, `/admin-logs`, `/profile`, `/chat` | Pending | |

## Acceptance Rule
`P1-QA-02` can be marked `Completed` only when all of these are true:
- All required device groups have recorded evidence.
- No blocker remains on home, dashboard, admin, admin-users, admin-logs, profile, or chat.
- Any minor visual issue is documented and explicitly accepted.
- Evidence location is linked from `docs/PHASE1_SIGNOFF.md`.

## Final Recording Step
After this gate passes:
1. Update `docs/PHASE1_EXECUTION_BACKLOG.md` and mark `P1-QA-02` as `Completed`.
2. Add the evidence summary into `docs/PHASE1_SIGNOFF.md`.
3. Mark `P1-DOC-01` as `Completed`.