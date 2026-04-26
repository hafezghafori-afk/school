const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const AfghanStudent = require('../models/AfghanStudent');
const User = require('../models/User');
const Counter = require('../models/Counter');
const SiteSettings = require('../models/SiteSettings');
const { ok, fail } = require('../utils/response');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');
const cache = require('../utils/simpleCache');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'AfghanStudent', actionPrefix: 'student_registration', audit: auditWrite });

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeStudentEmail = (value = '') => String(value || '').trim().toLowerCase();

const buildStudentDisplayName = (student = {}) => {
  const first = String(student?.personalInfo?.firstName || '').trim();
  const last = String(student?.personalInfo?.lastName || '').trim();
  const full = `${first} ${last}`.trim();
  return full || String(student?.registrationId || 'شاگرد').trim() || 'شاگرد';
};

const mapStudentGradeToUserGrade = (student = {}) => {
  const raw = String(student?.academicInfo?.currentGrade || '').trim();
  return raw || '';
};

const generateFallbackStudentEmail = (student = {}) => {
  const idPart = String(student?._id || '').trim() || Date.now().toString(36);
  return `student.${idPart}@local.school`;
};

const ensureStudentLinkedUser = async (student, { forceActive = false } = {}) => {
  if (!student?._id) return null;

  const desiredName = buildStudentDisplayName(student);
  const desiredGrade = mapStudentGradeToUserGrade(student);
  const normalizedEmail = normalizeStudentEmail(student?.contactInfo?.email || '');
  const candidateEmail = EMAIL_RX.test(normalizedEmail)
    ? normalizedEmail
    : generateFallbackStudentEmail(student);
  const desiredStatus = forceActive || String(student?.status || '').trim().toLowerCase() === 'active'
    ? 'active'
    : 'inactive';

  let linkedUser = student.linkedUserId
    ? await User.findById(student.linkedUserId).select('_id email name orgRole role status grade')
    : null;

  if (linkedUser?._id) {
    linkedUser.name = desiredName;
    linkedUser.grade = desiredGrade;
    linkedUser.status = desiredStatus;
    await linkedUser.save();
    return linkedUser;
  }

  let finalEmail = candidateEmail;
  const existingByEmail = await User.findOne({ email: candidateEmail }).select('_id').lean();
  if (existingByEmail?._id) {
    finalEmail = generateFallbackStudentEmail(student);
  }

  const tempPassword = crypto.randomBytes(12).toString('base64url');
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  linkedUser = await User.create({
    name: desiredName,
    email: finalEmail,
    password: hashedPassword,
    orgRole: 'student',
    role: 'student',
    status: desiredStatus,
    grade: desiredGrade
  });

  student.linkedUserId = linkedUser._id;
  return linkedUser;
};

// Replace temporary middleware with real logic in routes

// Create new student (for manual registration)
router.post('/', requireAuth, requireRole(['admin', 'principal', 'registration_manager']), requirePermission('manage_content'), async (req, res) => {
  try {
    const {
      schoolId,
      firstName,
      lastName,
      fatherName,
      grandfatherName,
      nationalId,
      birthDate,
      gender,
      bloodType,
      phone,
      email,
      address,
      city,
      province,
      previousSchool,
      previousGrade,
      enrollmentDate,
      academicYearId,
      classId,
      shiftId,
      fatherName: fatherFullName,
      fatherPhone,
      fatherOccupation,
      motherName,
      motherPhone,
      motherOccupation,
      guardianName,
      guardianPhone,
      guardianRelation,
      medicalConditions,
      allergies,
      emergencyContact,
      emergencyPhone,
      transportation,
      lunchProgram,
      specialNeeds,
      notes,
      registrationType = 'manual'
    } = req.body;

    // Check for duplicate national ID
    const existingStudent = await AfghanStudent.findOne({
      'identification.tazkiraNumber': nationalId,
      status: { $ne: 'deleted' }
    });

    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: 'دانش‌آموزی با این کد ملی قبلاً ثبت شده است'
      });
    }

    // Prepare Registration and Asas Numbers
    let registrationId = null;
    let asasNumber = req.body.asasNumber || null;

    if (registrationType === 'online') {
      const gregorianYear = new Date().getFullYear();
      const afghanYearRaw = (gregorianYear - 621).toString();
      const afghanYear = afghanYearRaw.padStart(4, '0');
      const afghanYearShort = afghanYearRaw.slice(-2);

      const settings = (await SiteSettings.findOne()) || {};
      const format = (settings.studentIdFormats && settings.studentIdFormats.registrationIdFormat) ? settings.studentIdFormats.registrationIdFormat : 'REG-{YYYY}-{SEQ}';

      const counter = await Counter.findByIdAndUpdate(
        `reg_${afghanYear}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      
      registrationId = format
        .replace(/{YYYY}/g, afghanYear)
        .replace(/{YY}/g, afghanYearShort)
        .replace(/{SEQ}/g, counter.seq.toString().padStart(4, '0'));
    } else {
      // If manual but no asas is provided yet, they can verify it later.
    }

    // Create student record using AfghanStudent model structure
    const studentData = {
      personalInfo: {
        firstName,
        lastName,
        firstNameDari: firstName,
        lastNameDari: lastName,
        fatherName,
        gender,
        birthDate,
        birthPlace: city || province
      },
      identification: {
        tazkiraNumber: nationalId
      },
      familyInfo: {
        motherName,
        fatherName: fatherFullName,
        guardianName,
        guardianRelation
      },
      contactInfo: {
        phone,
        email,
        province,
        district: city,
        address,
        emergencyContact,
        emergencyPhone
      },
      academicInfo: {
        currentSchool: schoolId,
        currentGrade: classId,
        enrollmentDate: enrollmentDate || new Date(),
        previousSchool,
        previousGrade,
        attendanceRecord: {
          totalDays: 0,
          presentDays: 0,
          absentDays: 0,
          lateDays: 0
        },
        academicPerformance: {
          lastYearGPA: 0,
          subjects: []
        }
      },
      medicalInfo: {
        bloodType,
        allergies: allergies || '',
        physicalDisabilities: {
          hasDisability: specialNeeds ? true : false,
          description: specialNeeds || ''
        },
        medicalConditions: medicalConditions || ''
      },
      financialInfo: {
        receivesScholarship: false,
        tuitionFees: {
          paid: 0,
          total: 0
        }
      },
      transportationInfo: {
        mode: transportation || 'walking',
        requiresSchoolBus: transportation === 'school_bus'
      },
      status: registrationType === 'online' ? 'inactive' : 'active',
      verificationStatus: registrationType === 'online' ? 'pending' : 'verified',
      registrationId: registrationId || undefined,
      asasNumber: asasNumber || undefined,
      registrationType,
      createdBy: req.user.id,
      createdAt: new Date(),
      lastUpdatedBy: req.user.id,
      updatedAt: new Date()
    };

    // Add parent contact information
    if (fatherPhone) {
      studentData.familyInfo.fatherPhone = fatherPhone;
      studentData.familyInfo.fatherOccupation = fatherOccupation;
    }
    
    if (motherPhone) {
      studentData.familyInfo.motherPhone = motherPhone;
      studentData.familyInfo.motherOccupation = motherOccupation;
    }
    
    if (guardianPhone) {
      studentData.familyInfo.guardianPhone = guardianPhone;
    }

    const student = new AfghanStudent(studentData);
    await student.save();

    if (registrationType !== 'online') {
      await ensureStudentLinkedUser(student, { forceActive: true });
      await student.save();
    }

    const populatedStudent = await AfghanStudent.findById(student._id)
      .populate('academicInfo.currentSchool', 'name province district')
      .populate('createdBy', 'firstName lastName')
      .populate('lastUpdatedBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'دانش‌آموز با موفقیت ثبت شد',
      data: populatedStudent
    });
  } catch (error) {
    console.error('Error creating student:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در ثبت دانش‌آموز',
      error: error.message
    });
  }
});

// Get all students for a school
router.get('/school/:schoolId', requireAuth, requireRole(['admin', 'principal', 'teacher', 'registration_manager']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { academicYearId, classId, shiftId, gender, status, page = 1, limit = 50 } = req.query;

    let query = { 
      'academicInfo.currentSchool': schoolId,
      status: { $ne: 'deleted' }
    };

    if (status) query.status = status;
    if (gender) query['personalInfo.gender'] = gender;

    const skip = (page - 1) * limit;

    const [students, total] = await Promise.all([
      AfghanStudent.find(query)
        .populate('academicInfo.currentSchool', 'name province district')
        .populate('createdBy', 'firstName lastName')
        .populate('lastUpdatedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AfghanStudent.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: students,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت لیست دانش‌آموزان',
      error: error.message
    });
  }
});

// Get single student by ID
router.get('/:id', requireAuth, requireRole(['admin', 'principal', 'teacher', 'registration_manager']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { id } = req.params;

    const student = await AfghanStudent.findById(id)
      .populate('academicInfo.currentSchool', 'name province district')
      .populate('createdBy', 'firstName lastName')
      .populate('lastUpdatedBy', 'firstName lastName')
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'دانش‌آموز یافت نشد'
      });
    }

    res.json({
      success: true,
      data: student
    });
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت اطلاعات دانش‌آموز',
      error: error.message
    });
  }
});

// Update student
router.put('/:id', requireAuth, requireRole(['admin', 'principal', 'registration_manager']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedAt: new Date(),
      lastUpdatedBy: req.user.id
    };

    const student = await AfghanStudent.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('academicInfo.currentSchool', 'name province district')
      .populate('createdBy', 'firstName lastName')
      .populate('lastUpdatedBy', 'firstName lastName');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'دانش‌آموز یافت نشد'
      });
    }

    res.json({
      success: true,
      message: 'اطلاعات دانش‌آموز با موفقیت به‌روزرسانی شد',
      data: student
    });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در به‌روزرسانی اطلاعات دانش‌آموز',
      error: error.message
    });
  }
});

// Verify student and assign Asas Number
router.put('/:id/verify', requireAuth, requireRole(['admin', 'principal', 'registration_manager']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { id } = req.params;
    let { asasNumber, autoGenerateAsas } = req.body;

    const student = await AfghanStudent.findById(id);
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'دانش‌آموز یافت نشد' });
    }

    if (student.verificationStatus === 'verified') {
      return res.status(400).json({ success: false, message: 'این دانش‌آموز قبلاً تایید شده است' });
    }

    // Generate Asas Automatically if requested
    if (autoGenerateAsas && !asasNumber) {
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
      
      asasNumber = format
        .replace(/{YYYY}/g, afghanYear)
        .replace(/{YY}/g, afghanYearShort)
        .replace(/{SEQ}/g, counter.seq.toString().padStart(4, '0'));
    } else if (!asasNumber) {
      return res.status(400).json({ success: false, message: 'شماره اساس باید وارد شود یا تولید خودکار انتخاب گردد' });
    }

    // Check if Asas is already taken by another student
    const existingAsas = await AfghanStudent.findOne({ asasNumber, _id: { $ne: id }, status: { $ne: 'deleted' } });
    if (existingAsas) {
      return res.status(400).json({ success: false, message: 'این شماره اساس از قبل برای دانش‌آموز دیگری ثبت شده است' });
    }

    student.verificationStatus = 'verified';
    student.status = 'active'; // Once verified, they become active
    student.asasNumber = asasNumber;
    student.updatedAt = new Date();
    student.lastUpdatedBy = req.user.id;

    await ensureStudentLinkedUser(student, { forceActive: true });

    await student.save();

    const populatedStudent = await AfghanStudent.findById(id)
      .populate('academicInfo.currentSchool', 'name province district')
      .populate('createdBy', 'firstName lastName')
      .populate('lastUpdatedBy', 'firstName lastName');

    res.json({
      success: true,
      message: 'دانش‌آموز تایید شد و شماره اساس اختصاص یافت',
      data: populatedStudent
    });

  } catch (error) {
    console.error('Error verifying student:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در تایید دانش‌آموز',
      error: error.message
    });
  }
});

// Delete student (soft delete)
router.delete('/:id', requireAuth, requireRole(['admin', 'principal']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { id } = req.params;

    const student = await AfghanStudent.findByIdAndUpdate(
      id,
      { 
        status: 'deleted',
        deletedAt: new Date(),
        lastUpdatedBy: req.user.id,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'دانش‌آموز یافت نشد'
      });
    }

    res.json({
      success: true,
      message: 'دانش‌آموز با موفقیت حذف شد'
    });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در حذف دانش‌آموز',
      error: error.message
    });
  }
});

// Search students
router.get('/search/:schoolId', requireAuth, requireRole(['admin', 'principal', 'teacher', 'registration_manager']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { q, academicYearId, classId, shiftId, gender, status } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'عبارت جستجو الزامی است'
      });
    }

    let query = {
      'academicInfo.currentSchool': schoolId,
      status: { $ne: 'deleted' },
      $or: [
        { 'personalInfo.firstName': { $regex: q, $options: 'i' } },
        { 'personalInfo.lastName': { $regex: q, $options: 'i' } },
        { 'personalInfo.firstNameDari': { $regex: q, $options: 'i' } },
        { 'personalInfo.lastNameDari': { $regex: q, $options: 'i' } },
        { 'identification.tazkiraNumber': { $regex: q, $options: 'i' } },
        { 'contactInfo.phone': { $regex: q, $options: 'i' } },
        { 'contactInfo.email': { $regex: q, $options: 'i' } }
      ]
    };

    if (status) query.status = status;
    if (gender) query['personalInfo.gender'] = gender;

    const students = await AfghanStudent.find(query)
      .populate('academicInfo.currentSchool', 'name province district')
      .populate('createdBy', 'firstName lastName')
      .limit(20)
      .lean();

    res.json({
      success: true,
      data: students
    });
  } catch (error) {
    console.error('Error searching students:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در جستجوی دانش‌آموزان',
      error: error.message
    });
  }
});

// Get student statistics
router.get('/stats/:schoolId', requireAuth, requireRole(['admin', 'principal', 'teacher']), requirePermission('view_reports'), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { academicYearId } = req.query;

    let matchQuery = { 
      'academicInfo.currentSchool': schoolId,
      status: { $ne: 'deleted' }
    };

    const cacheKey = `stats_${schoolId}_${academicYearId || 'all'}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const stats = await AfghanStudent.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
          graduated: { $sum: { $cond: [{ $eq: ['$status', 'graduated'] }, 1, 0] } },
          transferred: { $sum: { $cond: [{ $eq: ['$status', 'transferred'] }, 1, 0] } },
          suspended: { $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] } },
          male: { $sum: { $cond: [{ $eq: ['$personalInfo.gender', 'male'] }, 1, 0] } },
          female: { $sum: { $cond: [{ $eq: ['$personalInfo.gender', 'female'] }, 1, 0] } }
        }
      }
    ]);

    const result = stats[0] || {
      total: 0,
      active: 0,
      inactive: 0,
      graduated: 0,
      transferred: 0,
      suspended: 0,
      male: 0,
      female: 0
    };

    cache.set(cacheKey, result);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting student statistics:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت آمار دانش‌آموزان',
      error: error.message
    });
  }
});

module.exports = router;
