# Backup and Restore Runbook

Last update: 2026-03-07
Owner: Operations / admin

## Scope

This runbook covers application-level backup and restore for:
- MongoDB content managed through the backend Mongoose models
- uploaded files stored in `backend/uploads/`

Backup output is written to `backend/backups/<timestamp>/`.

## Backup Structure

Each backup directory contains:
- `manifest.json`: backup metadata and collection inventory
- `database/*.json`: one EJSON dump per MongoDB collection
- `uploads/`: copied user-uploaded files when uploads are included

The database dump uses MongoDB Extended JSON so ObjectIds and dates survive restore.

## Pre-Backup Checks

From `backend`:

```bash
npm run backup:plan
npm run test:smoke
npm run audit:security
```

Recommended operator checks before a release backup:
- Confirm `MONGO_URI` points to the intended environment.
- Confirm enough disk space exists under `backend/backups/`.
- Confirm no emergency data migration is running.

## Create a Backup

From `backend`:

```bash
npm run backup:create
```

Optional examples:

```bash
npm run backup:create -- --label pre-release
npm run backup:create -- --db-only
npm run backup:create -- --uploads-only
npm run backup:create -- --out ./backups/manual-2026-03-07
```

Expected result:
- The command prints each collection name and count.
- `manifest.json` is written at the end.
- If `backend/uploads/` exists, it is copied into the backup directory unless `--db-only` is used.

## Restore Safety Rules

Restore is destructive for the targeted collections and upload directory.
Always do this first:
1. Stop backend write traffic.
2. Take a fresh backup of the current state.
3. Validate the target backup directory with a dry run.
4. Confirm the environment and timestamp twice.

## Dry-Run Restore Validation

From `backend`:

```bash
npm run backup:restore -- --in ./backups/<timestamp> --dry-run
```

The dry run prints:
- target backup directory
- whether database and uploads are included
- the collection list from `manifest.json`
- whether `uploads/` exists in the backup

## Restore a Backup

From `backend`:

```bash
npm run backup:restore -- --in ./backups/<timestamp> --force
```

Optional examples:

```bash
npm run backup:restore -- --in ./backups/<timestamp> --force --db-only
npm run backup:restore -- --in ./backups/<timestamp> --force --uploads-only
```

Restore behavior:
- targeted collections are cleared first
- each collection dump is inserted from the backup manifest order
- `backend/uploads/` is replaced when uploads are included

## Post-Restore Validation

After restore, run:

From `backend`:

```bash
npm run test:smoke
npm run check:operations
```

From `frontend`:

```bash
npm run test:smoke
```

Then perform a quick operator check:
- admin login works
- student dashboard loads
- finance center loads pending receipts
- one file-backed page can still open an uploaded attachment

## Retention Guidance

Recommended retention policy:
- keep the latest daily backup for 7 days
- keep the latest weekly backup for 4 weeks
- keep the latest pre-release backup for each production release

## Notes

- Backup directories are ignored by git via `backend/.gitignore`.
- This workflow is application-level; it does not replace infrastructure snapshots if your hosting platform also provides them.
