const {
  backupRoot,
  parseArgs,
  ensureDir,
  getRegisteredModels,
  getMongoUri,
  disconnectDatabase,
  resolveBackupDirectory,
  getDatabaseName
} = require('./backupRestoreShared');
const { createDatabaseBackup } = require('../services/databaseBackupService');

function printPlan(backupDir, options, models) {
  console.log(`Backup directory: ${backupDir}`);
  console.log(`Database: ${getDatabaseName(getMongoUri())}`);
  console.log(`Include database: ${options.includeDatabase ? 'yes' : 'no'}`);
  console.log(`Include uploads: ${options.includeUploads ? 'yes' : 'no'}`);
  if (options.includeDatabase) {
    console.log(`Registered collections (preview only): ${models.map((item) => item.collectionName).join(', ')}`);
  }
}

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
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
    console.log('The actual v2 backup inventories every raw MongoDB collection, including collections without a Mongoose model.');
    console.log('Dry run complete.');
    return;
  }

  try {
    const backup = await createDatabaseBackup({
      backupDir,
      includeDatabase,
      includeUploads,
      log: (message) => console.log(message)
    });
    console.log(`Backup completed: ${backup.backupDir}`);
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { printPlan, run };
