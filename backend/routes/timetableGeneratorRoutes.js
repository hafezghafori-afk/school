const express = require('express');
const router = express.Router();
const TimetableEntry = require('../models/TimetableEntry');
const TeacherAssignment = require('../models/TeacherAssignment');
const CurriculumRule = require('../models/CurriculumRule');
const PeriodDefinition = require('../models/PeriodDefinition');
const TeacherAvailability = require('../models/TeacherAvailability');
const SchoolClass = require('../models/SchoolClass');
const Subject = require('../models/Subject');
const User = require('../models/User');
const StudentMembership = require('../models/StudentMembership');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'TimetableGenerator', actionPrefix: 'timetable_generator', audit: auditWrite });

const hasExplicitAvailablePeriods = (availablePeriods = []) => {
  return Array.isArray(availablePeriods)
    && availablePeriods.some((slot) => Array.isArray(slot?.periodIndexes) && slot.periodIndexes.length > 0);
};

const isPeriodExplicitlyAvailable = (teacherAvail, dayCode, periodIndex) => {
  const periods = Array.isArray(teacherAvail?.availablePeriods) ? teacherAvail.availablePeriods : [];
  if (!hasExplicitAvailablePeriods(periods)) return true;

  const daySlot = periods.find((slot) => slot?.dayCode === dayCode);
  const indexes = Array.isArray(daySlot?.periodIndexes) ? daySlot.periodIndexes : [];
  return indexes.includes(periodIndex);
};

const TIMETABLE_MANAGEMENT_ROLES = new Set(['admin', 'principal', 'timetable_manager']);

async function respondTimetableForbidden(req, res, {
  message,
  scope,
  targetType,
  targetId,
  reason,
  meta
} = {}) {
  await logActivity({
    req,
    action: 'timetable_access_forbidden',
    targetType: targetType || 'TimetableAccess',
    targetId: String(targetId || ''),
    reason: String(reason || 'timetable_access_denied'),
    meta: {
      scope: String(scope || ''),
      ...(meta && typeof meta === 'object' ? meta : {})
    }
  });

  return res.status(403).json({
    success: false,
    message: message || 'دسترسی مجاز نیست.'
  });
}

async function resolveStudentAllowedClassId({ userId, academicYearId }) {
  if (!userId) return '';
  const query = {
    student: userId,
    isCurrent: true,
    status: { $in: ['active', 'pending', 'suspended', 'transferred_in'] }
  };
  if (academicYearId) {
    query.$or = [{ academicYearId }, { academicYear: academicYearId }];
  }

  let membership = await StudentMembership.findOne(query)
    .select('classId academicYearId createdAt joinedAt')
    .sort({ joinedAt: -1, createdAt: -1 });

  if (!membership && academicYearId) {
    membership = await StudentMembership.findOne({
      student: userId,
      isCurrent: true,
      status: { $in: ['active', 'pending', 'suspended', 'transferred_in'] }
    })
      .select('classId academicYearId createdAt joinedAt')
      .sort({ joinedAt: -1, createdAt: -1 });
  }

  return String(membership?.classId || '');
}

// Generate timetable for a specific configuration
router.post('/generate', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const { schoolId, academicYearId, shiftId } = req.body;

    if (!schoolId || !academicYearId || !shiftId) {
      return res.status(400).json({
        success: false,
        message: 'School ID, academic year ID, and shift ID are required'
      });
    }

    // Clear existing timetable entries for this configuration
    await TimetableEntry.deleteMany({
      schoolId,
      academicYearId,
      shiftId
    });

    // Get all necessary data
    const [
      assignments,
      curriculumRules,
      periodDefinitions,
      teacherAvailabilities,
      classes,
      subjects
    ] = await Promise.all([
      TeacherAssignment.find({
        schoolId,
        academicYearId,
        status: 'active'
      })
        .populate('classId', 'title gradeLevel section genderType')
        .populate('subjectId', 'name category requiresLab requiresComputer')
        .populate('teacherUserId', 'name'),
      
      CurriculumRule.find({
        schoolId,
        academicYearId,
        status: 'active'
      })
        .populate('classId', 'title gradeLevel section genderType')
        .populate('subjectId', 'name category'),
      
      PeriodDefinition.find({})
        .populate({
          path: 'timetableConfigurationId',
          match: { academicYearId, shiftId }
        }),
      
      TeacherAvailability.find({
        schoolId,
        academicYearId,
        shiftId,
        status: 'active'
      })
        .populate('teacherId', 'name'),
      
      SchoolClass.find({
        schoolId,
        academicYearId,
        status: 'active'
      }),
      
      Subject.find({ schoolId, status: 'active' })
    ]);

    // Filter period definitions for this configuration
    const relevantPeriodDefinitions = periodDefinitions.filter(
      pd => pd.timetableConfigurationId
    );

    if (relevantPeriodDefinitions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No period definitions found for this configuration'
      });
    }

    const availableSlots = relevantPeriodDefinitions
      .filter((period) => period.type === 'class')
      .sort((a, b) => {
        if (a.dayCode === b.dayCode) return a.periodIndex - b.periodIndex;
        return a.dayCode.localeCompare(b.dayCode);
      });
    const lastClassPeriodIndex = availableSlots.reduce((max, slot) => Math.max(max, Number(slot?.periodIndex) || 0), 0);

    // Create availability matrix
    const availabilityMatrix = {};
    teacherAvailabilities.forEach(avail => {
      const teacherId = avail.teacherId._id.toString();
      availabilityMatrix[teacherId] = {
        availableDays: avail.availableDays || [],
        availablePeriods: avail.availablePeriods || [],
        unavailablePeriods: avail.unavailablePeriods || [],
        preferredOffPeriods: avail.preferredOffPeriods || [],
        maxPeriodsPerDay: avail.maxPeriodsPerDay,
        maxPeriodsPerWeek: avail.maxPeriodsPerWeek,
        prefersConsecutivePeriods: avail.prefersConsecutivePeriods,
        avoidFirstPeriod: avail.avoidFirstPeriod,
        avoidLastPeriod: avail.avoidLastPeriod,
        minGapBetweenPeriods: avail.minGapBetweenPeriods,
        specialConstraints: avail.specialConstraints || {}
      };
    });

    // Sort assignments by priority and constraints
    const sortedAssignments = assignments.sort((a, b) => {
      // First by priority
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      
      // Then by teacher constraints (more constrained first)
      const aTeacherAvail = availabilityMatrix[a.teacherUserId._id.toString()];
      const bTeacherAvail = availabilityMatrix[b.teacherUserId._id.toString()];
      
      const aConstraints = (aTeacherAvail?.avoidFirstPeriod ? 1 : 0) + 
                         (aTeacherAvail?.avoidLastPeriod ? 1 : 0) +
                         (aTeacherAvail?.specialConstraints?.onlyMorningShift ? 1 : 0) +
                         (aTeacherAvail?.specialConstraints?.onlyAfternoonShift ? 1 : 0);
      
      const bConstraints = (bTeacherAvail?.avoidFirstPeriod ? 1 : 0) + 
                         (bTeacherAvail?.avoidLastPeriod ? 1 : 0) +
                         (bTeacherAvail?.specialConstraints?.onlyMorningShift ? 1 : 0) +
                         (bTeacherAvail?.specialConstraints?.onlyAfternoonShift ? 1 : 0);
      
      return bConstraints - aConstraints;
    });

    // Generate timetable
    const generatedEntries = [];
    const conflicts = [];
    const unscheduledAssignments = [];
    const teacherLoadTracker = {};

    const getTeacherDayLoad = (teacherId, dayCode) => {
      if (!teacherLoadTracker[teacherId]) return 0;
      return teacherLoadTracker[teacherId].daily[dayCode] || 0;
    };

    const getTeacherWeekLoad = (teacherId) => {
      if (!teacherLoadTracker[teacherId]) return 0;
      return teacherLoadTracker[teacherId].weekly || 0;
    };

    const increaseTeacherLoad = (teacherId, dayCode) => {
      if (!teacherLoadTracker[teacherId]) {
        teacherLoadTracker[teacherId] = { weekly: 0, daily: {} };
      }
      teacherLoadTracker[teacherId].weekly += 1;
      teacherLoadTracker[teacherId].daily[dayCode] = (teacherLoadTracker[teacherId].daily[dayCode] || 0) + 1;
    };

    for (const assignment of sortedAssignments) {
      const scheduledPeriods = [];
      
      for (const periodDef of availableSlots) {
        if (scheduledPeriods.length >= assignment.weeklyPeriods) break;

        const dayCode = periodDef.dayCode;
        const periodIndex = periodDef.periodIndex;
        const teacherId = assignment.teacherUserId._id.toString();
        const classId = assignment.classId._id.toString();

        const teacherAvail = availabilityMatrix[teacherId];
        if (!teacherAvail) continue;
        if (!teacherAvail.availableDays.includes(dayCode)) continue;
        if (!isPeriodExplicitlyAvailable(teacherAvail, dayCode, periodIndex)) continue;

        const teacherDayLoad = getTeacherDayLoad(teacherId, dayCode);
        const teacherWeekLoad = getTeacherWeekLoad(teacherId);
        if (teacherAvail.maxPeriodsPerDay && teacherDayLoad >= teacherAvail.maxPeriodsPerDay) continue;
        if (teacherAvail.maxPeriodsPerWeek && teacherWeekLoad >= teacherAvail.maxPeriodsPerWeek) continue;

        const alreadyScheduled = scheduledPeriods.some(
          (slot) => slot.dayCode === dayCode && slot.periodIndex === periodIndex
        );
        if (alreadyScheduled) continue;

        const unavailablePeriod = teacherAvail.unavailablePeriods.find(
          (slot) => slot.dayCode === dayCode && slot.periodIndexes.includes(periodIndex)
        );
        if (unavailablePeriod) continue;

        if (teacherAvail.avoidFirstPeriod && periodIndex === 1) continue;
        if (teacherAvail.avoidLastPeriod && lastClassPeriodIndex > 0 && periodIndex === lastClassPeriodIndex) continue;

        const existingEntry = await TimetableEntry.findOne({
          schoolId,
          academicYearId,
          shiftId,
          dayCode,
          periodIndex,
          $or: [
            { classId },
            { teacherId }
          ]
        });

        if (existingEntry) {
          conflicts.push({
            type: existingEntry.classId.toString() === classId ? 'class' : 'teacher',
            dayCode,
            periodIndex,
            assignment: assignment._id,
            conflictingEntry: existingEntry._id
          });
          continue;
        }

        if (assignment.subjectId.requiresLab && !periodDef.title?.includes('Lab')) continue;
        if (assignment.subjectId.requiresComputer && !periodDef.title?.includes('Computer')) continue;

        const entry = new TimetableEntry({
          schoolId,
          academicYearId,
          shiftId,
          classId,
          subjectId: assignment.subjectId._id,
          teacherId: assignment.teacherUserId._id,
          periodDefinitionId: periodDef._id,
          dayCode,
          periodIndex,
          startTime: periodDef.startTime,
          endTime: periodDef.endTime,
          source: 'auto',
          status: 'published',
          createdBy: req.user.id,
          lastModifiedBy: req.user.id,
          lastModifiedAt: new Date()
        });

        await entry.save();
        generatedEntries.push(entry);
        scheduledPeriods.push({ dayCode, periodIndex });
        increaseTeacherLoad(teacherId, dayCode);
      }
      
      if (scheduledPeriods.length < assignment.weeklyPeriods) {
        unscheduledAssignments.push({
          assignment: assignment._id,
          required: assignment.weeklyPeriods,
          scheduled: scheduledPeriods.length,
          teacher: assignment.teacherUserId.name || '---',
          subject: assignment.subjectId.name,
          class: assignment.classId.title
        });
      }
    }

    res.json({
      success: true,
      message: `Generated ${generatedEntries.length} timetable entries`,
      data: {
        generatedEntries,
        conflicts,
        unscheduledAssignments,
        summary: {
          totalAssignments: assignments.length,
          scheduledEntries: generatedEntries.length,
          conflicts: conflicts.length,
          unscheduledAssignments: unscheduledAssignments.length
        }
      }
    });
  } catch (error) {
    console.error('Error generating timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating timetable',
      error: error.message
    });
  }
});

// Get timetable entries
router.get('/entries/:schoolId', requireAuth, async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { academicYearId, shiftId, classId, teacherId } = req.query;
    const requesterRole = String(req.user?.role || '').toLowerCase();

    if (!TIMETABLE_MANAGEMENT_ROLES.has(requesterRole)) {
      return await respondTimetableForbidden(req, res, {
        message: 'فقط کاربران مدیریتی اجازه مشاهده نمای کلی تقسیم اوقات را دارند.',
        scope: 'entries',
        targetType: 'TimetableEntries',
        targetId: String(schoolId || ''),
        reason: 'entries_overview_forbidden',
        meta: {
          requesterRole,
          requestedClassId: String(classId || ''),
          requestedTeacherId: String(teacherId || '')
        }
      });
    }
    
    let query = schoolId === 'default-school-id' ? {} : { schoolId };
    if (academicYearId) query.academicYearId = academicYearId;
    if (shiftId) query.shiftId = shiftId;
    if (classId) query.classId = classId;
    if (teacherId) query.teacherId = teacherId;

    const entries = await TimetableEntry.find(query)
      .populate('academicYearId', 'title')
      .populate('shiftId', 'name')
      .populate('classId', 'title gradeLevel section genderType')
      .populate('subjectId', 'name category')
      .populate('teacherId', 'name')
      .populate('periodDefinitionId', 'startTime endTime type')
      .sort({ dayCode: 1, periodIndex: 1 });

    res.json({
      success: true,
      data: entries
    });
  } catch (error) {
    console.error('Error fetching timetable entries:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching timetable entries',
      error: error.message
    });
  }
});

// Get timetable by class
router.get('/class/:classId', requireAuth, async (req, res) => {
  try {
    const { classId } = req.params;
    const { academicYearId, shiftId } = req.query;
    const requesterRole = String(req.user?.role || '').toLowerCase();
    const requesterId = String(req.user?.id || '');

    if (requesterRole === 'student') {
      const allowedClassId = await resolveStudentAllowedClassId({ userId: requesterId, academicYearId });
      if (!allowedClassId || allowedClassId !== String(classId)) {
        return await respondTimetableForbidden(req, res, {
          message: 'شاگرد فقط اجازه مشاهده تقسیم اوقات صنف خودش را دارد.',
          scope: 'class',
          targetType: 'SchoolClass',
          targetId: String(classId || ''),
          reason: 'student_class_scope_mismatch',
          meta: {
            allowedClassId: String(allowedClassId || ''),
            requesterRole
          }
        });
      }
    }

    if (requesterRole === 'instructor') {
      const teacherEntriesForClass = await TimetableEntry.exists({ classId, teacherId: requesterId });
      if (!teacherEntriesForClass) {
        return await respondTimetableForbidden(req, res, {
          message: 'استاد فقط اجازه مشاهده صنف‌های مربوط به برنامه خودش را دارد.',
          scope: 'class',
          targetType: 'SchoolClass',
          targetId: String(classId || ''),
          reason: 'instructor_unassigned_class_forbidden',
          meta: {
            requesterRole,
            requesterId
          }
        });
      }
    }

    let query = { classId };
    if (academicYearId) query.academicYearId = academicYearId;
    if (shiftId) query.shiftId = shiftId;

    const entries = await TimetableEntry.find(query)
      .populate('academicYearId', 'title')
      .populate('shiftId', 'name')
      .populate('subjectId', 'name category')
      .populate('teacherId', 'name')
      .populate('periodDefinitionId', 'startTime endTime type')
      .sort({ dayCode: 1, periodIndex: 1 });

    // Group by day and period
    const timetable = {};
    const weekDays = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    
    weekDays.forEach(day => {
      timetable[day] = {};
      entries
        .filter(entry => entry.dayCode === day)
        .forEach(entry => {
          timetable[day][entry.periodIndex] = entry;
        });
    });

    res.json({
      success: true,
      data: {
        timetable,
        entries,
        summary: {
          totalPeriods: entries.length,
          uniqueSubjects: new Set(entries.map(e => e.subjectId._id.toString())).size,
          uniqueTeachers: new Set(entries.map(e => e.teacherId._id.toString())).size
        }
      }
    });
  } catch (error) {
    console.error('Error fetching class timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching class timetable',
      error: error.message
    });
  }
});

// Get timetable by teacher
router.get('/teacher/:teacherId', requireAuth, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { academicYearId, shiftId } = req.query;
    const requesterRole = String(req.user?.role || '').toLowerCase();
    const requesterId = String(req.user?.id || '');

    if (requesterRole === 'student') {
      return await respondTimetableForbidden(req, res, {
        message: 'شاگرد اجازه دسترسی به برنامه استاد را ندارد.',
        scope: 'teacher',
        targetType: 'User',
        targetId: String(teacherId || ''),
        reason: 'student_teacher_view_forbidden',
        meta: { requesterRole }
      });
    }

    if (requesterRole === 'instructor' && requesterId !== String(teacherId)) {
      return await respondTimetableForbidden(req, res, {
        message: 'استاد فقط اجازه مشاهده برنامه خودش را دارد.',
        scope: 'teacher',
        targetType: 'User',
        targetId: String(teacherId || ''),
        reason: 'instructor_other_teacher_forbidden',
        meta: {
          requesterRole,
          requesterId
        }
      });
    }

    let query = { teacherId };
    if (academicYearId) query.academicYearId = academicYearId;
    if (shiftId) query.shiftId = shiftId;

    const entries = await TimetableEntry.find(query)
      .populate('academicYearId', 'title')
      .populate('shiftId', 'name')
      .populate('classId', 'title gradeLevel section genderType')
      .populate('subjectId', 'name category')
      .populate('periodDefinitionId', 'startTime endTime type')
      .sort({ dayCode: 1, periodIndex: 1 });

    // Group by day and period
    const timetable = {};
    const weekDays = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    
    weekDays.forEach(day => {
      timetable[day] = {};
      entries
        .filter(entry => entry.dayCode === day)
        .forEach(entry => {
          timetable[day][entry.periodIndex] = entry;
        });
    });

    res.json({
      success: true,
      data: {
        timetable,
        entries,
        summary: {
          totalPeriods: entries.length,
          uniqueClasses: new Set(entries.map(e => e.classId._id.toString())).size,
          uniqueSubjects: new Set(entries.map(e => e.subjectId._id.toString())).size
        }
      }
    });
  } catch (error) {
    console.error('Error fetching teacher timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher timetable',
      error: error.message
    });
  }
});

// Update timetable entry
router.put('/entry/:id', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      lastModifiedBy: req.user.id
    };

    const entry = await TimetableEntry.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('academicYearId', 'title')
      .populate('shiftId', 'name')
      .populate('classId', 'title gradeLevel section genderType')
      .populate('subjectId', 'name category')
      .populate('teacherId', 'name');

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Timetable entry not found'
      });
    }

    res.json({
      success: true,
      message: 'Timetable entry updated successfully',
      data: entry
    });
  } catch (error) {
    console.error('Error updating timetable entry:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating timetable entry',
      error: error.message
    });
  }
});

// Delete timetable entry
router.delete('/entry/:id', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const entry = await TimetableEntry.findByIdAndDelete(req.params.id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Timetable entry not found'
      });
    }

    res.json({
      success: true,
      message: 'Timetable entry deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting timetable entry:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting timetable entry',
      error: error.message
    });
  }
});

// Publish timetable
router.post('/publish/:schoolId', requireAuth, checkRole(['admin', 'principal']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const {
      academicYearId,
      shiftId,
      decisionNote,
      approverName,
      publishDecision,
      gateStatus,
      gateMetrics
    } = req.body;

    const normalizedDecisionNote = String(decisionNote || '').trim();
    const normalizedApproverName = String(approverName || '').trim();
    const normalizedPublishDecision = String(publishDecision || '').trim();
    const normalizedGateStatus = String(gateStatus || '').trim();

    if (!normalizedDecisionNote) {
      return res.status(400).json({
        success: false,
        message: 'Publish decision note is required'
      });
    }

    const result = await TimetableEntry.updateMany(
      {
        schoolId,
        academicYearId,
        shiftId
      },
      {
        status: 'published',
        publishedAt: new Date(),
        publishedBy: req.user.id
      }
    );

    await logActivity({
      req,
      action: 'timetable_publish',
      targetType: 'TimetablePublish',
      targetId: `${schoolId}:${academicYearId}:${shiftId}`,
      reason: normalizedDecisionNote,
      meta: {
        publishDecision: normalizedPublishDecision || 'Publish',
        approverName: normalizedApproverName || undefined,
        gateStatus: normalizedGateStatus || undefined,
        gateMetrics: gateMetrics && typeof gateMetrics === 'object' ? gateMetrics : undefined,
        publishedCount: result.modifiedCount
      }
    });

    res.json({
      success: true,
      message: `Published ${result.modifiedCount} timetable entries`,
      data: {
        publishedCount: result.modifiedCount,
        publishDecision: normalizedPublishDecision || 'Publish',
        gateStatus: normalizedGateStatus || '',
        decisionNote: normalizedDecisionNote,
        approverName: normalizedApproverName || ''
      }
    });
  } catch (error) {
    console.error('Error publishing timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Error publishing timetable',
      error: error.message
    });
  }
});

// Get timetable conflicts
router.get('/conflicts/:schoolId', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { academicYearId, shiftId } = req.query;

    let query = schoolId === 'default-school-id' ? {} : { schoolId };
    if (academicYearId) query.academicYearId = academicYearId;
    if (shiftId) query.shiftId = shiftId;

    const entries = await TimetableEntry.find(query)
      .populate('classId', 'title gradeLevel section')
      .populate('teacherId', 'name')
      .populate('subjectId', 'name')
      .sort({ dayCode: 1, periodIndex: 1 });

    const conflicts = [];
    const entryMap = new Map();

    // Create map for quick lookup
    entries.forEach(entry => {
      const key = `${entry.dayCode}-${entry.periodIndex}`;
      if (!entryMap.has(key)) {
        entryMap.set(key, []);
      }
      entryMap.get(key).push(entry);
    });

    // Find conflicts
    entryMap.forEach((entriesAtSlot, key) => {
      if (entriesAtSlot.length > 1) {
        const [dayCode, periodIndex] = key.split('-');
        
        // Check class conflicts
        const classMap = new Map();
        entriesAtSlot.forEach(entry => {
          const classId = entry.classId._id.toString();
          if (!classMap.has(classId)) {
            classMap.set(classId, []);
          }
          classMap.get(classId).push(entry);
        });

        // Check teacher conflicts
        const teacherMap = new Map();
        entriesAtSlot.forEach(entry => {
          const teacherId = entry.teacherId._id.toString();
          if (!teacherMap.has(teacherId)) {
            teacherMap.set(teacherId, []);
          }
          teacherMap.get(teacherId).push(entry);
        });

        // Add conflicts
        classMap.forEach((conflictingEntries, classId) => {
          if (conflictingEntries.length > 1) {
            conflicts.push({
              type: 'class',
              dayCode,
              periodIndex: parseInt(periodIndex),
              class: conflictingEntries[0].classId,
              entries: conflictingEntries
            });
          }
        });

        teacherMap.forEach((conflictingEntries, teacherId) => {
          if (conflictingEntries.length > 1) {
            conflicts.push({
              type: 'teacher',
              dayCode,
              periodIndex: parseInt(periodIndex),
              teacher: conflictingEntries[0].teacherId,
              entries: conflictingEntries
            });
          }
        });
      }
    });

    res.json({
      success: true,
      data: {
        conflicts,
        summary: {
          totalConflicts: conflicts.length,
          classConflicts: conflicts.filter(c => c.type === 'class').length,
          teacherConflicts: conflicts.filter(c => c.type === 'teacher').length
        }
      }
    });
  } catch (error) {
    console.error('Error finding conflicts:', error);
    res.status(500).json({
      success: false,
      message: 'Error finding conflicts',
      error: error.message
    });
  }
});

module.exports = router;
