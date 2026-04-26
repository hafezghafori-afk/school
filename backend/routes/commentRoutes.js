const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const Course = require('../models/Course');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'Comment', actionPrefix: 'comment', audit: auditWrite });

// مسیر ثبت کامنت جدید
router.post('/add', async (req, res) => {
    try {
        const { courseId, userId, userName, text } = req.body;

        const newComment = new Comment({
            course: courseId,
            user: userId,
            userName,
            text
        });

        const savedComment = await newComment.save();

        // اضافه کردن آی‌دی کامنت به خودِ درس (برای نمایش راحت‌تر)
        await Course.findByIdAndUpdate(courseId, {
            $push: { comments: savedComment._id }
        });

        res.status(201).json({ message: "سوال شما با موفقیت ثبت شد" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
