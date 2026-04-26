const express = require('express');
const Result = require('../models/Result');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'Result', actionPrefix: 'result', audit: auditWrite });

// ذخیره نتیجه آزمون
router.post('/save', requireAuth, async (req, res) => {
  try {
    const { courseId, score, totalQuestions } = req.body;
    const userId = req.user?.id;
    if (!userId || !courseId || score === undefined) {
      return res.status(400).json({ success: false, message: 'اطلاعات ناقص است' });
    }
    const numericScore = Number(score);
    if (Number.isNaN(numericScore) || numericScore < 0 || numericScore > 100) {
      return res.status(400).json({ success: false, message: 'نمره معتبر نیست' });
    }

    const result = await Result.create({
      user: userId,
      course: courseId,
      score: numericScore,
      totalQuestions: totalQuestions || null
    });

    res.status(201).json({ success: true, message: 'نتیجه ذخیره شد', resultId: result._id });
  } catch (error) {
    console.error('Result Save Error:', error);
    res.status(500).json({ success: false, message: 'خطا در ذخیره نتیجه' });
  }
});

module.exports = router;
