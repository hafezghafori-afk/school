# Promotion Runbook

This runbook uses the canonical promotion engine on top of `ExamSession` and `ExamResult`.

## Preview promotions

```bash
cd backend
npm run preview:promotions -- --session=<sessionId>
```

Optional flags:

- `--rule=<promotionRuleId>`
- `--target-year=<academicYearId>`
- `--memberships=<membershipId1,membershipId2>`

## Apply promotions

Only apply after results are verified.

```bash
cd backend
npm run apply:promotions -- --session=<sessionId> --actor=<userId>
```

Safety guards:

- The script blocks apply when preview items still have `pending` result status.
- The script blocks apply when preview contains `blocked` items.

Override only if you intentionally want that behavior:

- `--allow-pending`
- `--allow-blocked`

## Recommendation

1. Run a backup.
2. Preview promotions.
3. Confirm target year and target class resolution.
4. Apply only after exam marks are final.
