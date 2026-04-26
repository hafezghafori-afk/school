const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Order = require('../models/Order');
const StudentMembership = require('../models/StudentMembership');

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const showHelp = args.has('--help') || args.has('-h');

const getMongoUri = () => process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

function printHelp() {
  console.log('Usage: node ./scripts/backfillStudentStatusesFromMemberships.js [--dry-run]');
  console.log('');
  console.log('Marks student users without any current membership or approved order as inactive.');
}

async function buildAcademicStudentSet() {
  const [membershipStudents, approvedOrderStudents] = await Promise.all([
    StudentMembership.distinct('student', { isCurrent: true }),
    Order.distinct('user', { status: 'approved' })
  ]);

  return new Set(
    [...membershipStudents, ...approvedOrderStudents]
      .filter(Boolean)
      .map((value) => String(value))
  );
}

async function run() {
  if (showHelp) {
    printHelp();
    return;
  }

  await mongoose.connect(getMongoUri());

  try {
    const academicStudentIds = await buildAcademicStudentSet();
    const cursor = User.collection.find(
      { role: 'student', status: 'active' },
      { projection: { email: 1, name: 1, role: 1, status: 1, createdAt: 1 }, sort: { createdAt: 1 } }
    );

    let scanned = 0;
    let changed = 0;
    const samples = [];

    while (await cursor.hasNext()) {
      const user = await cursor.next();
      if (!user) continue;
      scanned += 1;

      if (academicStudentIds.has(String(user._id))) continue;
      changed += 1;
      if (samples.length < 20) {
        samples.push({ email: user.email || String(user._id), patch: { status: 'inactive' } });
      }

      if (!isDryRun) {
        await User.collection.updateOne({ _id: user._id }, { $set: { status: 'inactive' } });
      }
    }

    console.log(`[backfill:student-statuses] scanned=${scanned} changed=${changed} dryRun=${isDryRun}`);
    if (samples.length) {
      console.log('[backfill:student-statuses] sample updates:');
      samples.forEach((sample) => {
        console.log(` - ${sample.email}: ${JSON.stringify(sample.patch)}`);
      });
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[backfill:student-statuses] failed:', error);
  process.exit(1);
});
