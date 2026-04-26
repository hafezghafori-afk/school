# Education Cutover Runbook

## Scope

This runbook covers the class-centric education cutover where:
- `SchoolClass / classId` is the primary identifier in admin education flows.
- `InstructorSubject` persists `classId` first.
- `course / legacyCourseId` remains backend-only compatibility data.
- content modules (`quiz`, `recordings`, public class catalog) accept or emit `classId` first while keeping `courseId` compatibility where still needed.
- academic classroom flows (`grades`, `homework`) now accept and emit `classId` first while keeping `courseId` only as compatibility data where the current schema still requires it.
- attendance routes now expose `classId` first and mark legacy `course` paths or query filters with deprecation headers.
- virtual classes now accept `classId` directly at the API boundary and mark legacy course-only filters as deprecated.
- content structure routes for `Module` now accept `classId` directly and keep `courseId` only as compatibility storage.
- the legacy public catalog route `/api/courses/all` is retired and now points clients to `/api/education/public-school-classes`.
- `quiz` and `recordings` still accept `courseId` at the API boundary, but only as an input resolver to a canonical `classId`; read-time fallback on rows with `classId = null` is retired.
- `homework` and `grade` manager/student pages now select canonical class scopes first and only send `courseId` when a compatibility write still needs it.
- legacy `grade` and `homework` course routes remain temporarily available, but now respond with deprecation headers and a canonical `classId` replacement endpoint.

## Affected areas

- `backend/routes/educationRoutes.js`
- `backend/routes/quizRoutes.js`
- `backend/routes/recordingRoutes.js`
- `backend/routes/gradeRoutes.js`
- `backend/routes/homeworkRoutes.js`
- `backend/routes/attendanceRoutes.js`
- `backend/routes/virtualClassRoutes.js`
- `backend/routes/moduleRoutes.js`
- `backend/models/InstructorSubject.js`
- `backend/models/Quiz.js`
- `backend/models/VirtualRecording.js`
- `backend/models/Homework.js`
- `backend/models/HomeworkSubmission.js`
- `backend/models/Module.js`
- `backend/routes/adminRoutes.js`
- `frontend/src/pages/AdminEducationCore.jsx`
- `frontend/src/pages/GradeManager.jsx`
- `frontend/src/pages/MyGrades.jsx`
- `frontend/src/pages/HomeworkManager.jsx`
- `frontend/src/pages/MyHomework.jsx`
- `frontend/src/pages/QuizBuilder.jsx`
- `frontend/src/pages/Quiz.jsx`
- `frontend/src/pages/RecordingsPage.jsx`
- `frontend/src/pages/CourseList.jsx`
- `frontend/src/components/VirtualClassPanel.jsx`
- `frontend/src/pages/AdminPanel.jsx`
- `frontend/src/App.jsx`
- `backend/scripts/backfillEducationClassLinks.js`

## Preflight

Run these commands before deployment:

```bash
cd D:/School-Project/backend && npm run check:education-routes
cd D:/School-Project/backend && npm run check:content-canonical-routes
cd D:/School-Project/backend && npm run check:content-class-refs
cd D:/School-Project/backend && npm run check:grade-routes
cd D:/School-Project/backend && npm run check:grade-class-refs
cd D:/School-Project/backend && npm run check:homework-routes
cd D:/School-Project/backend && npm run check:homework-class-refs
cd D:/School-Project/backend && npm run check:attendance-routes
cd D:/School-Project/backend && npm run check:virtual-chat-routes
cd D:/School-Project/backend && npm run check:module-routes
cd D:/School-Project/backend && npm run check:module-class-refs
cd D:/School-Project/backend && npm run backfill:content-class-refs:dry
cd D:/School-Project/backend && npm run backfill:grade-class-refs:dry
cd D:/School-Project/backend && npm run backfill:homework-class-refs:dry
cd D:/School-Project/backend && npm run backfill:module-class-refs:dry
cd D:/School-Project/backend && npm run check:syntax
cd D:/School-Project/backend && npm run test:smoke
cd D:/School-Project/frontend && npm run build
cd D:/School-Project/frontend && npm run test:e2e:grades
cd D:/School-Project/frontend && npm run test:e2e:homework
cd D:/School-Project/frontend && npm run test:e2e:content-canonical
cd D:/School-Project/backend && npm run backfill:education-class-links:dry
```

Expected outcome:
- route smoke is green
- canonical content smoke is green
- content class-ref integrity check is green
- grade and homework route smoke are green
- grade class-ref integrity check is green
- homework class-ref integrity check is green
- attendance route smoke is green
- virtual/chat route smoke is green
- module route smoke is green
- module class-ref integrity check is green
- content class-ref dry-run reports zero unresolved rows
- grade class-ref dry-run reports zero unresolved rows
- homework class-ref dry-run reports zero unresolved rows
- module class-ref dry-run reports zero unresolved rows
- backend syntax check is green
- full smoke is green
- frontend build is green
- grade and homework e2e are green
- canonical content e2e is green
- dry-run reports either `updated > 0` with safe changes or `updated = 0`
- unresolved items are reviewed before apply

## Deploy sequence

1. Deploy backend code with the class-first route/model changes.
2. Run the dry-run backfill and review the summary.
3. Apply the backfill:

```bash
cd D:/School-Project/backend && npm run backfill:education-class-links
cd D:/School-Project/backend && npm run backfill:content-class-refs
cd D:/School-Project/backend && npm run backfill:grade-class-refs
cd D:/School-Project/backend && npm run backfill:homework-class-refs
cd D:/School-Project/backend && npm run backfill:module-class-refs
```

4. Re-run validation:

```bash
cd D:/School-Project/backend && npm run check:education-routes
cd D:/School-Project/backend && npm run check:content-canonical-routes
cd D:/School-Project/backend && npm run check:content-class-refs
cd D:/School-Project/backend && npm run check:grade-routes
cd D:/School-Project/backend && npm run check:grade-class-refs
cd D:/School-Project/backend && npm run check:homework-routes
cd D:/School-Project/backend && npm run check:homework-class-refs
cd D:/School-Project/backend && npm run check:attendance-routes
cd D:/School-Project/backend && npm run check:virtual-chat-routes
cd D:/School-Project/backend && npm run check:module-routes
cd D:/School-Project/backend && npm run check:module-class-refs
cd D:/School-Project/backend && npm run check:syntax
cd D:/School-Project/backend && npm run test:smoke
cd D:/School-Project/frontend && npm run build
cd D:/School-Project/frontend && npm run test:e2e:grades
cd D:/School-Project/frontend && npm run test:e2e:homework
cd D:/School-Project/frontend && npm run test:e2e:content-canonical
```

5. Deploy frontend after backend validation is green.

## What the backfill does

`backfillEducationClassLinks.js` updates legacy `InstructorSubject` rows so that:
- missing `classId` is filled from `course -> SchoolClass`
- mismatched or missing `course` is synced from `SchoolClass.legacyCourseId`
- missing `academicYear` is synced from `SchoolClass.academicYearId`

It does not delete any data and does not remove `course` compatibility.

`backfillContentClassRefs.js` updates `Quiz` and `VirtualRecording` rows so that:
- missing `classId` is filled from `course -> SchoolClass`
- mismatched compatibility `course` is synced from `SchoolClass.legacyCourseId` when available
- public-course rows without a school-class mapping are skipped, not rewritten

`checkContentClassRefs.js` also enforces that:
- `Quiz` and `VirtualRecording` rows linked to academic classes carry `classId`
- current `StudentMembership` rows used for content access also carry `classId`

`backfillGradeClassRefs.js` updates `Grade` rows so that:
- missing `classId` is filled from `course -> SchoolClass`
- mismatched compatibility `course` is synced from `SchoolClass.legacyCourseId` when available

`checkGradeClassRefs.js` enforces that:
- `Grade` rows linked to academic classes carry `classId`
- stored compatibility `course` still matches the resolved canonical class when applicable

`backfillHomeworkClassRefs.js` updates `Homework` and `HomeworkSubmission` rows so that:
- missing `classId` is filled from `course -> SchoolClass`
- submission `classId` can also be recovered from the linked `Homework`
- compatibility `course` is synced from `SchoolClass.legacyCourseId` or the linked homework when needed

`checkHomeworkClassRefs.js` enforces that:
- `Homework` rows carry `classId`
- `HomeworkSubmission` rows carry `classId`
- stored compatibility `course` still matches the resolved canonical class when applicable

`backfillModuleClassRefs.js` updates `Module` rows so that:
- missing `classId` is filled from `course -> SchoolClass`
- mismatched compatibility `course` is synced from `SchoolClass.legacyCourseId` when available

`checkModuleClassRefs.js` enforces that:
- `Module` rows carry `classId`
- stored compatibility `course` still matches the resolved canonical class when applicable

## Verification checklist

After deployment, verify these behaviors:
- `GET /api/education/instructor-subjects?classId=...` returns `classId`, `courseId`, and `schoolClass`
- creating a teacher mapping from `AdminEducationCore` sends `classId` and succeeds
- updating a teacher mapping does not require `courseId`
- student enrollment create/update still works with `classId`
- school class rows show legacy sync status, not legacy course title as a primary label
- `GradeManager` loads rosters from `/api/grades/class/:classId` and saves grades with `classId`
- `MyGrades` prefers the canonical class report URL `/api/grades/report/class/:classId`
- `GET /api/grades/course/:courseId` returns deprecation headers and `X-Replacement-Endpoint=/api/grades/class/:classId`
- `GET /api/grades/report/:courseId` returns deprecation headers and `X-Replacement-Endpoint=/api/grades/report/class/:classId`
- `HomeworkManager` loads homework from `/api/homeworks/class/:classId` and saves with `classId`
- `MyHomework` filters `my/submissions` with `classId`
- `GET /api/homeworks/course/:courseId` returns deprecation headers and `X-Replacement-Endpoint=/api/homeworks/class/:classId`
- `GET /api/attendance/course/:courseId`, `/summary`, `/export.csv`, and `/weekly` return deprecation headers with canonical `class` replacements
- `GET /api/attendance/student/:studentId/summary?courseId=...`, `/export.csv?courseId=...`, and `GET /api/attendance/my/weekly?courseId=...` return deprecation headers with canonical `classId` query replacements
- `VirtualClassPanel` filters and saves sessions against canonical class scope first
- `GET /api/virtual-classes?classId=...` returns scoped sessions, while `?courseId=...` returns deprecation headers and a `classId` replacement
- `GET /api/modules/class/:classId` returns canonical module rows, while `GET /api/modules/course/:courseId` returns deprecation headers and a class replacement
- `POST /api/modules/class/:classId` stores `classId` and compatibility `courseId` together
- `QuizBuilder` sends `classId` and `courseId`, and `Quiz` reads the scoped quiz for the selected class
- `RecordingsPage` filters by canonical class source lists and sends `classId` with compatibility `courseId`
- `GET /api/quizzes/subject/:subject?courseId=...` only succeeds when that course resolves to a `SchoolClass`
- `GET /api/recordings?courseId=...` only succeeds when that course resolves to a `SchoolClass`
- `CourseList`, home search, and `VirtualClassPanel` no longer call `/api/courses/all`
- admin search links and quick results now open `/courses/:classId` when canonical class mapping exists
- `GET /api/education/public-school-classes` returns public catalog rows with `classId`, `courseId`, and `schoolClass`
- `GET /api/courses/all` returns `410` with `replacementEndpoint=/api/education/public-school-classes`

## Rollback

Rollback is low-risk because old code can ignore the new `classId` field on `InstructorSubject`.
The same rule applies to `Quiz` and `VirtualRecording`: legacy code can continue reading `course` while newer code also uses `classId`.

If rollback is needed:
1. Roll back backend/frontend code to the previous release.
2. Do not delete the new `classId` data.
3. Re-run smoke for the reverted release.

No data rollback is required unless the release introduced unrelated bad writes.

## Escalation rule

Stop the rollout if either of these happens:
- dry-run unresolved items are not understood
- `check:education-routes` or `test:smoke` fails after the backfill apply

In that case, keep the existing data, investigate unresolved rows, and do not remove backend compatibility yet.
