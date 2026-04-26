require('dotenv').config();
const mongoose = require('mongoose');
const { seedExamReferenceData } = require('../services/examEngineService');

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

  await mongoose.connect(mongoUri);
  const summary = await seedExamReferenceData({ dryRun });
  console.log(JSON.stringify({ dryRun, ...summary }, null, 2));
}

run()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
