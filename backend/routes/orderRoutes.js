const express = require('express');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'Order', actionPrefix: 'order', audit: auditWrite });

const respondLegacyEducationRouteRetired = (res, {
  message = 'Legacy order-based education routes are retired.',
  redirectTo = '/dashboard',
  replacementEndpoint = ''
} = {}) => res.status(410).json({
  success: false,
  deprecated: true,
  message,
  redirectTo,
  replacementEndpoint
});

const respondLegacyFinanceRouteRetired = (res, {
  message = 'Legacy order-based finance routes are retired.',
  redirectTo = '/admin-finance#pending-receipts',
  replacementEndpoint = ''
} = {}) => res.status(410).json({
  success: false,
  deprecated: true,
  message,
  redirectTo,
  replacementEndpoint
});

router.get('/instructor/courses', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res) => (
  respondLegacyEducationRouteRetired(res, {
    message: 'Legacy order-based instructor class list is retired. Use canonical education routes instead.',
    redirectTo: '/instructor/dashboard',
    replacementEndpoint: '/api/education/instructor/courses'
  })
));

router.post('/join-request', requireAuth, (req, res) => (
  respondLegacyEducationRouteRetired(res, {
    message: 'Legacy order-based join requests are retired. Submit canonical education join requests instead.',
    redirectTo: '/courses',
    replacementEndpoint: '/api/education/join-requests'
  })
));

router.get('/instructor/pending', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res) => (
  respondLegacyEducationRouteRetired(res, {
    message: 'Legacy order-based instructor join-request inbox is retired. Use canonical education requests instead.',
    redirectTo: '/instructor/dashboard',
    replacementEndpoint: '/api/education/instructor/join-requests'
  })
));

router.post('/instructor/approve/:orderId', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res) => (
  respondLegacyEducationRouteRetired(res, {
    message: 'Legacy order-based instructor approval is retired. Approve canonical education join requests instead.',
    redirectTo: '/instructor/dashboard',
    replacementEndpoint: '/api/education/instructor/join-requests/:id/approve'
  })
));

router.post('/instructor/reject/:orderId', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res) => (
  respondLegacyEducationRouteRetired(res, {
    message: 'Legacy order-based instructor rejection is retired. Reject canonical education join requests instead.',
    redirectTo: '/instructor/dashboard',
    replacementEndpoint: '/api/education/instructor/join-requests/:id/reject'
  })
));

router.get('/instructor/course-students', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res) => (
  respondLegacyEducationRouteRetired(res, {
    message: 'Legacy order-based class roster is retired. Read the roster from canonical education memberships instead.',
    redirectTo: '/instructor/dashboard',
    replacementEndpoint: '/api/education/instructor/course-students'
  })
));

router.post('/instructor/add-student', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res) => (
  respondLegacyEducationRouteRetired(res, {
    message: 'Legacy order-based class enrollment writes are retired. Add students through canonical education memberships instead.',
    redirectTo: '/instructor/dashboard',
    replacementEndpoint: '/api/education/instructor/course-students'
  })
));

router.delete('/instructor/remove-student/:orderId', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res) => (
  respondLegacyEducationRouteRetired(res, {
    message: 'Legacy order-based class removal is retired. Remove students through canonical education memberships instead.',
    redirectTo: '/instructor/dashboard',
    replacementEndpoint: '/api/education/instructor/course-students/:id'
  })
));

router.post('/submit', requireAuth, (req, res) => (
  respondLegacyFinanceRouteRetired(res, {
    message: 'Legacy order-based receipt submission is retired. Submit receipts from the student finance center instead.',
    redirectTo: '/my-finance',
    replacementEndpoint: '/api/finance/student/receipts'
  })
));

router.get('/pending', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), (req, res) => (
  respondLegacyFinanceRouteRetired(res, {
    message: 'Legacy order-based finance inbox is retired. Use canonical finance receipts instead.',
    replacementEndpoint: '/api/student-finance/payments?status=pending'
  })
));

router.post('/:orderId/follow-up', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), (req, res) => (
  respondLegacyFinanceRouteRetired(res, {
    message: 'Legacy order-based finance follow-up is retired. Update finance receipts instead.',
    replacementEndpoint: '/api/student-finance/payments/:id/follow-up'
  })
));

router.post('/approve/:orderId', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), (req, res) => (
  respondLegacyFinanceRouteRetired(res, {
    message: 'Legacy order-based finance approval is retired. Approve canonical finance receipts instead.',
    replacementEndpoint: '/api/student-finance/payments/:id/approve'
  })
));

router.post('/reject/:orderId', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), (req, res) => (
  respondLegacyFinanceRouteRetired(res, {
    message: 'Legacy order-based finance rejection is retired. Reject canonical finance receipts instead.',
    replacementEndpoint: '/api/student-finance/payments/:id/reject'
  })
));

router.get('/user/:userId', requireAuth, async (req, res) => {
  const requestedId = req.params.userId;
  if (requestedId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '?????? ???????' });
  }

  return respondLegacyEducationRouteRetired(res, {
    message: 'Legacy order-based student class list is retired. Read canonical education access instead.',
    redirectTo: requestedId === req.user.id ? '/dashboard' : '/admin-education',
    replacementEndpoint: requestedId === req.user.id ? '/api/education/my-courses' : '/api/education/student-enrollments'
  });
});

module.exports = router;
