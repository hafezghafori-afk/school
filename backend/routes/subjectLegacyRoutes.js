const express = require('express');
const Subject = require('../models/Subject');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/school/:schoolId', requireAuth, async (req, res) => {
  try {
    const { schoolId } = req.params;
    const filter = schoolId === 'default-school-id' ? {} : { schoolId };
    const items = await Subject.find(filter)
      .sort({ name: 1, createdAt: -1 });

    res.json({
      success: true,
      data: items
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching subjects',
      error: error.message
    });
  }
});

module.exports = router;
