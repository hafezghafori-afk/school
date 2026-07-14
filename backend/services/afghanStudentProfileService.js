const AfghanStudent = require('../models/AfghanStudent');
const AfghanSchool = require('../models/AfghanSchool');

const normalizeText = (value = '') => String(value || '').trim();
const isValidEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const splitFullName = (value = '') => {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'شاگرد',
    lastName: parts.slice(1).join(' ')
  };
};

const gradeFromClass = (schoolClass = {}, fallback = '') => {
  const gradeLevel = Number(schoolClass?.gradeLevel || String(fallback || '').match(/\d+/)?.[0] || 1);
  const bounded = Number.isFinite(gradeLevel) ? Math.min(12, Math.max(1, gradeLevel)) : 1;
  return `grade${bounded}`;
};

const compactUnique = (items = []) => Array.from(new Set(items.map(normalizeText).filter(Boolean)));

const buildTrustedIdentityFilter = ({ tazkiraNumber = '', registrationId = '', asasNumber = '', email = '', phone = '' } = {}) => {
  const or = [];
  compactUnique([tazkiraNumber, registrationId, asasNumber]).forEach((value) => {
    or.push({ 'identification.tazkiraNumber': value });
    or.push({ registrationId: value });
    or.push({ asasNumber: value });
  });
  if (isValidEmail(email)) or.push({ 'contactInfo.email': normalizeText(email).toLowerCase() });
  compactUnique([phone]).forEach((value) => {
    or.push({ 'contactInfo.phone': value });
    or.push({ 'contactInfo.mobile': value });
    or.push({ 'familyInfo.fatherPhone': value });
    or.push({ 'familyInfo.guardianPhone': value });
  });
  return or.length ? { $or: or, status: { $ne: 'deleted' } } : null;
};

async function findTrustedAfghanStudentMatch(identifiers = {}) {
  const filter = buildTrustedIdentityFilter(identifiers);
  if (!filter) return null;
  return AfghanStudent.findOne(filter).sort({ updatedAt: -1, createdAt: -1 });
}

async function ensureAfghanStudentProfile({
  source = 'manual',
  enrollment = null,
  user = null,
  schoolId = null,
  schoolClass = null,
  academicYearId = null,
  shiftId = null,
  actorId = null,
  defaults = {}
} = {}) {
  const sourceEnrollment = enrollment || {};
  const fullName = normalizeText(
    defaults.fullName
    || sourceEnrollment.studentName
    || user?.name
    || ''
  );
  const { firstName, lastName } = splitFullName(fullName);
  const email = normalizeText(defaults.email || sourceEnrollment.email || user?.email || '').toLowerCase();
  const phone = normalizeText(defaults.phone || sourceEnrollment.phone || sourceEnrollment.emergencyPhone || '');
  const registrationId = normalizeText(defaults.registrationId || sourceEnrollment.registrationId || '');
  const asasNumber = normalizeText(defaults.asasNumber || sourceEnrollment.asasNumber || '');
  const tazkiraNumber = normalizeText(defaults.tazkiraNumber || sourceEnrollment.nationalId || sourceEnrollment.tazkiraNumber || registrationId || asasNumber);
  const effectiveSchoolId = schoolId || schoolClass?.schoolId || defaults.schoolId || null;
  const school = effectiveSchoolId ? await AfghanSchool.findById(effectiveSchoolId).select('province district address') : null;
  const district = normalizeText(defaults.district || sourceEnrollment.district || school?.district || sourceEnrollment.address || 'نامشخص');
  const province = normalizeText(defaults.province || sourceEnrollment.province || school?.province || 'kabul');
  const address = normalizeText(defaults.address || sourceEnrollment.address || school?.address || district);

  let student = await findTrustedAfghanStudentMatch({
    tazkiraNumber,
    registrationId,
    asasNumber,
    email,
    phone
  });
  const wasCreated = !student;

  if (!student) {
    student = new AfghanStudent({
      personalInfo: {
        firstName,
        lastName,
        firstNameDari: firstName,
        lastNameDari: lastName,
        fatherName: normalizeText(defaults.fatherName || sourceEnrollment.fatherName || 'ثبت نشده'),
        grandfatherName: normalizeText(defaults.grandfatherName || ''),
        gender: ['male', 'female'].includes(defaults.gender || sourceEnrollment.gender) ? (defaults.gender || sourceEnrollment.gender) : 'male',
        birthDate: defaults.birthDate || sourceEnrollment.birthDate || new Date('2000-01-01T00:00:00.000Z'),
        birthPlace: district,
        nationality: 'Afghan'
      },
      identification: {
        tazkiraNumber: tazkiraNumber || registrationId || asasNumber || `PROFILE-${Date.now()}`
      },
      familyInfo: {
        fatherPhone: phone,
        motherName: normalizeText(defaults.motherName || sourceEnrollment.motherName || 'ثبت نشده'),
        guardianName: normalizeText(defaults.guardianName || sourceEnrollment.fatherName || fullName || 'سرپرست'),
        guardianRelation: 'father',
        guardianPhone: phone || '0000000000'
      },
      contactInfo: {
        phone,
        mobile: phone,
        email: isValidEmail(email) ? email : '',
        province,
        district,
        address,
        emergencyContact: {
          name: normalizeText(defaults.guardianName || sourceEnrollment.fatherName || fullName || 'سرپرست'),
          relation: 'سرپرست',
          phone: phone || '0000000000'
        }
      },
      academicInfo: {
        currentSchool: effectiveSchoolId,
        classId: schoolClass?._id || defaults.classId || null,
        currentClassId: schoolClass?._id || defaults.classId || null,
        shiftId: shiftId || defaults.shiftId || null,
        academicYearId: academicYearId || schoolClass?.academicYearId || defaults.academicYearId || null,
        currentGrade: gradeFromClass(schoolClass, sourceEnrollment.grade || user?.grade),
        currentSection: normalizeText(schoolClass?.section || ''),
        currentShift: normalizeText(schoolClass?.shift || 'morning'),
        enrollmentDate: defaults.enrollmentDate || sourceEnrollment.approvedAt || sourceEnrollment.createdAt || new Date(),
        enrollmentType: sourceEnrollment.previousSchool ? 'transfer' : 'new',
        previousSchool: sourceEnrollment.previousSchool
          ? { name: sourceEnrollment.previousSchool, type: 'private' }
          : undefined,
        attendanceRecord: { totalDays: 0, presentDays: 0, absentDays: 0, lateDays: 0 }
      },
      status: 'active',
      verificationStatus: 'verified',
      registrationId: registrationId || undefined,
      asasNumber: asasNumber || undefined,
      linkedUserId: user?._id || sourceEnrollment.linkedUserId || null,
      createdBy: actorId || undefined,
      notes: {
        general: normalizeText(defaults.note || sourceEnrollment.notes || `ساخته شده از ${source}`)
      }
    });
  }

  if (user?._id && String(student.linkedUserId || '') !== String(user._id)) {
    student.linkedUserId = user._id;
  }
  if (schoolClass?._id) {
    student.academicInfo = {
      ...(student.academicInfo || {}),
      currentSchool: effectiveSchoolId || student.academicInfo?.currentSchool,
      classId: schoolClass._id,
      currentClassId: schoolClass._id,
      shiftId: shiftId || student.academicInfo?.shiftId || null,
      academicYearId: academicYearId || schoolClass.academicYearId || student.academicInfo?.academicYearId || null,
      currentGrade: gradeFromClass(schoolClass, sourceEnrollment.grade || user?.grade),
      currentSection: normalizeText(schoolClass.section || student.academicInfo?.currentSection || ''),
      currentShift: normalizeText(schoolClass.shift || student.academicInfo?.currentShift || 'morning')
    };
  }

  await student.save();
  return { student, wasCreated };
}

module.exports = {
  buildTrustedIdentityFilter,
  ensureAfghanStudentProfile,
  findTrustedAfghanStudentMatch
};
