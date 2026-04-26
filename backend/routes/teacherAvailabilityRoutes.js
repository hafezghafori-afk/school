const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const TeacherAvailability = require('../models/TeacherAvailability');
const Shift = require('../models/Shift');
const AcademicYear = require('../models/AcademicYear');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'TeacherAvailability', actionPrefix: 'teacher_availability', audit: auditWrite });

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const CLASS_PERIOD_INDEXES = new Set([1, 2, 3, 5, 6, 7]);

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

const resolveSchoolIdForAvailability = async (schoolIdParam, payload = {}) => {
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

  const shiftId = String(payload.shiftId || '').trim();
  if (shiftId && isValidObjectId(shiftId)) {
    const shift = await Shift.findById(shiftId).select('schoolId');
    if (shift?.schoolId) return shift.schoolId.toString();
  }

  return '';
};

// Get teacher availability for a school
router.get('/school/:schoolId', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { academicYearId, teacherId, shiftId } = req.query;
    
    let query = schoolId === 'default-school-id' ? {} : { schoolId };
    if (academicYearId) query.academicYearId = academicYearId;
    if (teacherId) query.teacherId = teacherId;
    if (shiftId) query.shiftId = shiftId;

    const availabilities = await TeacherAvailability.find(query)
      .populate('academicYearId', 'title status')
      .populate('shiftId', 'name nameDari namePashto')
      .populate('teacherId', 'name email role orgRole subject status')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: availabilities
    });
  } catch (error) {
    console.error('Error fetching teacher availabilities:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher availabilities',
      error: error.message
    });
  }
});

// Create new teacher availability
router.post('/school/:schoolId', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const schoolId = await resolveSchoolIdForAvailability(req.params.schoolId, req.body);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'شناسه مکتب معتبر نیست. ابتدا سال تعلیمی و نوبت معتبر را انتخاب کنید.'
      });
    }

    const availabilityData = {
      ...req.body,
      schoolId,
      createdBy: req.user.id
    };

    // Check if availability already exists for this combination
    const existing = await TeacherAvailability.findOne({
      schoolId,
      teacherId: availabilityData.teacherId,
      academicYearId: availabilityData.academicYearId,
      shiftId: availabilityData.shiftId
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Teacher availability already exists for this combination'
      });
    }

    const availability = new TeacherAvailability(availabilityData);
    await availability.save();

    const populatedAvailability = await TeacherAvailability.findById(availability._id)
      .populate('academicYearId', 'title status')
      .populate('shiftId', 'name nameDari namePashto')
      .populate('teacherId', 'name email role orgRole subject status');

    res.status(201).json({
      success: true,
      message: 'Teacher availability created successfully',
      data: populatedAvailability
    });
  } catch (error) {
    console.error('Error creating teacher availability:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating teacher availability',
      error: error.message
    });
  }
});

// Update teacher availability
router.put('/:id', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedBy: req.user.id
    };

    const availability = await TeacherAvailability.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('academicYearId', 'title status')
      .populate('shiftId', 'name nameDari namePashto')
      .populate('teacherId', 'name email role orgRole subject status');

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Teacher availability not found'
      });
    }

    res.json({
      success: true,
      message: 'Teacher availability updated successfully',
      data: availability
    });
  } catch (error) {
    console.error('Error updating teacher availability:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating teacher availability',
      error: error.message
    });
  }
});

// Delete teacher availability
router.delete('/:id', requireAuth, checkRole(['admin', 'principal']), async (req, res) => {
  try {
    const availability = await TeacherAvailability.findByIdAndDelete(req.params.id);

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Teacher availability not found'
      });
    }

    res.json({
      success: true,
      message: 'Teacher availability deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting teacher availability:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting teacher availability',
      error: error.message
    });
  }
});

// Get availability by teacher
router.get('/teacher/:teacherId', requireAuth, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { academicYearId, shiftId } = req.query;

    let query = { teacherId };
    if (academicYearId) query.academicYearId = academicYearId;
    if (shiftId) query.shiftId = shiftId;

    const availabilities = await TeacherAvailability.find(query)
      .populate('academicYearId', 'title status')
      .populate('shiftId', 'name nameDari namePashto')
      .sort({ 'shiftId.name': 1 });

    res.json({
      success: true,
      data: availabilities
    });
  } catch (error) {
    console.error('Error fetching teacher availabilities:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher availabilities',
      error: error.message
    });
  }
});

// Get teacher availability matrix for timetable generation
router.get('/matrix/:schoolId', requireAuth, async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { academicYearId, shiftId } = req.query;

    if (!academicYearId || !shiftId) {
      return res.status(400).json({
        success: false,
        message: 'Academic year and shift ID are required'
      });
    }

    const availabilities = await TeacherAvailability.find({
      ...(schoolId === 'default-school-id' ? {} : { schoolId }),
      academicYearId,
      shiftId,
      status: 'active'
    })
      .populate('teacherId', 'name email role orgRole subject status');

    // Create availability matrix
    const weekDays = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const matrix = {};

    availabilities.forEach(availability => {
      const teacherId = availability.teacherId._id.toString();
      
      if (!matrix[teacherId]) {
        matrix[teacherId] = {
          teacher: availability.teacherId,
          availableDays: availability.availableDays || [],
          availablePeriods: availability.availablePeriods || [],
          unavailablePeriods: availability.unavailablePeriods || [],
          preferredOffPeriods: availability.preferredOffPeriods || [],
          maxPeriodsPerDay: availability.maxPeriodsPerDay,
          maxPeriodsPerWeek: availability.maxPeriodsPerWeek,
          prefersConsecutivePeriods: availability.prefersConsecutivePeriods,
          avoidFirstPeriod: availability.avoidFirstPeriod,
          avoidLastPeriod: availability.avoidLastPeriod,
          minGapBetweenPeriods: availability.minGapBetweenPeriods,
          specialConstraints: availability.specialConstraints,
          temporaryRestrictions: availability.temporaryRestrictions || []
        };
      }
    });

    res.json({
      success: true,
      data: {
        matrix,
        weekDays,
        totalTeachers: Object.keys(matrix).length
      }
    });
  } catch (error) {
    console.error('Error generating availability matrix:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating availability matrix',
      error: error.message
    });
  }
});

// Check teacher availability for specific time slot
router.post('/check-availability', requireAuth, async (req, res) => {
  try {
    const { teacherId, academicYearId, shiftId, dayCode, periodIndex } = req.body;
    const normalizedPeriodIndex = Number(periodIndex);

    if (!Number.isInteger(normalizedPeriodIndex) || !CLASS_PERIOD_INDEXES.has(normalizedPeriodIndex)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid period. Allowed class periods are 1,2,3,5,6,7.'
      });
    }

    const availability = await TeacherAvailability.findOne({
      teacherId,
      academicYearId,
      shiftId,
      status: 'active'
    });

    if (!availability) {
      return res.json({
        success: true,
        isAvailable: false,
        reason: 'No availability record found'
      });
    }

    // Check if teacher is available on this day
    if (!availability.availableDays.includes(dayCode)) {
      return res.json({
        success: true,
        isAvailable: false,
        reason: 'Teacher not available on this day'
      });
    }

    if (!isPeriodExplicitlyAvailable(availability, dayCode, normalizedPeriodIndex)) {
      return res.json({
        success: true,
        isAvailable: false,
        reason: 'Period is outside explicit available periods'
      });
    }

    // Check if this specific period is unavailable
    const unavailablePeriod = availability.unavailablePeriods.find(
      up => up.dayCode === dayCode && up.periodIndexes.includes(normalizedPeriodIndex)
    );

    if (unavailablePeriod) {
      return res.json({
        success: true,
        isAvailable: false,
        reason: unavailablePeriod.reason || 'Period marked as unavailable'
      });
    }

    const preferredOffPeriod = (availability.preferredOffPeriods || []).find(
      (slot) => slot.dayCode === dayCode && Array.isArray(slot.periodIndexes) && slot.periodIndexes.includes(normalizedPeriodIndex)
    );

    // Check temporary restrictions
    const today = new Date();
    const activeRestriction = availability.temporaryRestrictions.find(
      tr => new Date(tr.startDate) <= today && new Date(tr.endDate) >= today
    );

    if (activeRestriction) {
      return res.json({
        success: true,
        isAvailable: false,
        reason: `Temporary restriction: ${activeRestriction.details}`
      });
    }

    res.json({
      success: true,
      isAvailable: true,
      constraints: {
        maxPeriodsPerDay: availability.maxPeriodsPerDay,
        maxPeriodsPerWeek: availability.maxPeriodsPerWeek,
        avoidFirstPeriod: availability.avoidFirstPeriod,
        avoidLastPeriod: availability.avoidLastPeriod,
        prefersConsecutivePeriods: availability.prefersConsecutivePeriods,
        minGapBetweenPeriods: availability.minGapBetweenPeriods,
        specialConstraints: availability.specialConstraints,
        isPreferredOff: Boolean(preferredOffPeriod),
        preferredOffReason: preferredOffPeriod?.reason || ''
      }
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking availability',
      error: error.message
    });
  }
});

// Bulk create teacher availabilities
router.post('/bulk', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const { availabilities } = req.body;

    const results = [];
    const errors = [];

    for (const availabilityData of availabilities) {
      try {
        const schoolId = await resolveSchoolIdForAvailability(availabilityData.schoolId, availabilityData);
        if (!schoolId) {
          errors.push({
            data: availabilityData,
            error: 'شناسه مکتب معتبر نیست.'
          });
          continue;
        }

        // Check if already exists
        const existing = await TeacherAvailability.findOne({
          schoolId,
          teacherId: availabilityData.teacherId,
          academicYearId: availabilityData.academicYearId,
          shiftId: availabilityData.shiftId
        });

        if (!existing) {
          const availability = new TeacherAvailability({
            ...availabilityData,
            schoolId,
            createdBy: req.user.id
          });
          await availability.save();
          
          const populated = await TeacherAvailability.findById(availability._id)
            .populate('academicYearId', 'title status')
            .populate('shiftId', 'name nameDari namePashto')
            .populate('teacherId', 'name email role orgRole subject status');
          
          results.push(populated);
        }
      } catch (error) {
        errors.push({
          data: availabilityData,
          error: error.message
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `${results.length} teacher availabilities created successfully`,
      data: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error bulk creating teacher availabilities:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk creating teacher availabilities',
      error: error.message
    });
  }
});

// Get teachers without availability setup
router.get('/missing/:schoolId', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { academicYearId, shiftId } = req.query;

    if (!academicYearId || !shiftId) {
      return res.status(400).json({
        success: false,
        message: 'Academic year and shift ID are required'
      });
    }

    const teachers = await User.find({
      role: { $in: ['instructor', 'teacher', 'professor', 'admin'] },
      status: 'active'
    })
      .select('name email role orgRole subject status');

    // Get teachers with availability
    const availabilities = await TeacherAvailability.find({
      ...(schoolId === 'default-school-id' ? {} : { schoolId }),
      academicYearId,
      shiftId,
      status: 'active'
    })
      .select('teacherId')
      .sort({ createdAt: -1 });

    const teachersWithAvailability = new Set(
      availabilities.map(a => a.teacherId.toString())
    );

    const teachersWithoutAvailability = teachers.filter(
      teacher => !teachersWithAvailability.has(teacher._id.toString())
    );

    res.json({
      success: true,
      data: teachersWithoutAvailability
    });
  } catch (error) {
    console.error('Error finding teachers without availability:', error);
    res.status(500).json({
      success: false,
      message: 'Error finding teachers without availability',
      error: error.message
    });
  }
});

module.exports = router;
