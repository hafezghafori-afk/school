# Phase 4 - Attendance Execution Backlog

Last update: 2026-03-06
Status: Complete
Phase owner: Education core / dashboards / reporting

## Objective

Close Phase 4 with these deliverables:

1. Daily attendance registration for each class
2. Class attendance report
3. Individual student attendance report
4. Weekly attendance status in student and instructor dashboards

## Current Baseline

- Backend already has:
  - `Attendance` model with statuses `present/absent/late/excused`
  - one-record-per-student-per-class-per-day protection
  - class/day list endpoint
  - upsert endpoint
  - student self-view list endpoint
- Frontend already has:
  - `AttendanceManager.jsx` for daily entry
  - `MyAttendance.jsx` for student self-view
  - dashboard links to attendance pages
- New backend reporting base now has:
  - shared attendance reporting helper
  - reporting indexes on `Attendance`
  - class summary endpoint for date-range reports
- Remaining carry-over:
  - none

## Exit Criteria

Phase 4 is done only when all of these are true:

1. Instructor/admin can register daily attendance for a class from one operational screen.
2. Instructor/admin can view class attendance summaries by date range.
3. Instructor/admin can view a single student attendance summary by date range.
4. Student dashboard shows weekly attendance status summary.
5. Instructor dashboard shows weekly attendance summary for the selected class.
6. Attendance pages remain responsive and pass route smoke checks.

## Scope Boundaries

In scope:

- Attendance reporting
- Dashboard summaries
- Attendance filters
- Attendance summary cards
- Attendance QA and documentation

Out of scope for this phase:

- Parent notifications
- SMS/email absentee alerts
- Biometric or QR attendance
- Auto-attendance from chat/live class presence

## Backlog

| ID | Priority | Stream | Status | Task | Expected output | Depends on | Key files |
|---|---|---|---|---|---|---|---|
| `P4-BE-01` | High | Backend | Completed | Add reporting indexes and shared attendance summary helpers. | Fast reusable aggregation layer for class, student, and weekly summaries. | None | `backend/models/Attendance.js`, `backend/routes/attendanceRoutes.js`, `backend/utils/attendanceReporting.js` |
| `P4-BE-02` | High | Backend | Completed | Add class report endpoint for date-range summary. | `GET /api/attendance/course/:courseId/summary?from&to` with totals, rate, per-student rows, optional daily breakdown. | `P4-BE-01` | `backend/routes/attendanceRoutes.js` |
| `P4-BE-03` | High | Backend | Completed | Add student report endpoint for date-range summary. | `GET /api/attendance/student/:studentId/summary?courseId&from&to` with totals, rate, streaks, recent entries. | `P4-BE-01` | `backend/routes/attendanceRoutes.js` |
| `P4-BE-04` | High | Backend | Completed | Add weekly dashboard endpoints for student and instructor/admin views. | `GET /api/attendance/my/weekly` and `GET /api/attendance/course/:courseId/weekly`. | `P4-BE-01` | `backend/routes/attendanceRoutes.js` |
| `P4-BE-05` | Medium | Backend | Completed | Add attendance export option for reports. | CSV export for class and student reports, aligned with filtered date range. | `P4-BE-02`, `P4-BE-03` | `backend/routes/attendanceRoutes.js` |
| `P4-FE-01` | High | Frontend | Completed | Refactor `AttendanceManager` into three operational views: daily register, class report, student report. | One screen that supports entry and reporting without mixing raw rows and report concerns. | `P4-BE-02`, `P4-BE-03` | `frontend/src/pages/AttendanceManager.jsx`, `frontend/src/pages/AttendanceManager.css` |
| `P4-FE-02` | High | Frontend | Completed | Add summary cards and better save flow to daily register. | Daily register shows totals by status and supports efficient save flow for large classes. | Existing API or `P4-BE-01` | `frontend/src/pages/AttendanceManager.jsx` |
| `P4-FE-03` | High | Frontend | Completed | Build class report UI with filters and table. | Date-range report with totals, attendance rate, student rows, and export action. | `P4-BE-02`, `P4-BE-05` | `frontend/src/pages/AttendanceManager.jsx`, `frontend/src/pages/AttendanceManager.css` |
| `P4-FE-04` | High | Frontend | Completed | Build individual student report UI inside attendance manager. | Select student, filter by class/date range, show status totals and recent records. | `P4-BE-03` | `frontend/src/pages/AttendanceManager.jsx`, `frontend/src/pages/AttendanceManager.css` |
| `P4-FE-05` | Medium | Frontend | Completed | Upgrade `MyAttendance` with filters and summary strip. | Student can filter by class/date/status and see totals for present/absent/late/excused. | `P4-BE-03` or existing `/my` extension | `frontend/src/pages/MyAttendance.jsx`, `frontend/src/pages/MyAttendance.css` |
| `P4-FE-06` | High | Frontend | Completed | Add weekly attendance widget to student dashboard. | `Dashboard.jsx` shows current-week attendance totals and quick access to details. | `P4-BE-04` | `frontend/src/pages/Dashboard.jsx` |
| `P4-FE-07` | High | Frontend | Completed | Add weekly attendance widget to instructor dashboard. | `InstructorDashboard.jsx` shows selected-class weekly summary and link to report screen. | `P4-BE-04` | `frontend/src/pages/InstructorDashboard.jsx` |
| `P4-QA-01` | High | QA | Completed | Add backend smoke coverage for new attendance report endpoints. | Route-level verification for auth, response shape, date-range validation, and CSV attachment behavior. | Backend tasks | `backend/scripts/checkAttendanceRoutes.js`, `backend/package.json` |
| `P4-QA-02` | High | QA | Completed | Add frontend smoke/e2e coverage for daily entry and report screens. | Playwright flow for register -> report -> dashboard widget visibility. | Frontend tasks | `frontend/tests/e2e/` |
| `P4-DOC-01` | Medium | Docs | Completed | Update progress matrix and release notes after implementation. | Phase 4 completion evidence and any carry-over tasks documented. | All implementation tasks | `docs/PROJECT_PROGRESS_MATRIX.md`, `docs/UI_CONSISTENCY_MATRIX.md`, phase signoff doc |

## Recommended Implementation Order

1. `P4-FE-01`, `P4-FE-02`
2. `P4-FE-03`, `P4-FE-04`, `P4-FE-05`
3. `P4-FE-06`, `P4-FE-07`
4. `P4-QA-01`
5. `P4-DOC-01`

## Progress Log

- 2026-03-06: Completed `P4-BE-01` by adding `backend/utils/attendanceReporting.js` and reporting indexes in `backend/models/Attendance.js`.
- 2026-03-06: Completed `P4-BE-02` by adding `GET /api/attendance/course/:courseId/summary` to `backend/routes/attendanceRoutes.js`.
- 2026-03-06: Completed `P4-BE-03` by adding `GET /api/attendance/student/:studentId/summary` with totals, streak, recent rows, and optional course filter.
- 2026-03-06: Completed `P4-BE-04` by adding `GET /api/attendance/my/weekly` and `GET /api/attendance/course/:courseId/weekly`.
- 2026-03-06: Completed `P4-FE-01` to `P4-FE-07` by shipping report views in `AttendanceManager`, filtered `MyAttendance`, and weekly widgets in both dashboards.
- 2026-03-06: Verification update: `frontend` `npm run lint` and `npm run build` passed after the Phase 4 UI/reporting changes.
- 2026-03-06: Completed `P4-BE-05` by adding CSV export routes for class and student attendance reports in `backend/routes/attendanceRoutes.js`.
- 2026-03-06: Completed `P4-QA-02` by adding `frontend/tests/e2e/attendance.workflow.spec.js` and passing `npm run test:e2e:attendance`.
- 2026-03-06: Completed `P4-QA-01` by adding `backend/scripts/checkAttendanceRoutes.js` and wiring it into `backend` `npm run test:smoke`.
- 2026-03-06: Phase 4 signoff recorded in `docs/PHASE4_SIGNOFF.md`.

## API Draft

### Class Summary

`GET /api/attendance/course/:courseId/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`

Suggested response shape:

```json
{
  "success": true,
  "summary": {
    "courseId": "course-1",
    "from": "2026-03-01",
    "to": "2026-03-07",
    "totalStudents": 32,
    "present": 144,
    "absent": 8,
    "late": 4,
    "excused": 2,
    "attendanceRate": 91.1
  },
  "students": [
    {
      "studentId": "stu-1",
      "name": "Student Name",
      "present": 5,
      "absent": 1,
      "late": 0,
      "excused": 0,
      "attendanceRate": 83.3
    }
  ],
  "byDate": [
    {
      "date": "2026-03-01",
      "present": 28,
      "absent": 2,
      "late": 1,
      "excused": 1
    }
  ]
}
```

### Student Summary

`GET /api/attendance/student/:studentId/summary?courseId=&from=YYYY-MM-DD&to=YYYY-MM-DD`

Suggested response shape:

```json
{
  "success": true,
  "summary": {
    "studentId": "stu-1",
    "courseId": "course-1",
    "from": "2026-03-01",
    "to": "2026-03-07",
    "present": 5,
    "absent": 1,
    "late": 0,
    "excused": 0,
    "attendanceRate": 83.3,
    "currentAbsentStreak": 0
  },
  "recent": [
    {
      "date": "2026-03-06",
      "status": "present",
      "note": ""
    }
  ]
}
```

### Weekly Dashboard Summary

Student:

`GET /api/attendance/my/weekly?courseId=&weekStart=YYYY-MM-DD`

Instructor/Admin:

`GET /api/attendance/course/:courseId/weekly?weekStart=YYYY-MM-DD`

Suggested response shape:

```json
{
  "success": true,
  "week": {
    "start": "2026-03-01",
    "end": "2026-03-07"
  },
  "summary": {
    "present": 5,
    "absent": 1,
    "late": 0,
    "excused": 0,
    "attendanceRate": 83.3
  }
}
```

## UI Notes

- Daily register should remain optimized for speed:
  - class selector
  - date selector
  - status counts
  - efficient save flow
- Class report should emphasize:
  - date-range filters
  - summary cards
  - student table
  - export action
- Student self-view should emphasize:
  - clear totals
  - recent records
  - simple filters
- Dashboard widgets should stay compact:
  - one weekly summary card
  - one primary action to detailed attendance page

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Attendance data volume grows quickly by day and class. | Slow reports and dashboard summaries. | Add reporting indexes and shared aggregation helpers first. |
| Reporting logic duplicates across pages. | Inconsistent totals between manager, student page, and dashboards. | Centralize summary logic in backend helper/service. |
| Daily register and report flows become cluttered in one screen. | Instructor UX regresses. | Split the manager into clearly labeled views/tabs. |
| Date filtering is inconsistent between APIs. | Confusing numbers and QA failures. | Normalize date validation and shared response shape. |

## Definition of Done Checklist

- [x] Daily register works for instructors/admins
- [x] Class report works by date range
- [x] Individual student report works by date range
- [x] Student dashboard weekly widget is live
- [x] Instructor dashboard weekly widget is live
- [x] New attendance APIs are protected by auth/role/permission checks
- [x] Smoke/e2e coverage exists for new flows
- [x] Progress matrix is updated after implementation
