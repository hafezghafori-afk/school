const LEGACY_PERMISSION_MAP = Object.freeze({
  manage_users: [
    'users.manage',
    'users.create',
    'users.edit',
    'users.deactivate',
    'users.roles.manage',
    'users.permissions.manage',
    'users.access_requests.manage',
    'users.profile_requests.manage',
    'students.manage',
    'students.documents.manage',
    'students.guardians.manage',
    'students.transfers.manage',
    'students.lifecycle.view',
    'students.lifecycle.manage',
    'students.lifecycle.approve',
    'teachers.manage',
    'education.promotions.manage',
    'settings.login.manage',
    'settings.security.manage',
    'schools.manage',
    'schools.create',
    'schools.edit',
    'schools.documents.manage'
  ],
  manage_enrollments: [
    'students.register',
    'enrollments.online.manage',
    'enrollments.manage',
    'enrollments.detail.view',
    'enrollments.print'
  ],
  manage_memberships: [
    'education.memberships.manage',
    'students.lifecycle.view',
    'students.lifecycle.manage',
    'students.transfers.manage',
    'education.promotions.manage'
  ],
  manage_finance: [
    'finance.center.manage',
    'finance.government.view',
    'finance.memberships.manage',
    'finance.student_profile.view',
    'finance.bills.manage',
    'finance.payments.manage',
    'finance.receipts.approve',
    'finance.receipts.reject',
    'finance.receipts.follow_up',
    'finance.discounts.manage',
    'finance.exemptions.manage',
    'finance.reliefs.manage',
    'finance.transport.manage',
    'finance.reports.view',
    'finance.month_close.manage',
    'finance.documents.manage',
    'finance.lifecycle_effects.manage',
    'reports.government_finance.view'
  ],
  manage_content: [
    'education.core.manage',
    'education.years.manage',
    'education.terms.manage',
    'education.classes.manage',
    'education.subjects.manage',
    'education.curriculum.manage',
    'education.result_tables.manage',
    'education.sheet_templates.manage',
    'education.exams.manage',
    'teachers.dashboard.access',
    'teachers.students.add',
    'teachers.attendance.manage',
    'attendance.students.manage',
    'attendance.employees.manage',
    'grades.manage',
    'grades.detail.view',
    'homework.manage',
    'quiz.manage',
    'content.news.manage',
    'content.news.archive',
    'content.news.categories',
    'content.gallery.manage',
    'content.pages.manage',
    'content.faq.manage',
    'content.terms.manage',
    'settings.general.manage',
    'settings.student_ids.manage',
    'settings.brand.manage',
    'settings.academic.manage'
  ],
  view_reports: [
    'dashboard.view',
    'users.logs.view',
    'students.profile.view',
    'students.activity.view',
    'teachers.reports.view',
    'finance.reports.view',
    'reports.builder.view',
    'reports.students.view',
    'reports.teachers.view',
    'reports.government_finance.view',
    'reports.schools.view',
    'reports.logs.view',
    'reports.alerts.view',
    'reports.admin_search.use',
    'schools.dashboard.view',
    'schools.map.view',
    'schools.reports.view',
    'schools.province_stats.view'
  ],
  view_schedule: [
    'timetable.view',
    'teachers.timetable.view',
    'timetable.teacher_view.access'
  ],
  manage_schedule: [
    'education.shifts.manage',
    'education.annual_plan.manage',
    'education.weekly_plan.manage',
    'teachers.assignments.manage',
    'timetable.hub.view',
    'timetable.config.manage',
    'timetable.shifts.manage',
    'timetable.teacher_assignments.manage',
    'timetable.teacher_availability.manage',
    'timetable.generate',
    'timetable.editor.manage',
    'timetable.operations.manage',
    'timetable.reports.view',
    'timetable.conflicts.manage',
    'timetable.history.view'
  ],
  manage_platform_requests: [
    'content.contacts.manage'
  ]
});

function expandLegacyPermissions(permissions = []) {
  const next = new Set();
  (Array.isArray(permissions) ? permissions : []).forEach((permission) => {
    const key = String(permission || '').trim();
    if (!key) return;
    next.add(key);
    (LEGACY_PERMISSION_MAP[key] || []).forEach((mapped) => next.add(mapped));
  });
  return Array.from(next);
}

module.exports = {
  LEGACY_PERMISSION_MAP,
  expandLegacyPermissions
};
