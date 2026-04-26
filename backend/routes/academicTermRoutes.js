const express = require('express');
const router = express.Router();
const AcademicTerm = require('../models/AcademicTerm');
const AcademicYear = require('../models/AcademicYear');
const { requireFields } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'AcademicTerm', actionPrefix: 'academic_term', audit: auditWrite });

// Get all terms for an academic year
router.get('/academic-year/:academicYearId', requireAuth, async (req, res) => {
  try {
    const { academicYearId } = req.params;
    const { status, type, page = 1, limit = 10 } = req.query;
    
    const filter = { academicYearId };
    if (status) filter.status = status;
    if (type) filter.type = type;
    
    const terms = await AcademicTerm.find(filter)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ order: 1, createdAt: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await AcademicTerm.countDocuments(filter);
    
    res.json({
      success: true,
      data: terms,
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
      message: 'Error fetching academic terms',
      error: error.message
    });
  }
});

// Get term by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const term = await AcademicTerm.findById(req.params.id)
      .populate('academicYearId', 'title code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    if (!term) {
      return res.status(404).json({
        success: false,
        message: 'Academic term not found'
      });
    }
    
    res.json({
      success: true,
      data: term
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching academic term',
      error: error.message
    });
  }
});

// Create new academic term
router.post('/', requireAuth, requireFields(['academicYearId', 'title']), async (req, res) => {
  try {
    // Verify academic year exists
    const academicYear = await AcademicYear.findById(req.body.academicYearId);
    if (!academicYear) {
      return res.status(400).json({
        success: false,
        message: 'Academic year not found'
      });
    }
    
    const termData = {
      ...req.body,
      createdBy: req.user.id
    };
    
    const term = new AcademicTerm(termData);
    await term.save();
    
    const populatedTerm = await AcademicTerm.findById(term._id)
      .populate('academicYearId', 'title code')
      .populate('createdBy', 'name email');
    
    res.status(201).json({
      success: true,
      data: populatedTerm,
      message: 'Academic term created successfully'
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Term with this code already exists for this academic year'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating academic term',
      error: error.message
    });
  }
});

// Update academic term
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedBy: req.user.id
    };
    
    const term = await AcademicTerm.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('academicYearId', 'title code')
     .populate('createdBy', 'name email')
     .populate('updatedBy', 'name email');
    
    if (!term) {
      return res.status(404).json({
        success: false,
        message: 'Academic term not found'
      });
    }
    
    res.json({
      success: true,
      data: term,
      message: 'Academic term updated successfully'
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Term with this code already exists for this academic year'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating academic term',
      error: error.message
    });
  }
});

// Activate academic term
router.post('/:id/activate', requireAuth, async (req, res) => {
  try {
    const session = await AcademicTerm.startSession();
    session.startTransaction();
    
    try {
      const term = await AcademicTerm.findById(req.params.id).session(session);
      
      if (!term) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Academic term not found'
        });
      }
      
      // Deactivate all other terms for this academic year
      await AcademicTerm.updateMany(
        { academicYearId: term.academicYearId, _id: { $ne: req.params.id } },
        { isActive: false, status: 'closed' },
        { session }
      );
      
      // Set this term as active
      term.isActive = true;
      term.status = 'active';
      term.updatedBy = req.user.id;
      await term.save({ session });
      
      await session.commitTransaction();
      session.endSession();
      
      const populatedTerm = await AcademicTerm.findById(term._id)
        .populate('academicYearId', 'title code')
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email');
      
      res.json({
        success: true,
        data: populatedTerm,
        message: 'Academic term activated successfully'
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error activating academic term',
      error: error.message
    });
  }
});

// Close academic term
router.post('/:id/close', requireAuth, async (req, res) => {
  try {
    const term = await AcademicTerm.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'closed',
        isActive: false,
        updatedBy: req.user.id
      },
      { new: true, runValidators: true }
    ).populate('academicYearId', 'title code')
     .populate('createdBy', 'name email')
     .populate('updatedBy', 'name email');
    
    if (!term) {
      return res.status(404).json({
        success: false,
        message: 'Academic term not found'
      });
    }
    
    res.json({
      success: true,
      data: term,
      message: 'Academic term closed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error closing academic term',
      error: error.message
    });
  }
});

// Generate terms automatically for academic year
router.post('/academic-year/:academicYearId/generate-terms', requireAuth, requireFields(['type']), async (req, res) => {
  try {
    const { academicYearId } = req.params;
    const { type = 'quarter' } = req.body;
    
    const academicYear = await AcademicYear.findById(academicYearId);
    if (!academicYear) {
      return res.status(404).json({
        success: false,
        message: 'Academic year not found'
      });
    }
    
    const termTemplates = {
      quarter: [
        { name: 'ربع اول', code: 'Q1', order: 1 },
        { name: 'ربع دوم', code: 'Q2', order: 2 },
        { name: 'ربع سوم', code: 'Q3', order: 3 },
        { name: 'ربع چهارم', code: 'Q4', order: 4 }
      ],
      semester: [
        { name: 'سمستر اول', code: 'S1', order: 1 },
        { name: 'سمستر دوم', code: 'S2', order: 2 }
      ],
      term: [
        { name: 'ترم اول', code: 'T1', order: 1 },
        { name: 'ترم دوم', code: 'T2', order: 2 },
        { name: 'ترم سوم', code: 'T3', order: 3 }
      ]
    };
    
    const templates = termTemplates[type] || termTemplates.quarter;
    
    // Check if terms already exist
    const existingTerms = await AcademicTerm.find({ academicYearId });
    if (existingTerms.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Academic year already has terms. Delete existing terms first or use manual creation.'
      });
    }
    
    const terms = templates.map(template => ({
      academicYearId,
      title: template.name,
      code: template.code,
      name: template.name,
      order: template.order,
      type,
      status: 'planned',
      createdBy: req.user.id
    }));
    
    const createdTerms = await AcademicTerm.insertMany(terms);
    
    const populatedTerms = await AcademicTerm.find({ academicYearId })
      .populate('academicYearId', 'title code')
      .populate('createdBy', 'name email')
      .sort({ order: 1 });
    
    res.status(201).json({
      success: true,
      data: populatedTerms,
      message: `Generated ${createdTerms.length} ${type} terms successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating terms',
      error: error.message
    });
  }
});

// Delete academic term
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const term = await AcademicTerm.findByIdAndDelete(req.params.id);
    
    if (!term) {
      return res.status(404).json({
        success: false,
        message: 'Academic term not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Academic term deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting academic term',
      error: error.message
    });
  }
});

module.exports = router;
