# Exam Session Bootstrap Runbook

This runbook provides a safe operational path to create the first live `ExamSession`
and roster without inserting ad-hoc data directly in MongoDB.

## Goal

Use canonical references from:

- `AcademicYear`
- `AcademicTerm`
- `SchoolClass`
- `ExamType`
- optional `Subject`
- optional `TeacherAssignment`

The bootstrap script defaults to preview mode. It only writes data when `--apply`
is passed.

## Preview first

```bash
cd backend
npm run preview:exam-session-bootstrap
```

You can scope the preview explicitly:

```bash
cd backend
npm run preview:exam-session-bootstrap -- --academic-year=1406 --class="Class 10 A" --exam-type=ANNUAL --period=1406-T1
```

Useful flags:

- `--academic-year=<id|code|title>`
- `--period=<id|code|title>`
- `--class=<id|code|title>`
- `--exam-type=<id|code|title>`
- `--subject=<id|code|name>`
- `--teacher-assignment=<id>`
- `--status=<draft|published|closed>`
- `--held-at=<ISO date>`
- `--published-at=<ISO date>`
- `--total-mark=<number>`
- `--pass-mark=<number>`
- `--conditional-mark=<number>`
- `--weight=<number>`
- `--skip-roster`
- `--allow-empty-roster`

## Apply when preview is clean

```bash
cd backend
npm run bootstrap:exam-session -- --academic-year=1406 --class="Class 10 A" --exam-type=ANNUAL --period=1406-T1
```

If you want to create the session but postpone roster initialization:

```bash
cd backend
npm run bootstrap:exam-session -- --academic-year=1406 --class="Class 10 A" --exam-type=ANNUAL --period=1406-T1 --skip-roster
```

## Behavior

- Preview resolves canonical references and runs `previewExamSessionBootstrap`.
- Apply runs the same preview first.
- Apply refuses to create an empty live roster unless you explicitly pass `--skip-roster`
  or `--allow-empty-roster`.
- Duplicate session scope is blocked by the exam engine.

## Recommended order

1. Run a database backup.
2. Run preview and confirm `canBootstrap = true`.
3. Apply the session bootstrap.
4. Start mark entry through the canonical exam routes/UI.
5. Recompute results and then test promotion preview.
