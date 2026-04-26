require('dotenv').config();

const mongoose = require('mongoose');
const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const FinancialYear = require('../models/FinancialYear');
const { formatAfghanStoredDateLabel } = require('../utils/afghanDate');

const getMongoUri = () => process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

async function backfillCollection(Model, label) {
  const items = await Model.find({
    $or: [
      { startDate: { $ne: null } },
      { endDate: { $ne: null } }
    ]
  });

  let updated = 0;
  for (const item of items) {
    const nextStart = item.startDate ? formatAfghanStoredDateLabel(item.startDate) : '';
    const nextEnd = item.endDate ? formatAfghanStoredDateLabel(item.endDate) : '';
    const currentStart = String(item.startDateLocal || '').trim();
    const currentEnd = String(item.endDateLocal || '').trim();

    if (nextStart === currentStart && nextEnd === currentEnd) {
      continue;
    }

    item.startDateLocal = nextStart;
    item.endDateLocal = nextEnd;
    await item.save();
    updated += 1;
  }

  console.log(`${label}: ${updated} رکورد بروزرسانی شد.`);
}

async function main() {
  await mongoose.connect(getMongoUri());
  try {
    await backfillCollection(AcademicYear, 'AcademicYear');
    await backfillCollection(AcademicTerm, 'AcademicTerm');
    await backfillCollection(FinancialYear, 'FinancialYear');
    console.log('Afghan local date backfill completed.');
  } finally {
    await mongoose.connection.close();
  }
}

main().catch((error) => {
  console.error('Afghan local date backfill failed:', error);
  process.exitCode = 1;
});
