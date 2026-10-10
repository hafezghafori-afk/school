/**
 * Turns an encrypted off-site backup (.sbk, from scripts/offsiteBackup.js) back
 * into an ordinary v2 backup directory that `npm run backup:restore` accepts.
 *
 * Usage (from backend/), with DB_BACKUP_PASSPHRASE set:
 *   node scripts/decryptOffsiteBackup.js --in=C:\Downloads\school-db-....sbk --out=C:\restores\school-2026-10-10
 *   node scripts/decryptOffsiteBackup.js --latest --out=C:\restores\latest     (downloads from R2; needs R2_* too)
 *   node scripts/decryptOffsiteBackup.js --key=db-backups/2026/10/school-db-....sbk --out=...
 *   node scripts/decryptOffsiteBackup.js --list                                 (lists the copies in R2)
 *
 * Then check it and restore into a NEW database (never over the live one):
 *   npm run backup:restore -- --in=<out dir> --db-only --dry-run
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs } = require('./backupRestoreShared');
const { verifyDatabaseBackup } = require('../services/databaseBackupService');
const offsite = require('../services/offsiteBackupService');

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.list) {
    const objects = await offsite.listBackupObjects(offsite.getBackupR2());
    if (!objects.length) console.log('No backups in the bucket yet.');
    objects.forEach((item) => console.log(`${item.key}  ${(item.size / (1024 * 1024)).toFixed(1)} MB`));
    return;
  }

  const outDir = String(args.out || '').trim();
  if (!outDir) throw new Error('Pass --out=<new directory>.');
  const passphrase = process.env.DB_BACKUP_PASSPHRASE || '';
  if (!passphrase) throw new Error('Set DB_BACKUP_PASSPHRASE (the one stored with the GitHub secrets).');

  let inFile = String(args.in || '').trim();
  let downloadDir = '';
  if (!inFile) {
    const r2 = offsite.getBackupR2();
    let key = String(args.key || '').trim();
    if (!key && args.latest) {
      const objects = await offsite.listBackupObjects(r2);
      key = objects.length ? objects[objects.length - 1].key : '';
      if (!key) throw new Error('No backups in the bucket yet.');
    }
    if (!key) throw new Error('Pass --in=<file.sbk>, --key=<bucket key> or --latest.');
    downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-db-restore-'));
    inFile = path.join(downloadDir, path.basename(key));
    console.log(`downloading ${key}`);
    await offsite.downloadBackupFile(r2, key, inFile);
  }

  try {
    const { outDir: written, files } = await offsite.decryptToDirectory({ inFile, outDir, passphrase });
    const verification = verifyDatabaseBackup({ backupDir: written, requireUploads: false });
    console.log(`decrypted ${files.length} files into ${written}`);
    console.log(`verified: ${verification.collections} collections, manifest sha256 ${verification.manifestSha256}`);
    console.log(`next: npm run backup:restore -- --in="${written}" --db-only --dry-run`);
  } finally {
    if (downloadDir) fs.rmSync(downloadDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { run };
