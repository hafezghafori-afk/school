const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const TeacherAssignment = require('../models/TeacherAssignment');
const TeacherAvailability = require('../models/TeacherAvailability');
const SchoolClass = require('../models/SchoolClass');
const Subject = require('../models/Subject');
const AcademicYear = require('../models/AcademicYear');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');
const { ensureTeacherAssignmentsFromLegacyMappings } = require('../services/timetableService');

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'TeacherAssignment', actionPrefix: 'teacher_assignment', audit: auditWrite });

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const ACTIVE_ASSIGNMENT_STATUSES = ['planned', 'active', 'pending'];

const resolveSchoolIdForAssignment = async (schoolIdParam, payload = {}) => {
  const normalized = String(schoolIdParam || '').trim();
  if (normalized && normalized !== 'default-school-id' && isValidObjectId(normalized)) {
    return normalized;
  }

  const schoolFromBody = String(payload.schoolId || '').trim();
  if (schoolFromBody && schoolFromBody !== 'default-school-id' && isValidObjectId(schoolFromBody)) {
    return schoolFromBody;
  }

  const yearId = String(payload.academicYearId || '').trim();
  if (yearId && isValidObjectId(yearId)) {
    const year = await AcademicYear.findById(yearId).select('schoolId');
    if (year?.schoolId) return year.schoolId.toString();
  }

  const classId = String(payload.classId || '').trim();
  if (classId && isValidObjectId(classId)) {
    const schoolClass = await SchoolClass.findById(classId).select('schoolId');
    if (schoolClass?.schoolId) return schoolClass.schoolId.toString();
  }

  return '';
};

const resolveShiftIdForAssignment = async (assignmentData = {}) => {
  const classId = String(assignmentData.classId || '').trim();
  if (!classId || !isValidObjectId(classId)) return '';
  const schoolClass = await SchoolClass.findById(classId).select('shiftId');
  return String(schoolClass?.shiftId || '').trim();
};

const getTeacherWeeklyLoad = async ({ schoolId, teacherUserId, academicYearId, shiftId, excludeAssignmentId = '' }) => {
  const query = {
    schoolId,
    teacherUserId,
    academicYearId,
    status: { $in: ACTIVE_ASSIGNMENT_STATUSES }
  };

  if (excludeAssignmentId && isValidObjectId(excludeAssignmentId)) {
    query._id = { $ne: excludeAssignmentId };
  }

  const assignments = await TeacherAssignment.find(query)
    .select('weeklyPeriods classId')
    .populate('classId', 'shiftId');

  return assignments.reduce((sum, item) => {
    const assignmentShiftId = String(item?.classId?.shiftId || '').trim();
    if (shiftId && assignmentShiftId && assignmentShiftId !== shiftId) return sum;
    return sum + (Number(item.weeklyPeriods) || 0);
  }, 0);
};

const resolveTeacherWeeklyCapacity = async ({
  schoolId,
  teacherUserId,
  academicYearId,
  shiftId,
  fallbackMaxPeriodsPerWeek
}) => {
  if (shiftId && isValidObjectId(shiftId)) {
    const availability = await TeacherAvailability.findOne({
      schoolId,
      teacherId: teacherUserId,
      academicYearId,
      shiftId,
      status: 'active'
    }).select('maxPeriodsPerWeek');

    const availabilityMax = Number(availability?.maxPeriodsPerWeek);
    if (Number.isFinite(availabilityMax) && availabilityMax > 0) {
      return availabilityMax;
    }
  }

  const fallback = Number(fallbackMaxPeriodsPerWeek);
  if (Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }

  return 24;
};

const validateTeacherCapacity = async ({ assignmentData, schoolId, excludeAssignmentId = '', extraWeeklyLoad = 0 }) => {
  const teacherUserId = String(assignmentData.teacherUserId || '').trim();
  const academicYearId = String(assignmentData.academicYearId || '').trim();
  const requestedWeeklyPeriods = Number(assignmentData.weeklyPeriods) || 0;

  if (!teacherUserId || !academicYearId || requestedWeeklyPeriods <= 0) {
    return null;
  }

  const shiftId = await resolveShiftIdForAssignment(assignmentData);
  const baseLoad = await getTeacherWeeklyLoad({
    schoolId,
    teacherUserId,
    academicYearId,
    shiftId,
    excludeAssignmentId
  });
  const maxPeriodsPerWeek = await resolveTeacherWeeklyCapacity({
    schoolId,
    teacherUserId,
    academicYearId,
    shiftId,
    fallbackMaxPeriodsPerWeek: assignmentData.maxPeriodsPerWeek
  });

  const projectedLoad = baseLoad + (Number(extraWeeklyLoad) || 0) + requestedWeeklyPeriods;
  if (projectedLoad <= maxPeriodsPerWeek) {
    return null;
  }

  return {
    shiftId,
    currentLoad: baseLoad + (Number(extraWeeklyLoad) || 0),
    requestedWeeklyPeriods,
    projectedLoad,
    maxPeriodsPerWeek
  };
};

// Get teacher assignments for a school
router.get('/school/:schoolId', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    await ensureTeacherAssignmentsFromLegacyMappings();
    const { schoolId } = req.params;
    const { academicYearId, classId, teacherId } = req.query;
    
    let query = schoolId === 'default-school-id' ? {} : { schoolId };
    if (academicYearId) query.academicYearId = academicYearId;
    if (classId) query.classId = classId;
    if (teacherId) query.teacherUserId = teacherId;

    const assignments = await TeacherAssignment.find(query)
      .populate('academicYearId', 'title status')
      .populate('classId', 'title gradeLevel section genderType')
      .populate('subjectId', 'name nameDari namePashto code category')
      .populate('teacherUserId', 'name email')
      .sort({ priority: 1, createdAt: -1 });

    res.json({
      success: true,
      data: assignments
    });
  } catch (error) {
    console.error('Error fetching teacher assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher assignments',
      error: error.message
    });
  }
});

// Create new teacher assignment
router.post('/school/:schoolId', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const schoolId = await resolveSchoolIdForAssignment(req.params.schoolId, req.body);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'شناسه مکتب معتبر نیست. ابتدا سال تعلیمی و صنف معتبر را انتخاب کنید.'
      });
    }

    const assignmentData = {
      ...req.body,
      schoolId,
      createdBy: req.user.id
    };

    // Check if assignment already exists for this combination
    const existing = await TeacherAssignment.findOne({
      schoolId,
      academicYearId: assignmentData.academicYearId,
      classId: assignmentData.classId,
      subjectId: assignmentData.subjectId,
      teacherUserId: assignmentData.teacherUserId
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Teacher assignment already exists for this combination'
      });
    }

    const capacityViolation = await validateTeacherCapacity({
      assignmentData,
      schoolId
    });

    if (capacityViolation) {
      return res.status(400).json({
        success: false,
        message: `این استاد در همین نوبت/سال ظرفیت کافی ندارد. بار فعلی ${capacityViolation.currentLoad} ساعت، درخواستی ${capacityViolation.requestedWeeklyPeriods} ساعت، سقف مجاز ${capacityViolation.maxPeriodsPerWeek} ساعت.`
      });
    }

    const assignment = new TeacherAssignment(assignmentData);
    await assignment.save();

    const populatedAssignment = await TeacherAssignment.findById(assignment._id)
      .populate('academicYearId', 'title status')
      .populate('classId', 'title gradeLevel section genderType')
      .populate('subjectId', 'name nameDari namePashto code category')
      .populate('teacherUserId', 'name email');

    res.status(201).json({
      success: true,
      message: 'Teacher assignment created successfully',
      data: populatedAssignment
    });
  } catch (error) {
    console.error('Error creating teacher assignment:', error);
    if (error?.code === 11000 && String(error?.keyPattern?.legacyInstructorSubjectId || '') === '1') {
      return res.status(400).json({
        success: false,
        message: 'ایندکس قدیمی تخصیص استاد باعث تداخل شده است. یک‌بار backend را بازآغاز کنید تا ایندکس اصلاح شود، سپس دوباره تلاش کنید.'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating teacher assignment',
      error: error.message
    });
  }
});

// Update teacher assignment
router.put('/:id', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedBy: req.user.id
    };

    const assignment = await TeacherAssignment.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('academicYearId', 'title status')
      .populate('classId', 'title gradeLevel section genderType')
      .populate('subjectId', 'name nameDari namePashto code category')
      .populate('teacherUserId', 'name email');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Teacher assignment not found'
      });
    }

    res.json({
      success: true,
      message: 'Teacher assignment updated successfully',
      data: assignment
    });
  } catch (error) {
    console.error('Error updating teacher assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating teacher assignment',
      error: error.message
    });
  }
});

// Delete teacher assignment
router.delete('/:id', requireAuth, checkRole(['admin', 'principal']), async (req, res) => {
  try {
    const assignment = await TeacherAssignment.findByIdAndDelete(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Teacher assignment not found'
      });
    }

    res.json({
      success: true,
      message: 'Teacher assignment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting teacher assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting teacher assignment',
      error: error.message
    });
  }
});

// Get assignments by teacher
router.get('/teacher/:teacherId', requireAuth, async (req, res) => {
  try {
    await ensureTeacherAssignmentsFromLegacyMappings();
    const { teacherId } = req.params;
    const { academicYearId } = req.query;

    let query = { teacherUserId: teacherId };
    if (academicYearId) query.academicYearId = academicYearId;

    const assignments = await TeacherAssignment.find(query)
      .populate('academicYearId', 'title status')
      .populate('classId', 'title gradeLevel section genderType')
      .populate('subjectId', 'name nameDari namePashto code category')
      .sort({ priority: 1 });

    // Calculate teacher load
    const totalWeeklyPeriods = assignments.reduce((sum, assignment) => sum + assignment.weeklyPeriods, 0);
    const totalClasses = assignments.length;

    res.json({
      success: true,
      data: {
        assignments,
        summary: {
          totalWeeklyPeriods,
          totalClasses,
          totalSubjects: new Set(assignments.map(a => a.subjectId._id.toString())).size
        }
      }
    });
  } catch (error) {
    console.error('Error fetching teacher assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher assignments',
      error: error.message
    });
  }
});

// Get assignments by class
router.get('/class/:classId', requireAuth, async (req, res) => {
  try {
    await ensureTeacherAssignmentsFromLegacyMappings();
    const { classId } = req.params;
    const { academicYearId } = req.query;

    let query = { classId };
    if (academicYearId) query.academicYearId = academicYearId;

    const assignments = await TeacherAssignment.find(query)
      .populate('academicYearId', 'title status')
      .populate('subjectId', 'name nameDari namePashto code category')
      .populate('teacherUserId', 'name email')
      .sort({ priority: 1, createdAt: -1 });

    res.json({
      success: true,
      data: assignments
    });
  } catch (error) {
    console.error('Error fetching class assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching class assignments',
      error: error.message
    });
  }
});

// Get available teachers for a subject
router.get('/available-teachers/:schoolId', requireAuth, async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { subjectId, academicYearId } = req.query;
    const assignmentFilter = schoolId === 'default-school-id' ? {} : { schoolId };

    const teachers = await User.find({
      role: { $in: ['instructor', 'teacher', 'professor', 'admin'] },
      status: 'active'
    })
      .select('name email subject');

    const currentAssignments = await TeacherAssignment.find({
      ...assignmentFilter,
      academicYearId,
      subjectId
    })
      .populate('teacherUserId', 'name email');

    const assignedTeacherIds = currentAssignments
      .map((assignment) => assignment.teacherUserId?._id?.toString())
      .filter(Boolean);

    const availableTeachers = teachers.map(teacher => ({
      ...teacher.toObject(),
      isCurrentlyAssigned: assignedTeacherIds.includes(teacher._id.toString()),
      currentLoad: currentAssignments.filter((assignment) => assignment.teacherUserId?._id?.toString() === teacher._id.toString()).length
    }));

    res.json({
      success: true,
      data: availableTeachers
    });
  } catch (error) {
    console.error('Error fetching available teachers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available teachers',
      error: error.message
    });
  }
});

// Bulk create teacher assignments
router.post('/bulk', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const { assignments } = req.body;

    const results = [];
    const errors = [];
    const stagedLoads = new Map();
    const baseLoads = new Map();

    for (const assignmentData of assignments) {
      try {
        const schoolId = await resolveSchoolIdForAssignment(assignmentData.schoolId, assignmentData);
        if (!schoolId) {
          errors.push({
            data: assignmentData,
            error: 'شناسه مکتب معتبر نیست.'
          });
          continue;
        }

        // Check if already exists
        const existing = await TeacherAssignment.findOne({
          schoolId,
          academicYearId: assignmentData.academicYearId,
          classId: assignmentData.classId,
          subjectId: assignmentData.subjectId,
          teacherUserId: assignmentData.teacherUserId
        });

        if (!existing) {
          const shiftId = await resolveShiftIdForAssignment(assignmentData);
          const stagedKey = [
            schoolId,
            String(assignmentData.teacherUserId || ''),
            String(assignmentData.academicYearId || ''),
            shiftId || 'no-shift'
          ].join(':');

          if (!stagedLoads.has(stagedKey)) {
            const baseLoad = await getTeacherWeeklyLoad({
              schoolId,
              teacherUserId: assignmentData.teacherUserId,
              academicYearId: assignmentData.academicYearId,
              shiftId
            });
            stagedLoads.set(stagedKey, baseLoad);
            baseLoads.set(stagedKey, baseLoad);
          }

          const extraWeeklyLoad = (stagedLoads.get(stagedKey) || 0) - (baseLoads.get(stagedKey) || 0);

          const capacityViolation = await validateTeacherCapacity({
            assignmentData,
            schoolId,
            extraWeeklyLoad
          });

          if (capacityViolation) {
            errors.push({
              data: assignmentData,
              error: `Teacher capacity exceeded: current=${capacityViolation.currentLoad}, requested=${capacityViolation.requestedWeeklyPeriods}, max=${capacityViolation.maxPeriodsPerWeek}`
            });
            continue;
          }

          const assignment = new TeacherAssignment({
            ...assignmentData,
            schoolId,
            createdBy: req.user.id
          });
          await assignment.save();

          const requestedWeeklyPeriods = Number(assignmentData.weeklyPeriods) || 0;
          stagedLoads.set(stagedKey, (stagedLoads.get(stagedKey) || 0) + requestedWeeklyPeriods);
          
          const populated = await TeacherAssignment.findById(assignment._id)
            .populate('academicYearId', 'title status')
            .populate('classId', 'title gradeLevel section genderType')
            .populate('subjectId', 'name nameDari namePashto code category')
            .populate('teacherUserId', 'name email');
          
          results.push(populated);
        }
      } catch (error) {
        errors.push({
          data: assignmentData,
          error: error.message
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `${results.length} teacher assignments created successfully`,
      data: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error bulk creating teacher assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk creating teacher assignments',
      error: error.message
    });
  }
});

// Get teacher workload summary
router.get('/workload/:schoolId', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    await ensureTeacherAssignmentsFromLegacyMappings();
    const { schoolId } = req.params;
    const { academicYearId } = req.query;

    const assignments = await TeacherAssignment.find({
      ...(schoolId === 'default-school-id' ? {} : { schoolId }),
      academicYearId,
      status: 'active'
    })
      .populate('teacherUserId', 'name email')
      .populate('subjectId', 'name category')
      .populate('classId', 'gradeLevel section')
      .sort({ createdAt: -1 });

    // Group by teacher
    const workloadByTeacher = {};
    assignments.forEach(assignment => {
      const teacherId = assignment.teacherUserId._id.toString();
      if (!workloadByTeacher[teacherId]) {
        workloadByTeacher[teacherId] = {
          teacher: assignment.teacherUserId,
          totalPeriods: 0,
          totalClasses: 0,
          totalSubjects: new Set(),
          assignments: []
        };
      }
      
      workloadByTeacher[teacherId].totalPeriods += assignment.weeklyPeriods;
      workloadByTeacher[teacherId].totalClasses += 1;
      workloadByTeacher[teacherId].totalSubjects.add(assignment.subjectId._id.toString());
      workloadByTeacher[teacherId].assignments.push(assignment);
    });

    // Convert Sets to counts
    Object.values(workloadByTeacher).forEach(workload => {
      workload.totalSubjects = workload.totalSubjects.size;
    });

    const summary = {
      totalTeachers: Object.keys(workloadByTeacher).length,
      totalAssignments: assignments.length,
      averagePeriodsPerTeacher: Object.keys(workloadByTeacher).length
        ? assignments.reduce((sum, a) => sum + a.weeklyPeriods, 0) / Object.keys(workloadByTeacher).length
        : 0,
      teachers: Object.values(workloadByTeacher)
    };

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching workload summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching workload summary',
      error: error.message
    });
  }
});

module.exports = router;
