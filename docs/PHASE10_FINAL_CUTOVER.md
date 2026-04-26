# Phase 10 Final Cutover

This document tracks the final cutover checks after the academic core, memberships,
student profile, exams, result tables, promotion, student finance, timetable, and
report engine phases have been introduced.

## Goal

Move the system from mixed legacy/canonical execution to canonical-first execution
without losing data integrity.

## Cutover rules

A final legacy retirement should only happen when the audit script reports:

- `readyForCoreCutover = true`
- `readyForTransactionCutover = true`
- `readyToRetireLegacyOrders = true`

Run the audit with:

```bash
cd backend
npm run check:phase10-cutover
```

Run strict mode before any destructive cleanup:

```bash
cd backend
npm run check:phase10-cutover -- --strict
```

## What the audit checks

- memberships missing `academicYearId`
- memberships missing `classId`
- academic transaction rows missing `studentMembershipId`
- explicit finance `linkScope` alignment (`membership` vs `student`) on finance and fee collections
- non-academic or `public_course` finance rows still missing `studentMembershipId`
- attendance/grade/exam/promotion rows missing `studentMembershipId`
- legacy `Schedule` rows not mirrored into canonical `Timetable`
- teacher assignments missing canonical `classId` or `subjectId`
- legacy `Order` rows that still do not have a canonical mirror in `StudentMembership` or `CourseJoinRequest`

## Important interpretation

The cutover audit now distinguishes between academic blockers and non-academic warnings:

- Finance and fee rows now carry an explicit `linkScope` field.

- Missing membership on an `academic_class` transaction is a blocker.
- Missing membership on a non-academic or `public_course` finance row is a warning.
- Historical `Order` rows may remain in the database as archive data after cutover, as long as:
  - approved orders already mirror to `StudentMembership`
  - join-request orders already mirror to `CourseJoinRequest`

This means the audit is aligned with the current runtime behavior, where academic flows are
membership-driven and public-course finance may still stay student-based.

## Safe cleanup order

1. Clear any remaining academic transaction rows without `studentMembershipId`.
2. Review non-academic finance rows and decide whether they stay student-based or get a separate public-course membership model.
3. Confirm approved legacy orders all mirror to `StudentMembership`.
4. Confirm join-request legacy orders all mirror to `CourseJoinRequest`.
5. Freeze legacy `Order` writes and keep the collection as archive history if needed.
6. Switch remaining read paths from legacy models to canonical report/service layers.
7. Retire legacy routes only after the audit is clean in strict mode.

## Current state as of 2026-03-13

- The remaining rows without `studentMembershipId` are from non-academic public-course finance.
- These rows do not block academic cutover, but they should stay visible as warnings.
- FinanceBill, FinanceReceipt, FeeOrder, FeePayment, and Discount now store `linkScope` explicitly and have been backfilled.
- Historical legacy `Order` rows can remain archived once canonical mirrors are complete.
- SLA automation now uses canonical `FinanceReceipt` follow-up rows instead of legacy `Order` follow-up data.
- Live exam and promotion transactional data may still be sparse, even if the schemas are ready.

## Recommendation

Treat this audit as the gate before removing any legacy database dependency. If the
script reports blockers, keep legacy compatibility paths in place and clean the
remaining academic rows first. If the script only reports warnings, the system is
close to final cutover and the remaining work is policy or archive cleanup rather
than core data integrity repair.

## Operational next step

To turn the remaining exam and promotion warnings into live data safely, use the
exam bootstrap runbook:

- [Exam Session Bootstrap Runbook](./EXAM_BOOTSTRAP_RUNBOOK.md)

Preview first, then create the first canonical exam session and roster only after
backup and review.

