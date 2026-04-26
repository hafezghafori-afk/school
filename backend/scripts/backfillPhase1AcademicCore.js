const mongoose = require('mongoose');
require('dotenv').config();

const AcademicTerm = require('../models/AcademicTerm');
const AcademicYear = require('../models/AcademicYear');
const Course = require('../models/Course');
const FinanceBill = require('../models/FinanceBill');
const FinanceFeePlan = require('../models/FinanceFeePlan');
const InstructorSubject = require('../models/InstructorSubject');
const SchoolClass = require('../models/SchoolClass');
const Schedule = require('../models/Schedule');
const StudentCore = require('../models/StudentCore');
const StudentMembership = require('../models/StudentMembership');
const StudentProfile = require('../models/StudentProfile');
const Subject = require('../models/Subject');
const TeacherAssignment = require('../models/TeacherAssignment');
const User = require('../models/User');

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

function trimText(value = '') {
  return String(value || '').trim();
}

function idsEqual(left, right) {
  return String(left || '') === String(right || '');
}

function patchValue(target, key, value) {
  if (value === undefined) return false;
  if (value === null) {
    if (target[key] !== null) {
      target[key] = null;
      return true;
    }
    return false;
  }
  if (target[key] instanceof Date && value instanceof Date) {
    if (target[key].getTime() !== value.getTime()) {
      target[key] = value;
      return true;
    }
    return false;
  }
  if (!idsEqual(target[key], value) && target[key] !== value) {
    target[key] = value;
    return true;
  }
  return false;
}

function numericValue(value = '') {
  const text = trimText(value);
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function pushSignal(map, key, rawValue) {
  const normalizedKey = trimText(key);
  const normalizedValue = trimText(rawValue);
  if (!normalizedKey || !normalizedValue) return;
  if (!map.has(normalizedKey)) map.set(normalizedKey, new Set());
  map.get(normalizedKey).add(normalizedValue);
}

function resolveAcademicYearByText(yearByText, value) {
  return yearByText.get(trimText(value)) || null;
}

async function run() {
  const args = parseArgs();
  const dryRun = Boolean(args['dry-run']);
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

  await mongoose.connect(mongoUri);

  const stats = {
    academicYearsCreated: 0,
    academicYearsActivated: 0,
    schoolClassesCreated: 0,
    schoolClassesYearAssigned: 0,
    coursesLinkedToSchoolClass: 0,
    coursesYearAssigned: 0,
    studentCoresCreated: 0,
    studentProfilesCreated: 0,
    membershipsUpdated: 0,
    subjectsCreated: 0,
    schedulesUpdated: 0,
    teacherAssignmentsCreated: 0,
    unresolvedSchoolClasses: 0
  };

  try {
    const legacyYearTitles = new Set();
    (await FinanceBill.distinct('academicYear')).forEach((value) => {
      const normalized = trimText(value);
      if (normalized) legacyYearTitles.add(normalized);
    });
    (await FinanceFeePlan.distinct('academicYear')).forEach((value) => {
      const normalized = trimText(value);
      if (normalized) legacyYearTitles.add(normalized);
    });

    const academicYears = await AcademicYear.find({});
    const academicYearByTitle = new Map(academicYears.map((item) => [trimText(item.title), item]));

    for (const title of Array.from(legacyYearTitles).sort()) {
      let item = academicYearByTitle.get(title);
      if (!item) {
        item = new AcademicYear({
          title,
          code: title,
          sequence: numericValue(title),
          status: 'planning',
          note: 'backfilled_from_legacy_string'
        });
        stats.academicYearsCreated += 1;
        if (!dryRun) await item.save();
        academicYears.push(item);
        academicYearByTitle.set(title, item);
      }
    }

    let activeAcademicYear = academicYears.find((item) => item.isActive) || null;
    if (!activeAcademicYear && academicYears.length) {
      const sortedYears = [...academicYears].sort((left, right) => {
        const seqDiff = (right.sequence || numericValue(right.code || right.title))
          - (left.sequence || numericValue(left.code || left.title));
        if (seqDiff !== 0) return seqDiff;
        return trimText(right.code || right.title).localeCompare(trimText(left.code || left.title));
      });
      activeAcademicYear = sortedYears[0] || null;
      if (activeAcademicYear) {
        activeAcademicYear.isActive = true;
        activeAcademicYear.status = 'active';
        stats.academicYearsActivated += 1;
        if (!dryRun) await activeAcademicYear.save();
      }
    }

    const yearByText = new Map();
    academicYears.forEach((item) => {
      yearByText.set(trimText(item.title), item);
      if (trimText(item.code)) yearByText.set(trimText(item.code), item);
    });

    const courseYearSignals = new Map();
    const bills = await FinanceBill.find({}).select('course academicYear');
    bills.forEach((item) => pushSignal(courseYearSignals, item.course, item.academicYear));
    const feePlans = await FinanceFeePlan.find({}).select('course academicYear');
    feePlans.forEach((item) => pushSignal(courseYearSignals, item.course, item.academicYear));

    const academicCourses = await Course.find({ kind: 'academic_class' });
    const schoolClasses = await SchoolClass.find({});
    const schoolClassByCourseId = new Map();
    schoolClasses.forEach((item) => {
      schoolClassByCourseId.set(String(item.legacyCourseId || ''), item);
    });

    for (const course of academicCourses) {
      let schoolClass = schoolClassByCourseId.get(String(course._id));
      if (!schoolClass) {
        schoolClass = new SchoolClass({
          title: trimText(course.title),
          academicYearId: course.academicYearRef || null,
          legacyCourseId: course._id,
          gradeLevel: trimText(course.gradeLevel || course.category),
          section: trimText(course.section),
          status: course.isActive ? 'active' : 'archived',
          homeroomTeacherUserId: course.homeroomInstructor || null,
          note: 'backfilled_from_course'
        });
        stats.schoolClassesCreated += 1;
        if (!dryRun) await schoolClass.save();
        schoolClasses.push(schoolClass);
        schoolClassByCourseId.set(String(course._id), schoolClass);
      }

      let changedCourse = false;
      let changedSchoolClass = false;

      if (!idsEqual(course.schoolClassRef, schoolClass._id)) {
        course.schoolClassRef = schoolClass._id;
        changedCourse = true;
        stats.coursesLinkedToSchoolClass += 1;
      }

      let derivedYear = course.academicYearRef || schoolClass.academicYearId || null;
      if (!derivedYear) {
        const signals = Array.from(courseYearSignals.get(String(course._id)) || []);
        if (signals.length === 1) {
          derivedYear = resolveAcademicYearByText(yearByText, signals[0])?._id || null;
        } else if (signals.length === 0 && activeAcademicYear) {
          derivedYear = activeAcademicYear._id;
        }
      }

      if (derivedYear) {
        if (!idsEqual(course.academicYearRef, derivedYear)) {
          course.academicYearRef = derivedYear;
          changedCourse = true;
          stats.coursesYearAssigned += 1;
        }
        if (!idsEqual(schoolClass.academicYearId, derivedYear)) {
          schoolClass.academicYearId = derivedYear;
          changedSchoolClass = true;
          stats.schoolClassesYearAssigned += 1;
        }
      } else {
        stats.unresolvedSchoolClasses += 1;
      }

      if (course.homeroomInstructor && !idsEqual(schoolClass.homeroomTeacherUserId, course.homeroomInstructor)) {
        schoolClass.homeroomTeacherUserId = course.homeroomInstructor;
        changedSchoolClass = true;
      }

      if (changedSchoolClass && !dryRun) await schoolClass.save();
      if (changedCourse && !dryRun) await course.save();
    }

    const studentUsers = await User.find({
      $or: [{ orgRole: 'student' }, { role: 'student' }]
    }).select('name email status');
    const studentCoreByUserId = new Map(
      (await StudentCore.find({ userId: { $ne: null } })).map((item) => [String(item.userId), item])
    );

    for (const user of studentUsers) {
      let studentCore = studentCoreByUserId.get(String(user._id));
      if (!studentCore) {
        studentCore = new StudentCore({
          userId: user._id,
          fullName: trimText(user.name),
          preferredName: trimText(user.name),
          email: trimText(user.email),
          status: user.status === 'inactive' ? 'inactive' : 'active',
          note: 'backfilled_from_user'
        });
        stats.studentCoresCreated += 1;
        if (!dryRun) await studentCore.save();
        studentCoreByUserId.set(String(user._id), studentCore);
      }

      const profile = await StudentProfile.findOne({ studentId: studentCore._id });
      if (!profile) {
        const nextProfile = new StudentProfile({ studentId: studentCore._id });
        stats.studentProfilesCreated += 1;
        if (!dryRun) await nextProfile.save();
      }
    }

    const courseById = new Map(academicCourses.map((item) => [String(item._id), item]));
    const memberships = await StudentMembership.find({});
    for (const membership of memberships) {
      const studentCore = studentCoreByUserId.get(String(membership.student));
      const schoolClass = schoolClassByCourseId.get(String(membership.course));
      const course = courseById.get(String(membership.course));
      let changed = false;

      if (studentCore) {
        changed = patchValue(membership, 'studentId', studentCore._id) || changed;
      }
      if (schoolClass) {
        changed = patchValue(membership, 'classId', schoolClass._id) || changed;
      }

      const derivedAcademicYearId = membership.academicYear
        || membership.academicYearId
        || schoolClass?.academicYearId
        || course?.academicYearRef
        || null;
      if (derivedAcademicYearId) {
        changed = patchValue(membership, 'academicYearId', derivedAcademicYearId) || changed;
        changed = patchValue(membership, 'academicYear', derivedAcademicYearId) || changed;
      }

      if (!membership.enrolledAt && membership.joinedAt) {
        membership.enrolledAt = membership.joinedAt;
        changed = true;
      }
      if (!membership.endedAt && membership.leftAt) {
        membership.endedAt = membership.leftAt;
        changed = true;
      }
      if (
        ['transferred', 'transferred_out', 'graduated', 'dropped', 'expelled', 'inactive', 'rejected']
          .includes(trimText(membership.status).toLowerCase())
        && !trimText(membership.endedReason)
      ) {
        membership.endedReason = trimText(membership.status).toLowerCase();
        changed = true;
      }

      if (changed) {
        stats.membershipsUpdated += 1;
        if (!dryRun) await membership.save();
      }
    }

    const subjectRows = await Subject.find({});
    const subjectByKey = new Map(
      subjectRows.map((item) => [trimText(item.name).toLowerCase() + '::' + trimText(item.grade).toLowerCase(), item])
    );
    const schedules = await Schedule.find({});
    const teacherAssignments = await TeacherAssignment.find({});

    const teacherAssignmentExists = (payload = {}) => teacherAssignments.some((item) => (
      idsEqual(item.teacherUserId, payload.teacherUserId)
      && idsEqual(item.classId, payload.classId)
      && idsEqual(item.subjectId, payload.subjectId)
      && trimText(item.assignmentType) === trimText(payload.assignmentType)
      && trimText(item.source) === trimText(payload.source)
    ));

    for (const schedule of schedules) {
      const schoolClass = schoolClassByCourseId.get(String(schedule.course));
      const gradeLevel = trimText(schoolClass?.gradeLevel);
      const subjectName = trimText(schedule.subject);
      let subject = null;
      let changedSchedule = false;

      if (schedule.subjectRef) {
        subject = subjectRows.find((item) => idsEqual(item._id, schedule.subjectRef)) || null;
      }
      if (!subject && subjectName) {
        const key = subjectName.toLowerCase() + '::' + gradeLevel.toLowerCase();
        subject = subjectByKey.get(key) || null;
        if (!subject) {
          subject = new Subject({
            name: subjectName,
            grade: gradeLevel,
            note: 'backfilled_from_schedule',
            isActive: true
          });
          stats.subjectsCreated += 1;
          if (!dryRun) await subject.save();
          subjectRows.push(subject);
          subjectByKey.set(key, subject);
        }
      }

      if (subject && !idsEqual(schedule.subjectRef, subject._id)) {
        schedule.subjectRef = subject._id;
        changedSchedule = true;
        stats.schedulesUpdated += 1;
      }
      if (changedSchedule && !dryRun) await schedule.save();

      const teacherPayload = {
        teacherUserId: schedule.instructor || null,
        academicYearId: schoolClass?.academicYearId || null,
        classId: schoolClass?._id || null,
        subjectId: subject?._id || null,
        assignmentType: 'subject',
        source: 'schedule_backfill'
      };

      if (!teacherPayload.teacherUserId || !teacherPayload.classId) continue;
      if (teacherAssignmentExists(teacherPayload)) continue;

      const item = new TeacherAssignment({
        ...teacherPayload,
        legacyCourseId: schedule.course || null,
        note: subjectName ? ('backfilled_from_schedule:' + subjectName) : 'backfilled_from_schedule'
      });
      stats.teacherAssignmentsCreated += 1;
      if (!dryRun) await item.save();
      teacherAssignments.push(item);
    }

    const homeroomAssignments = teacherAssignments.filter((item) => item.assignmentType === 'homeroom' && item.legacyCourseId);
    const existingHomeroomCourseIds = new Set(homeroomAssignments.map((item) => String(item.legacyCourseId)));
    for (const course of academicCourses) {
      if (!course.homeroomInstructor || existingHomeroomCourseIds.has(String(course._id))) continue;
      const schoolClass = schoolClassByCourseId.get(String(course._id));
      const item = new TeacherAssignment({
        teacherUserId: course.homeroomInstructor,
        academicYearId: course.academicYearRef || schoolClass?.academicYearId || null,
        classId: schoolClass?._id || null,
        assignmentType: 'homeroom',
        source: 'course_homeroom',
        legacyCourseId: course._id,
        isPrimary: true,
        note: 'backfilled_from_course_homeroom'
      });
      stats.teacherAssignmentsCreated += 1;
      if (!dryRun) await item.save();
      teacherAssignments.push(item);
    }

    console.log('[phase1:academic-core] dryRun=' + (dryRun ? 'yes' : 'no') + ' ' + JSON.stringify(stats));
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[phase1:academic-core] failed:', error);
  process.exit(1);
});
