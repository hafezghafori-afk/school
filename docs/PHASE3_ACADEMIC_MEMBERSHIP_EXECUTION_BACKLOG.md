# Phase 3 (Academic Membership) - Execution Backlog

Status: Complete
Last update: 2026-03-10
Scope: Course academic shape plus independent student membership model.

## Goal

Separate academic membership from order/enrollment flow so the education domain can carry real class membership explicitly.

## Completed Work

- Added academic course fields to `backend/models/Course.js`.
- Added and stabilized `backend/models/StudentMembership.js`.
- Added lifecycle behavior and indexes for current versus terminal memberships.
- Updated membership sync to read course academic context when available.
- Updated course routes to accept and validate academic fields.
- Added course academic backfill script in `backend/scripts/backfillCourseAcademicFields.js`.
- Ran membership backfill and verified current memberships in MongoDB.
- Ran course academic/public backfill and materialized explicit `kind` values in MongoDB.

## Final Model Decisions

- `Enrollment` remains a request/intake model.
- `Order` remains a workflow/payment compatibility model.
- `StudentMembership` is the real academic membership record.
- `Course.kind` explicitly separates:
  - `academic_class`
  - `public_course`

## Verification Snapshot

- Total `Course` records: `9`
- Explicit `academic_class` courses: `3`
- Explicit `public_course` courses: `6`
- Total `StudentMembership` records: `8`
- Current active memberships: `8`

## Done Criteria Check

- Real membership exists in the database: PASS
- `Course` can clearly carry the academic class role: PASS

## Carry-over

Future phases may enrich academic fields further with:

- `academicYearRef` population
- `section` standardization
- homeroom instructor assignment

These are enhancements, not blockers for Phase 3 closure.
