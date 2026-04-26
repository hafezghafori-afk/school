require('dotenv').config();
const mongoose = require('mongoose');
const Timetable = require('../models/Timetable');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildFilter(args = {}) {
  const filter = { source: 'manual' };

  const date = normalizeText(args.date);
  if (date) filter.occurrenceDate = date;

  const classId = normalizeText(args.classId);
  if (classId) filter.classId = classId;

  const teacherAssignmentId = normalizeText(args.teacherAssignmentId);
  if (teacherAssignmentId) filter.teacherAssignmentId = teacherAssignmentId;

  const room = normalizeText(args.room);
  if (room) filter.room = room;

  const status = normalizeText(args.status);
  if (status) filter.status = status;

  return filter;
}

async function run() {
  const args = parseArgs();
  const apply = Boolean(args.apply);
  const limit = Math.max(1, Number(args.limit || 50));
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

  await mongoose.connect(mongoUri);
  try {
    const filter = buildFilter(args);
    const total = await Timetable.countDocuments(filter);
    const sample = await Timetable.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('occurrenceDate dayOfWeek startTime endTime room classId teacherAssignmentId status source')
      .lean();

    console.log('mode=', apply ? 'apply' : 'dry-run');
    console.log('filter=', JSON.stringify(filter));
    console.log('matchCount=', total);
    console.log('sample=', JSON.stringify(sample, null, 2));

    if (!apply) {
      console.log('No deletion performed. Re-run with --apply to delete matched entries.');
      return;
    }

    const result = await Timetable.deleteMany(filter);
    console.log('deletedCount=', result.deletedCount || 0);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
