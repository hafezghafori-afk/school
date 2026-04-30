const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const SchoolClass = require('../models/SchoolClass');
const Course = require('../models/Course');
const User = require('../models/User');
const StudentMembership = require('../models/StudentMembership');

const CURRENT_MEMBERSHIP_STATUSES = ['active', 'pending', 'suspended', 'transferred_in'];

const extractClassId = (payload = {}) => (
  payload.classId
  || payload.currentClassId
  || payload.schoolClassId
  || payload.academicInfo?.classId
  || payload.academicInfo?.currentClassId
  || payload.academicContext?.classId
  || null
);

const extractAcademicYearId = (payload = {}, schoolClass = {}) => (
  payload.academicYearId
  || payload.academicInfo?.academicYearId
  || payload.academicContext?.academicYearId
  || schoolClass.academicYearId
  || null
);

const extractEnrollmentDate = (payload = {}) => (
  payload.enrollmentDate
  || payload.academicInfo?.enrollmentDate
  || payload.academicContext?.enrollmentDate
  || new Date()
);

const gradeLabelFromStudent = (student = {}) => {
  const grade = String(student?.academicInfo?.currentGrade || student?.grade || '').trim();
  const match = grade.match(/\d+/);
  return match ? match[0] : grade;
};

const studentDisplayName = (student = {}) => [
  student?.personalInfo?.firstNameDari || student?.personalInfo?.firstName || '',
  student?.personalInfo?.lastNameDari || student?.personalInfo?.lastName || ''
].filter(Boolean).join(' ').trim() || student?.studentName || 'متعلم جدید';

const makeSafeStudentEmail = async (studentId) => {
  const seed = `student.${String(studentId || crypto.randomBytes(6).toString('hex')).replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const email = `${seed}${attempt ? `.${attempt}` : ''}@students.local`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await User.findOne({ email }).select('_id');
    if (!exists) return email;
  }
  return `${seed}.${Date.now()}@students.local`;
};

const ensureStudentUser = async (student) => {
  if (!student?._id) return null;

  if (student.linkedUserId) {
    const existing = await User.findById(student.linkedUserId);
    if (existing) return existing;
  }

  const contactEmail = String(student?.contactInfo?.email || '').trim().toLowerCase();
  let user = contactEmail ? await User.findOne({ email: contactEmail, role: 'student' }) : null;

  if (!user) {
    const password = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
    user = await User.create({
      name: studentDisplayName(student),
      email: contactEmail || await makeSafeStudentEmail(student._id),
      password,
      role: 'student',
      grade: gradeLabelFromStudent(student)
    });
  }

  if (String(student.linkedUserId || '') !== String(user._id)) {
    student.linkedUserId = user._id;
    await student.save();
  }

  return user;
};

const syncCourseForSchoolClass = async (schoolClass) => {
  if (!schoolClass?._id) return null;

  let course = schoolClass.legacyCourseId ? await Course.findById(schoolClass.legacyCourseId) : null;
  if (!course) {
    course = await Course.findOne({ schoolClassRef: schoolClass._id, kind: 'academic_class' });
  }

  const payload = {
    title: schoolClass.title || schoolClass.titleDari || `صنف ${schoolClass.gradeLevel || ''}`,
    description: schoolClass.note || '',
    price: 0,
    category: String(schoolClass.gradeLevel || ''),
    level: schoolClass.shift || '',
    kind: 'academic_class',
    academicYearRef: schoolClass.academicYearId || null,
    schoolClassRef: schoolClass._id,
    gradeLevel: String(schoolClass.gradeLevel || ''),
    section: schoolClass.section || '',
    homeroomInstructor: schoolClass.homeroomTeacherUserId || null,
    isActive: schoolClass.status !== 'archived',
    tags: [schoolClass.code || '', schoolClass.section || ''].filter(Boolean)
  };

  if (!course) {
    course = await Course.create(payload);
  } else {
    Object.assign(course, payload);
    await course.save();
  }

  if (String(schoolClass.legacyCourseId || '') !== String(course._id)) {
    schoolClass.legacyCourseId = course._id;
    await schoolClass.save();
  }

  return course;
};

const updateClassCurrentStudentCount = async (classId) => {
  if (!classId) return 0;
  const count = await StudentMembership.countDocuments({
    classId,
    isCurrent: true,
    status: { $in: CURRENT_MEMBERSHIP_STATUSES }
  });
  await SchoolClass.updateOne({ _id: classId }, { $set: { currentStudents: count } });
  return count;
};

const assignStudentToClass = async ({ student, payload = {}, actorId = null, source = 'admin', note = '' }) => {
  const classId = extractClassId(payload);
  if (!classId) return null;

  const schoolClass = await SchoolClass.findById(classId);
  if (!schoolClass) return null;

  const user = await ensureStudentUser(student);
  const course = await syncCourseForSchoolClass(schoolClass);
  if (!user?._id || !course?._id) return null;

  const previousMemberships = await StudentMembership.find({
    student: user._id,
    isCurrent: true,
    classId: { $ne: schoolClass._id }
  }).select('classId');

  await StudentMembership.updateMany(
    { student: user._id, isCurrent: true, classId: { $ne: schoolClass._id } },
    {
      $set: {
        status: 'transferred_out',
        isCurrent: false,
        leftAt: new Date(),
        endedAt: new Date(),
        endedReason: 'class_reassignment'
      }
    }
  );

  const academicYearId = extractAcademicYearId(payload, schoolClass);
  const joinedAt = extractEnrollmentDate(payload);

  const membership = await StudentMembership.findOneAndUpdate(
    {
      student: user._id,
      course: course._id,
      academicYear: academicYearId || null,
      isCurrent: true
    },
    {
      $set: {
        student: user._id,
        course: course._id,
        classId: schoolClass._id,
        academicYear: academicYearId || null,
        academicYearId: academicYearId || null,
        status: 'active',
        source,
        enrolledAt: joinedAt,
        joinedAt,
        createdBy: actorId || null,
        note: note || (source === 'admin'
          ? 'معرفی خودکار از فورم ثبت شاگرد توسط دفتر/مدیریت تدریسی'
          : 'معرفی خودکار پس از تایید ثبت‌نام آنلاین'),
        isCurrent: true
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  student.academicInfo = {
    ...(student.academicInfo || {}),
    currentSchool: schoolClass.schoolId || student.academicInfo?.currentSchool,
    currentGrade: schoolClass.gradeLevel ? `grade${schoolClass.gradeLevel}` : student.academicInfo?.currentGrade,
    currentSection: schoolClass.section || student.academicInfo?.currentSection,
    currentShift: schoolClass.shift || student.academicInfo?.currentShift || 'morning'
  };
  await student.save();

  await updateClassCurrentStudentCount(schoolClass._id);
  await Promise.all(previousMemberships.map((item) => updateClassCurrentStudentCount(item.classId)));

  return membership;
};

module.exports = {
  assignStudentToClass,
  ensureStudentUser,
  syncCourseForSchoolClass,
  updateClassCurrentStudentCount
};
