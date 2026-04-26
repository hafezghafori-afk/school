const fs = require('node:fs');
const path = require('node:path');
const { EJSON } = require('bson');
const {
  uploadsDir,
  parseArgs,
  ensureDir,
  getRegisteredModels,
  connectDatabase,
  disconnectDatabase,
  copyDirectory,
  removeDirectory,
  resolveInputDirectory
} = require('./backupRestoreShared');

function getCollectionMap() {
  return new Map(getRegisteredModels().map((item) => [item.collectionName, item]));
}

function readManifest(backupDir) {
  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Backup manifest not found: ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

async function run() {
  const args = parseArgs();
  const backupDir = resolveInputDirectory(args.in);
  const includeDatabase = !args['uploads-only'];
  const includeUploads = !args['db-only'];
  const dryRun = Boolean(args['dry-run']);
  const force = Boolean(args.force);

  if (!backupDir) {
    throw new Error('Provide --in <backup-directory>.');
  }
  if (!includeDatabase && !includeUploads) {
    throw new Error('Choose at least one restore target.');
  }
  if (!dryRun && !force) {
    throw new Error('Restore is destructive. Re-run with --force after validating the backup directory.');
  }

  const manifest = readManifest(backupDir);
  const collectionMap = getCollectionMap();
  const uploadsBackupDir = path.join(backupDir, 'uploads');

  console.log(`Restore directory: ${backupDir}`);
  console.log(`Include database: ${includeDatabase ? 'yes' : 'no'}`);
  console.log(`Include uploads: ${includeUploads ? 'yes' : 'no'}`);

  if (dryRun) {
    console.log(`Collections in manifest: ${(manifest.database?.collections || []).map((item) => item.collection).join(', ')}`);
    console.log(`Uploads present: ${fs.existsSync(uploadsBackupDir) ? 'yes' : 'no'}`);
    console.log('Dry run complete.');
    return;
  }

  try {
    if (includeDatabase) {
      await connectDatabase();
      const collections = manifest.database?.collections || [];

      for (const entry of collections) {
        const registered = collectionMap.get(entry.collection);
        if (!registered) {
          throw new Error(`No model registered for collection "${entry.collection}".`);
        }
        await registered.model.deleteMany({});
        console.log(`CLEAR ${entry.collection}`);
      }

      for (const entry of collections) {
        const registered = collectionMap.get(entry.collection);
        const filePath = path.join(backupDir, entry.file);
        const docs = EJSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (docs.length > 0) {
          await registered.model.collection.insertMany(docs, { ordered: true });
        }
        console.log(`RESTORE ${entry.collection} (${docs.length})`);
      }
    }

    if (includeUploads && fs.existsSync(uploadsBackupDir)) {
      removeDirectory(uploadsDir);
      ensureDir(path.dirname(uploadsDir));
      copyDirectory(uploadsBackupDir, uploadsDir);
      console.log('RESTORE uploads');
    }

    console.log('Restore completed.');
  } finally {
    await disconnectDatabase();
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
