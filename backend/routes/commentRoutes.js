const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Comment = require('../models/Comment');
const Course = require('../models/Course');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'Comment', actionPrefix: 'comment', audit: auditWrite });

// مسیر ثبت کامنت جدید
// The author comes from the token, never the body: this route used to take
// userId/userName from anyone, signed in or not.
router.post('/add', requireAuth, async (req, res) => {
    try {
        const { courseId } = req.body || {};
        const text = String(req.body?.text || '').trim().slice(0, 2000);
        if (!mongoose.Types.ObjectId.isValid(courseId) || !text) {
            return res.status(400).json({ message: 'صنف و متن سوال الزامی است' });
        }
        if (!(await Course.exists({ _id: courseId }))) {
            return res.status(404).json({ message: 'صنف پیدا نشد' });
        }

        const newComment = new Comment({
            course: courseId,
            user: req.user.id,
            userName: req.user.name || '',
            text
        });

        const savedComment = await newComment.save();

        // اضافه کردن آی‌دی کامنت به خودِ درس (برای نمایش راحت‌تر)
        await Course.findByIdAndUpdate(courseId, {
            $push: { comments: savedComment._id }
        });

        res.status(201).json({ message: "سوال شما با موفقیت ثبت شد" });
    } catch (error) {
        console.error('Add Comment Error:', error);
        res.status(500).json({ message: 'ثبت سوال ناموفق بود' });
    }
});

module.exports = router;
