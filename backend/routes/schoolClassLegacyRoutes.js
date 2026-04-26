const express = require('express');
const SchoolClass = require('../models/SchoolClass');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/school/:schoolId', requireAuth, async (req, res) => {
  try {
    const { schoolId } = req.params;
    const filter = schoolId === 'default-school-id' ? {} : { schoolId };
    const items = await SchoolClass.find(filter)
      .populate('academicYearId', 'title status')
      .populate('shiftId', 'name nameDari namePashto')
      .sort({ gradeLevel: 1, section: 1, createdAt: -1 });

    res.json({
      success: true,
      data: items
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
    const { schoolId } = req.params;
    const classData = { ...req.body, schoolId };
    const newClass = new SchoolClass(classData);
    await newClass.save();
    const populated = await SchoolClass.findById(newClass._id)
      .populate('academicYearId', 'title status')
      .populate('shiftId', 'name nameDari namePashto');
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
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
