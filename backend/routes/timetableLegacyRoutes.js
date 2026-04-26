const express = require('express');
const timetableEditorRoutes = require('./timetableEditorRoutes');
const timetableGeneratorRoutes = require('./timetableGeneratorRoutes');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'TimetableLegacyAlias', actionPrefix: 'timetable_legacy_alias', audit: auditWrite });

// Compatibility aliases for simpler period-based API contract.
router.post('/', (req, res, next) => {
	req.url = '/entry';
	next();
});

router.delete('/:id', (req, res, next) => {
	if (!req.params?.id) {
		return res.status(400).json({ success: false, message: 'Entry id is required.' });
	}
	req.url = `/entry/${req.params.id}`;
	next();
});

router.put('/:id', (req, res, next) => {
	if (!req.params?.id) {
		return res.status(400).json({ success: false, message: 'Entry id is required.' });
	}
	req.url = `/entry/${req.params.id}`;
	next();
});

router.use('/', timetableEditorRoutes);
router.use('/', timetableGeneratorRoutes);

module.exports = router;
