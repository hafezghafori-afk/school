const express = require('express');
const router = express.Router();
const Shift = require('../models/Shift');
const { requireAuth } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const normalizeSchoolId = (value = '') => String(value || '').trim();
const isValidObjectId = (value = '') => /^[a-f\d]{24}$/i.test(normalizeSchoolId(value));

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'Shift', actionPrefix: 'shift', audit: auditWrite });

// Get all shifts for a school
router.get('/school/:schoolId', requireAuth, checkRole(['admin', 'principal']), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const filter = schoolId === 'default-school-id' ? { isActive: true } : { schoolId, isActive: true };
    const shifts = await Shift.find(filter)
      .sort({ name: 1 });
    
    res.json({
      success: true,
      data: shifts
    });
  } catch (error) {
    console.error('Error fetching shifts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching shifts',
      error: error.message
    });
  }
});

// Create new shift
router.post('/school/:schoolId', requireAuth, checkRole(['admin', 'principal']), async (req, res) => {
  try {
    const routeSchoolId = normalizeSchoolId(req.params.schoolId);
    const bodySchoolId = normalizeSchoolId(req.body?.schoolId);
    const headerSchoolId = normalizeSchoolId(req.headers['x-school-id']);

    const effectiveSchoolId = (
      routeSchoolId && routeSchoolId !== 'default-school-id'
        ? routeSchoolId
        : bodySchoolId || headerSchoolId
    );

    if (!isValidObjectId(effectiveSchoolId)) {
      return res.status(400).json({
        success: false,
        message: 'شناسه مکتب معتبر نیست. ابتدا یک مکتب معتبر انتخاب یا ایجاد کنید.',
        error: 'Invalid schoolId'
      });
    }

    const shiftData = {
      ...req.body,
      schoolId: effectiveSchoolId,
      createdBy: req.user.id
    };

    const shift = new Shift(shiftData);
    await shift.save();

    res.status(201).json({
      success: true,
      message: 'Shift created successfully',
      data: shift
    });
  } catch (error) {
    console.error('Error creating shift:', error);
    if (error?.name === 'ValidationError' || error?.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'اطلاعات نوبت معتبر نیست. ممکن است کد یا نام نوبت تکراری باشد.',
        error: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating shift',
      error: error.message
    });
  }
});

// Update shift
router.put('/:id', requireAuth, checkRole(['admin', 'principal']), async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'شناسه نوبت معتبر نیست.'
      });
    }

    const updateData = {
      ...req.body,
      updatedBy: req.user.id
    };

    const shift = await Shift.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    res.json({
      success: true,
      message: 'Shift updated successfully',
      data: shift
    });
  } catch (error) {
    console.error('Error updating shift:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating shift',
      error: error.message
    });
  }
});

// Delete shift (soft delete)
router.delete('/:id', requireAuth, checkRole(['admin', 'principal']), async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'شناسه نوبت معتبر نیست.'
      });
    }

    const shift = await Shift.findByIdAndUpdate(
      req.params.id,
      { 
        isActive: false,
        updatedBy: req.user.id
      },
      { new: true }
    );

    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    res.json({
      success: true,
      message: 'Shift deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting shift:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting shift',
      error: error.message
    });
  }
});

// Get shift by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'شناسه نوبت معتبر نیست.'
      });
    }

    const shift = await Shift.findById(req.params.id);

    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    res.json({
      success: true,
      data: shift
    });
  } catch (error) {
    console.error('Error fetching shift:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching shift',
      error: error.message
    });
  }
});

module.exports = router;
