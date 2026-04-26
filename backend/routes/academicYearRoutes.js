const express = require('express');
const router = express.Router();
const AcademicYear = require('../models/AcademicYear');
const { requireFields } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'AcademicYear', actionPrefix: 'academic_year', audit: auditWrite });

const normalizeId = (value = '') => String(value || '').trim();
const isValidObjectId = (value = '') => /^[a-f\d]{24}$/i.test(normalizeId(value));

// Get all academic years for a school
router.get('/school/:schoolId', requireAuth, async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;
    
    const filter = schoolId === 'default-school-id' ? {} : { schoolId };
    if (status) filter.status = status;
    
    const academicYears = await AcademicYear.find(filter)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ sequence: -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await AcademicYear.countDocuments(filter);
    
    res.json({
      success: true,
      data: academicYears,
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
      message: 'Error fetching academic years',
      error: error.message
    });
  }
});

// Get academic year by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'شناسه سال تعلیمی معتبر نیست.'
      });
    }

    const academicYear = await AcademicYear.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    if (!academicYear) {
      return res.status(404).json({
        success: false,
        message: 'Academic year not found'
      });
    }
    
    res.json({
      success: true,
      data: academicYear
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching academic year',
      error: error.message
    });
  }
});

// Create new academic year
router.post('/', requireAuth, requireFields(['schoolId', 'title']), async (req, res) => {
  try {
    const academicYearData = {
      ...req.body,
      createdBy: req.user.id
    };
    
    const academicYear = new AcademicYear(academicYearData);
    await academicYear.save();
    
    const populatedAcademicYear = await AcademicYear.findById(academicYear._id)
      .populate('createdBy', 'name email');
    
    res.status(201).json({
      success: true,
      data: populatedAcademicYear,
      message: 'Academic year created successfully'
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Academic year with this title or code already exists for this school'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating academic year',
      error: error.message
    });
  }
});

// Update academic year
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedBy: req.user.id
    };
    
    const academicYear = await AcademicYear.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email')
     .populate('updatedBy', 'name email');
    
    if (!academicYear) {
      return res.status(404).json({
        success: false,
        message: 'Academic year not found'
      });
    }
    
    res.json({
      success: true,
      data: academicYear,
      message: 'Academic year updated successfully'
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Academic year with this title or code already exists for this school'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating academic year',
      error: error.message
    });
  }
});

// Activate academic year (make it current)
router.post('/:id/activate', requireAuth, async (req, res) => {
  try {
    const session = await AcademicYear.startSession();
    session.startTransaction();
    
    try {
      // Deactivate all other academic years for this school
      const academicYear = await AcademicYear.findById(req.params.id).session(session);
      
      if (!academicYear) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Academic year not found'
        });
      }
      
      // Set all other years to isCurrent: false
      await AcademicYear.updateMany(
        { schoolId: academicYear.schoolId, _id: { $ne: req.params.id } },
        { isCurrent: false, isActive: false, status: 'closed' },
        { session }
      );
      
      // Set this year as current
      academicYear.isCurrent = true;
      academicYear.isActive = true;
      academicYear.status = 'active';
      academicYear.updatedBy = req.user.id;
      await academicYear.save({ session });
      
      await session.commitTransaction();
      session.endSession();
      
      const populatedAcademicYear = await AcademicYear.findById(academicYear._id)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email');
      
      res.json({
        success: true,
        data: populatedAcademicYear,
        message: 'Academic year activated successfully'
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error activating academic year',
      error: error.message
    });
  }
});

// Close academic year
router.post('/:id/close', requireAuth, async (req, res) => {
  try {
    const academicYear = await AcademicYear.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'closed',
        isActive: false,
        isCurrent: false,
        updatedBy: req.user.id
      },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email')
     .populate('updatedBy', 'name email');
    
    if (!academicYear) {
      return res.status(404).json({
        success: false,
        message: 'Academic year not found'
      });
    }
    
    res.json({
      success: true,
      data: academicYear,
      message: 'Academic year closed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error closing academic year',
      error: error.message
    });
  }
});

// Delete academic year
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const academicYear = await AcademicYear.findByIdAndDelete(req.params.id);
    
    if (!academicYear) {
      return res.status(404).json({
        success: false,
        message: 'Academic year not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Academic year deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting academic year',
      error: error.message
    });
  }
});

module.exports = router;
