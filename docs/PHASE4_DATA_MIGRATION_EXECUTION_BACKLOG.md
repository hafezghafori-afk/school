# Phase 4 (Data Migration and Backfill) - Execution Backlog

Status: Complete
Last update: 2026-03-10
Scope: Data migration into canonical `orgRole` and `StudentMembership` models plus integrity verification.

## Goal

Move existing local MongoDB data into the new identity and academic membership model so the database reflects the canonical design rather than relying on legacy defaults or implicit workflow state.

## Completed Work

- Reworked `backend/scripts/backfillOrgRoles.js` to read raw MongoDB records and materialize stored `orgRole` and `status` values.
- Reworked `backend/scripts/checkRoleIntegrity.js` to validate persisted user identity fields instead of hydrated Mongoose defaults.
- Added `backend/scripts/backfillStudentStatusesFromMemberships.js` to downgrade orphaned active students with no current membership and no approved order.
- Added `backend/scripts/checkAcademicMigrationIntegrity.js` to verify role cutover, approved-order to membership pairing, membership references, and active-student integrity in one report.
- Registered migration scripts in `backend/package.json`.
- Executed real `orgRole` backfill on local MongoDB.
- Executed real student-status cleanup on local MongoDB.
- Re-ran academic migration integrity until the report reached zero issues and zero warnings.

## Final Migration Decisions

- `orgRole` and `status` must exist as persisted values in MongoDB and cannot be considered complete only through schema defaults.
- `StudentMembership` is the authoritative academic membership record.
- `Order(status='approved')` remains compatibility input for migration, not the final academic source of truth.
- Student users marked `active` must have either:
  - a current `StudentMembership`, or
  - a currently approved legacy order during migration
- Students without either signal are downgraded to `inactive` during cleanup.

## Executed Commands

Executed on the local MongoDB environment:

- `cd backend && node .\scripts\backfillOrgRoles.js`
- `cd backend && node .\scripts\backfillStudentStatusesFromMemberships.js`
- `cd backend && node .\scripts\checkAcademicMigrationIntegrity.js`

## Final Verification Snapshot

- Total `User` records: `10`
- Approved `Order` records: `8`
- Approved order student-course pairs: `8`
- Total `StudentMembership` records: `8`
- Current membership pairs: `8`
- Active students after cleanup: `6`
- Integrity issues: `0`
- Integrity warnings: `0`

## Done Criteria Check

- Existing data migrated into the new model: PASS
- All active students have valid membership: PASS
- Integrity report is empty or cleanly resolvable: PASS

## Carry-over

Future phases may still remove more legacy read paths from education access logic, but that is not a blocker for Phase 4 closure because the migrated data is now internally consistent.

## Note

This backlog is for the user-defined Phase 4 about data migration and backfill. It does not replace `docs/PHASE4_EXECUTION_BACKLOG.md`, which belongs to the older roadmap.
