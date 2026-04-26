const express = require('express');
const router = express.Router();
const CurriculumRule = require('../models/CurriculumRule');
const SchoolClass = require('../models/SchoolClass');
const Subject = require('../models/Subject');
const AcademicYear = require('../models/AcademicYear');
const { requireAuth } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'CurriculumRule', actionPrefix: 'curriculum_rule', audit: auditWrite });

// Get curriculum rules for a school
router.get('/school/:schoolId', requireAuth, checkRole(['admin', 'principal', 'academic_manager']), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { academicYearId, classId } = req.query;
    
    let query = { schoolId };
    if (academicYearId) query.academicYearId = academicYearId;
    if (classId) query.classId = classId;

    const rules = await CurriculumRule.find(query)
      .populate('academicYearId', 'title status')
      .populate('classId', 'title gradeLevel section genderType')
      .populate('subjectId', 'name nameDari namePashto code category')
      .sort({ 'classId.gradeLevel': 1, 'classId.section': 1, priority: 1 });

    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    console.error('Error fetching curriculum rules:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching curriculum rules',
      error: error.message
    });
  }
});

// Create new curriculum rule
router.post('/school/:schoolId', requireAuth, checkRole(['admin', 'principal', 'academic_manager']), async (req, res) => {
  try {
    const { schoolId } = req.params;
    const ruleData = {
      ...req.body,
      schoolId,
      createdBy: req.user.id
    };

    // Check if rule already exists for this combination
    const existing = await CurriculumRule.findOne({
      schoolId,
      academicYearId: ruleData.academicYearId,
      classId: ruleData.classId,
      subjectId: ruleData.subjectId
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Curriculum rule already exists for this class and subject'
      });
    }

    const rule = new CurriculumRule(ruleData);
    await rule.save();

    const populatedRule = await CurriculumRule.findById(rule._id)
      .populate('academicYearId', 'title status')
      .populate('classId', 'title gradeLevel section genderType')
      .populate('subjectId', 'name nameDari namePashto code category');

    res.status(201).json({
      success: true,
      message: 'Curriculum rule created successfully',
      data: populatedRule
    });
  } catch (error) {
    console.error('Error creating curriculum rule:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating curriculum rule',
      error: error.message
    });
  }
});

// Update curriculum rule
router.put('/:id', requireAuth, checkRole(['admin', 'principal', 'academic_manager']), async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedBy: req.user.id
    };

    const rule = await CurriculumRule.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('academicYearId', 'title status')
      .populate('classId', 'title gradeLevel section genderType')
      .populate('subjectId', 'name nameDari namePashto code category');

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Curriculum rule not found'
      });
    }

    res.json({
      success: true,
      message: 'Curriculum rule updated successfully',
      data: rule
    });
  } catch (error) {
    console.error('Error updating curriculum rule:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating curriculum rule',
      error: error.message
    });
  }
});

// Delete curriculum rule
router.delete('/:id', requireAuth, checkRole(['admin', 'principal']), async (req, res) => {
  try {
    const rule = await CurriculumRule.findByIdAndDelete(req.params.id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Curriculum rule not found'
      });
    }

    res.json({
      success: true,
      message: 'Curriculum rule deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting curriculum rule:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting curriculum rule',
      error: error.message
    });
  }
});

// Get curriculum by class
router.get('/class/:classId', requireAuth, async (req, res) => {
  try {
    const { classId } = req.params;
    const { academicYearId } = req.query;

    let query = { classId };
    if (academicYearId) query.academicYearId = academicYearId;

    const rules = await CurriculumRule.find(query)
      .populate('academicYearId', 'title status')
      .populate('subjectId', 'name nameDari namePashto code category weeklyHours')
      .sort({ priority: 1, 'subjectId.name': 1 });

    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    console.error('Error fetching class curriculum:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching class curriculum',
      error: error.message
    });
  }
});

// Bulk create curriculum rules for a class
router.post('/class/:classId/bulk', requireAuth, checkRole(['admin', 'principal', 'academic_manager']), async (req, res) => {
  try {
    const { classId } = req.params;
    const { academicYearId, subjects } = req.body;

    const classInfo = await SchoolClass.findById(classId);
    if (!classInfo) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    const rules = [];
    for (const subject of subjects) {
      const ruleData = {
        schoolId: classInfo.schoolId,
        academicYearId,
        classId,
        subjectId: subject.subjectId,
        weeklyPeriods: subject.weeklyPeriods,
        isMandatory: subject.isMandatory !== false,
        priority: subject.priority || 1,
        consecutivePeriods: subject.consecutivePeriods || false,
        preferredTimeSlots: subject.preferredTimeSlots || [],
        avoidTimeSlots: subject.avoidTimeSlots || [],
        specialRequirements: subject.specialRequirements || {},
        createdBy: req.user.id
      };

      // Check if already exists
      const existing = await CurriculumRule.findOne({
        schoolId: classInfo.schoolId,
        academicYearId,
        classId,
        subjectId: subject.subjectId
      });

      if (!existing) {
        const rule = new CurriculumRule(ruleData);
        await rule.save();
        rules.push(rule);
      }
    }

    const populatedRules = await CurriculumRule.find({
      _id: { $in: rules.map(r => r._id) }
    })
      .populate('academicYearId', 'title status')
      .populate('classId', 'title gradeLevel section genderType')
      .populate('subjectId', 'name nameDari namePashto code category');

    res.status(201).json({
      success: true,
      message: `${rules.length} curriculum rules created successfully`,
      data: populatedRules
    });
  } catch (error) {
    console.error('Error bulk creating curriculum rules:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk creating curriculum rules',
      error: error.message
    });
  }
});

// Get curriculum summary for a class
router.get('/class/:classId/summary', requireAuth, async (req, res) => {
  try {
    const { classId } = req.params;
    const { academicYearId } = req.query;

    let query = { classId };
    if (academicYearId) query.academicYearId = academicYearId;

    const rules = await CurriculumRule.find(query)
      .populate('subjectId', 'name nameDari namePashto code category')
      .sort({ priority: 1, 'subjectId.name': 1 });

    const summary = {
      totalSubjects: rules.length,
      totalWeeklyPeriods: rules.reduce((sum, rule) => sum + rule.weeklyPeriods, 0),
      mandatorySubjects: rules.filter(rule => rule.isMandatory).length,
      electiveSubjects: rules.filter(rule => !rule.isMandatory).length,
      subjectsByCategory: {},
      subjects: rules.map(rule => ({
        _id: rule._id,
        subject: rule.subjectId,
        weeklyPeriods: rule.weeklyPeriods,
        isMandatory: rule.isMandatory,
        priority: rule.priority,
        specialRequirements: rule.specialRequirements
      }))
    };

    // Group by category
    rules.forEach(rule => {
      const category = rule.subjectId.category;
      if (!summary.subjectsByCategory[category]) {
        summary.subjectsByCategory[category] = {
          count: 0,
          periods: 0
        };
      }
      summary.subjectsByCategory[category].count++;
      summary.subjectsByCategory[category].periods += rule.weeklyPeriods;
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching curriculum summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching curriculum summary',
      error: error.message
    });
  }
});

module.exports = router;
