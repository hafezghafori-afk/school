const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AfghanStudent = require('../models/AfghanStudent');
const AfghanSchool = require('../models/AfghanSchool');
const Enrollment = require('../models/Enrollment');
const { requireFields } = require('../middleware/validate');
const Counter = require('../models/Counter');
const SiteSettings = require('../models/SiteSettings');
const StudentMembership = require('../models/StudentMembership');
const StudentCore = require('../models/StudentCore');
const User = require('../models/User');
const { ok, fail } = require('../utils/response');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');
const cache = require('../utils/simpleCache');
const { requireAuth, requireRole, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { requireWritableSchool, writeSchoolContextHeaders } = require('../services/schoolContextService');
const { ENROLLMENT_SOURCES, inferEnrollmentSource } = require('../utils/enrollmentSource');
const { assertSafeStudentInput } = require('../utils/studentInputSafety');
const { normalizeStudentSearchText } = require('../utils/studentSearch');
const {
  assignStudentToClass,
  serializeTransferAdmissionBilling
} = require('../services/studentClassAssignmentService');
const sawanehCardService = require('../services/sawanehCardService');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'AfghanStudent', actionPrefix: 'afghan_student', audit: auditWrite });

const studentUploadDir = path.join(__dirname, '..', 'uploads', 'afghan-students');
if (!fs.existsSync(studentUploadDir)) {
  fs.mkdirSync(studentUploadDir, { recursive: true });
}

const studentDocumentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, studentUploadDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png']);
    cb(allowed.has(file.mimetype) ? null : new Error('invalid_student_document_type'), allowed.has(file.mimetype));
  }
});

const STUDENT_DOCUMENT_META = {
  tazkira: { type: 'tazkira', title: 'تذکره شاگرد' },
  fatherTazkira: { type: 'other', title: 'تذکره پدر' },
  photo: { type: 'photo', title: 'عکس شاگرد' },
  seParcha: { type: 'transfer_certificate', title: 'سه پارچه' }
};

// Helper functions
const calculateAge = (birthDate) => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

const formatStudentUpdateError = (error) => {
  if (error?.code === 11000) {
    return 'شماره تذکره/شناسه شاگرد قبلاً برای شاگرد دیگری ثبت شده است.';
  }
  if (error?.name === 'ValidationError' && error.errors) {
    return Object.values(error.errors)
      .map((item) => item?.message)
      .filter(Boolean)
      .join('، ') || 'اطلاعات شاگرد با فیلدهای ضروری سازگار نیست.';
  }
  if (error?.name === 'CastError') {
    return 'شناسه شاگرد معتبر نیست.';
  }
  return 'ذخیره مشخصات شاگرد ناموفق بود.';
};

const expandDotNotationPayload = (payload = {}) => {
  const expanded = {};
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (!key.includes('.')) {
      expanded[key] = value;
      return;
    }

    const parts = key.split('.').filter(Boolean);
    let target = expanded;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        target[part] = value;
        return;
      }
      if (!target[part] || typeof target[part] !== 'object' || Array.isArray(target[part])) {
        target[part] = {};
      }
      target = target[part];
    });
  });
  return expanded;
};

const populateAfghanStudentQuery = (query) => query
  .populate('academicInfo.currentSchool', 'name province district schoolType')
  .populate('academicInfo.classId', 'title code gradeLevel section shift shiftId academicYearId')
  .populate('academicInfo.currentClassId', 'title code gradeLevel section shift shiftId academicYearId')
  .populate('academicInfo.shiftId', 'name nameDari namePashto code')
  .populate('academicInfo.academicYearId', 'title isActive')
  .populate('createdBy', 'name email')
  .populate('lastUpdatedBy', 'name email');

const gradeLabelFromStudent = (studentData = {}) => {
  const grade = String(studentData?.academicInfo?.currentGrade || '').trim();
  const match = grade.match(/\d+/);
  return match ? match[0] : grade;
};

const syncManualStudentEnrollment = async ({ student, studentData, req }) => {
  if (!student?._id) return null;
  const existing = await Enrollment.findOne({
    $or: [
      { linkedStudentId: student._id },
      { linkedUserId: student._id },
      ...(student.linkedUserId ? [{ linkedUserId: student.linkedUserId }] : [])
    ]
  });
  const studentName = [
    studentData?.personalInfo?.firstName,
    studentData?.personalInfo?.lastName
  ].filter(Boolean).join(' ').trim() || student.fullName || 'شاگرد جدید';

  const payload = {
    studentName,
    fatherName: studentData?.personalInfo?.fatherName || '',
    nationalId: studentData?.identification?.tazkiraNumber || '',
    motherName: studentData?.familyInfo?.motherName || '',
    gender: studentData?.personalInfo?.gender || 'male',
    birthDate: studentData?.personalInfo?.birthDate || '',
    grade: gradeLabelFromStudent(studentData),
    phone: studentData?.contactInfo?.phone || studentData?.contactInfo?.mobile || studentData?.familyInfo?.fatherPhone || '',
    email: studentData?.contactInfo?.email || '',
    address: studentData?.contactInfo?.address || '',
    previousSchool: studentData?.academicInfo?.previousSchool?.name || '',
    emergencyPhone: studentData?.contactInfo?.emergencyContact?.phone || '',
    notes: studentData?.notes?.general || 'ثبت مستقیم از صفحه ثبت شاگرد جدید',
    academicContext: {
      schoolId: studentData?.academicInfo?.currentSchool || null,
      classId: studentData?.academicInfo?.classId || studentData?.academicInfo?.currentClassId || studentData?.classId || null,
      shiftId: studentData?.academicInfo?.shiftId || studentData?.shiftId || null,
      academicYearId: studentData?.academicInfo?.academicYearId || studentData?.academicYearId || null,
      enrollmentDate: studentData?.academicInfo?.enrollmentDate || null
    },
    registrationId: student.registrationId || studentData?.registrationId || '',
    asasNumber: student.asasNumber || studentData?.asasNumber || '',
    registrationSource: existing
      ? inferEnrollmentSource(existing)
      : ENROLLMENT_SOURCES.MANUAL,
    status: 'approved',
    linkedStudentId: student._id,
    linkedUserId: student.linkedUserId || null,
    approvedBy: req.user?.id || null,
    approvedAt: new Date()
  };

  if (existing) {
    Object.assign(existing, payload);
    return existing.save();
  }

  return Enrollment.create(payload);
};

const syncRelatedStudentIdentity = async (student) => {
  if (!student?._id) return;
  const firstName = student.personalInfo?.firstNameDari || student.personalInfo?.firstName || '';
  const lastName = student.personalInfo?.lastNameDari || student.personalInfo?.lastName || '';
  const studentName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const fatherName = student.personalInfo?.fatherName || '';
  const email = student.contactInfo?.email || '';
  const phone = student.contactInfo?.phone || student.contactInfo?.mobile || '';
  const grade = gradeLabelFromStudent(student);
  const linkedUserId = student.linkedUserId || null;

  if (linkedUserId && studentName) {
    await User.findByIdAndUpdate(linkedUserId, {
      $set: {
        name: studentName,
        grade
      }
    });
  }

  await Enrollment.updateMany(
    {
      $or: [
        { linkedStudentId: student._id },
        ...(linkedUserId ? [{ linkedUserId }] : [])
      ]
    },
    {
      $set: {
        ...(studentName ? { studentName } : {}),
        fatherName,
        gender: student.personalInfo?.gender || 'male',
        birthDate: student.personalInfo?.birthDate || '',
        grade,
        phone,
        email,
        address: student.contactInfo?.address || '',
        province: student.contactInfo?.province || '',
        district: student.contactInfo?.district || '',
        emergencyPhone: student.contactInfo?.emergencyContact?.phone || ''
      }
    }
  );

  await StudentMembership.updateMany(
    {
      $or: [
        { afghanStudentId: student._id },
        ...(linkedUserId ? [{ student: linkedUserId }] : [])
      ]
    },
    {
      $set: {
        afghanStudentId: student._id,
        ...(linkedUserId ? { student: linkedUserId } : {})
      }
    }
  );

  const membershipStudentCoreIds = await StudentMembership.find({
    $or: [
      { afghanStudentId: student._id },
      ...(linkedUserId ? [{ student: linkedUserId }] : [])
    ],
    studentId: { $ne: null }
  }).distinct('studentId');

  const studentCoreFilter = {
    $or: [
      ...(linkedUserId ? [{ userId: linkedUserId }] : []),
      ...(membershipStudentCoreIds.length ? [{ _id: { $in: membershipStudentCoreIds } }] : [])
    ]
  };

  if (studentName && studentCoreFilter.$or.length) {
    const studentCoreSet = {
      fullName: studentName,
      preferredName: studentName,
      givenName: firstName,
      familyName: lastName,
      phone,
      email,
      gender: student.personalInfo?.gender || '',
      dateOfBirth: student.personalInfo?.birthDate ? String(student.personalInfo.birthDate).slice(0, 10) : ''
    };
    const admissionNo = student.asasNumber || student.registrationId || student.identification?.tazkiraNumber || '';
    if (admissionNo) studentCoreSet.admissionNo = admissionNo;
    await StudentCore.updateMany(studentCoreFilter, { $set: studentCoreSet });
  }
};

const getStudentStats = async (schoolId, grade) => {
  const query = { status: 'active' };
  if (schoolId) query['academicInfo.currentSchool'] = schoolId;
  if (grade) query['academicInfo.currentGrade'] = grade;

  const students = await AfghanStudent.find(query).lean();
  
  return {
    total: students.length,
    male: students.filter(s => s.personalInfo.gender === 'male').length,
    female: students.filter(s => s.personalInfo.gender === 'female').length,
    averageAge: students.length > 0 ? 
      Math.round(students.reduce((sum, s) => sum + calculateAge(s.personalInfo.birthDate), 0) / students.length) : 0,
    byGrade: students.reduce((acc, student) => {
      const grade = student.academicInfo.currentGrade;
      acc[grade] = (acc[grade] || 0) + 1;
      return acc;
    }, {}),
    attendanceRate: students.length > 0 ? 
      Math.round(students.reduce((sum, s) => sum + parseFloat(s.academicInfo.attendanceRecord.presentDays / s.academicInfo.attendanceRecord.totalDays * 100 || 0), 0) / students.length) : 0
  };
};

// GET /api/afghan-students/dashboard - Student dashboard statistics
router.get('/dashboard', requireAuth, requireRole(['admin', 'principal', 'teacher']), requirePermission('view_reports'), async (req, res) => {
  try {
    const { schoolId, grade, province } = req.query;
    
    const query = { status: 'active' };
    if (schoolId) query['academicInfo.currentSchool'] = schoolId;
    if (grade) query['academicInfo.currentGrade'] = grade;
    if (province) query['contactInfo.province'] = province;

    const cacheKey = `student_dashboard_${schoolId || 'all'}_${grade || 'all'}_${province || 'all'}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return ok(res, cachedData, 'آمار داشبورد شاگردان از حافظه موقت دریافت شد.');
    }

    const students = await AfghanStudent.find(query).lean();
    
    const stats = {
      total: students.length,
      male: students.filter(s => s.personalInfo.gender === 'male').length,
      female: students.filter(s => s.personalInfo.gender === 'female').length,
      averageAge: students.length > 0 ? 
        Math.round(students.reduce((sum, s) => sum + calculateAge(s.personalInfo.birthDate), 0) / students.length) : 0,
      byGrade: students.reduce((acc, student) => {
        const grade = student.academicInfo.currentGrade;
        acc[grade] = (acc[grade] || 0) + 1;
        return acc;
      }, {}),
      byProvince: students.reduce((acc, student) => {
        const province = student.contactInfo.province;
        acc[province] = (acc[province] || 0) + 1;
        return acc;
      }, {}),
      attendanceRate: students.length > 0 ? 
        Math.round(students.reduce((sum, s) => {
          const total = s.academicInfo.attendanceRecord.totalDays;
          const present = s.academicInfo.attendanceRecord.presentDays;
          return sum + (total > 0 ? (present / total) * 100 : 0);
        }, 0) / students.length) : 0,
      scholarshipRecipients: students.filter(s => s.financialInfo?.receivesScholarship).length,
      specialNeeds: students.filter(s => s.medicalInfo?.physicalDisabilities?.hasDisability).length
    };

    cache.set(cacheKey, stats);

    return ok(res, stats, 'آمار داشبورد شاگردان دریافت شد.');
  } catch (error) {
    console.error('Student Dashboard Error:', error);
    return fail(res, 'دریافت آمار داشبورد شاگردان ناموفق بود.', 500);
  }
});

// GET /api/afghan-students - Get all students with filtering
router.get('/', requireAuth, requireRole(['admin', 'principal', 'teacher', 'registration_manager']), requireAnyPermission(['manage_content', 'manage_users', 'manage_enrollments']), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 1000,
      schoolId,
      grade,
      gender,
      province,
      district,
      status = 'active',
      search,
      ageRange
    } = req.query;

    const query = { status };

    if (schoolId) query['academicInfo.currentSchool'] = schoolId;
    if (grade) query['academicInfo.currentGrade'] = grade;
    if (gender) query['personalInfo.gender'] = gender;
    if (province) query['contactInfo.province'] = province;
    if (district) query['contactInfo.district'] = district;

    if (ageRange) {
      const [minAge, maxAge] = ageRange.split('-').map(Number);
      const today = new Date();
      const minBirthDate = new Date(today.getFullYear() - maxAge, today.getMonth(), today.getDate());
      const maxBirthDate = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());
      query['personalInfo.birthDate'] = { $gte: minBirthDate, $lte: maxBirthDate };
    }

    if (search) {
      const normalizedSearch = normalizeStudentSearchText(search);
      const escapedSearch = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchCondition = { $regex: escapedSearch, $options: 'i' };
      query.$or = [
        { 'personalInfo.firstName': searchCondition },
        { 'personalInfo.lastName': searchCondition },
        { 'personalInfo.firstNameDari': searchCondition },
        { 'personalInfo.lastNameDari': searchCondition },
        { 'personalInfo.fatherName': searchCondition },
        { 'identification.tazkiraNumber': searchCondition },
        { 'contactInfo.phone': searchCondition },
        { 'contactInfo.mobile': searchCondition },
        { 'contactInfo.email': searchCondition },
        { asasNumber: searchCondition },
        { registrationId: searchCondition }
      ];
    }

    const normalizedLimit = Math.min(Math.max(parseInt(limit, 10) || 1000, 1), 5000);
    const normalizedPage = Math.max(parseInt(page, 10) || 1, 1);

    const students = await AfghanStudent.find(query)
      .populate('academicInfo.currentSchool', 'name province district')
      .populate('academicInfo.classId', 'title code gradeLevel section shift shiftId academicYearId')
      .populate('academicInfo.currentClassId', 'title code gradeLevel section shift shiftId academicYearId')
      .populate('academicInfo.shiftId', 'name nameDari namePashto code')
      .populate('academicInfo.academicYearId', 'title isActive')
      .populate('createdBy', 'name email')
      .populate('lastUpdatedBy', 'name email')
      .limit(normalizedLimit)
      .skip((normalizedPage - 1) * normalizedLimit)
      .sort({ createdAt: -1 })
      .lean();

    const total = await AfghanStudent.countDocuments(query);

    return ok(res, {
      students,
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        pages: Math.ceil(total / normalizedLimit)
      }
    }, 'Students retrieved successfully');
  } catch (error) {
    console.error('Get Students Error:', error);
    return fail(res, 'دریافت فهرست شاگردان ناموفق بود.', 500);
  }
});

// GET /api/afghan-students/:id - Get single student
router.get('/:id', requireAuth, requireRole(['admin', 'principal', 'teacher', 'registration_manager']), requireAnyPermission(['manage_content', 'manage_users', 'manage_enrollments']), async (req, res) => {
  try {
    const student = await AfghanStudent.findById(req.params.id)
      .populate('academicInfo.currentSchool', 'name province district schoolType')
      .populate('academicInfo.classId', 'title code gradeLevel section shift shiftId academicYearId')
      .populate('academicInfo.currentClassId', 'title code gradeLevel section shift shiftId academicYearId')
      .populate('academicInfo.shiftId', 'name nameDari namePashto code')
      .populate('academicInfo.academicYearId', 'title isActive')
      .populate('createdBy', 'name email')
      .populate('lastUpdatedBy', 'name email')
      .lean();

    if (!student) {
      return fail(res, 'شاگرد پیدا نشد.', 404);
    }

    return ok(res, student, 'مشخصات شاگرد دریافت شد.');
  } catch (error) {
    console.error('Get Student Error:', error);
    return fail(res, 'دریافت مشخصات شاگرد ناموفق بود.', 500);
  }
});

// POST /api/afghan-students - Create new student
router.post('/', requireAuth, requireRole(['admin', 'principal', 'registration_manager']), requireAnyPermission(['manage_content', 'manage_enrollments']), requireFields([
  'personalInfo.firstName', 'personalInfo.lastName', 'personalInfo.firstNameDari', 'personalInfo.lastNameDari',
  'personalInfo.fatherName', 'personalInfo.gender', 'personalInfo.birthDate', 'personalInfo.birthPlace',
  'identification.tazkiraNumber',
  'familyInfo.motherName',
  'contactInfo.province', 'contactInfo.district', 'contactInfo.address',
  'academicInfo.currentSchool', 'academicInfo.currentGrade', 'academicInfo.enrollmentDate'
]), async (req, res) => {
  try {
    const studentData = {
      ...req.body,
      createdBy: req.user?.id || 'system'
    };

    const schoolContext = await requireWritableSchool(req, studentData);
    studentData.academicInfo = {
      ...(studentData.academicInfo || {}),
      currentSchool: schoolContext.schoolId
    };

    // Check if tazkira number already exists
    const existingStudent = await AfghanStudent.findOne({ 
      'identification.tazkiraNumber': studentData.identification.tazkiraNumber 
    });
    if (existingStudent) {
      return fail(res, 'شماره تذکره قبلاً ثبت شده است.', 400);
    }

    // Validate school exists
    const school = await AfghanSchool.findById(studentData.academicInfo.currentSchool);
    if (!school) {
      return fail(res, 'مکتب پیدا نشد.', 400);
    }

    if (!studentData.asasNumber) {
      const gregorianYear = new Date().getFullYear();
      const afghanYearRaw = (gregorianYear - 621).toString();
      const afghanYear = afghanYearRaw.padStart(4, '0');
      const afghanYearShort = afghanYearRaw.slice(-2);

      const settings = (await SiteSettings.findOne()) || {};
      const format = (settings.studentIdFormats && settings.studentIdFormats.asasNumberFormat) ? settings.studentIdFormats.asasNumberFormat : '{YYYY}-{SEQ}';

      const counter = await Counter.findByIdAndUpdate(
        `asas_${afghanYear}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      
      studentData.asasNumber = format
        .replace(/{YYYY}/g, afghanYear)
        .replace(/{YY}/g, afghanYearShort)
        .replace(/{SEQ}/g, counter.seq.toString().padStart(4, '0'));
    }

    if (!studentData.registrationId) {
      studentData.registrationId = `MANUAL-${studentData.asasNumber}`;
    }

    const student = new AfghanStudent(studentData);
    await student.save();

    const membership = await assignStudentToClass({
      student,
      payload: studentData,
      actorId: req.user?.id || null,
      source: 'admin'
    });
    const admissionBilling = serializeTransferAdmissionBilling(
      membership?.$locals?.transferAdmissionBilling || null
    );
    await syncManualStudentEnrollment({ student, studentData, req });

    // کارت سوانحِ متعلم را همراه ثبت‌نام بساز (شکستش نباید ثبت شاگرد را خراب کند)
    try {
      await sawanehCardService.ensureCard(student._id, { actorId: req.user?.id || null });
    } catch (sawanehError) {
      console.error('ensureSawanehCard (create student) failed:', sawanehError?.message || sawanehError);
    }

    // Populate school info for response
    await student.populate('academicInfo.currentSchool', 'name province district');

    writeSchoolContextHeaders(res, schoolContext.schoolId);
    return res.status(201).json({
      success: true,
      message: admissionBilling?.created
        ? `شاگرد ثبت شد و بل داخله ${admissionBilling.billNumber || ''} صادر گردید.`
        : 'Student created successfully',
      admissionBilling,
      data: student
    });
  } catch (error) {
    console.error('Create Student Error:', error);
    if (error.message === 'school_context_required') {
      return fail(res, error.messageDari || 'اول یک مکتب فعال و معتبر انتخاب یا ایجاد کنید.', error.statusCode || 400);
    }
    if (error.code === 11000) {
      return fail(res, 'شماره تذکره قبلاً ثبت شده است.', 400);
    }
    if (error?.name === 'ValidationError') {
      return fail(res, formatStudentUpdateError(error), 400);
    }
    return fail(res, 'ایجاد شاگرد ناموفق بود.', 500);
  }
});

// POST /api/afghan-students/:id/documents - Attach registration documents
router.post('/:id/documents', requireAuth, requireRole(['admin', 'principal', 'registration_manager']), requireAnyPermission(['manage_content', 'manage_enrollments']), (req, res) => {
  studentDocumentUpload.fields([
    { name: 'tazkira', maxCount: 1 },
    { name: 'fatherTazkira', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'seParcha', maxCount: 1 }
  ])(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError.message === 'invalid_student_document_type'
        ? 'نوع فایل سند معتبر نیست. فقط PDF، JPG و PNG پذیرفته می‌شود.'
        : 'آپلود سندهای شاگرد ناموفق بود.';
      return fail(res, message, 400);
    }

    try {
      const student = await AfghanStudent.findById(req.params.id);
      if (!student) {
        return fail(res, 'شاگرد پیدا نشد.', 404);
      }

      const documents = Object.entries(req.files || {}).flatMap(([field, files]) => {
        const meta = STUDENT_DOCUMENT_META[field];
        if (!meta) return [];
        return (files || []).map((file) => ({
          type: meta.type,
          title: meta.title,
          url: `uploads/afghan-students/${file.filename}`,
          uploadDate: new Date(),
          verified: false
        }));
      });

      if (!documents.length) {
        return fail(res, 'هیچ سندی برای آپلود انتخاب نشده است.', 400);
      }

      student.documents.push(...documents);
      student.lastUpdatedBy = req.user?.id || student.lastUpdatedBy;
      await student.save();

      await Enrollment.findOneAndUpdate(
        {
          $or: [
            { linkedStudentId: student._id },
            { linkedUserId: student._id },
            ...(student.linkedUserId ? [{ linkedUserId: student.linkedUserId }] : [])
          ]
        },
        {
          documents: {
            idCardUrl: documents.find((item) => item.type === 'tazkira')?.url || '',
            birthCertUrl: documents.find((item) => item.type === 'other')?.url || '',
            reportCardUrl: documents.find((item) => item.type === 'transfer_certificate')?.url || '',
            photoUrl: documents.find((item) => item.type === 'photo')?.url || ''
          }
        },
        { new: true }
      );

      return ok(res, { documents: student.documents }, 'اسناد شاگرد با موفقیت بارگذاری شد.');
    } catch (error) {
      console.error('Upload Student Documents Error:', error);
      return fail(res, 'بارگذاری اسناد شاگرد ناموفق بود.', 500);
    }
  });
});

// PUT /api/afghan-students/:id - Update student
router.put('/:id', requireAuth, requireRole(['admin', 'principal', 'registration_manager']), requireAnyPermission(['manage_content', 'manage_users', 'manage_enrollments']), async (req, res) => {
  try {
    assertSafeStudentInput(req.body || {});
    const rawStudentData = {
      ...req.body,
      lastUpdatedBy: req.user?.id || 'system'
    };
    const studentData = expandDotNotationPayload(rawStudentData);

    // If updating school, validate it exists
    if (studentData.academicInfo?.currentSchool) {
      const school = await AfghanSchool.findById(studentData.academicInfo.currentSchool);
      if (!school) {
        return fail(res, 'مکتب پیدا نشد.', 400);
      }
    }

    const student = await AfghanStudent.findById(req.params.id);
    if (!student) {
      return fail(res, 'شاگرد پیدا نشد.', 404);
    }

    const currentClassId = String(student.academicInfo?.currentClassId || student.academicInfo?.classId || '').trim();
    const requestedClassId = String(
      studentData.academicInfo?.currentClassId
      || studentData.academicInfo?.classId
      || currentClassId
    ).trim();
    if (requestedClassId && currentClassId && requestedClassId !== currentClassId) {
      return fail(
        res,
        'تغییر صنف از فورم مشخصات مجاز نیست؛ تبدیلی صنف را از بخش تغییر وضعیت تعلیمی ثبت کنید.',
        409
      );
    }

    Object.entries(rawStudentData).forEach(([key, value]) => {
      student.set(key, value);
    });
    await student.save();

    const refreshedStudent = await populateAfghanStudentQuery(AfghanStudent.findById(student._id));
    await syncManualStudentEnrollment({ student: refreshedStudent, studentData: refreshedStudent.toObject(), req });
    await syncRelatedStudentIdentity(refreshedStudent);

    return ok(res, { data: refreshedStudent.toObject() }, 'مشخصات شاگرد با موفقیت به‌روزرسانی شد.');
  } catch (error) {
    console.error('Update Student Error:', error);
    if (error?.code === 'student_profile_system_message_placeholder_rejected') {
      return fail(res, 'متن پیام سیستمی را نمی‌توان به‌عنوان مشخصات شاگرد ذخیره کرد؛ صفحه را تازه کنید و دوباره تلاش نمایید.', 400);
    }
    const status = error?.code === 11000 || error?.name === 'ValidationError' || error?.name === 'CastError' ? 400 : 500;
    return fail(res, formatStudentUpdateError(error), status);
  }
});

// DELETE /api/afghan-students/:id - Delete student
router.delete('/:id', requireAuth, requireRole(['admin', 'principal']), requireAnyPermission(['manage_content', 'manage_users', 'manage_enrollments']), async (req, res) => {
  try {
    const student = await AfghanStudent.findById(req.params.id);
    if (!student) {
      return fail(res, 'شاگرد پیدا نشد.', 404);
    }

    const membershipFilter = {
      $or: [
        { afghanStudentId: student._id },
        ...(student.linkedUserId ? [{ student: student.linkedUserId }] : [])
      ]
    };
    const membershipCount = await StudentMembership.countDocuments(membershipFilter);
    if (membershipCount > 0) {
      return res.status(409).json({
        success: false,
        code: 'student_with_membership_cannot_be_deleted',
        message: 'پروندهٔ شاگرد دارای سابقهٔ تعلیمی حذف نمی‌شود؛ تبدیلی، ترک تحصیل یا منفکی را از بخش تغییر وضعیت تعلیمی ثبت کنید.'
      });
    }

    await AfghanStudent.deleteOne({ _id: student._id });

    await Enrollment.findOneAndDelete({
      $or: [
        { linkedStudentId: student._id },
        { linkedUserId: student._id },
        ...(student.linkedUserId ? [{ linkedUserId: student.linkedUserId }] : [])
      ]
    });

    return ok(res, student, 'شاگرد با موفقیت حذف شد.');
  } catch (error) {
    console.error('Delete Student Error:', error);
    return fail(res, 'حذف شاگرد ناموفق بود.', 500);
  }
});

// POST /api/afghan-students/bulk - Bulk create students
router.post('/bulk', requireAuth, requireRole(['admin', 'principal']), requirePermission('manage_content'), requireFields(['students']), async (req, res) => {
  try {
    const { students } = req.body;
    
    if (!Array.isArray(students) || students.length === 0) {
      return fail(res, 'فهرست شاگردان الزامی است و نمی‌تواند خالی باشد.', 400);
    }

    if (students.length > 100) {
      return fail(res, 'ایجاد بیشتر از ۱۰۰ شاگرد در یک مرحله مجاز نیست.', 400);
    }

    const results = {
      successful: [],
      failed: [],
      summary: {
        total: students.length,
        successful: 0,
        failed: 0
      }
    };

    for (let i = 0; i < students.length; i++) {
      const studentData = {
        ...students[i],
        createdBy: req.user?.id || 'system'
      };

      try {
        // Check if tazkira number already exists
        const existingStudent = await AfghanStudent.findOne({ 
          'identification.tazkiraNumber': studentData.identification.tazkiraNumber 
        });
        if (existingStudent) {
          results.failed.push({
            index: i,
            tazkiraNumber: studentData.identification.tazkiraNumber,
            error: 'Tazkira number already exists'
          });
          continue;
        }

        // Validate school exists
        const school = await AfghanSchool.findById(studentData.academicInfo.currentSchool);
        if (!school) {
          results.failed.push({
            index: i,
            tazkiraNumber: studentData.identification.tazkiraNumber,
            error: 'School not found'
          });
          continue;
        }

        const student = new AfghanStudent(studentData);
        await student.save();
        await assignStudentToClass({
          student,
          payload: studentData,
          actorId: req.user?.id || null,
          source: 'admin'
        });
        await syncManualStudentEnrollment({ student, studentData, req });
        
        results.successful.push({
          index: i,
          tazkiraNumber: studentData.identification.tazkiraNumber,
          studentId: student._id
        });
        results.summary.successful++;
      } catch (error) {
        results.failed.push({
          index: i,
          tazkiraNumber: studentData.identification.tazkiraNumber,
          error: error.message
        });
        results.summary.failed++;
      }
    }

    return ok(res, results, 'ایجاد گروهی شاگردان تکمیل شد.');
  } catch (error) {
    console.error('Bulk Create Students Error:', error);
    return fail(res, 'ایجاد گروهی شاگردان ناموفق بود.', 500);
  }
});

// GET /api/afghan-students/attendance/:schoolId - Get attendance statistics for a school
router.get('/attendance/:schoolId', requireAuth, requireRole(['admin', 'principal', 'teacher']), requirePermission('view_reports'), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { grade, dateRange } = req.query;

    const query = { 
      'academicInfo.currentSchool': schoolId,
      status: 'active'
    };
    
    if (grade) query['academicInfo.currentGrade'] = grade;

    const students = await AfghanStudent.find(query).lean();
    
    const attendanceStats = {
      totalStudents: students.length,
      averageAttendance: 0,
      byGrade: {},
      byGender: {
        male: { total: 0, average: 0 },
        female: { total: 0, average: 0 }
      },
      lowAttendance: [] // Students with < 70% attendance
    };

    let totalAttendancePercentage = 0;

    for (const student of students) {
      const attendance = student.academicInfo.attendanceRecord;
      const attendanceRate = attendance.totalDays > 0 ? 
        (attendance.presentDays / attendance.totalDays) * 100 : 0;

      totalAttendancePercentage += attendanceRate;

      // By grade
      const grade = student.academicInfo.currentGrade;
      if (!attendanceStats.byGrade[grade]) {
        attendanceStats.byGrade[grade] = { total: 0, average: 0, rates: [] };
      }
      attendanceStats.byGrade[grade].total++;
      attendanceStats.byGrade[grade].rates.push(attendanceRate);

      // By gender
      const gender = student.personalInfo.gender;
      attendanceStats.byGender[gender].total++;
      attendanceStats.byGender[gender].average += attendanceRate;

      // Low attendance tracking
      if (attendanceRate < 70) {
        attendanceStats.lowAttendance.push({
          studentId: student._id,
          name: `${student.personalInfo.firstName} ${student.personalInfo.lastName}`,
          attendanceRate: Math.round(attendanceRate)
        });
      }
    }

    // Calculate averages
    attendanceStats.averageAttendance = students.length > 0 ? 
      Math.round(totalAttendancePercentage / students.length) : 0;

    // Grade averages
    for (const grade in attendanceStats.byGrade) {
      const gradeData = attendanceStats.byGrade[grade];
      gradeData.average = gradeData.rates.length > 0 ? 
        Math.round(gradeData.rates.reduce((sum, rate) => sum + rate, 0) / gradeData.rates.length) : 0;
      delete gradeData.rates;
    }

    // Gender averages
    attendanceStats.byGender.male.average = attendanceStats.byGender.male.total > 0 ? 
      Math.round(attendanceStats.byGender.male.average / attendanceStats.byGender.male.total) : 0;
    attendanceStats.byGender.female.average = attendanceStats.byGender.female.total > 0 ? 
      Math.round(attendanceStats.byGender.female.average / attendanceStats.byGender.female.total) : 0;

    return ok(res, attendanceStats, 'آمار حاضری شاگرد دریافت شد.');
  } catch (error) {
    console.error('Attendance Stats Error:', error);
    return fail(res, 'دریافت آمار حاضری ناموفق بود.', 500);
  }
});

// POST /api/afghan-students/:id/update-attendance - Update student attendance
router.post('/:id/update-attendance', requireAuth, requireRole(['admin', 'principal', 'teacher']), requirePermission('manage_content'), requireFields(['presentDays', 'totalDays']), async (req, res) => {
  try {
    const { presentDays, totalDays } = req.body;
    
    if (presentDays > totalDays) {
      return fail(res, 'تعداد روزهای حاضر نمی‌تواند از مجموع روزها بیشتر باشد.', 400);
    }

    const student = await AfghanStudent.findById(req.params.id);
    if (!student) {
      return fail(res, 'شاگرد پیدا نشد.', 404);
    }

    student.academicInfo.attendanceRecord = {
      totalDays: student.academicInfo.attendanceRecord.totalDays + totalDays,
      presentDays: student.academicInfo.attendanceRecord.presentDays + presentDays,
      absentDays: student.academicInfo.attendanceRecord.absentDays + (totalDays - presentDays),
      lateDays: student.academicInfo.attendanceRecord.lateDays
    };

    student.lastUpdatedBy = req.user?.id || 'system';
    await student.save();

    return ok(res, student.academicInfo.attendanceRecord, 'معلومات حاضری با موفقیت به‌روزرسانی شد.');
  } catch (error) {
    console.error('Update Attendance Error:', error);
    return fail(res, 'به‌روزرسانی حاضری ناموفق بود.', 500);
  }
});

// GET /api/afghan-students/performance/:schoolId - Get academic performance statistics
router.get('/performance/:schoolId', requireAuth, requireRole(['admin', 'principal', 'teacher']), requirePermission('view_reports'), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { grade, term } = req.query;

    const query = { 
      'academicInfo.currentSchool': schoolId,
      status: 'active'
    };
    
    if (grade) query['academicInfo.currentGrade'] = grade;

    const students = await AfghanStudent.find(query).lean();
    
    const performanceStats = {
      totalStudents: students.length,
      averageGPA: 0,
      byGrade: {},
      byGender: {
        male: { total: 0, averageGPA: 0 },
        female: { total: 0, averageGPA: 0 }
      },
      subjectPerformance: {},
      topPerformers: [],
      needsImprovement: []
    };

    let totalGPA = 0;

    for (const student of students) {
      const performance = student.academicInfo.academicPerformance;
      const gpa = performance.lastYearGPA || 0;

      totalGPA += gpa;

      // By grade
      const grade = student.academicInfo.currentGrade;
      if (!performanceStats.byGrade[grade]) {
        performanceStats.byGrade[grade] = { total: 0, averageGPA: 0, gpas: [] };
      }
      performanceStats.byGrade[grade].total++;
      performanceStats.byGrade[grade].gpas.push(gpa);

      // By gender
      const gender = student.personalInfo.gender;
      performanceStats.byGender[gender].total++;
      performanceStats.byGender[gender].averageGPA += gpa;

      // Top performers
      if (gpa >= 85) {
        performanceStats.topPerformers.push({
          studentId: student._id,
          name: `${student.personalInfo.firstName} ${student.personalInfo.lastName}`,
          gpa
        });
      }

      // Needs improvement
      if (gpa > 0 && gpa < 60) {
        performanceStats.needsImprovement.push({
          studentId: student._id,
          name: `${student.personalInfo.firstName} ${student.personalInfo.lastName}`,
          gpa
        });
      }

      // Subject performance
      if (performance.subjects && performance.subjects.length > 0) {
        for (const subject of performance.subjects) {
          if (!performanceStats.subjectPerformance[subject.name]) {
            performanceStats.subjectPerformance[subject.name] = { scores: [], count: 0 };
          }
          performanceStats.subjectPerformance[subject.name].scores.push(subject.score);
          performanceStats.subjectPerformance[subject.name].count++;
        }
      }
    }

    // Calculate averages
    performanceStats.averageGPA = students.length > 0 ? 
      Math.round(totalGPA / students.length) : 0;

    // Grade averages
    for (const grade in performanceStats.byGrade) {
      const gradeData = performanceStats.byGrade[grade];
      gradeData.averageGPA = gradeData.gpas.length > 0 ? 
        Math.round(gradeData.gpas.reduce((sum, gpa) => sum + gpa, 0) / gradeData.gpas.length) : 0;
      delete gradeData.gpas;
    }

    // Gender averages
    performanceStats.byGender.male.averageGPA = performanceStats.byGender.male.total > 0 ? 
      Math.round(performanceStats.byGender.male.averageGPA / performanceStats.byGender.male.total) : 0;
    performanceStats.byGender.female.averageGPA = performanceStats.byGender.female.total > 0 ? 
      Math.round(performanceStats.byGender.female.averageGPA / performanceStats.byGender.female.total) : 0;

    // Subject averages
    for (const subject in performanceStats.subjectPerformance) {
      const subjectData = performanceStats.subjectPerformance[subject];
      const average = subjectData.scores.length > 0 ? 
        Math.round(subjectData.scores.reduce((sum, score) => sum + score, 0) / subjectData.scores.length) : 0;
      performanceStats.subjectPerformance[subject] = {
        count: subjectData.count,
        average
      };
    }

    // Sort top performers and needs improvement
    performanceStats.topPerformers.sort((a, b) => b.gpa - a.gpa);
    performanceStats.needsImprovement.sort((a, b) => a.gpa - a.gpa);

    return ok(res, performanceStats, 'آمار عملکرد تعلیمی دریافت شد.');
  } catch (error) {
    console.error('Performance Stats Error:', error);
    return fail(res, 'دریافت آمار عملکرد تعلیمی ناموفق بود.', 500);
  }
});

module.exports = router;
