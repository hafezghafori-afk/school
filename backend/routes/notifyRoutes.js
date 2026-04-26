const express = require('express');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');
const Notification = require('../models/Notification');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'Notification', actionPrefix: 'notification', audit: auditWrite });

router.post('/order-status', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  const { email, orderId, status, reason } = req.body || {};
  if (!email || !orderId || !status) {
    return res.status(400).json({ success: false, message: '\u0627\u0637\u0644\u0627\u0639\u0627\u062a \u0646\u0627\u0642\u0635 \u0627\u0633\u062a' });
  }

  const subject = `\u0648\u0636\u0639\u06cc\u062a \u0633\u0641\u0627\u0631\u0634 \u0634\u0645\u0627: ${status}`;
  const text = `\u0633\u0644\u0627\u0645\u060c
\u0648\u0636\u0639\u06cc\u062a \u0633\u0641\u0627\u0631\u0634 \u0634\u0645\u0627 (${orderId}) \u0628\u0647 \u062d\u0627\u0644\u062a ${status} \u062a\u063a\u06cc\u06cc\u0631 \u06a9\u0631\u062f.
${reason ? `\u062f\u0644\u06cc\u0644: ${reason}` : ''}`;
  const html = `
    <div style="font-family:Tahoma,Arial;line-height:1.8">
      <h3>\u0648\u0636\u0639\u06cc\u062a \u0633\u0641\u0627\u0631\u0634 \u0634\u0645\u0627</h3>
      <p>\u0633\u0641\u0627\u0631\u0634 <strong>${orderId}</strong> \u0628\u0647 \u0648\u0636\u0639\u06cc\u062a <strong>${status}</strong> \u062a\u063a\u06cc\u06cc\u0631 \u06a9\u0631\u062f.</p>
      ${reason ? `<p>\u062f\u0644\u06cc\u0644: ${reason}</p>` : ''}
      <p>\u0628\u0627 \u0627\u062d\u062a\u0631\u0627\u0645\u060c Academy Pro</p>
    </div>
  `;

  const result = await sendMail({ to: email, subject, text, html });
  if (!result.ok) {
    return res.status(200).json({ success: false, message: result.message || '\u0627\u0631\u0633\u0627\u0644 \u0627\u06cc\u0645\u06cc\u0644 \u0645\u0645\u06a9\u0646 \u0646\u0634\u062f' });
  }

  await Notification.create({
    email,
    orderId,
    status,
    reason: reason || '',
    channel: 'email'
  });
  res.json({ success: true, message: '\u0627\u06cc\u0645\u06cc\u0644 \u0627\u0631\u0633\u0627\u0644 \u0634\u062f' });
});

router.get('/list', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const items = await Notification.find().sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062f\u0631\u06cc\u0627\u0641\u062a \u0627\u0639\u0644\u0627\u0646\u200c\u0647\u0627' });
  }
});

module.exports = router;
