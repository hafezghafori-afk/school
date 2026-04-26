const express = require('express');
const router = express.Router();
const SchoolWeekConfig = require('../models/SchoolWeekConfig');
const { requireFields } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'SchoolWeekConfig', actionPrefix: 'school_week_config', audit: auditWrite });

// Get week config for a school
router.get('/school/:schoolId', requireAuth, async (req, res) => {
  try {
    const { schoolId } = req.params;
    
    let weekConfig = await SchoolWeekConfig.findOne({ schoolId })
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    // If no config exists, create default one
    if (!weekConfig) {
      const defaultConfig = SchoolWeekConfig.getDefaultAfghanConfig();
      weekConfig = new SchoolWeekConfig({
        schoolId,
        ...defaultConfig,
        createdBy: req.user.id
      });
      await weekConfig.save();
      
      weekConfig = await SchoolWeekConfig.findOne({ schoolId })
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email');
    }
    
    res.json({
      success: true,
      data: weekConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching week configuration',
      error: error.message
    });
  }
});

// Get week config by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const weekConfig = await SchoolWeekConfig.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    if (!weekConfig) {
      return res.status(404).json({
        success: false,
        message: 'Week configuration not found'
      });
    }
    
    res.json({
      success: true,
      data: weekConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching week configuration',
      error: error.message
    });
  }
});

// Create or update week config
router.post('/', requireAuth, requireFields(['schoolId', 'workingDays', 'weekendDays']), async (req, res) => {
  try {
    const { schoolId } = req.body;
    
    // Check if config already exists
    const existingConfig = await SchoolWeekConfig.findOne({ schoolId });
    
    if (existingConfig) {
      return res.status(400).json({
        success: false,
        message: 'Week configuration already exists for this school. Use PATCH to update.'
      });
    }
    
    const configData = {
      ...req.body,
      createdBy: req.user.id
    };
    
    const weekConfig = new SchoolWeekConfig(configData);
    await weekConfig.save();
    
    const populatedConfig = await SchoolWeekConfig.findById(weekConfig._id)
      .populate('createdBy', 'name email');
    
    res.status(201).json({
      success: true,
      data: populatedConfig,
      message: 'Week configuration created successfully'
    });
  } catch (error) {
    if (error.message.includes('At least one working day is required')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating week configuration',
      error: error.message
    });
  }
});

// Update week config
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedBy: req.user.id
    };
    
    const weekConfig = await SchoolWeekConfig.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email')
     .populate('updatedBy', 'name email');
    
    if (!weekConfig) {
      return res.status(404).json({
        success: false,
        message: 'Week configuration not found'
      });
    }
    
    res.json({
      success: true,
      data: weekConfig,
      message: 'Week configuration updated successfully'
    });
  } catch (error) {
    if (error.message.includes('At least one working day is required')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating week configuration',
      error: error.message
    });
  }
});

// Reset to default Afghan configuration
router.post('/:id/reset-default', requireAuth, async (req, res) => {
  try {
    const weekConfig = await SchoolWeekConfig.findById(req.params.id);
    
    if (!weekConfig) {
      return res.status(404).json({
        success: false,
        message: 'Week configuration not found'
      });
    }
    
    const defaultConfig = SchoolWeekConfig.getDefaultAfghanConfig();
    
    // Preserve schoolId and created info, reset everything else
    weekConfig.workingDays = defaultConfig.workingDays;
    weekConfig.weekendDays = defaultConfig.weekendDays;
    weekConfig.dayLabels = defaultConfig.dayLabels;
    weekConfig.weekStartDay = defaultConfig.weekStartDay;
    weekConfig.hasHalfDayThursday = defaultConfig.hasHalfDayThursday;
    weekConfig.thursdayEndTime = defaultConfig.thursdayEndTime;
    weekConfig.maxInstructionalDaysPerWeek = defaultConfig.maxInstructionalDaysPerWeek;
    weekConfig.updatedBy = req.user.id;
    
    await weekConfig.save();
    
    const populatedConfig = await SchoolWeekConfig.findById(weekConfig._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    res.json({
      success: true,
      data: populatedConfig,
      message: 'Week configuration reset to default successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error resetting week configuration',
      error: error.message
    });
  }
});

// Get working days for a specific date range
router.post('/:id/working-days', requireAuth, requireFields(['startDate', 'endDate']), async (req, res) => {
  try {
    const weekConfig = await SchoolWeekConfig.findById(req.params.id);
    
    if (!weekConfig) {
      return res.status(404).json({
        success: false,
        message: 'Week configuration not found'
      });
    }
    
    const { startDate, endDate } = req.body;
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be before end date'
      });
    }
    
    const workingDays = [];
    const weekendDays = [];
    const currentDate = new Date(start);
    
    while (currentDate <= end) {
      // JavaScript getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
      // Convert to our system: 1=شنبه (Saturday), 7=جمعه (Friday)
      let dayNumber = currentDate.getDay(); // 0=Sunday, 6=Saturday
      dayNumber = dayNumber === 0 ? 7 : dayNumber; // Sunday=7 (جمعه)
      
      const dayInfo = {
        date: currentDate.toISOString().split('T')[0],
        dayNumber,
        dayLabel: weekConfig.getDayLabel(dayNumber),
        isWorking: weekConfig.isWorkingDay(dayNumber),
        isWeekend: weekConfig.isWeekend(dayNumber),
        isHalfDay: weekConfig.hasHalfDayThursday && dayNumber === 6
      };
      
      if (dayInfo.isWorking) {
        workingDays.push(dayInfo);
      } else if (dayInfo.isWeekend) {
        weekendDays.push(dayInfo);
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    res.json({
      success: true,
      data: {
        period: {
          startDate: start.toISOString().split('T')[0],
          endDate: end.toISOString().split('T')[0],
          totalDays: Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
        },
        workingDays,
        weekendDays,
        summary: {
          totalWorkingDays: workingDays.length,
          totalWeekendDays: weekendDays.length,
          totalInstructionalDays: workingDays.reduce((total, day) => {
            return total + (day.isHalfDay ? 0.5 : 1);
          }, 0)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error calculating working days',
      error: error.message
    });
  }
});

// Delete week config
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const weekConfig = await SchoolWeekConfig.findByIdAndDelete(req.params.id);
    
    if (!weekConfig) {
      return res.status(404).json({
        success: false,
        message: 'Week configuration not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Week configuration deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting week configuration',
      error: error.message
    });
  }
});

module.exports = router;
