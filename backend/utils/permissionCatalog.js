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
    'students.register',
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
    'schools.documents.manage',
    'id_cards.manage'
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
    'shortterm.center.manage',
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
    'reports.government_finance.view',
    'finance.reports.consolidated.view'
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
    'settings.academic.manage',
    'id_cards.manage'
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
    'finance.reports.consolidated.view',
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
    'timetable.history.view',
    'settings.academic.manage'
  ],
  manage_platform_requests: [
    'content.contacts.manage'
  ],
  // پروندهٔ سوانح شاگرد (مکاتب افغانستان) — دارندگان permissionهای زیر خودکار مجازند
  'sawaneh.card.view': [
    'manage_content', 'manage_users', 'manage_enrollments',
    'students.profile.view', 'students.manage', 'education.core.manage',
    'schools.reports.view', 'teachers.dashboard.access'
  ],
  'sawaneh.card.edit': [
    'manage_content', 'manage_users', 'students.manage', 'education.core.manage'
  ],
  'sawaneh.card.supervisor_remark': [
    'manage_content', 'education.core.manage', 'education.exams.manage',
    'teachers.dashboard.access'
  ],
  'sawaneh.card.name_correction': [
    'manage_users', 'students.manage'
  ],
  'sawaneh.card.separation': [
    'manage_users', 'students.transfers.manage', 'students.lifecycle.manage'
  ],
  'sawaneh.transcript.view': [
    'manage_content', 'grades.detail.view', 'education.result_tables.manage',
    'reports.students.view', 'teachers.dashboard.access'
  ],
  'sawaneh.transcript.build': [
    'manage_content', 'education.exams.manage', 'education.result_tables.manage'
  ],
  'sawaneh.transcript.finalize': [
    'manage_content', 'education.result_tables.manage'
  ],
  'sawaneh.transcript.lock': [
    'manage_content', 'settings.academic.manage'
  ]
});

const PERMISSION_GROUPS = Object.freeze([
  {
    key: 'dashboard',
    permissions: [
      'dashboard.view',
      'profile.view',
      'profile.update.request',
      'notifications.view',
      'chat.use',
      'recordings.view',
      'schedule.public.view'
    ]
  },
  {
    key: 'users',
    permissions: [
      'users.manage',
      'users.create',
      'users.edit',
      'users.deactivate',
      'users.roles.manage',
      'users.permissions.manage',
      'users.access_requests.manage',
      'users.profile_requests.manage',
      'users.logs.view'
    ]
  },
  {
    key: 'students',
    permissions: [
      'students.register',
      'students.manage',
      'enrollments.online.manage',
      'enrollments.manage',
      'enrollments.detail.view',
      'enrollments.print',
      'students.profile.view',
      'students.documents.manage',
      'students.guardians.manage',
      'students.transfers.manage',
      'students.lifecycle.view',
      'students.lifecycle.manage',
      'students.lifecycle.approve',
      'students.activity.view'
    ]
  },
  {
    key: 'education',
    permissions: [
      'education.core.manage',
      'education.years.manage',
      'education.terms.manage',
      'education.classes.manage',
      'education.shifts.manage',
      'education.subjects.manage',
      'education.curriculum.manage',
      'education.annual_plan.manage',
      'education.weekly_plan.manage',
      'education.memberships.manage',
      'education.promotions.manage',
      'education.result_tables.manage',
      'education.sheet_templates.manage',
      'education.exams.manage'
    ]
  },
  {
    key: 'teachers',
    permissions: [
      'teachers.manage',
      'teachers.assignments.manage',
      'teachers.dashboard.access',
      'teachers.students.add',
      'teachers.reports.view',
      'teachers.attendance.manage',
      'teachers.timetable.view'
    ]
  },
  {
    key: 'timetable',
    permissions: [
      'timetable.hub.view',
      'timetable.view',
      'timetable.config.manage',
      'timetable.shifts.manage',
      'timetable.teacher_assignments.manage',
      'timetable.teacher_availability.manage',
      'timetable.generate',
      'timetable.editor.manage',
      'timetable.operations.manage',
      'timetable.reports.view',
      'timetable.conflicts.manage',
      'timetable.history.view',
      'timetable.student_view.access',
      'timetable.teacher_view.access'
    ]
  },
  {
    key: 'learning',
    permissions: [
      'attendance.students.manage',
      'attendance.my.view',
      'attendance.employees.manage',
      'grades.manage',
      'grades.my.view',
      'grades.detail.view',
      'homework.manage',
      'homework.my.view',
      'quiz.take',
      'quiz.manage'
    ]
  },
  {
    key: 'finance',
    permissions: [
      'finance.center.manage',
      'shortterm.center.manage',
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
      'finance.my.view',
      'finance.receipt.submit'
    ]
  },
  {
    key: 'content',
    permissions: [
      'content.news.manage',
      'content.news.archive',
      'content.news.categories',
      'content.gallery.manage',
      'content.pages.manage',
      'content.contacts.manage',
      'content.faq.manage',
      'content.terms.manage'
    ]
  },
  {
    key: 'reports',
    permissions: [
      'reports.builder.view',
      'reports.students.view',
      'reports.teachers.view',
      'reports.government_finance.view',
      'finance.reports.consolidated.view',
      'reports.schools.view',
      'reports.logs.view',
      'reports.alerts.view',
      'reports.admin_search.use'
    ]
  },
  {
    key: 'schools',
    permissions: [
      'schools.dashboard.view',
      'schools.map.view',
      'schools.manage',
      'schools.reports.view',
      'schools.create',
      'schools.edit',
      'schools.documents.manage',
      'schools.province_stats.view'
    ]
  },
  {
    key: 'settings',
    permissions: [
      'settings.general.manage',
      'settings.login.manage',
      'settings.student_ids.manage',
      'settings.brand.manage',
      'settings.academic.manage',
      'settings.security.manage',
      'access_school_manager',
      'access_head_teacher'
    ]
  },
  {
    key: 'sawaneh',
    permissions: [
      'sawaneh.card.view',
      'sawaneh.card.edit',
      'sawaneh.card.supervisor_remark',
      'sawaneh.card.name_correction',
      'sawaneh.card.separation',
      'sawaneh.transcript.view',
      'sawaneh.transcript.build',
      'sawaneh.transcript.finalize',
      'sawaneh.transcript.lock'
    ]
  },
  {
    key: 'id_cards',
    permissions: [
      'id_cards.manage'
    ]
  }
]);

const PERMISSION_KEYS = Object.freeze(Array.from(new Set([
  ...Object.keys(LEGACY_PERMISSION_MAP),
  ...Object.values(LEGACY_PERMISSION_MAP).flat(),
  ...PERMISSION_GROUPS.flatMap((group) => group.permissions)
])));

const ACCESS_PERMISSION_KEYS = Object.freeze(new Set(PERMISSION_KEYS));

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
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  ACCESS_PERMISSION_KEYS,
  expandLegacyPermissions
};
