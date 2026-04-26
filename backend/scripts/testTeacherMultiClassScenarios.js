const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const AcademicYear = require('../models/AcademicYear');
const SchoolClass = require('../models/SchoolClass');
const Subject = require('../models/Subject');
const Shift = require('../models/Shift');
const TeacherAvailability = require('../models/TeacherAvailability');
const TeacherAssignment = require('../models/TeacherAssignment');
const TimetableConfiguration = require('../models/TimetableConfiguration');
const PeriodDefinition = require('../models/PeriodDefinition');
const TimetableEntry = require('../models/TimetableEntry');

const teacherAssignmentRouter = require('../routes/teacherAssignmentRoutes');
const timetableGeneratorRouter = require('../routes/timetableGeneratorRoutes');

function buildRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function invokeRouteHandler(router, method, path, { params = {}, body = {}, query = {}, user = {} } = {}) {
  const layer = router.stack.find((item) => item.route && item.route.path === path && item.route.methods && item.route.methods[method]);
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  const req = { params, body, query, user, headers: {} };
  const res = buildRes();

  await handler(req, res);
  return { statusCode: res.statusCode, body: res.body };
}

async function findSchoolAndShift() {
  const sampleClass = await SchoolClass.findOne({ status: 'active' }).select('schoolId shiftId');
  if (!sampleClass?.schoolId || !sampleClass?.shiftId) {
    throw new Error('No active class with schoolId/shiftId found for bootstrap');
  }

  const shift = await Shift.findById(sampleClass.shiftId).select('_id');
  if (!shift?._id) {
    throw new Error('Shift not found for bootstrap class');
  }

  return {
    schoolId: String(sampleClass.schoolId),
    shiftId: String(shift._id)
  };
}

async function main() {
  const created = {
    teacherId: '',
    yearId: '',
    classIds: [],
    subjectIds: [],
    availabilityId: '',
    assignmentIds: [],
    configId: '',
    periodIds: []
  };

  const now = Date.now();
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

  await mongoose.connect(mongoUri);

  try {
    const admin = await User.findOne({ role: 'admin', status: 'active' }).select('_id role');
    if (!admin?._id) {
      throw new Error('No active admin user found for executing protected handlers');
    }

    const { schoolId, shiftId } = await findSchoolAndShift();

    const tempYear = await AcademicYear.create({
      schoolId,
      code: `TMP-Y-${now}`,
      title: `Temporary Scenario Year ${now}`,
      status: 'active',
      isActive: true,
      isCurrent: false,
      createdBy: admin._id
    });
    created.yearId = String(tempYear._id);

    const classA = await SchoolClass.create({
      schoolId,
      title: `TMP-CLASS-A-${now}`,
      titleDari: `صنف موقت الف ${now}`,
      titlePashto: `موقتي ټولګی الف ${now}`,
      code: `TMPA${String(now).slice(-6)}`,
      academicYearId: tempYear._id,
      shiftId,
      gradeLevel: 10,
      section: 'ح',
      genderType: 'mixed',
      shift: 'morning',
      legacyCourseId: new mongoose.Types.ObjectId(),
      room: 'TMP-A',
      capacity: 35,
      status: 'active'
    });

    const classB = await SchoolClass.create({
      schoolId,
      title: `TMP-CLASS-B-${now}`,
      titleDari: `صنف موقت ب ${now}`,
      titlePashto: `موقتي ټولګی ب ${now}`,
      code: `TMPB${String(now).slice(-6)}`,
      academicYearId: tempYear._id,
      shiftId,
      gradeLevel: 10,
      section: 'ط',
      genderType: 'mixed',
      shift: 'morning',
      legacyCourseId: new mongoose.Types.ObjectId(),
      room: 'TMP-B',
      capacity: 35,
      status: 'active'
    });
    created.classIds.push(String(classA._id), String(classB._id));

    const subject1 = await Subject.create({
      schoolId,
      code: `TMP-S1-${now}`,
      name: 'Temp Subject 1',
      nameDari: 'مضمون موقت ۱',
      namePashto: 'موقتي مضمون ۱',
      category: 'core',
      subjectType: 'theoretical',
      gradeLevels: [10],
      weeklyHours: 2,
      status: 'active'
    });

    const subject2 = await Subject.create({
      schoolId,
      code: `TMP-S2-${now}`,
      name: 'Temp Subject 2',
      nameDari: 'مضمون موقت ۲',
      namePashto: 'موقتي مضمون ۲',
      category: 'core',
      subjectType: 'theoretical',
      gradeLevels: [10],
      weeklyHours: 2,
      status: 'active'
    });

    const subject3 = await Subject.create({
      schoolId,
      code: `TMP-S3-${now}`,
      name: 'Temp Subject 3',
      nameDari: 'مضمون موقت ۳',
      namePashto: 'موقتي مضمون ۳',
      category: 'core',
      subjectType: 'theoretical',
      gradeLevels: [10],
      weeklyHours: 2,
      status: 'active'
    });

    const subject4 = await Subject.create({
      schoolId,
      code: `TMP-S4-${now}`,
      name: 'Temp Subject 4',
      nameDari: 'مضمون موقت ۴',
      namePashto: 'موقتي مضمون ۴',
      category: 'core',
      subjectType: 'theoretical',
      gradeLevels: [10],
      weeklyHours: 1,
      status: 'active'
    });
    created.subjectIds.push(String(subject1._id), String(subject2._id), String(subject3._id), String(subject4._id));

    const teacher = await User.create({
      name: `Temp Multi Class Teacher ${now}`,
      email: `temp.teacher.${now}@example.com`,
      password: 'temp123456',
      role: 'instructor',
      status: 'active',
      subject: 'Temp Subject'
    });
    created.teacherId = String(teacher._id);

    const availability = await TeacherAvailability.create({
      schoolId,
      teacherId: teacher._id,
      academicYearId: tempYear._id,
      shiftId,
      availableDays: ['saturday', 'sunday', 'monday'],
      availablePeriods: [
        { dayCode: 'saturday', periodIndexes: [1, 2, 3] },
        { dayCode: 'sunday', periodIndexes: [1, 2, 3] },
        { dayCode: 'monday', periodIndexes: [1, 2, 3] }
      ],
      maxPeriodsPerDay: 3,
      maxPeriodsPerWeek: 6,
      status: 'active',
      createdBy: admin._id
    });
    created.availabilityId = String(availability._id);

    console.log('SCENARIO 1: Teacher teaches multiple classes within capacity');
    const bulkResponse = await invokeRouteHandler(teacherAssignmentRouter, 'post', '/bulk', {
      user: { id: String(admin._id), role: 'admin' },
      body: {
        assignments: [
          {
            schoolId,
            academicYearId: String(tempYear._id),
            classId: String(classA._id),
            subjectId: String(subject1._id),
            teacherUserId: String(teacher._id),
            legacyInstructorSubjectId: new mongoose.Types.ObjectId(),
            weeklyPeriods: 2,
            priority: 1,
            assignmentType: 'permanent',
            status: 'active'
          },
          {
            schoolId,
            academicYearId: String(tempYear._id),
            classId: String(classB._id),
            subjectId: String(subject2._id),
            teacherUserId: String(teacher._id),
            legacyInstructorSubjectId: new mongoose.Types.ObjectId(),
            weeklyPeriods: 2,
            priority: 1,
            assignmentType: 'permanent',
            status: 'active'
          },
          {
            schoolId,
            academicYearId: String(tempYear._id),
            classId: String(classA._id),
            subjectId: String(subject3._id),
            teacherUserId: String(teacher._id),
            legacyInstructorSubjectId: new mongoose.Types.ObjectId(),
            weeklyPeriods: 2,
            priority: 1,
            assignmentType: 'permanent',
            status: 'active'
          }
        ]
      }
    });

    const createdAssignments = Array.isArray(bulkResponse.body?.data) ? bulkResponse.body.data : [];
    created.assignmentIds.push(...createdAssignments.map((item) => String(item._id || item.id)).filter(Boolean));
    const scenario1Pass = bulkResponse.statusCode === 201 && createdAssignments.length >= 2;
    console.log(`- status=${bulkResponse.statusCode}, created=${createdAssignments.length}`);
    if (Array.isArray(bulkResponse.body?.errors) && bulkResponse.body.errors.length) {
      console.log(`- bulk errors: ${bulkResponse.body.errors.map((item) => item.error).join(' | ')}`);
    }
    console.log(scenario1Pass ? 'PASS' : 'FAIL');

    console.log('\nSCENARIO 2: Capacity exceeded should be blocked');
    const exceedResponse = await invokeRouteHandler(teacherAssignmentRouter, 'post', '/school/:schoolId', {
      user: { id: String(admin._id), role: 'admin' },
      params: { schoolId },
      body: {
        schoolId,
        academicYearId: String(tempYear._id),
        classId: String(classB._id),
        subjectId: String(subject4._id),
        teacherUserId: String(teacher._id),
        legacyInstructorSubjectId: new mongoose.Types.ObjectId(),
        weeklyPeriods: 3,
        priority: 1,
        assignmentType: 'permanent',
        status: 'active'
      }
    });

    const scenario2Pass = exceedResponse.statusCode === 400 && /ظرفیت|capacity|سقف/i.test(String(exceedResponse.body?.message || ''));
    console.log(`- status=${exceedResponse.statusCode}, message=${String(exceedResponse.body?.message || '')}`);
    console.log(scenario2Pass ? 'PASS' : 'FAIL');

    console.log('\nSCENARIO 3: Auto generation keeps teacher conflict-free across classes');
    const config = await TimetableConfiguration.create({
      schoolId,
      academicYearId: tempYear._id,
      shiftId,
      workingDays: ['saturday', 'sunday', 'monday'],
      periodsPerDay: 3,
      breakPeriods: [],
      status: 'active',
      isActive: true,
      createdBy: admin._id
    });
    created.configId = String(config._id);

    const periods = await PeriodDefinition.insertMany([
      {
        timetableConfigurationId: config._id,
        dayCode: 'saturday',
        periodIndex: 1,
        startTime: '08:00',
        endTime: '08:45',
        type: 'class',
        title: 'P1'
      },
      {
        timetableConfigurationId: config._id,
        dayCode: 'sunday',
        periodIndex: 1,
        startTime: '08:00',
        endTime: '08:45',
        type: 'class',
        title: 'P1'
      },
      {
        timetableConfigurationId: config._id,
        dayCode: 'monday',
        periodIndex: 1,
        startTime: '08:00',
        endTime: '08:45',
        type: 'class',
        title: 'P1'
      }
    ]);
    created.periodIds.push(...periods.map((item) => String(item._id)));

    const generateResponse = await invokeRouteHandler(timetableGeneratorRouter, 'post', '/generate', {
      user: { id: String(admin._id), role: 'admin' },
      body: {
        schoolId,
        academicYearId: String(tempYear._id),
        shiftId: String(shiftId)
      }
    });

    const generatedEntries = Array.isArray(generateResponse.body?.data?.generatedEntries)
      ? generateResponse.body.data.generatedEntries
      : [];

    const teacherSlots = new Set();
    let duplicateTeacherSlot = false;
    for (const entry of generatedEntries) {
      const teacherId = String(entry.teacherId || '');
      const slotKey = `${teacherId}:${entry.dayCode}:${entry.periodIndex}`;
      if (teacherSlots.has(slotKey)) {
        duplicateTeacherSlot = true;
        break;
      }
      teacherSlots.add(slotKey);
    }

    const scenario3Pass = generateResponse.statusCode === 200 && !duplicateTeacherSlot;
    console.log(`- status=${generateResponse.statusCode}, generated=${generatedEntries.length}, duplicateTeacherSlot=${duplicateTeacherSlot}`);
    console.log(scenario3Pass ? 'PASS' : 'FAIL');

    const allPass = scenario1Pass && scenario2Pass && scenario3Pass;
    console.log(`\nFINAL RESULT: ${allPass ? 'PASS (all 3 scenarios)' : 'FAIL (one or more scenarios failed)'}`);
  } finally {
    if (created.periodIds.length) {
      await PeriodDefinition.deleteMany({ _id: { $in: created.periodIds } });
    }
    if (created.configId) {
      await TimetableConfiguration.deleteOne({ _id: created.configId });
    }
    if (created.yearId) {
      await TimetableEntry.deleteMany({ academicYearId: created.yearId });
      await TeacherAssignment.deleteMany({ academicYearId: created.yearId });
      await TeacherAvailability.deleteMany({ academicYearId: created.yearId });
      await SchoolClass.deleteMany({ academicYearId: created.yearId });
      await AcademicYear.deleteOne({ _id: created.yearId });
    }
    if (created.subjectIds.length) {
      await Subject.deleteMany({ _id: { $in: created.subjectIds } });
    }
    if (created.teacherId) {
      await User.deleteOne({ _id: created.teacherId });
    }

    await mongoose.connection.close();
  }
}

main()
  .then(() => {
    console.log('Scenario test completed.');
  })
  .catch((error) => {
    console.error('Scenario test failed:', error);
    process.exitCode = 1;
  });
