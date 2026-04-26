const express = require('express');
const router = express.Router();
const TimetableEntry = require('../models/TimetableEntry');
const TeacherAssignment = require('../models/TeacherAssignment');
const CurriculumRule = require('../models/CurriculumRule');
const TeacherAvailability = require('../models/TeacherAvailability');
const SchoolClass = require('../models/SchoolClass');
const Subject = require('../models/Subject');
const User = require('../models/User');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'TimetableEntry', actionPrefix: 'timetable_editor', audit: auditWrite });

// Standard school day slots: 6 class periods + 1 break slot.
const STANDARD_SLOTS = Object.freeze([
  { slotNumber: 1, startTime: '08:00', endTime: '08:40', type: 'class' },
  { slotNumber: 2, startTime: '08:40', endTime: '09:20', type: 'class' },
  { slotNumber: 3, startTime: '09:20', endTime: '10:00', type: 'class' },
  { slotNumber: 4, startTime: '10:00', endTime: '10:10', type: 'break' },
  { slotNumber: 5, startTime: '10:10', endTime: '10:50', type: 'class' },
  { slotNumber: 6, startTime: '10:50', endTime: '11:30', type: 'class' },
  { slotNumber: 7, startTime: '11:30', endTime: '12:10', type: 'class' }
]);

const slotByNumber = Object.freeze(
  STANDARD_SLOTS.reduce((acc, slot) => {
    acc[slot.slotNumber] = slot;
    return acc;
  }, {})
);

const CLASS_SLOT_NUMBERS = new Set(
  STANDARD_SLOTS
    .filter((slot) => slot.type === 'class')
    .map((slot) => slot.slotNumber)
);

const hasExplicitAvailablePeriods = (availablePeriods = []) => {
  return Array.isArray(availablePeriods)
    && availablePeriods.some((slot) => Array.isArray(slot?.periodIndexes) && slot.periodIndexes.length > 0);
};

const isPeriodExplicitlyAvailable = (availability, dayCode, periodIndex) => {
  const periods = Array.isArray(availability?.availablePeriods) ? availability.availablePeriods : [];
  if (!hasExplicitAvailablePeriods(periods)) return true;

  const daySlot = periods.find((slot) => slot?.dayCode === dayCode);
  const indexes = Array.isArray(daySlot?.periodIndexes) ? daySlot.periodIndexes : [];
  return indexes.includes(periodIndex);
};

function resolveSlotPayload(payload = {}, fallbackPeriodIndex = null, options = {}) {
  const { requireSlot = false } = options;
  const providedRawSlot = payload.slotNumber ?? payload.periodIndex;
  const hasProvidedSlot = !(providedRawSlot === undefined || providedRawSlot === null || String(providedRawSlot).trim() === '');

  if (!hasProvidedSlot) {
    if (requireSlot) {
      const error = new Error('slotNumber or periodIndex is required');
      error.statusCode = 400;
      throw error;
    }

    return {
      periodIndex: fallbackPeriodIndex,
      startTime: payload.startTime,
      endTime: payload.endTime,
      slotNumber: null
    };
  }

  const slotNumber = Number(providedRawSlot);
  const slot = Number.isInteger(slotNumber) ? slotByNumber[slotNumber] : null;

  if (!slot || !CLASS_SLOT_NUMBERS.has(slotNumber)) {
    const error = new Error('Invalid period. Allowed class periods are 1,2,3,5,6,7.');
    error.statusCode = 400;
    throw error;
  }

  return {
    periodIndex: slotNumber,
    startTime: slot.startTime,
    endTime: slot.endTime,
    slotNumber
  };
}

// Create new timetable entry (manual override)
router.post('/entry', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const {
      schoolId,
      academicYearId,
      shiftId,
      classId,
      subjectId,
      teacherId,
      dayCode,
      periodIndex,
      slotNumber,
      startTime,
      endTime,
      source = 'manual_override'
    } = req.body;

    const resolvedSlot = resolveSlotPayload({ slotNumber, periodIndex, startTime, endTime }, null, { requireSlot: true });

    // Check for conflicts
    const classConflict = await TimetableEntry.findOne({
      schoolId,
      academicYearId,
      shiftId,
      dayCode,
      periodIndex: resolvedSlot.periodIndex,
      classId,
      status: { $ne: 'cancelled' }
    });

    if (classConflict) {
      return res.status(400).json({
        success: false,
        message: 'Class conflict: this class already has a lesson in this slot.',
        conflictType: 'class',
        conflict: classConflict
      });
    }

    const teacherConflict = await TimetableEntry.findOne({
      schoolId,
      academicYearId,
      shiftId,
      dayCode,
      periodIndex: resolvedSlot.periodIndex,
      teacherId,
      status: { $ne: 'cancelled' }
    });

    if (teacherConflict) {
      return res.status(400).json({
        success: false,
        message: 'Teacher conflict: this teacher already has a lesson in this slot.',
        conflictType: 'teacher',
        conflict: teacherConflict
      });
    }

    // Check teacher availability
    const teacherAvailability = await TeacherAvailability.findOne({
      schoolId,
      teacherId,
      academicYearId,
      shiftId,
      status: 'active'
    });

    if (teacherAvailability) {
      // Check if teacher is available on this day
      if (!teacherAvailability.availableDays.includes(dayCode)) {
        return res.status(400).json({
          success: false,
          message: 'Teacher not available on this day'
        });
      }

      if (!isPeriodExplicitlyAvailable(teacherAvailability, dayCode, resolvedSlot.periodIndex)) {
        return res.status(400).json({
          success: false,
          message: 'Teacher not available in this period'
        });
      }

      // Check if this specific period is unavailable
      const unavailablePeriod = teacherAvailability.unavailablePeriods.find(
        up => up.dayCode === dayCode && up.periodIndexes.includes(resolvedSlot.periodIndex)
      );

      if (unavailablePeriod) {
        return res.status(400).json({
          success: false,
          message: `Teacher unavailable: ${unavailablePeriod.reason || 'Period marked as unavailable'}`
        });
      }
    }

    // Create new entry
    const entry = new TimetableEntry({
      schoolId,
      academicYearId,
      shiftId,
      classId,
      subjectId,
      teacherId,
      dayCode,
      periodIndex: resolvedSlot.periodIndex,
      startTime: resolvedSlot.startTime,
      endTime: resolvedSlot.endTime,
      source,
      status: 'draft',
      createdBy: req.user.id,
      lastModifiedBy: req.user.id,
      lastModifiedAt: new Date()
    });

    await entry.save();

    const populatedEntry = await TimetableEntry.findById(entry._id)
      .populate('academicYearId', 'title')
      .populate('shiftId', 'name')
      .populate('classId', 'title gradeLevel section')
      .populate('subjectId', 'name category')
      .populate('teacherId', 'name');

    res.status(201).json({
      success: true,
      message: 'Timetable entry created successfully',
      data: populatedEntry
    });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    if (statusCode === 500) {
      console.error('Error creating timetable entry:', error);
    }
    res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? 'Error creating timetable entry' : error.message,
      error: error.message,
    });
  }
});

// Update timetable entry (manual edit)
router.put('/entry/:id', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const { id } = req.params;
    const resolvedSlot = resolveSlotPayload(req.body, null, { requireSlot: false });
    const normalizedUpdateData = {
      ...req.body,
      ...(resolvedSlot.periodIndex ? { periodIndex: resolvedSlot.periodIndex } : {}),
      ...(resolvedSlot.startTime ? { startTime: resolvedSlot.startTime } : {}),
      ...(resolvedSlot.endTime ? { endTime: resolvedSlot.endTime } : {})
    };
    const updateData = {
      ...normalizedUpdateData,
      lastModifiedBy: req.user.id,
      lastModifiedAt: new Date()
    };

    // Get original entry for comparison
    const originalEntry = await TimetableEntry.findById(id);
    if (!originalEntry) {
      return res.status(404).json({
        success: false,
        message: 'Timetable entry not found'
      });
    }

    const nextDayCode = updateData.dayCode || originalEntry.dayCode;
    const nextPeriodIndex = updateData.periodIndex || originalEntry.periodIndex;
    const nextClassId = updateData.classId || originalEntry.classId;
    const nextTeacherId = updateData.teacherId || originalEntry.teacherId;

    const hasConflictSensitiveChange = (
      String(nextDayCode) !== String(originalEntry.dayCode)
      || Number(nextPeriodIndex) !== Number(originalEntry.periodIndex)
      || String(nextClassId) !== String(originalEntry.classId)
      || String(nextTeacherId) !== String(originalEntry.teacherId)
    );

    if (hasConflictSensitiveChange) {
      const classConflict = await TimetableEntry.findOne({
        schoolId: originalEntry.schoolId,
        academicYearId: originalEntry.academicYearId,
        shiftId: originalEntry.shiftId,
        dayCode: nextDayCode,
        periodIndex: nextPeriodIndex,
        classId: nextClassId,
        status: { $ne: 'cancelled' },
        _id: { $ne: id }
      });

      if (classConflict) {
        return res.status(400).json({
          success: false,
          message: 'Class conflict: this class already has a lesson in this slot.',
          conflictType: 'class',
          conflict: classConflict
        });
      }

      const teacherConflict = await TimetableEntry.findOne({
        schoolId: originalEntry.schoolId,
        academicYearId: originalEntry.academicYearId,
        shiftId: originalEntry.shiftId,
        dayCode: nextDayCode,
        periodIndex: nextPeriodIndex,
        teacherId: nextTeacherId,
        status: { $ne: 'cancelled' },
        _id: { $ne: id }
      });

      if (teacherConflict) {
        return res.status(400).json({
          success: false,
          message: 'Teacher conflict: this teacher already has a lesson in this slot.',
          conflictType: 'teacher',
          conflict: teacherConflict
        });
      }
    }

    // Check teacher availability when teacher/day/period changes.
    if (hasConflictSensitiveChange) {
      const teacherAvailability = await TeacherAvailability.findOne({
        schoolId: originalEntry.schoolId,
        teacherId: nextTeacherId,
        academicYearId: originalEntry.academicYearId,
        shiftId: originalEntry.shiftId,
        status: 'active'
      });

      if (teacherAvailability) {
        const dayCode = nextDayCode;
        const periodIndex = nextPeriodIndex;

        if (!teacherAvailability.availableDays.includes(dayCode)) {
          return res.status(400).json({
            success: false,
            message: 'Teacher not available on this day'
          });
        }

        if (!isPeriodExplicitlyAvailable(teacherAvailability, dayCode, periodIndex)) {
          return res.status(400).json({
            success: false,
            message: 'Teacher not available in this period'
          });
        }

        const unavailablePeriod = teacherAvailability.unavailablePeriods.find(
          up => up.dayCode === dayCode && up.periodIndexes.includes(periodIndex)
        );

        if (unavailablePeriod) {
          return res.status(400).json({
            success: false,
            message: `Teacher unavailable: ${unavailablePeriod.reason || 'Period marked as unavailable'}`
          });
        }
      }
    }

    const entry = await TimetableEntry.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('academicYearId', 'title')
      .populate('shiftId', 'name')
      .populate('classId', 'title gradeLevel section')
      .populate('subjectId', 'name category')
      .populate('teacherId', 'name');

    res.json({
      success: true,
      message: 'Timetable entry updated successfully',
      data: entry
    });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    if (statusCode === 500) {
      console.error('Error updating timetable entry:', error);
    }
    res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? 'Error updating timetable entry' : error.message,
      error: error.message
    });
  }
});

// Delete timetable entry
router.delete('/entry/:id', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await TimetableEntry.findByIdAndDelete(id);

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

// Bulk update entries
router.put('/entries/bulk', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const { updates } = req.body; // Array of { id, updateData }

    const results = [];
    const errors = [];

    for (const { id, updateData } of updates) {
      try {
        const entry = await TimetableEntry.findByIdAndUpdate(
          id,
          {
            ...updateData,
            lastModifiedBy: req.user.id,
            lastModifiedAt: new Date()
          },
          { new: true, runValidators: true }
        )
          .populate('academicYearId', 'title')
          .populate('shiftId', 'name')
          .populate('classId', 'title gradeLevel section')
          .populate('subjectId', 'name category')
          .populate('teacherId', 'name');

        if (entry) {
          results.push(entry);
        } else {
          errors.push({ id, error: 'Entry not found' });
        }
      } catch (error) {
        errors.push({ id, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Updated ${results.length} entries successfully`,
      data: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error bulk updating entries:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk updating entries',
      error: error.message
    });
  }
});

// Swap two entries
router.post('/entries/swap', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const { entry1Id, entry2Id } = req.body;

    const [entry1, entry2] = await Promise.all([
      TimetableEntry.findById(entry1Id),
      TimetableEntry.findById(entry2Id)
    ]);

    if (!entry1 || !entry2) {
      return res.status(404).json({
        success: false,
        message: 'One or both entries not found'
      });
    }

    // Swap time slots
    const temp = {
      dayCode: entry1.dayCode,
      periodIndex: entry1.periodIndex,
      startTime: entry1.startTime,
      endTime: entry1.endTime
    };

    entry1.dayCode = entry2.dayCode;
    entry1.periodIndex = entry2.periodIndex;
    entry1.startTime = entry2.startTime;
    entry1.endTime = entry2.endTime;
    entry1.lastModifiedBy = req.user.id;
    entry1.lastModifiedAt = new Date();

    entry2.dayCode = temp.dayCode;
    entry2.periodIndex = temp.periodIndex;
    entry2.startTime = temp.startTime;
    entry2.endTime = temp.endTime;
    entry2.lastModifiedBy = req.user.id;
    entry2.lastModifiedAt = new Date();

    await Promise.all([entry1.save(), entry2.save()]);

    res.json({
      success: true,
      message: 'Entries swapped successfully',
      data: [entry1, entry2]
    });
  } catch (error) {
    console.error('Error swapping entries:', error);
    res.status(500).json({
      success: false,
      message: 'Error swapping entries',
      error: error.message
    });
  }
});

// Get change history
router.get('/history/:schoolId', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { academicYearId, shiftId, classId, teacherId, limit = 50 } = req.query;

    let query = schoolId === 'default-school-id' ? {} : { schoolId };
    if (academicYearId) query.academicYearId = academicYearId;
    if (shiftId) query.shiftId = shiftId;
    if (classId) query.classId = classId;
    if (teacherId) query.teacherId = teacherId;

    const entries = await TimetableEntry.find(query)
      .populate('academicYearId', 'title')
      .populate('shiftId', 'name')
      .populate('classId', 'title gradeLevel section')
      .populate('subjectId', 'name category')
      .populate('teacherId', 'name')
      .populate('createdBy', 'name')
      .populate('lastModifiedBy', 'name')
      .sort({ lastModifiedAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: entries
    });
  } catch (error) {
    console.error('Error fetching change history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching change history',
      error: error.message
    });
  }
});

// Validate entry before saving
router.post('/entry/validate', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const {
      schoolId,
      academicYearId,
      shiftId,
      classId,
      teacherId,
      dayCode,
      periodIndex,
      excludeId // Exclude this entry from conflict check (for updates)
    } = req.body;

    const normalizedPeriodIndex = Number(periodIndex);
    if (!Number.isInteger(normalizedPeriodIndex) || !CLASS_SLOT_NUMBERS.has(normalizedPeriodIndex)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid period. Allowed class periods are 1,2,3,5,6,7.'
      });
    }

    const conflicts = [];

    // Check class conflicts
    const classConflict = await TimetableEntry.findOne({
      schoolId,
      academicYearId,
      shiftId,
      dayCode,
      periodIndex: normalizedPeriodIndex,
      classId,
      _id: { $ne: excludeId }
    });

    if (classConflict) {
      conflicts.push({
        type: 'class',
        entry: classConflict,
        message: 'Class already scheduled at this time'
      });
    }

    // Check teacher conflicts
    const teacherConflict = await TimetableEntry.findOne({
      schoolId,
      academicYearId,
      shiftId,
      dayCode,
      periodIndex: normalizedPeriodIndex,
      teacherId,
      _id: { $ne: excludeId }
    });

    if (teacherConflict) {
      conflicts.push({
        type: 'teacher',
        entry: teacherConflict,
        message: 'Teacher already scheduled at this time'
      });
    }

    // Check teacher availability
    const teacherAvailability = await TeacherAvailability.findOne({
      schoolId,
      teacherId,
      academicYearId,
      shiftId,
      status: 'active'
    });

    if (teacherAvailability) {
      if (!teacherAvailability.availableDays.includes(dayCode)) {
        conflicts.push({
          type: 'availability',
          message: 'Teacher not available on this day'
        });
      }

      if (!isPeriodExplicitlyAvailable(teacherAvailability, dayCode, normalizedPeriodIndex)) {
        conflicts.push({
          type: 'availability',
          message: 'Teacher not available in this period'
        });
      }

      const unavailablePeriod = teacherAvailability.unavailablePeriods.find(
        up => up.dayCode === dayCode && up.periodIndexes.includes(normalizedPeriodIndex)
      );

      if (unavailablePeriod) {
        conflicts.push({
          type: 'availability',
          message: `Teacher unavailable: ${unavailablePeriod.reason || 'Period marked as unavailable'}`
        });
      }
    }

    // Check curriculum rule compliance
    const curriculumRule = await CurriculumRule.findOne({
      schoolId,
      academicYearId,
      classId,
      subjectId: req.body.subjectId,
      status: 'active'
    });

    if (!curriculumRule) {
      conflicts.push({
        type: 'curriculum',
        message: 'No curriculum rule found for this subject-class combination'
      });
    }

    // Check teacher assignment
    const teacherAssignment = await TeacherAssignment.findOne({
      schoolId,
      academicYearId,
      classId,
      subjectId: req.body.subjectId,
      teacherUserId: teacherId,
      status: 'active'
    });

    if (!teacherAssignment) {
      conflicts.push({
        type: 'assignment',
        message: 'No teacher assignment found for this combination'
      });
    }

    res.json({
      success: true,
      isValid: conflicts.length === 0,
      conflicts
    });
  } catch (error) {
    console.error('Error validating entry:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating entry',
      error: error.message
    });
  }
});

// Get suggested alternatives for a conflicting slot
router.get('/alternatives', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const {
      schoolId,
      academicYearId,
      shiftId,
      classId,
      teacherId,
      subjectId,
      excludeDayCode,
      excludePeriodIndex
    } = req.query;

    // Find available slots for this class
    const classSlots = await TimetableEntry.find({
      schoolId,
      academicYearId,
      shiftId,
      classId
    }).select('dayCode periodIndex');

    // Find available slots for this teacher
    const teacherSlots = await TimetableEntry.find({
      schoolId,
      academicYearId,
      shiftId,
      teacherId
    }).select('dayCode periodIndex');

    // Get teacher availability
    const teacherAvailability = await TeacherAvailability.findOne({
      schoolId,
      teacherId,
      academicYearId,
      shiftId,
      status: 'active'
    });

    const weekDays = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const alternatives = [];

    for (const day of weekDays) {
      if (teacherAvailability && !teacherAvailability.availableDays.includes(day)) {
        continue;
      }

      for (const period of CLASS_SLOT_NUMBERS) {
        // Skip the excluded slot
        if (day === excludeDayCode && period === parseInt(excludePeriodIndex)) {
          continue;
        }

        // Check if this period is unavailable for teacher
        if (teacherAvailability) {
          if (!isPeriodExplicitlyAvailable(teacherAvailability, day, period)) {
            continue;
          }

          const unavailablePeriod = teacherAvailability.unavailablePeriods.find(
            up => up.dayCode === day && up.periodIndexes.includes(period)
          );
          if (unavailablePeriod) {
            continue;
          }
        }

        // Check if class is free
        const classOccupied = classSlots.some(
          slot => slot.dayCode === day && slot.periodIndex === period
        );

        // Check if teacher is free
        const teacherOccupied = teacherSlots.some(
          slot => slot.dayCode === day && slot.periodIndex === period
        );

        if (!classOccupied && !teacherOccupied) {
          alternatives.push({
            dayCode: day,
            periodIndex: period,
            priority: 1 // Could be calculated based on preferences
          });
        }
      }
    }

    // Sort by priority (could be enhanced with teacher preferences)
    alternatives.sort((a, b) => a.priority - b.priority);

    res.json({
      success: true,
      data: alternatives
    });
  } catch (error) {
    console.error('Error finding alternatives:', error);
    res.status(500).json({
      success: false,
      message: 'Error finding alternatives',
      error: error.message
    });
  }
});

module.exports = router;
