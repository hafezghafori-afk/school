const express = require('express');
const mongoose = require('mongoose');
const AfghanStudent = require('../models/AfghanStudent');
const AfghanSchool = require('../models/AfghanSchool');
const { requireFields } = require('../middleware/validate');
const Counter = require('../models/Counter');
const SiteSettings = require('../models/SiteSettings');
const { ok, fail } = require('../utils/response');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');
const cache = require('../utils/simpleCache');
const { requireAuth, requireRole, requirePermission, requireAnyPermission } = require('../middleware/auth');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'AfghanStudent', actionPrefix: 'afghan_student', audit: auditWrite });

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
      return ok(res, cachedData, 'Student dashboard statistics retrieved successfully (cached)');
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

    return ok(res, stats, 'Student dashboard statistics retrieved successfully');
  } catch (error) {
    console.error('Student Dashboard Error:', error);
    return fail(res, 'Failed to retrieve student dashboard statistics', 500);
  }
});

// GET /api/afghan-students - Get all students with filtering
router.get('/', requireAuth, requireRole(['admin', 'principal', 'teacher']), requirePermission('manage_content'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
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
      query.$or = [
        { 'personalInfo.firstName': { $regex: search, $options: 'i' } },
        { 'personalInfo.lastName': { $regex: search, $options: 'i' } },
        { 'personalInfo.firstNameDari': { $regex: search, $options: 'i' } },
        { 'personalInfo.lastNameDari': { $regex: search, $options: 'i' } },
        { 'identification.tazkiraNumber': { $regex: search, $options: 'i' } }
      ];
    }

    const students = await AfghanStudent.find(query)
      .populate('academicInfo.currentSchool', 'name province district')
      .populate('createdBy', 'name email')
      .populate('lastUpdatedBy', 'name email')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })
      .lean();

    const total = await AfghanStudent.countDocuments(query);

    return ok(res, {
      students,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }, 'Students retrieved successfully');
  } catch (error) {
    console.error('Get Students Error:', error);
    return fail(res, 'Failed to retrieve students', 500);
  }
});

// GET /api/afghan-students/:id - Get single student
router.get('/:id', requireAuth, requireRole(['admin', 'principal', 'teacher']), requirePermission('manage_content'), async (req, res) => {
  try {
    const student = await AfghanStudent.findById(req.params.id)
      .populate('academicInfo.currentSchool', 'name province district schoolType')
      .populate('createdBy', 'name email')
      .populate('lastUpdatedBy', 'name email')
      .lean();

    if (!student) {
      return fail(res, 'Student not found', 404);
    }

    return ok(res, student, 'Student retrieved successfully');
  } catch (error) {
    console.error('Get Student Error:', error);
    return fail(res, 'Failed to retrieve student', 500);
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

    // Check if tazkira number already exists
    const existingStudent = await AfghanStudent.findOne({ 
      'identification.tazkiraNumber': studentData.identification.tazkiraNumber 
    });
    if (existingStudent) {
      return fail(res, 'Tazkira number already exists', 400);
    }

    // Validate school exists
    const school = await AfghanSchool.findById(studentData.academicInfo.currentSchool);
    if (!school) {
      return fail(res, 'School not found', 400);
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

    // Populate school info for response
    await student.populate('academicInfo.currentSchool', 'name province district');

    return ok(res, student, 'Student created successfully', 201);
  } catch (error) {
    console.error('Create Student Error:', error);
    if (error.code === 11000) {
      return fail(res, 'Tazkira number already exists', 400);
    }
    return fail(res, 'Failed to create student', 500);
  }
});

// PUT /api/afghan-students/:id - Update student
router.put('/:id', requireAuth, requireRole(['admin', 'principal', 'registration_manager']), requirePermission('manage_content'), async (req, res) => {
  try {
    const studentData = {
      ...req.body,
      lastUpdatedBy: req.user?.id || 'system'
    };

    // If updating school, validate it exists
    if (studentData.academicInfo?.currentSchool) {
      const school = await AfghanSchool.findById(studentData.academicInfo.currentSchool);
      if (!school) {
        return fail(res, 'School not found', 400);
      }
    }

    const student = await AfghanStudent.findByIdAndUpdate(
      req.params.id,
      studentData,
      { new: true, runValidators: true }
    ).populate('academicInfo.currentSchool', 'name province district');

    if (!student) {
      return fail(res, 'Student not found', 404);
    }

    return ok(res, student, 'Student updated successfully');
  } catch (error) {
    console.error('Update Student Error:', error);
    if (error.code === 11000) {
      return fail(res, 'Tazkira number already exists', 400);
    }
    return fail(res, 'Failed to update student', 500);
  }
});

// DELETE /api/afghan-students/:id - Delete student
router.delete('/:id', requireAuth, requireRole(['admin', 'principal']), requirePermission('manage_content'), async (req, res) => {
  try {
    const student = await AfghanStudent.findByIdAndDelete(req.params.id);
    if (!student) {
      return fail(res, 'Student not found', 404);
    }

    return ok(res, student, 'Student deleted successfully');
  } catch (error) {
    console.error('Delete Student Error:', error);
    return fail(res, 'Failed to delete student', 500);
  }
});

// POST /api/afghan-students/bulk - Bulk create students
router.post('/bulk', requireAuth, requireRole(['admin', 'principal']), requirePermission('manage_content'), requireFields(['students']), async (req, res) => {
  try {
    const { students } = req.body;
    
    if (!Array.isArray(students) || students.length === 0) {
      return fail(res, 'Students array is required and cannot be empty', 400);
    }

    if (students.length > 100) {
      return fail(res, 'Cannot create more than 100 students at once', 400);
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

    return ok(res, results, 'Bulk student creation completed');
  } catch (error) {
    console.error('Bulk Create Students Error:', error);
    return fail(res, 'Failed to create students in bulk', 500);
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

    return ok(res, attendanceStats, 'Attendance statistics retrieved successfully');
  } catch (error) {
    console.error('Attendance Stats Error:', error);
    return fail(res, 'Failed to retrieve attendance statistics', 500);
  }
});

// POST /api/afghan-students/:id/update-attendance - Update student attendance
router.post('/:id/update-attendance', requireAuth, requireRole(['admin', 'principal', 'teacher']), requirePermission('manage_content'), requireFields(['presentDays', 'totalDays']), async (req, res) => {
  try {
    const { presentDays, totalDays } = req.body;
    
    if (presentDays > totalDays) {
      return fail(res, 'Present days cannot exceed total days', 400);
    }

    const student = await AfghanStudent.findById(req.params.id);
    if (!student) {
      return fail(res, 'Student not found', 404);
    }

    student.academicInfo.attendanceRecord = {
      totalDays: student.academicInfo.attendanceRecord.totalDays + totalDays,
      presentDays: student.academicInfo.attendanceRecord.presentDays + presentDays,
      absentDays: student.academicInfo.attendanceRecord.absentDays + (totalDays - presentDays),
      lateDays: student.academicInfo.attendanceRecord.lateDays
    };

    student.lastUpdatedBy = req.user?.id || 'system';
    await student.save();

    return ok(res, student.academicInfo.attendanceRecord, 'Attendance updated successfully');
  } catch (error) {
    console.error('Update Attendance Error:', error);
    return fail(res, 'Failed to update attendance', 500);
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
    performanceStats.needsImprovement.sort((a, b) => a.gpa - b.gpa);

    return ok(res, performanceStats, 'Performance statistics retrieved successfully');
  } catch (error) {
    console.error('Performance Stats Error:', error);
    return fail(res, 'Failed to retrieve performance statistics', 500);
  }
});

module.exports = router;
