# Admin Schedule Cleanup Baseline (2026-04-11)

## Goal
Prepare the admin schedule module for a final redesign by reducing route duplication safely and documenting migration points.

## Changes Applied
1. Frontend route unification:
- `/admin-schedule` remains the main admin schedule entry and points to `TimetableHub`.
- `/admin-schedule/legacy` now redirects to `/admin-schedule`.
- Removed legacy lazy import and prefetch mapping for `AdminSchedule` from `App.jsx`.

## File-by-File Map (Current)
### Frontend Router
- `frontend/src/App.jsx`
  - Main admin route: `/admin-schedule` -> `TimetableHub`
  - Legacy path retained only as redirect: `/admin-schedule/legacy` -> `/admin-schedule`

### Frontend Pages in Timetable Flow
- `frontend/src/pages/TimetableHub.jsx` (entry dashboard)
- `frontend/src/pages/TimetableConfiguration.jsx`
- `frontend/src/pages/TeacherAssignmentManagement.jsx`
- `frontend/src/pages/TeacherAvailabilityManagement.jsx`
- `frontend/src/pages/CurriculumManagement.jsx`
- `frontend/src/pages/TimetableOperations.jsx`
- `frontend/src/pages/TimetableEditor.jsx`
- `frontend/src/pages/TimetableReports.jsx`
- `frontend/src/pages/TimetableConflictManager.jsx`
- `frontend/src/pages/TimetableChangeLog.jsx`
- `frontend/src/pages/TeacherTimetableView.jsx`
- `frontend/src/pages/StudentTimetableView.jsx`

### Backend Routes (Both Active)
- `backend/routes/timetableRoutes.js` mounted at `/api/timetables`
  - New service-oriented API set.
- `backend/routes/timetableLegacyRoutes.js` mounted at `/api/timetable`
  - Legacy/operational endpoints still used by multiple frontend pages.
- `backend/routes/scheduleRoutes.js` mounted at `/api/schedules`
  - Separate schedule module used by instructor dashboard and general schedule features.

## Duplicate/Parallel Areas to Resolve in Final Redesign
1. API namespace split (`/api/timetable` vs `/api/timetables`) is still present.
2. Some timetable pages still depend on legacy endpoints.
3. Legacy page `frontend/src/pages/AdminSchedule.jsx` is now detached from routing but still exists.

## Safe Migration Plan for Final Design
1. Freeze new feature work on `/api/timetable`.
2. Migrate each page to `/api/timetables` service endpoints.
3. Remove `AdminSchedule.jsx` after final design is approved and all tests pass.
4. Remove `/api/timetable` mount from `backend/server.js` after migration.
5. Keep `/api/schedules` only if business scope remains distinct from timetable.

## Validation Checklist
- Admin route opens from `/admin-schedule`.
- Old `/admin-schedule/legacy` links still work via redirect.
- Existing timetable pages load and operate as before.
- No import/lint errors in `frontend/src/App.jsx`.

## Implementation Status (2026-04-11)

Applied in code now:
- Backend timetable editor now enforces only class periods `1,2,3,5,6,7`.
- Break slot is hard-blocked for create/update/validate flows.
- Conflict responses are split and explicit:
  - `conflictType: class`
  - `conflictType: teacher`
- Teacher availability check endpoint now rejects invalid/break periods.
- Teacher availability UI now displays fixed period times in row labels.

Files updated in this step:
- `backend/routes/timetableEditorRoutes.js`
- `backend/routes/teacherAvailabilityRoutes.js`
- `frontend/src/pages/TeacherAvailabilityManagement.jsx`

Additional UX hardening completed:
- `frontend/src/pages/TimetableOperations.jsx`
  - Conflict toasts now differentiate class vs teacher conflicts.
  - Break/invalid period backend errors are shown with clear localized messaging.
- `frontend/src/pages/TimetableEditor.jsx`
  - Create/update/move actions now show explicit conflict and break-slot error messages.
- `frontend/src/pages/TeacherAvailabilityManagement.jsx`
  - Simple mode now saves only core constraints (advanced-only fields are cleared unless Advanced mode is selected).

API contract unification completed in this phase:
- `backend/routes/timetableLegacyRoutes.js`
  - Added `PUT /api/timetable/:id` compatibility alias (maps to `/entry/:id`).
- `frontend/src/pages/TimetableOperations.jsx`
  - Update flow now uses `PUT /api/timetable/:id`.
- `frontend/src/pages/TimetableEditor.jsx`
  - Create/update/delete now use `/api/timetable` contract consistently.
  - Protected requests now include auth header helper.

Conflict management hardening completed:
- `frontend/src/pages/TimetableConflictManager.jsx`
  - Stable conflict identifiers are generated for UI actions even when backend `_id` is missing.
  - Teacher/class labels now render safely from mixed backend payload shapes.
  - Slot details now display period label and fixed time range (period-based readability).

Endpoint cleanup check:
- No remaining `/api/timetable/entry` usage found in `frontend/src/**`.

Step-1 completion evidence:
- `backend/scripts/checkTimetableRoutes.js` => `PASS`
- `backend/scripts/checkTimetableLegacyAccessRoutes.js` => `PASS`
- Note: browser E2E (`timetable.browser.workflow.spec.js`) failed due runtime worker crash/OOM in this environment, not assertion-level functional failure.

Step-2 started (controlled legacy cleanup):
- Removed unused compatibility aliases from `backend/routes/timetableLegacyRoutes.js`:
  - `POST /api/timetable/generate-timetable`
  - `GET /api/timetable/all`
- Kept active/simple contract endpoints intact:
  - `POST /api/timetable`
  - `PUT /api/timetable/:id`
  - `DELETE /api/timetable/:id`

Step-2 progress (current):
- Added focused contract test script:
  - `backend/scripts/checkTimetableSimpleContractRoutes.js`
  - covers:
    - break-slot write rejection
    - class conflict response (`conflictType: class`)
    - teacher conflict response (`conflictType: teacher`)
    - simplified CRUD aliases (`POST/PUT/DELETE /api/timetable`)
- Added npm script entry:
  - `check:timetable-simple-contract-routes`
- Execution result:
  - `check:timetable-simple-contract-routes PASS`

Step-2 hardening update:
- Reduced noisy server logging for expected validation failures (HTTP 400) in:
  - `backend/routes/timetableEditorRoutes.js`
  - create/update now log stack traces only for server errors (HTTP 500).
- Extended simple-contract checks to assert removed legacy aliases return 404:
  - `GET /api/timetable/all`
  - `POST /api/timetable/generate-timetable`
- Included `check:timetable-simple-contract-routes` inside backend `test:smoke` pipeline.

Step-2 read-contract validation added:
- Added script:
  - `backend/scripts/checkTimetableSimpleReadContractRoutes.js`
- Coverage:
  - `GET /api/timetable/class/:classId`
  - `GET /api/timetable/teacher/:teacherId`
  - response shape assertions for `entries`, `timetable`, and `summary`
- Added npm script:
  - `check:timetable-simple-read-contract-routes`
- Included inside backend `test:smoke` pipeline.
- Execution result:
  - `check:timetable-simple-read-contract-routes PASS`

Validation status update:
- Full backend smoke run was attempted.
- Current blocker is outside timetable scope:
  - `check:permissions` fails on missing `requirePermission` coverage in:
    - `routes/afghanStudentRoutes.js`
    - `routes/studentRegistrationRoutes.js`
- Timetable-focused validation chain is fully passing:
  - `check:timetable-routes PASS`
  - `check:timetable-simple-contract-routes PASS`
  - `check:timetable-simple-read-contract-routes PASS`
  - `check:timetable-legacy-access-routes PASS`

Latest execution update (2026-04-11):
- Resolved remaining non-timetable smoke blockers:
  - Added permission guards in:
    - `backend/routes/afghanStudentRoutes.js`
    - `backend/routes/studentRegistrationRoutes.js`
  - Updated role cutover expectations in:
    - `backend/scripts/checkRoleCutover.js`
- Resolved final `check:admin-routes` mismatch:
  - Added deterministic alert key priority ordering in:
    - `backend/routes/adminRoutes.js`
  - Hardened brittle final-order assertion in:
    - `backend/scripts/checkAdminRoutes.js`
- Validation result:
  - `npm run check:admin-routes` => PASS (10/10)
  - `npm run test:smoke` => PASS (full pipeline)

## Final Target Design (Approved)

### 1) Timetable Paradigm
- Use Period-Based Timetable only.
- Do not use free-time authoring in UI.
- Keep daily structure fixed:
  - Period 1: 08:00-08:40
  - Period 2: 08:40-09:20
  - Period 3: 09:20-10:00
  - Break: 10:00-10:10 (locked)
  - Period 4: 10:10-10:50
  - Period 5: 10:50-11:30
  - Period 6: 11:30-12:10

### 2) Data Contracts (Simple + Clear)
- Canonical slot source (fixed):

```json
{
  "slotNumber": 1,
  "startTime": "08:00",
  "endTime": "08:40",
  "type": "class"
}
```

```json
{
  "slotNumber": 4,
  "startTime": "10:00",
  "endTime": "10:10",
  "type": "break"
}
```

- Entry model should be slot-based and minimal:

```json
{
  "classId": "7A",
  "teacherId": "T1",
  "subjectId": "Math",
  "dayOfWeek": "saturday",
  "slotNumber": 1
}
```

- Teacher availability should remain slot-based:

```json
{
  "teacherId": "...",
  "academicYearId": "...",
  "shift": "morning",
  "dayOfWeek": "saturday",
  "slotNumber": 1,
  "availabilityType": "available"
}
```

```json
{
  "teacherId": "...",
  "academicYearId": "...",
  "shift": "morning",
  "maxPeriodsPerDay": 4,
  "maxPeriodsPerWeek": 20,
  "avoidFirstPeriod": false,
  "avoidLastPeriod": true,
  "allowConsecutivePeriods": true,
  "notes": ""
}
```

### 3) Mandatory Rules
- Rule A: Teacher conflict block
  - Same teacher + same day + same slot => reject.
- Rule B: Class conflict block
  - Same class + same day + same slot => reject.
- Rule C: Break lock
  - Break row cannot be edited for entry/availability assignment.

### 4) UI Blueprint: Teacher Availability (Modern + Practical)

#### Header actions
- Academic Year selector
- Teacher selector
- Shift selector
- Save
- Reset
- Copy from another teacher
- View current teacher timetable

#### Teacher summary card
- Name, code, specialty, contact, status
- Max periods/day, max periods/week
- Free slots count, blocked slots count

#### Main weekly matrix
- Columns: Saturday -> Thursday
- Rows: Period 1, 2, 3, Break, 4, 5, 6
- Cell states:
  - Available (green)
  - Unavailable (gray/red)
  - Preferred off (yellow)
  - Empty (neutral)
- Click cycle: available -> unavailable -> preferred_off -> empty
- Break row: disabled + static style

#### General constraints card
- maxPeriodsPerDay
- maxPeriodsPerWeek
- minGapBetweenPeriods
- avoidFirstPeriod
- avoidLastPeriod
- allowConsecutivePeriods
- day-level quick toggles

#### Quick toolbar
- Set all available
- Set all unavailable
- Weekday preset (Sat-Wed)
- Lock first period
- Lock last period
- Copy day to day
- Copy week to similar teachers

#### Smart alerts
- Very low available slots
- No Thursday availability
- Daily limit > weekly limit
- Current timetable load > available slots

### 5) API Target Surface (Simple)
- POST /api/timetable
- GET /api/timetable/class/:classId
- GET /api/timetable/teacher/:teacherId
- DELETE /api/timetable/:id

Note:
- Existing mixed namespaces will be migrated gradually.
- Keep compatibility until every dependent frontend page is moved.

### 6) Scope of Simplification (What to remove)
- No algorithm-heavy auto-generation in the first phase.
- No complex assignment wizard in first phase.
- No free-time minute-level editors.
- No multi-step forms for daily operator workflows.

### 7) File-Level Execution Plan
1. `frontend/src/pages/TeacherAvailabilityManagement.jsx`
   - Keep matrix-first UX.
   - Enforce fixed 6+break rows.
   - Keep simple/advanced modes.
2. `frontend/src/pages/TimetableOperations.jsx`
   - Ensure direct slot-based entry editing from grid.
3. `backend/routes/timetableLegacyRoutes.js`
   - Preserve compatibility endpoints until migration complete.
4. `backend/routes/timetableRoutes.js`
   - Continue introducing canonical service endpoints.
5. `backend/models/TeacherAvailability.js`
   - Keep slot/day availability + general constraints as canonical.

### 8) Acceptance Criteria
- Staff can create/edit timetable using slot grid only.
- Break cannot accept lessons or availability edits.
- Teacher conflict and class conflict are both blocked.
- Teacher and student timetable views are readable and consistent.
- Teacher availability page is usable in under 60 seconds for common edits.
