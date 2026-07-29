require('dotenv').config();
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const { ENROLLMENT_SOURCES, inferEnrollmentSource } = require('../utils/enrollmentSource');

const apply = process.argv.includes('--apply');
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db?replicaSet=rs0';

async function run() {
  await mongoose.connect(mongoUri);
  const rows = await Enrollment.find()
    .select('_id registrationSource registrationId notes linkedStudentId')
    .lean();

  const report = {
    mode: apply ? 'apply' : 'dry-run',
    reviewed: rows.length,
    alreadyClassified: 0,
    toManual: 0,
    toOnline: 0,
    updated: 0
  };
  const operations = [];

  rows.forEach((row) => {
    const current = String(row.registrationSource || '').trim();
    const inferred = inferEnrollmentSource(row);
    if (current === inferred) {
      report.alreadyClassified += 1;
      return;
    }
    if (inferred === ENROLLMENT_SOURCES.MANUAL) report.toManual += 1;
    if (inferred === ENROLLMENT_SOURCES.ONLINE) report.toOnline += 1;
    operations.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { registrationSource: inferred } }
      }
    });
  });

  if (apply && operations.length) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const result = await Enrollment.bulkWrite(operations, { session });
        report.updated = Number(result.modifiedCount || 0);
      });
    } finally {
      await session.endSession();
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (!apply) console.log('Dry run only. Re-run with --apply after reviewing the counts.');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
