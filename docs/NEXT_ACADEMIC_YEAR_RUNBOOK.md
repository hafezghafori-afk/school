# Next Academic Year Bootstrap Runbook

This runbook prepares the target academic year needed by the promotion engine.

## Preview the scaffold plan

```bash
cd backend
npm run preview:next-academic-year
```

Optional flags:

- `--source-year=<id|code|title>`
- `--target-code=<code>`
- `--target-title=<title>`
- `--target-sequence=<number>`

## Apply the scaffold

```bash
cd backend
npm run bootstrap:next-academic-year
```

What it creates:

- a planning `AcademicYear` when the target year does not already exist
- cloned `SchoolClass` rows in `draft` status
- linked academic `Course` rows for those cloned classes

## Recommendation

1. Run backup first.
2. Preview the scaffold.
3. Apply it only when the target year label is correct.
4. Re-run promotion preview after bootstrap.
