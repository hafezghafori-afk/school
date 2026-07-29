require('dotenv').config();
const mongoose = require('mongoose');

const AcademicTerm = require('../models/AcademicTerm');
const AcademicYear = require('../models/AcademicYear');
const School = require('../models/School');
const SchoolClass = require('../models/SchoolClass');
const TeacherAssignment = require('../models/TeacherAssignment');

function idOf(value) {
  return value ? String(value._id || value) : '';
}

function classScopeKey(item = {}, academicYearId = '') {
  return [
    idOf(item.schoolId),
    academicYearId,
    Number(item.gradeLevel || 0),
    String(item.section || ''),
    String(item.genderType || ''),
    idOf(item.shiftId)
  ].join('|');
}

function chooseActiveYear(years = []) {
  const current = years.filter((item) => item.isCurrent === true);
  if (current.length === 1) return current[0];
  const active = years.filter((item) => item.isActive === true || item.status === 'active');
  return active.length === 1 ? active[0] : null;
}

async function run() {
  const apply = process.argv.includes('--apply');
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  await mongoose.connect(mongoUri);

  const [schools, years, assignments, classes, terms] = await Promise.all([
    School.find({}).lean(),
    AcademicYear.find({}).lean(),
    TeacherAssignment.find({ status: 'active' }).lean(),
    SchoolClass.find({}).lean(),
    AcademicTerm.find({}).lean()
  ]);

  const validSchoolIds = new Set(schools.map((item) => idOf(item)));
  const validYearIds = new Set(years.map((item) => idOf(item)));
  const yearById = new Map(years.map((item) => [idOf(item), item]));
  const classById = new Map(classes.map((item) => [idOf(item), item]));
  const termById = new Map(terms.map((item) => [idOf(item), item]));
  const yearsBySchool = new Map();
  years.forEach((year) => {
    const schoolId = idOf(year.schoolId);
    yearsBySchool.set(schoolId, [...(yearsBySchool.get(schoolId) || []), year]);
  });

  const contexts = [];
  const unresolved = [];
  for (const assignment of assignments) {
    const assignmentId = idOf(assignment);
    const assignmentSchoolId = idOf(assignment.schoolId);
    const schoolClass = classById.get(idOf(assignment.classId)) || null;
    const term = termById.get(idOf(assignment.termId)) || null;
    if (!schoolClass) {
      unresolved.push({ assignmentId, reason: 'class_not_found' });
      continue;
    }

    const classSchoolId = idOf(schoolClass.schoolId);
    const assignmentSchoolIsValid = validSchoolIds.has(assignmentSchoolId);
    const classSchoolIsValid = validSchoolIds.has(classSchoolId);
    if (!classSchoolIsValid) {
      unresolved.push({ assignmentId, classId: idOf(schoolClass), reason: 'class_school_not_found' });
      continue;
    }
    if (assignmentSchoolIsValid && assignmentSchoolId !== classSchoolId) {
      unresolved.push({ assignmentId, classId: idOf(schoolClass), reason: 'assignment_class_school_mismatch' });
      continue;
    }

    const targetSchoolId = classSchoolId;
    const rawAssignmentYearId = idOf(assignment.academicYearId);
    const rawClassYearId = idOf(schoolClass.academicYearId);
    const rawTermYearId = idOf(term?.academicYearId);
    const assignmentYear = yearById.get(rawAssignmentYearId) || null;
    const classYear = yearById.get(rawClassYearId) || null;
    const termYear = yearById.get(rawTermYearId) || null;
    const assignmentYearId = assignmentYear && idOf(assignmentYear.schoolId) === targetSchoolId ? rawAssignmentYearId : '';
    const classYearId = classYear && idOf(classYear.schoolId) === targetSchoolId ? rawClassYearId : '';
    const termYearId = termYear && idOf(termYear.schoolId) === targetSchoolId ? rawTermYearId : '';
    if (assignmentYearId && classYearId && assignmentYearId !== classYearId) {
      unresolved.push({ assignmentId, classId: idOf(schoolClass), reason: 'valid_years_disagree' });
      continue;
    }

    const fallbackYear = chooseActiveYear(yearsBySchool.get(targetSchoolId) || []);
    const targetYearId = assignmentYearId || classYearId || termYearId || idOf(fallbackYear);
    if (!targetYearId) {
      unresolved.push({ assignmentId, classId: idOf(schoolClass), reason: 'single_active_year_not_found' });
      continue;
    }

    contexts.push({
      assignment,
      schoolClass,
      targetYearId,
      targetSchoolId,
      assignmentSchoolNeedsUpdate: assignmentSchoolId !== targetSchoolId,
      assignmentNeedsUpdate: assignmentYearId !== targetYearId,
      classNeedsUpdate: classYearId !== targetYearId
    });
  }

  const blockedClassIds = new Set();
  const requestedYearByClass = new Map();
  contexts.forEach((context) => {
    const classId = idOf(context.schoolClass);
    const requestedYearId = requestedYearByClass.get(classId);
    if (requestedYearId && requestedYearId !== context.targetYearId) {
      blockedClassIds.add(classId);
      unresolved.push({ classId, reason: 'class_has_multiple_target_years' });
    } else {
      requestedYearByClass.set(classId, context.targetYearId);
    }
  });

  const occupiedClassScopes = new Map();
  classes.forEach((item) => {
    const yearId = validYearIds.has(idOf(item.academicYearId)) ? idOf(item.academicYearId) : '';
    if (yearId) occupiedClassScopes.set(classScopeKey(item, yearId), idOf(item));
  });
  const plannedClassScopes = new Map();
  contexts.forEach((context) => {
    if (!context.classNeedsUpdate) return;
    const classId = idOf(context.schoolClass);
    const targetScope = classScopeKey(context.schoolClass, context.targetYearId);
    const occupiedBy = occupiedClassScopes.get(targetScope);
    const plannedBy = plannedClassScopes.get(targetScope);
    if ((occupiedBy && occupiedBy !== classId) || (plannedBy && plannedBy !== classId)) {
      blockedClassIds.add(classId);
      unresolved.push({ classId, targetYearId: context.targetYearId, reason: 'class_unique_scope_conflict' });
      return;
    }
    plannedClassScopes.set(targetScope, classId);
  });

  const applicableContexts = contexts.filter((context) => !blockedClassIds.has(idOf(context.schoolClass)));
  const assignmentUpdates = applicableContexts
    .filter((context) => context.assignmentNeedsUpdate || context.assignmentSchoolNeedsUpdate)
    .map((context) => ({
      updateOne: {
        filter: { _id: context.assignment._id, status: 'active' },
        update: { $set: { academicYearId: context.targetYearId, schoolId: context.targetSchoolId } }
      }
    }));
  const classUpdatesById = new Map();
  applicableContexts
    .filter((context) => context.classNeedsUpdate)
    .forEach((context) => classUpdatesById.set(idOf(context.schoolClass), {
      updateOne: {
        filter: { _id: context.schoolClass._id },
        update: { $set: { academicYearId: context.targetYearId } }
      }
    }));
  const classUpdates = [...classUpdatesById.values()];

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    activeAssignmentsReviewed: assignments.length,
    assignmentRecordsToUpdate: assignmentUpdates.length,
    assignmentYearsToUpdate: applicableContexts.filter((context) => context.assignmentNeedsUpdate).length,
    assignmentSchoolsToUpdate: applicableContexts.filter((context) => context.assignmentSchoolNeedsUpdate).length,
    classYearsToUpdate: classUpdates.length,
    unresolvedItems: unresolved.length,
    unresolved
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    console.log('Dry run only. Re-run with --apply after reviewing the counts.');
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (classUpdates.length) await SchoolClass.bulkWrite(classUpdates, { session });
      if (assignmentUpdates.length) await TeacherAssignment.bulkWrite(assignmentUpdates, { session });
    });
  } finally {
    await session.endSession();
  }

  console.log(JSON.stringify({
    ...summary,
    classesUpdated: classUpdates.length,
    assignmentsUpdated: assignmentUpdates.length
  }, null, 2));
}

run()
  .catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
