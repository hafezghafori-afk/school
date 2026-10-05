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
  - `promoted` / `repeated` → a new `active` membership in the target class, the source membership is
    closed.
  - `graduated` → class 12 (or a terminal rule): the source membership becomes `graduated`.
  - `conditional` (مشروط) → **held** for the second-chance exam: nothing moves until
    `POST /api/promotions/transactions/:id/resolve` with `{ decision: 'promoted' | 'repeated' }`.
  - `blocked` / `skipped` → listed in the batch's `notApplied`; no transaction is written, so the
    student can be promoted once the marks are fixed.
- Everything is written in **one MongoDB transaction** (a replica set or mongos is required); the
  class head-counts and the student registry (`AfghanStudent.academicInfo`) are updated with it.

## The page (phase 3)

«مرکز ارتقا صنف» (`/admin-promotions`) works one class at a time, in five steps:

1. **مبدا** — the source year (the active year is preselected) and a board of its classes from
   `GET /api/promotions/year-board?academicYearId=` (current students, latest batch, conditional students
   waiting for the second chance; grade 12 is marked as graduation).
2. **مقصد** — the target year (only later years are offered) and the class for promoted students and
   the class for repeaters. The system's choice is preselected; only legal classes (right grade, same
   gender, target year) are listed, with their capacity.
3. **تاریخ‌ها** — end of the source membership and start in the target class (defaults: end of the
   source year, start of the target year).
4. **شاگردان** — every student with نمبر اساس, result, decision, average/failed subjects, a per-student
   target class (e.g. to split a section), include/exclude, debt, after-end documents and the reliefs
   that can be carried over.
5. **تأیید** — blockers, warnings and a grouped summary; one confirmed «اعمال ارتقا».

Every change re-runs `POST /api/promotions/preview`, so what the page shows is what the apply does.
For rules other than the official general result the preview reads the class's latest exam session
when none is chosen (a class without any exam session says so). Below the steps, the batches of the
year: details per student, per-student and whole-class rollback, «کامیاب شد / ناکام شد» for held
students, and «چاپ لیست» (A4 list with three signature boxes: تهیه‌کننده، مدیر مکتب، ریاست عمومی).

## Finance (phase 2)

- **New memberships are `active`** from the start of the target year, so the normal billing picks
  them up. Their `admissionType` is `promotion`, and the billing engine never charges a promotion
  membership «داخله» again.
- **Preview** shows per student (`item.finance`): the source-year debt (`outstanding`, a warning only
  — it stays as that year's debt), documents dated after the source end (`postEndUnpaid`,
  `postEndPaid`) and active discounts/exemptions (`reliefs`). `plan.warnings` adds a line for the debt,
  for after-end documents, and for every target class without a fee plan in the target year.
- **Apply** settles each moved student's source membership inside the same transaction: an unpaid
  document dated after the end is voided (bill and its fee-order mirror), unless its month is closed
  (then it is listed in `financeEffects.reviewRequired`); a paid one becomes a `FinanceRefund` case
  (`membership_ended`, note suggesting `credit_next_bill`) for the finance office. The source-year
  debt and the second-chance exam fee are never touched. Government reports are built from payments
  and expenses, so ratified reports don't change.
- **Reliefs**: `reliefCarryOver: [{ membershipId, reliefs: [{ sourceModel: 'discount' | 'fee_exemption', id }] }]`
  (or `carryAllReliefs: true`) re-registers the chosen ones on the new membership after commit, through
  the normal registry (target-year window, open-bill sync, FinanceRelief mirror). A held student's
  choice is kept as `plannedReliefs` and carried when the second chance is decided (the resolve
  request may also send `reliefs` / `carryAllReliefs`). Results are in `financeEffects.carriedReliefs`
  and `batch.financeSummary`.
- **Rollback** cancels the reliefs the promotion carried. Voided after-end documents and refund cases
  stay as they are; finance re-issues or rejects them if needed.

## Access

One person approves a promotion. `education.promotions.manage` comes by default with the school
manager (مدیر مکتب), the general presidency (ریاست عمومی) and the academic manager (through
`manage_users` / `manage_memberships`); `check:promotion-routes` keeps the first two pinned.

## Rollback

- One student: `POST /api/promotions/rollback/:transactionId`.
- Whole batch: `POST /api/promotions/batches/:batchId/rollback` — all or nothing; the error lists
  every student that blocked it.
- A rollback is refused when the new membership was promoted again, or when finance has already
  billed it (non-void `FinanceBill`/`FeeOrder`): void those bills first.

## Second-chance exam fee (فیس امتحان چانس دوم)

مرکز مالی مکتب → «بل‌ها و تعهدات» lists only the students a batch held as conditional (held, or
already resolved), with their failed subjects, average and their own monthly fee as a guide.
Charging them is **optional** and every amount is typed per student:

- «صدور بل» — an ordinary `FinanceBill` of fee type `exam` («فیس امتحان چانس دوم») on the
  student's source-year membership and class. Its `issuanceKey` is `second_chance_exam:<transaction>`,
  so a student can only have one live bill; month-close and other-school checks are the usual ones.
- «معاف» (reason required) and «برداشتن معافیت».
- «باطل‌کردن بل» goes through the normal bill void (finance manager / lead / president, no payment
  on it, month not closed); afterwards the decision is open again.
- An unpaid fee only **warns** when the second-chance result is recorded; it stays as that year's
  debt. A conditional student whose fee bill is still live can't be rolled back until it is voided.
- Income shows up in the finance and government reports as fee type `exam` under the source class.

API: `GET /api/finance/admin/second-chance-fees`, `POST .../:transactionId/bill | waive |
clear-waiver | void-bill` (`manage_finance`).

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
- `npm run check:second-chance-fee` — the finance list, billing, waiver, void and rollback/resolve
  interplay through the real finance routes; SKIP on a standalone server.
- `npm run check:promotion-finance` — debt/after-end documents in the preview, settlement on apply,
  closed months, no second admission fee, relief carry-over and its rollback; SKIP on a standalone server.

## Recommendation

1. Run a backup.
2. Make sure the target year and its classes exist (`npm run bootstrap:next-academic-year`).
3. Preview and confirm the target year, the two target classes and every red/yellow item.
4. Apply only after exam marks are final.
