const express = require('express');
const SchoolClass = require('../models/SchoolClass');
const { requireAuth } = require('../middleware/auth');
const { DEFAULT_SCHOOL_ID, resolveActiveSchool, requireWritableSchool, writeSchoolContextHeaders } = require('../services/schoolContextService');

const router = express.Router();

router.get('/school/:schoolId', requireAuth, async (req, res) => {
  try {
    const { schoolId } = req.params;
    const resolved = schoolId === DEFAULT_SCHOOL_ID
      ? await resolveActiveSchool(req, { allowSingleFallback: true })
      : { schoolId, requiresSelection: false };
    if (resolved.requiresSelection) {
      return res.json({
        success: true,
        data: [],
        meta: { requiresSchoolSelection: true }
      });
    }
    const filter = { schoolId: resolved.schoolId || schoolId };
    const items = await SchoolClass.find(filter)
      .populate('academicYearId', 'title status')
      .populate('shiftId', 'name nameDari namePashto')
      .sort({ gradeLevel: 1, section: 1, createdAt: -1 });

    res.json({
      success: true,
      data: items,
      meta: { schoolId: resolved.schoolId || schoolId }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching school classes',
      error: error.message
    });
  }
});

router.post('/school/:schoolId', requireAuth, async (req, res) => {
  try {
    const schoolContext = await requireWritableSchool(req, { ...req.body, schoolId: req.params.schoolId });
    const classData = { ...req.body, schoolId: schoolContext.schoolId };
    const newClass = new SchoolClass(classData);
    await newClass.save();
    const populated = await SchoolClass.findById(newClass._id)
      .populate('academicYearId', 'title status')
      .populate('shiftId', 'name nameDari namePashto');
    writeSchoolContextHeaders(res, schoolContext.schoolId);
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.message === 'school_context_required') {
      return res.status(error.statusCode || 400).json({ success: false, message: error.messageDari || 'اول یک مکتب فعال و معتبر انتخاب یا ایجاد کنید.' });
    }
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'این صنف قبلاً ثبت شده است.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const updated = await SchoolClass.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true, runValidators: true }
    )
      .populate('academicYearId', 'title status')
      .populate('shiftId', 'name nameDari namePashto');
    if (!updated) return res.status(404).json({ success: false, message: 'صنف یافت نشد.' });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await SchoolClass.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'صنف یافت نشد.' });
    res.json({ success: true, message: 'صنف حذف شد.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
