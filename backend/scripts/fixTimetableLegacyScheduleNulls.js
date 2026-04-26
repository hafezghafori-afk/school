require('dotenv').config();
const mongoose = require('mongoose');
const Timetable = require('../models/Timetable');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');
  try {
    const before = await Timetable.countDocuments({ legacyScheduleId: null });
    const result = await Timetable.updateMany(
      { legacyScheduleId: null },
      { $unset: { legacyScheduleId: 1 } }
    );
    const after = await Timetable.countDocuments({ legacyScheduleId: null });

    console.log({
      before,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      after
    });
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
