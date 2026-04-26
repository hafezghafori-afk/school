const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const showHelp = args.has('--help') || args.has('-h');

const getMongoUri = () => process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

const normalize = (value) => String(value || '').trim().toLowerCase();

function printHelp() {
  console.log('Usage: node ./scripts/backfillSubjectEmailDuplicates.js [--dry-run]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run   Preview updates without writing to MongoDB');
  console.log('  --help      Show this help message');
}

function shouldClearSubject(user = {}) {
  const email = normalize(user.email);
  const subject = normalize(user.subject);
  if (!email || !subject) return false;
  return subject === email;
}

async function run() {
  if (showHelp) {
    printHelp();
    return;
  }

  await mongoose.connect(getMongoUri());

  try {
    const cursor = User.collection.find({}, {
      projection: {
        email: 1,
        subject: 1,
        orgRole: 1,
        role: 1,
        createdAt: 1
      },
      sort: { createdAt: 1 }
    });

    let scanned = 0;
    let changed = 0;
    const byOrgRole = new Map();
    const samples = [];

    while (await cursor.hasNext()) {
      const user = await cursor.next();
      if (!user) continue;
      scanned += 1;

      if (!shouldClearSubject(user)) continue;

      changed += 1;
      const orgRole = String(user.orgRole || user.role || 'unknown');
      byOrgRole.set(orgRole, (byOrgRole.get(orgRole) || 0) + 1);

      if (samples.length < 20) {
        samples.push({
          email: user.email || String(user._id),
          previousSubject: user.subject || ''
        });
      }

      if (!isDryRun) {
        await User.collection.updateOne(
          { _id: user._id },
          {
            $set: { subject: '' }
          }
        );
      }
    }

    console.log(`[backfill:subject-email-duplicates] scanned=${scanned} changed=${changed} dryRun=${isDryRun}`);

    if (byOrgRole.size) {
      console.log('[backfill:subject-email-duplicates] affected role distribution:');
      Array.from(byOrgRole.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([role, count]) => {
          console.log(` - ${role}: ${count}`);
        });
    }

    if (samples.length) {
      console.log('[backfill:subject-email-duplicates] sample rows:');
      samples.forEach((sample) => {
        console.log(` - ${sample.email}: subject="${sample.previousSubject}" -> ""`);
      });
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[backfill:subject-email-duplicates] failed:', error);
  process.exit(1);
});
