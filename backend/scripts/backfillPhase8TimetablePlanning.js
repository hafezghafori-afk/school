require('dotenv').config();
const mongoose = require('mongoose');
const { backfillPhase8TimetablePlanning } = require('../services/timetableService');

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');
  try {
    const summary = await backfillPhase8TimetablePlanning({ dryRun });
    console.log(JSON.stringify({ dryRun, ...summary }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
