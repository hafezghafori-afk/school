require('dotenv').config();

const mongoose = require('mongoose');
const AfghanSchool = require('../models/AfghanSchool');
const Shift = require('../models/Shift');
const SchoolShift = require('../models/SchoolShift');
require('../models/School');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
const DEFAULT_SCHOOL_ID = 'default-school-id';
const LEGACY_SINGLE_SCHOOL_ID = '000000000000000000000001';

const SCHOOL_ID_COLLECTIONS = [
  'academicyears',
  'academicterms',
  'schoolclasses',
  'subjects',
  'curriculumrules',
  'teacherassignments',
  'teacheravailabilities',
  'timetableconfigurations',
  'timetableentries',
  'dailytimetableboarddrafts',
  'schoolweekconfigs',
  'financialyears',
  'expenseentries',
  'financetreasuryaccounts',
  'financetreasurytransactions',
  'financeprocurementcommitments',
  'governmentfinancesnapshots'
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { apply: false, targetSchoolId: '', deleteOtherSchools: false };
  for (const arg of args) {
    if (arg === '--apply') options.apply = true;
    if (arg === '--dry-run') options.apply = false;
    if (arg === '--delete-other-schools') options.deleteOtherSchools = true;
    if (arg.startsWith('--target-school-id=')) {
      options.targetSchoolId = arg.slice('--target-school-id='.length).trim();
    }
  }
  return options;
}

function id(value) {
  return String(value || '').trim();
}

function isPlaceholder(value) {
  const normalized = id(value);
  return !normalized || normalized === DEFAULT_SCHOOL_ID || normalized === LEGACY_SINGLE_SCHOOL_ID;
}

function toMongoIdValue(value) {
  const normalized = id(value);
  return mongoose.Types.ObjectId.isValid(normalized)
    ? new mongoose.Types.ObjectId(normalized)
    : normalized;
}

async function collectionExists(db, name) {
  return (await db.listCollections({ name }).toArray()).length > 0;
}

async function countScopeProblems(db, name, validSchoolIds) {
  if (!(await collectionExists(db, name))) {
    return { collection: name, exists: false, total: 0, needsTarget: 0, orphanIds: [] };
  }
  const col = db.collection(name);
  const values = (await col.distinct('schoolId')).filter(Boolean).map(id);
  const orphanIds = values.filter((value) => isPlaceholder(value) || !validSchoolIds.has(value));
  const orphanValues = orphanIds.map(toMongoIdValue);
  const needsTarget = await col.countDocuments({
    $or: [
      { schoolId: { $exists: false } },
      { schoolId: null },
      { schoolId: { $in: orphanValues } }
    ]
  });
  return {
    collection: name,
    exists: true,
    total: await col.countDocuments({}),
    needsTarget,
    orphanIds
  };
}

async function setCollectionSchoolId(db, name, targetSchoolId, orphanIds, apply) {
  if (!(await collectionExists(db, name))) return { collection: name, matched: 0, modified: 0 };
  const orphanValues = orphanIds.map(toMongoIdValue);
  const query = {
    $or: [
      { schoolId: { $exists: false } },
      { schoolId: null },
      { schoolId: { $in: orphanValues } }
    ]
  };
  const matched = await db.collection(name).countDocuments(query);
  if (!apply || !matched) return { collection: name, matched, modified: 0 };
  const result = await db.collection(name).updateMany(query, { $set: { schoolId: toMongoIdValue(targetSchoolId) } });
  return { collection: name, matched, modified: result.modifiedCount || 0 };
}

async function syncLegacySchoolShifts(targetSchoolId, validSchoolIds, apply) {
  const legacyItems = await SchoolShift.find({
    $or: [
      { schoolId: targetSchoolId },
      { schoolId: { $in: [...validSchoolIds].filter((schoolId) => schoolId !== targetSchoolId).map(toMongoIdValue) } },
      { schoolId: LEGACY_SINGLE_SCHOOL_ID }
    ]
  }).lean();
  const allSchoolShiftIds = (await SchoolShift.distinct('schoolId')).filter(Boolean).map(id);
  const orphanSchoolShiftIds = allSchoolShiftIds.filter((value) => isPlaceholder(value) || !validSchoolIds.has(value));
  const orphanItems = orphanSchoolShiftIds.length
    ? await SchoolShift.find({ schoolId: { $in: orphanSchoolShiftIds.map(toMongoIdValue) } }).lean()
    : [];
  const shiftItems = await Shift.find({}).lean();

  const items = [...legacyItems, ...orphanItems, ...shiftItems];
  const shiftMap = new Map();
  const report = [];

  for (const item of items) {
    const rawCode = id(item.code || item.name || `shift-${item._id}`).toLowerCase();
    const rawName = id(item.name || item.nameDari || rawCode).toLowerCase();
    const name = rawCode.includes('after') || rawCode.includes('aft') || rawName.includes('بعد') || rawName.includes('afternoon')
      ? 'afternoon'
      : rawCode.includes('even') || rawName.includes('شب') || rawName.includes('evening')
        ? 'evening'
        : 'morning';
    const code = name;
    let shift = await Shift.findOne({ schoolId: targetSchoolId, code });
    if (!shift && apply) {
      shift = await Shift.create({
        schoolId: targetSchoolId,
        name,
        nameDari: item.name || code,
        namePashto: item.name || code,
        code,
        startTime: item.startTime || '08:00',
        endTime: item.endTime || '12:00',
        isActive: item.isActive !== false
      });
    }
    if (shift?._id) shiftMap.set(id(item._id), id(shift._id));
    report.push({
      schoolShiftId: id(item._id),
      code,
      action: shift ? 'mapped-to-shift' : apply ? 'create-failed' : 'would-create-shift',
      shiftId: shift?._id ? id(shift._id) : ''
    });
  }

  if (apply && shiftMap.size) {
    for (const [fromShiftId, toShiftId] of shiftMap.entries()) {
      for (const collection of ['schoolclasses', 'teacherassignments', 'teacheravailabilities', 'timetableconfigurations', 'timetableentries', 'curriculumrules']) {
        await mongoose.connection.db.collection(collection).updateMany(
          { shiftId: new mongoose.Types.ObjectId(fromShiftId) },
          { $set: { shiftId: new mongoose.Types.ObjectId(toShiftId) } }
        );
      }
    }

    await Shift.deleteMany({
      _id: { $nin: [...new Set([...shiftMap.values()].map((value) => new mongoose.Types.ObjectId(value)))] }
    });
    await SchoolShift.deleteMany({});
  }

  return { report, mappedShiftCount: shiftMap.size };
}

async function consolidateAfghanPeopleAndSchools(targetSchoolId, apply, deleteOtherSchools) {
  const otherSchoolIds = (await AfghanSchool.distinct('_id'))
    .map(id)
    .filter((schoolId) => schoolId !== targetSchoolId);
  const otherSchoolValues = otherSchoolIds.map(toMongoIdValue);
  const db = mongoose.connection.db;
  const studentQuery = { 'academicInfo.currentSchool': { $in: otherSchoolValues } };
  const teacherQuery = { 'employmentInfo.currentSchool': { $in: otherSchoolValues } };
  const studentMatched = await db.collection('afghanstudents').countDocuments(studentQuery);
  const teacherMatched = await db.collection('afghanteachers').countDocuments(teacherQuery);
  const schoolMatched = otherSchoolValues.length
    ? await db.collection('afghanschools').countDocuments({ _id: { $in: otherSchoolValues } })
    : 0;

  const report = {
    otherSchoolIds,
    studentsToMove: studentMatched,
    teachersToMove: teacherMatched,
    schoolsToDelete: deleteOtherSchools ? schoolMatched : 0,
    modified: {
      students: 0,
      teachers: 0,
      deletedSchools: 0
    }
  };

  if (!apply) return report;

  if (studentMatched) {
    const result = await db.collection('afghanstudents').updateMany(studentQuery, {
      $set: { 'academicInfo.currentSchool': new mongoose.Types.ObjectId(targetSchoolId) }
    });
    report.modified.students = result.modifiedCount || 0;
  }
  if (teacherMatched) {
    const result = await db.collection('afghanteachers').updateMany(teacherQuery, {
      $set: { 'employmentInfo.currentSchool': new mongoose.Types.ObjectId(targetSchoolId) }
    });
    report.modified.teachers = result.modifiedCount || 0;
  }
  if (deleteOtherSchools && otherSchoolValues.length) {
    const result = await db.collection('afghanschools').deleteMany({ _id: { $in: otherSchoolValues } });
    report.modified.deletedSchools = result.deletedCount || 0;
  }

  return report;
}

async function repairShiftIndexes(db, apply) {
  const exists = await collectionExists(db, 'shifts');
  if (!exists) return { checked: false };
  const indexes = await db.collection('shifts').indexes();
  const hasGlobalCodeIndex = indexes.some((item) => item.name === 'code_1' && item.unique);
  const hasScopedCodeIndex = indexes.some((item) => (
    item.unique && item.key?.schoolId === 1 && item.key?.code === 1
  ));

  if (apply && hasGlobalCodeIndex) {
    await db.collection('shifts').dropIndex('code_1');
  }
  if (apply && !hasScopedCodeIndex) {
    await db.collection('shifts').createIndex({ schoolId: 1, code: 1 }, {
      unique: true,
      background: true,
      name: 'schoolId_1_code_1'
    });
  }

  return {
    checked: true,
    hasGlobalCodeIndex,
    hasScopedCodeIndex,
    actions: {
      dropGlobalCodeIndex: Boolean(hasGlobalCodeIndex),
      createScopedCodeIndex: Boolean(!hasScopedCodeIndex)
    }
  };
}

async function main() {
  const options = parseArgs();
  if (!mongoose.Types.ObjectId.isValid(options.targetSchoolId)) {
    throw new Error('Usage: node scripts/migrateSchoolScope.js --target-school-id=<AfghanSchool ObjectId> [--apply]');
  }

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const targetSchool = await AfghanSchool.findById(options.targetSchoolId).lean();
  if (!targetSchool) throw new Error(`Target AfghanSchool not found: ${options.targetSchoolId}`);

  const validSchoolIds = new Set((await AfghanSchool.distinct('_id')).map(id));
  const scopeReport = [];
  const updateReport = [];

  for (const collection of SCHOOL_ID_COLLECTIONS) {
    const report = await countScopeProblems(db, collection, validSchoolIds);
    scopeReport.push(report);
    updateReport.push(await setCollectionSchoolId(db, collection, options.targetSchoolId, report.orphanIds, options.apply));
  }

  const shiftIndexReport = await repairShiftIndexes(db, options.apply);
  const shiftReport = await syncLegacySchoolShifts(options.targetSchoolId, validSchoolIds, options.apply);
  const peopleAndSchoolReport = await consolidateAfghanPeopleAndSchools(
    options.targetSchoolId,
    options.apply,
    options.deleteOtherSchools
  );

  console.log(JSON.stringify({
    mode: options.apply ? 'apply' : 'dry-run',
    targetSchool: {
      id: id(targetSchool._id),
      name: targetSchool.nameDari || targetSchool.name || '',
      code: targetSchool.schoolCode || ''
    },
    scopeReport,
    updateReport,
    shiftIndexReport,
    shiftReport,
    peopleAndSchoolReport
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message || error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
