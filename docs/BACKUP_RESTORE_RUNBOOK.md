# Backup and Restore Runbook

Last update: 2026-07-22
Owner: Operations / admin

## Scope and format

Application backups use manifest format v2 and contain:

- every raw MongoDB collection, including collections that have no Mongoose model;
- collection options, indexes, views, document counts, and SHA-256 checksums;
- MongoDB Extended JSON files so BSON values survive restore;
- an upload-file inventory with each relative path, byte size, and SHA-256 checksum.

The transient `financemaintenancelocks` collection is deliberately excluded.

## Create a backup

For an application-consistent backup, stop write traffic or enter the application's global maintenance window first. The finance-reset command does this automatically; the general backup command does not acquire a maintenance lock by itself.

From `backend`:

```powershell
npm run backup:plan
npm run backup:create -- --label=pre-release
```

Optional targets:

```powershell
npm run backup:create -- --db-only --label=database-only
npm run backup:create -- --uploads-only --label=uploads-only
npm run backup:create -- --out=C:\durable-backups\school-2026-07-22
```

`manifest.json` is written only after the backup completes. A backup without a v2 manifest whose `completed` value is `true` is not restorable by the safe restore command.

## Verify a backup without connecting to MongoDB

```powershell
npm run backup:restore -- --in=C:\durable-backups\school-2026-07-22 --dry-run
```

The command verifies all requested checksums, counts, collection definitions, paths, and upload inventory. It prints the exact manifest SHA-256. Save that value for the staged restore command.

Use `--db-only` or `--uploads-only` only when that is the intended recovery scope.

## Safe staged restore

The restore command never clears or overwrites the connected/live database and never replaces `backend/uploads`. It restores into:

- a new empty MongoDB database whose name begins with `restore_stage_`;
- a new absolute uploads directory outside the repository.

Example:

```powershell
npm run backup:restore -- `
  --in=C:\durable-backups\school-2026-07-22 `
  --target-database=restore_stage_school_20260722 `
  --uploads-out=C:\durable-restores\school-uploads-20260722 `
  --expected-manifest-sha256=SHA256_FROM_DRY_RUN `
  --confirm=RESTORE_VERIFIED_BACKUP_TO_NEW_TARGET `
  --force
```

Safety behavior:

- a v1 or incomplete manifest is rejected;
- a changed manifest or collection/upload file is rejected;
- a database that is not empty is rejected;
- the source/live database name is rejected as the target;
- an existing uploads output path is rejected;
- a partially written staging database is left quarantined for forensic review and must never be used for cutover; choose a fresh target name for the next attempt.

## Validate and cut over

Do not cut over immediately. First:

1. Start one isolated backend instance pointed to the staged database and staged uploads.
2. Run backend smoke checks and finance integrity checks.
3. Verify student history, open/overdue bills, receipts, reliefs, and attachment downloads.
4. Stop all production write traffic.
5. Take one more v2 backup of the current production state.
6. Switch the production connection/storage configuration to the verified staged targets through the hosting platform's controlled deployment process.
7. Keep the previous database and uploads unchanged until sign-off.

There is intentionally no in-place `--force` restore path in this script. In-place collection-by-collection replacement is not atomic and can leave a live database partially restored if the process or network fails.

## Nightly off-site backups

`.github/workflows/db-backup-nightly.yml` runs every night at 02:00 Kabul time
(and on demand from the Actions tab). It:

1. takes a v2 database backup of every collection (`--db-only`; uploaded files
   live in R2, see `DEPLOYMENT_RUNBOOK.md`);
2. packs and encrypts it (AES-256-GCM, key from `DB_BACKUP_PASSPHRASE`) into one
   `.sbk` file;
3. uploads it to R2 as `db-backups/YYYY/MM/school-db-<timestamp>.sbk`;
4. decrypts that file again and restores it into a throwaway MongoDB inside the
   job, checking every collection's count and digest — a backup that cannot be
   restored fails the run, and GitHub emails the failure;
5. prunes copies older than 30 days, keeping the first copy of each of the last
   12 months.

Setup (once): add these repository secrets under Settings → Secrets and
variables → Actions: `MONGO_URI` (already there), `DB_BACKUP_PASSPHRASE`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`,
`R2_BACKUP_BUCKET_NAME`. The bucket must be private.

**Keep `DB_BACKUP_PASSPHRASE` in a password manager as well.** GitHub never shows
a secret again, and without the passphrase no backup can be read.

Restore from it:

```powershell
cd backend
$env:DB_BACKUP_PASSPHRASE = '<passphrase>'
# with the R2_* variables set: newest copy straight from the bucket
npm run backup:decrypt -- --latest --out=C:\restores\school-latest
# or a file downloaded from the Cloudflare dashboard
npm run backup:decrypt -- --in=C:\Downloads\school-db-2026-10-10T21-30-05Z.sbk --out=C:\restores\school-2026-10-10
npm run backup:restore -- --in=C:\restores\school-2026-10-10 --db-only --dry-run
```

then continue with the safe staged restore above (`--db-only`). `npm run
backup:decrypt -- --list` lists the copies in the bucket. A wrong passphrase, a
damaged or truncated file is refused and leaves nothing behind.

## Retention

- Keep daily backups for at least 7 days.
- Keep weekly backups for at least 4 weeks.
- Keep each pre-release and pre-finance-reset backup until financial sign-off.
- Store at least one copy outside the application host and repository.
