const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const TimetableConfiguration = require('../models/TimetableConfiguration');
const PeriodDefinition = require('../models/PeriodDefinition');
const Shift = require('../models/Shift');
const AcademicYear = require('../models/AcademicYear');
const { requireAuth } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'TimetableConfiguration', actionPrefix: 'timetable_configuration', audit: auditWrite });

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const resolveSchoolIdForCreate = async (schoolIdParam, body = {}) => {
  const normalized = String(schoolIdParam || '').trim();
  if (normalized && normalized !== 'default-school-id' && isValidObjectId(normalized)) {
    return normalized;
  }

  const yearId = String(body.academicYearId || '').trim();
  if (yearId && isValidObjectId(yearId)) {
    const year = await AcademicYear.findById(yearId).select('schoolId');
    if (year?.schoolId) return year.schoolId.toString();
  }

  const shiftId = String(body.shiftId || '').trim();
  if (shiftId && isValidObjectId(shiftId)) {
    const shift = await Shift.findById(shiftId).select('schoolId');
    if (shift?.schoolId) return shift.schoolId.toString();
  }

  return '';
};

// Get all timetable configurations for a school
router.get('/school/:schoolId', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const filter = schoolId === 'default-school-id' ? {} : { schoolId };
    const configurations = await TimetableConfiguration.find(filter)
      .populate('academicYearId', 'title status')
      .populate('shiftId', 'name nameDari namePashto')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: configurations
    });
  } catch (error) {
    console.error('Error fetching timetable configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching timetable configurations',
      error: error.message
    });
  }
});

// Create new timetable configuration
router.post('/school/:schoolId', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const schoolId = await resolveSchoolIdForCreate(req.params.schoolId, req.body);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'شناسه مکتب معتبر نیست. ابتدا سال تعلیمی و نوبت معتبر را انتخاب کنید.'
      });
    }

    const configData = {
      ...req.body,
      schoolId,
      createdBy: req.user.id
    };

    // Check if configuration already exists for this combination
    const existing = await TimetableConfiguration.findOne({
      schoolId,
      academicYearId: configData.academicYearId,
      shiftId: configData.shiftId
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Configuration already exists for this academic year and shift'
      });
    }

    const configuration = new TimetableConfiguration(configData);
    await configuration.save();

    // Auto-create period definitions based on configuration
    await createPeriodDefinitions(configuration._id, configData);

    const populatedConfig = await TimetableConfiguration.findById(configuration._id)
      .populate('academicYearId', 'title status')
      .populate('shiftId', 'name nameDari namePashto');

    res.status(201).json({
      success: true,
      message: 'Timetable configuration created successfully',
      data: populatedConfig
    });
  } catch (error) {
    console.error('Error creating timetable configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating timetable configuration',
      error: error.message
    });
  }
});

// Helper function to create period definitions
async function createPeriodDefinitions(configId, configData) {
  const { workingDays, periodsPerDay, breakPeriods = [] } = configData;
  const periodDefinitions = [];
  const baseMinutes = 8 * 60;
  const slotDuration = 45;

  const toTime = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const minutes = (totalMinutes % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  workingDays.forEach(day => {
    for (let i = 1; i <= periodsPerDay; i++) {
      const breakPeriod = breakPeriods.find(bp => bp.periodIndex === i);
      const isBreak = Boolean(breakPeriod);
      const duration = isBreak ? Number(breakPeriod.duration || slotDuration) : slotDuration;
      const startMinutes = baseMinutes + ((i - 1) * slotDuration);
      const endMinutes = startMinutes + duration;
      
      periodDefinitions.push({
        timetableConfigurationId: configId,
        dayCode: day,
        periodIndex: i,
        startTime: toTime(startMinutes),
        endTime: toTime(endMinutes),
        type: isBreak ? breakPeriod.type : 'class',
        isBreak,
        order: i
      });
    }
  });

  await PeriodDefinition.insertMany(periodDefinitions);
}

// Update timetable configuration
router.put('/:id', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedBy: req.user.id
    };

    const configuration = await TimetableConfiguration.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('academicYearId', 'title status')
      .populate('shiftId', 'name nameDari namePashto');

    if (!configuration) {
      return res.status(404).json({
        success: false,
        message: 'Configuration not found'
      });
    }

    // Update period definitions if working days or periods changed
    if (req.body.workingDays || req.body.periodsPerDay || req.body.breakPeriods) {
      await updatePeriodDefinitions(configuration._id, req.body);
    }

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      data: configuration
    });
  } catch (error) {
    console.error('Error updating configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating configuration',
      error: error.message
    });
  }
});

// Helper function to update period definitions
async function updatePeriodDefinitions(configId, configData) {
  // Delete existing period definitions
  await PeriodDefinition.deleteMany({ timetableConfigurationId: configId });
  
  // Recreate period definitions
  await createPeriodDefinitions(configId, configData);
}

// Get configuration with period definitions
router.get('/:id/details', requireAuth, async (req, res) => {
  try {
    const configuration = await TimetableConfiguration.findById(req.params.id)
      .populate('academicYearId', 'title status')
      .populate('shiftId', 'name nameDari namePashto');

    if (!configuration) {
      return res.status(404).json({
        success: false,
        message: 'Configuration not found'
      });
    }

    const periodDefinitions = await PeriodDefinition.find({ 
      timetableConfigurationId: req.params.id 
    })
      .sort({ dayCode: 1, periodIndex: 1 });

    res.json({
      success: true,
      data: {
        configuration,
        periodDefinitions
      }
    });
  } catch (error) {
    console.error('Error fetching configuration details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching configuration details',
      error: error.message
    });
  }
});

// Update period definitions
router.put('/:id/periods', requireAuth, checkRole(['admin', 'principal', 'timetable_manager']), async (req, res) => {
  try {
    const { periods } = req.body;
    
    // Update each period definition
    for (const period of periods) {
      await PeriodDefinition.findByIdAndUpdate(
        period._id,
        {
          startTime: period.startTime,
          endTime: period.endTime,
          type: period.type,
          title: period.title,
          isBreak: period.type !== 'class'
        }
      );
    }

    res.json({
      success: true,
      message: 'Period definitions updated successfully'
    });
  } catch (error) {
    console.error('Error updating period definitions:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating period definitions',
      error: error.message
    });
  }
});

// Delete configuration
router.delete('/:id', requireAuth, checkRole(['admin', 'principal']), async (req, res) => {
  try {
    // Delete related period definitions
    await PeriodDefinition.deleteMany({ timetableConfigurationId: req.params.id });
    
    // Delete configuration
    await TimetableConfiguration.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Configuration deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting configuration',
      error: error.message
    });
  }
});

module.exports = router;
