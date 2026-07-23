const { isFinanceMaintenanceActive } = require('../services/financeMaintenanceService');

async function blockFinanceWritesDuringMaintenance(req, res, next) {
  try {
    const schoolId = String(
      req.headers?.['x-school-id']
      || req.user?.schoolId
      || req.user?.activeSchoolId
      || ''
    ).trim();
    if (!await isFinanceMaintenanceActive(schoolId)) return next();
    return res.status(423).json({
      success: false,
      code: 'finance_maintenance_active',
      message: 'بخش مالی موقتاً برای پاک‌سازی و بررسی حساب‌ها قفل است. پس از پایان عملیات دوباره تلاش کنید.'
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { blockFinanceWritesDuringMaintenance };
