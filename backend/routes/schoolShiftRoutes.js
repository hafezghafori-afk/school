const express = require('express');
const router = express.Router();
const SchoolShift = require('../models/SchoolShift');
const { requireFields } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'SchoolShift', actionPrefix: 'school_shift', audit: auditWrite });

// Get all shifts for a school - supports both path and query parameters
router.get('/', requireAuth, async (req, res) => {
  try {
    // schoolId path میں یا query میں ہو سکتا ہے
    const schoolId = req.params.schoolId || req.query.schoolId;
    const { isActive, page = 1, limit = 10 } = req.query;
    
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'schoolId الزامی است'
      });
    }
    
    const filter = { schoolId };
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    
    const shifts = await SchoolShift.find(filter)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ sortOrder: 1, name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await SchoolShift.countDocuments(filter);
    
    res.json({
      success: true,
      data: shifts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching school shifts',
      error: error.message
    });
  }
});

// Get all shifts for a school - using path parameter
router.get('/school/:schoolId', requireAuth, async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { isActive, page = 1, limit = 10 } = req.query;
    
    const filter = { schoolId };
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    
    const shifts = await SchoolShift.find(filter)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ sortOrder: 1, name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await SchoolShift.countDocuments(filter);
    
    res.json({
      success: true,
      data: shifts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching school shifts',
      error: error.message
    });
  }
});

// Get shift by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const shift = await SchoolShift.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'School shift not found'
      });
    }
    
    res.json({
      success: true,
      data: shift
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching school shift',
      error: error.message
    });
  }
});

// Create new school shift
router.post('/', requireAuth, requireFields(['schoolId', 'name', 'code', 'startTime', 'endTime']), async (req, res) => {
  try {
    const shiftData = {
      ...req.body,
      createdBy: req.user.id
    };
    
    const shift = new SchoolShift(shiftData);
    await shift.save();
    
    const populatedShift = await SchoolShift.findById(shift._id)
      .populate('createdBy', 'name email');
    
    res.status(201).json({
      success: true,
      data: populatedShift,
      message: 'School shift created successfully'
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Shift with this code already exists for this school'
      });
    }
    
    if (error.message.includes('Start time must be before end time')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating school shift',
      error: error.message
    });
  }
});

// Update school shift
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedBy: req.user.id
    };
    
    const shift = await SchoolShift.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email')
     .populate('updatedBy', 'name email');
    
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'School shift not found'
      });
    }
    
    res.json({
      success: true,
      data: shift,
      message: 'School shift updated successfully'
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Shift with this code already exists for this school'
      });
    }
    
    if (error.message.includes('Start time must be before end time')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating school shift',
      error: error.message
    });
  }
});

// Activate/deactivate shift
router.patch('/:id/toggle-status', requireAuth, async (req, res) => {
  try {
    const shift = await SchoolShift.findById(req.params.id);
    
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'School shift not found'
      });
    }
    
    shift.isActive = !shift.isActive;
    shift.updatedBy = req.user.id;
    await shift.save();
    
    const populatedShift = await SchoolShift.findById(shift._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    res.json({
      success: true,
      data: populatedShift,
      message: `School shift ${shift.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error toggling shift status',
      error: error.message
    });
  }
});

// Reorder shifts
router.post('/reorder', requireAuth, requireFields(['schoolId', 'shifts']), async (req, res) => {
  try {
    const { schoolId, shifts } = req.body;
    
    // Validate shifts array structure
    if (!Array.isArray(shifts) || shifts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Shifts array is required and cannot be empty'
      });
    }
    
    const session = await SchoolShift.startSession();
    session.startTransaction();
    
    try {
      for (const shiftData of shifts) {
        if (!shiftData.id || typeof shiftData.sortOrder !== 'number') {
          throw new Error('Invalid shift data structure');
        }
        
        await SchoolShift.findByIdAndUpdate(
          shiftData.id,
          { 
            sortOrder: shiftData.sortOrder,
            updatedBy: req.user.id
          },
          { session }
        );
      }
      
      await session.commitTransaction();
      session.endSession();
      
      // Fetch updated shifts
      const updatedShifts = await SchoolShift.find({ schoolId })
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .sort({ sortOrder: 1, name: 1 });
      
      res.json({
        success: true,
        data: updatedShifts,
        message: 'Shifts reordered successfully'
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error reordering shifts',
      error: error.message
    });
  }
});

// Delete school shift
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const shift = await SchoolShift.findByIdAndDelete(req.params.id);
    
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'School shift not found'
      });
    }
    
    res.json({
      success: true,
      message: 'School shift deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting school shift',
      error: error.message
    });
  }
});

module.exports = router;
