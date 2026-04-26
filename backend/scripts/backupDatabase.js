const fs = require('node:fs');
const path = require('node:path');
const { EJSON } = require('bson');
const {
  uploadsDir,
  backupRoot,
  parseArgs,
  ensureDir,
  getRegisteredModels,
  getMongoUri,
  connectDatabase,
  disconnectDatabase,
  copyDirectory,
  resolveBackupDirectory,
  writeJsonFile,
  getDatabaseName
} = require('./backupRestoreShared');

function printPlan(backupDir, options, models) {
  console.log(`Backup directory: ${backupDir}`);
  console.log(`Database: ${getDatabaseName(getMongoUri())}`);
  console.log(`Include database: ${options.includeDatabase ? 'yes' : 'no'}`);
  console.log(`Include uploads: ${options.includeUploads ? 'yes' : 'no'}`);
  if (options.includeDatabase) {
    console.log(`Collections: ${models.map((item) => item.collectionName).join(', ')}`);
  }
}

async function run() {
  const args = parseArgs();
  const includeDatabase = !args['uploads-only'];
  const includeUploads = !args['db-only'];
  const dryRun = Boolean(args['dry-run']);
  const backupDir = resolveBackupDirectory(args);
  const models = getRegisteredModels();

  if (!includeDatabase && !includeUploads) {
    throw new Error('Choose at least one backup target.');
  }

  ensureDir(backupRoot);
  printPlan(backupDir, { includeDatabase, includeUploads }, models);
  if (dryRun) {
    console.log('Dry run complete.');
    return;
  }

  ensureDir(backupDir);

  const manifest = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    database: {
      name: getDatabaseName(getMongoUri()),
      included: includeDatabase,
      collections: []
    },
    uploads: {
      included: includeUploads,
      copied: false,
      source: path.relative(path.resolve(__dirname, '..'), uploadsDir).replace(/\\/g, '/')
    }
  };

  try {
    if (includeDatabase) {
      const dataDir = path.join(backupDir, 'database');
      ensureDir(dataDir);
      await connectDatabase();

      for (const item of models) {
        const docs = await item.model.find({}).lean().exec();
        const filePath = path.join(dataDir, `${item.collectionName}.json`);
        fs.writeFileSync(filePath, `${EJSON.stringify(docs, null, 2)}\n`, 'utf8');
        manifest.database.collections.push({
          model: item.name,
          collection: item.collectionName,
          count: docs.length,
          file: `database/${item.collectionName}.json`
        });
        console.log(`BACKUP ${item.collectionName} (${docs.length})`);
      }
    }

    if (includeUploads) {
      const copied = copyDirectory(uploadsDir, path.join(backupDir, 'uploads'));
      manifest.uploads.copied = copied;
      console.log(copied ? 'BACKUP uploads' : 'SKIP uploads (not found)');
    }

    writeJsonFile(path.join(backupDir, 'manifest.json'), manifest);
    console.log(`Backup completed: ${backupDir}`);
  } finally {
    await disconnectDatabase();
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
