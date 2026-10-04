# Promotion Runbook

This runbook uses the canonical promotion engine on top of `ExamSession` and `ExamResult`
(or the official general result of a class when the rule's mode is `official_general_result`).

## How a promotion is applied

One press of «اعمال ارتقا» promotes one source class of one academic year and is recorded as a
`PromotionBatch`. Every student the batch touched has a `PromotionTransaction` pointing back to it.

- **Source**: the source academic year and source class (or an exam session, which carries both).
- **Target year**: chosen explicitly (`targetAcademicYearId`) or the nearest year *after* the source
  one. The same year, or an earlier one, blocks the apply.
- **Target classes**: `promotedClassId` takes the promoted students (it must be one grade higher) and
  `repeatClassId` the repeaters (same grade). Both must belong to the target year, must not be
  archived, and must not be the other gender (ذکور/اناث; a mixed class fits either). When a class is
  left empty the engine picks a class of the required grade, preferring the same section, then the
  same gender, then the same shift — and never falls back to a class of the wrong grade.
- **Per-student overrides** (`studentOverrides`): `{ membershipId, targetClassId }` sends one student to
  another legal class (e.g. splitting a section); `{ membershipId, exclude: true }` leaves them out.
- **Dates**: the source membership ends on `sourceEndAt` (default: end of the source year) and the new
  one starts on `targetStartAt` (default: start of the target year). A legacy `effectiveAt` sets both.
- **Outcomes**:
  - `promoted` / `repeated` → a new membership in the target class (status from the rule, `pending` by
    default), the source membership is closed.
  - `graduated` → class 12 (or a terminal rule): the source membership becomes `graduated`.
  - `conditional` (مشروط) → **held** for the second-chance exam: nothing moves until
    `POST /api/promotions/transactions/:id/resolve` with `{ decision: 'promoted' | 'repeated' }`.
  - `blocked` / `skipped` → listed in the batch's `notApplied`; no transaction is written, so the
    student can be promoted once the marks are fixed.
- Everything is written in **one MongoDB transaction** (a replica set or mongos is required); the
  class head-counts and the student registry (`AfghanStudent.academicInfo`) are updated with it.

## Rollback

- One student: `POST /api/promotions/rollback/:transactionId`.
- Whole batch: `POST /api/promotions/batches/:batchId/rollback` — all or nothing; the error lists
  every student that blocked it.
- A rollback is refused when the new membership was promoted again, or when finance has already
  billed it (non-void `FinanceBill`/`FeeOrder`): void those bills first.

## CLI

```bash
cd backend
npm run preview:promotions -- --session=<sessionId>
npm run apply:promotions -- --session=<sessionId> --actor=<userId>
```

Optional flags: `--rule=<promotionRuleId>`, `--target-year=<academicYearId>`,
`--memberships=<membershipId1,membershipId2>`. The CLI apply refuses `pending` results and `blocked`
items unless `--allow-pending` / `--allow-blocked` is passed.

## Checks

- `npm run check:promotion-planning` — the class/year/date rules (no database).
- `npm run check:promotion-batch-flow` — preview → apply → rollback → resolve against a throwaway
  database; reports SKIP on a standalone server because it needs transactions.
- `npm run check:promotion-routes` — route permissions, error codes and activity logs.

## Recommendation

1. Run a backup.
2. Make sure the target year and its classes exist (`npm run bootstrap:next-academic-year`).
3. Preview and confirm the target year, the two target classes and every red/yellow item.
4. Apply only after exam marks are final.
