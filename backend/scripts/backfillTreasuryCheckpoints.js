const mongoose = require('mongoose');
require('dotenv').config();

const {
  createTreasuryCheckpoint,
  computeAccountMetricsThrough,
  listActiveTreasuryAccounts
} = require('../services/treasuryCheckpointService');

// Phase 3 of the مرکز مالی دولت review (P9). Creates a per-account treasury
// balance checkpoint so buildTreasuryAnalytics stops folding the whole ledger on
// every call. Safe to re-run: one checkpoint per (account, asOf); a later read
// re-verifies row counts and ignores a checkpoint whose history changed.

const argv = process.argv.slice(2);
const flags = new Map(
  argv
    .filter((item) => item.startsWith('--'))
    .map((item) => {
      const [key, value] = item.replace(/^--/, '').split('=');
      return [key, value === undefined ? true : value];
    })
);
const isDryRun = flags.has('dry-run');
const showHelp = flags.has('help') || flags.has('h');

const getMongoUri = () => process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

function defaultAsOf() {
  // Last moment of the previous calendar month — recent enough that the
  // "since checkpoint" tail still covers the whole open month.
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
}

function printHelp() {
  console.log('Usage: node ./scripts/backfillTreasuryCheckpoints.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --asOf=YYYY-MM-DD      Cut-off date (default: end of last month)');
  console.log('  --financialYearId=ID   Only accounts in this financial year');
  console.log('  --academicYearId=ID    Only accounts in this academic year');
  console.log('  --dry-run              Report what would be written, write nothing');
  console.log('  --help                 Show this help');
}

async function run() {
  if (showHelp) {
    printHelp();
    return;
  }

  const asOfRaw = flags.get('asOf');
  const asOf = asOfRaw ? new Date(`${asOfRaw}T23:59:59.999`) : defaultAsOf();
  if (Number.isNaN(asOf.getTime())) {
    console.error(`Invalid --asOf value: ${asOfRaw}`);
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(getMongoUri());
  try {
    const accounts = await listActiveTreasuryAccounts({
      financialYearId: flags.get('financialYearId') || '',
      academicYearId: flags.get('academicYearId') || ''
    });
    console.log(`[treasury-checkpoints] ${accounts.length} active account(s); asOf ${asOf.toISOString()}${isDryRun ? ' (dry-run)' : ''}`);

    let written = 0;
    for (const account of accounts) {
      const result = isDryRun
        // eslint-disable-next-line no-await-in-loop
        ? await computeAccountMetricsThrough(account, asOf)
        // eslint-disable-next-line no-await-in-loop
        : await createTreasuryCheckpoint({ account, asOf, note: 'backfill' });
      console.log(`  ${account.code || account._id}: bookBalance ${result?.metrics?.bookBalance}`);
      if (!isDryRun) written += 1;
    }

    console.log(`[treasury-checkpoints] ${isDryRun ? `would write ${accounts.length}` : `wrote ${written}`} checkpoint(s).`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[treasury-checkpoints] failed:', error?.message || error);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
