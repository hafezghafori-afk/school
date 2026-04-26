require('dotenv').config();
const mongoose = require('mongoose');
const { seedResultTableReferenceData } = require('../services/resultTableService');

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');
  const summary = await seedResultTableReferenceData({ dryRun });
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
