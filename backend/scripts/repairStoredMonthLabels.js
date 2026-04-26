require('dotenv').config();

const mongoose = require('mongoose');
const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const FinancialYear = require('../models/FinancialYear');
const FeeOrder = require('../models/FeeOrder');
const FinanceBill = require('../models/FinanceBill');
const {
  formatAfghanMonthYearLabel,
  formatAfghanStoredDateLabel,
  replaceIranianSolarMonthNames
} = require('../utils/afghanDate');

const getMongoUri = () => process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

async function backfillLocalDateLabels(Model, label) {
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

    if (nextStart === currentStart && nextEnd === currentEnd) continue;

    item.startDateLocal = nextStart;
    item.endDateLocal = nextEnd;
    await item.save();
    updated += 1;
  }

  return { label, updated };
}

async function backfillMonthlyPeriodLabels(Model, label) {
  const items = await Model.find({
    periodType: 'monthly',
    dueDate: { $ne: null }
  });

  let updated = 0;
  for (const item of items) {
    const nextLabel = formatAfghanMonthYearLabel(item.dueDate);
    const currentLabel = replaceIranianSolarMonthNames(String(item.periodLabel || '').trim());

    if (currentLabel === nextLabel) {
      if (String(item.periodLabel || '').trim() !== currentLabel) {
        item.periodLabel = currentLabel;
        await item.save();
        updated += 1;
      }
      continue;
    }

    item.periodLabel = nextLabel;
    await item.save();
    updated += 1;
  }

  return { label, updated };
}

async function main() {
  await mongoose.connect(getMongoUri());
  try {
    const results = [];
    results.push(await backfillLocalDateLabels(AcademicYear, 'AcademicYear local dates'));
    results.push(await backfillLocalDateLabels(AcademicTerm, 'AcademicTerm local dates'));
    results.push(await backfillLocalDateLabels(FinancialYear, 'FinancialYear local dates'));
    results.push(await backfillMonthlyPeriodLabels(FeeOrder, 'FeeOrder monthly labels'));
    results.push(await backfillMonthlyPeriodLabels(FinanceBill, 'FinanceBill monthly labels'));

    results.forEach((entry) => {
      console.log(`${entry.label}: ${entry.updated} رکورد بروزرسانی شد.`);
    });
  } finally {
    await mongoose.connection.close();
  }
}

main().catch((error) => {
  console.error('Month label repair failed:', error);
  process.exitCode = 1;
});
