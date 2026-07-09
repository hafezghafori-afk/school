export const PERMISSION_GROUPS = [
  {
    key: 'dashboard',
    label: 'داشبورد و حساب کاربری',
    permissions: [
      { key: 'dashboard.view', label: 'داشبورد عمومی سیستم', legacy: ['view_reports'] },
      { key: 'profile.view', label: 'پروفایل کاربر' },
      { key: 'profile.update.request', label: 'درخواست تغییر مشخصات' },
      { key: 'notifications.view', label: 'اعلان‌ها' },
      { key: 'chat.use', label: 'پیام‌ها / چت' },
      { key: 'recordings.view', label: 'آرشیف ضبط جلسات' },
      { key: 'schedule.public.view', label: 'تقویم / زمان‌بندی عمومی' }
    ]
  },
  {
    key: 'users',
    label: 'کاربران و نقش‌ها',
    permissions: [
      { key: 'users.manage', label: 'مدیریت کاربران', legacy: ['manage_users'] },
      { key: 'users.create', label: 'ایجاد کاربر', legacy: ['manage_users'] },
      { key: 'users.edit', label: 'ویرایش کاربر', legacy: ['manage_users'] },
      { key: 'users.deactivate', label: 'غیرفعال/تعلیق کاربر', legacy: ['manage_users'] },
      { key: 'users.roles.manage', label: 'تنظیم نقش کاربر', legacy: ['manage_users'] },
      { key: 'users.permissions.manage', label: 'تنظیم سطح دسترسی کاربران', legacy: ['manage_users'] },
      { key: 'users.access_requests.manage', label: 'درخواست‌های دسترسی', legacy: ['manage_users'] },
      { key: 'users.profile_requests.manage', label: 'تایید تغییر مشخصات کاربران', legacy: ['manage_users'] },
      { key: 'users.logs.view', label: 'لاگ فعالیت کاربران', legacy: ['view_reports'] }
    ]
  },
  {
    key: 'students',
    label: 'ثبت‌نام و شاگردان',
    permissions: [
      { key: 'students.register', label: 'ثبت شاگرد', legacy: ['manage_enrollments', 'manage_users'] },
      { key: 'students.manage', label: 'مدیریت شاگردان', legacy: ['manage_users'] },
      { key: 'enrollments.online.manage', label: 'ثبت‌نام آنلاین', legacy: ['manage_enrollments'] },
      { key: 'enrollments.manage', label: 'مدیریت فورم‌های ثبت‌نام', legacy: ['manage_enrollments'] },
      { key: 'enrollments.detail.view', label: 'جزئیات ثبت‌نام', legacy: ['manage_enrollments'] },
      { key: 'enrollments.print', label: 'چاپ فورم ثبت‌نام', legacy: ['manage_enrollments'] },
      { key: 'students.profile.view', label: 'پروفایل شاگرد', legacy: ['view_reports'] },
      { key: 'students.documents.manage', label: 'اسناد شاگرد', legacy: ['manage_users'] },
      { key: 'students.guardians.manage', label: 'والد/سرپرست شاگرد', legacy: ['manage_users'] },
      { key: 'students.transfers.manage', label: 'انتقالات شاگرد', legacy: ['manage_users'] },
      { key: 'students.lifecycle.view', label: 'مشاهده چرخه آموزشی شاگرد', legacy: ['manage_users', 'manage_memberships'] },
      { key: 'students.lifecycle.manage', label: 'مدیریت تبدیلی/ترک تحصیل شاگرد', legacy: ['manage_users', 'manage_memberships'] },
      { key: 'students.lifecycle.approve', label: 'تایید تغییرات چرخه آموزشی شاگرد', legacy: ['manage_users'] },
      { key: 'students.activity.view', label: 'گزارش فعالیت شاگرد', legacy: ['view_reports'] }
    ]
  },
  {
    key: 'education',
    label: 'آموزش و ساختار تعلیمی',
    permissions: [
      { key: 'education.core.manage', label: 'مرکز مدیریت آموزش', legacy: ['manage_content'] },
      { key: 'education.years.manage', label: 'سال تعلیمی', legacy: ['manage_content'] },
      { key: 'education.terms.manage', label: 'ترم/دوره تعلیمی', legacy: ['manage_content'] },
      { key: 'education.classes.manage', label: 'صنف‌ها / کلاس‌ها', legacy: ['manage_content'] },
      { key: 'education.shifts.manage', label: 'نوبت‌ها / شیفت‌ها', legacy: ['manage_schedule'] },
      { key: 'education.subjects.manage', label: 'مضامین', legacy: ['manage_content'] },
      { key: 'education.curriculum.manage', label: 'نصاب تعلیمی', legacy: ['manage_content'] },
      { key: 'education.annual_plan.manage', label: 'پلان تعلیمی سالانه', legacy: ['manage_schedule'] },
      { key: 'education.weekly_plan.manage', label: 'پلان تعلیمی هفته‌وار', legacy: ['manage_schedule'] },
      { key: 'education.memberships.manage', label: 'ممبرشیپ آموزشی', legacy: ['manage_memberships'] },
      { key: 'education.promotions.manage', label: 'ارتقای صنف', legacy: ['manage_users'] },
      { key: 'education.result_tables.manage', label: 'جدول نتایج', legacy: ['manage_content'] },
      { key: 'education.sheet_templates.manage', label: 'قالب شقه‌ها / sheet templates', legacy: ['manage_content'] },
      { key: 'education.exams.manage', label: 'داشبورد امتحانات', legacy: ['manage_content'] }
    ]
  },
  {
    key: 'teachers',
    label: 'استادان',
    permissions: [
      { key: 'teachers.manage', label: 'مدیریت استادان', legacy: ['manage_users'] },
      { key: 'teachers.assignments.manage', label: 'تعیین استاد به مضمون/صنف', legacy: ['manage_schedule'] },
      { key: 'teachers.dashboard.access', label: 'دسترسی استاد به داشبورد', legacy: ['manage_content'] },
      { key: 'teachers.students.add', label: 'افزودن شاگرد توسط استاد', legacy: ['manage_content'] },
      { key: 'teachers.reports.view', label: 'گزارش استاد', legacy: ['view_reports'] },
      { key: 'teachers.attendance.manage', label: 'حاضری استاد', legacy: ['manage_content'] },
      { key: 'teachers.timetable.view', label: 'تقسیم اوقات استاد', legacy: ['view_schedule'] }
    ]
  },
  {
    key: 'timetable',
    label: 'تقسیم اوقات',
    permissions: [
      { key: 'timetable.hub.view', label: 'مرکز تقسیم اوقات', legacy: ['manage_schedule'] },
      { key: 'timetable.view', label: 'مشاهده تقسیم اوقات', legacy: ['view_schedule'] },
      { key: 'timetable.config.manage', label: 'تنظیمات تقسیم اوقات', legacy: ['manage_schedule'] },
      { key: 'timetable.shifts.manage', label: 'مدیریت نوبت‌های تقسیم اوقات', legacy: ['manage_schedule'] },
      { key: 'timetable.teacher_assignments.manage', label: 'تنظیم استادان در تقسیم اوقات', legacy: ['manage_schedule'] },
      { key: 'timetable.teacher_availability.manage', label: 'دسترس‌پذیری استاد', legacy: ['manage_schedule'] },
      { key: 'timetable.generate', label: 'تولید تقسیم اوقات', legacy: ['manage_schedule'] },
      { key: 'timetable.editor.manage', label: 'ویرایش تقسیم اوقات', legacy: ['manage_schedule'] },
      { key: 'timetable.operations.manage', label: 'عملیات روزانه تقسیم اوقات', legacy: ['manage_schedule'] },
      { key: 'timetable.reports.view', label: 'گزارش تقسیم اوقات', legacy: ['manage_schedule'] },
      { key: 'timetable.conflicts.manage', label: 'مدیریت تداخل‌ها', legacy: ['manage_schedule'] },
      { key: 'timetable.history.view', label: 'تاریخچه تغییرات تقسیم اوقات', legacy: ['manage_schedule'] },
      { key: 'timetable.student_view.access', label: 'نمای شاگرد از تقسیم اوقات' },
      { key: 'timetable.teacher_view.access', label: 'نمای استاد از تقسیم اوقات', legacy: ['view_schedule'] }
    ]
  },
  {
    key: 'learning',
    label: 'حاضری، نمرات و کارخانگی',
    permissions: [
      { key: 'attendance.students.manage', label: 'مدیریت حاضری شاگردان', legacy: ['manage_content'] },
      { key: 'attendance.my.view', label: 'مشاهده حاضری خود شاگرد' },
      { key: 'attendance.employees.manage', label: 'مدیریت حاضری کارمندان', legacy: ['manage_content'] },
      { key: 'grades.manage', label: 'مدیریت نمرات', legacy: ['manage_content'] },
      { key: 'grades.my.view', label: 'مشاهده نمرات خود شاگرد' },
      { key: 'grades.detail.view', label: 'جزئیات نمرات', legacy: ['manage_content'] },
      { key: 'homework.manage', label: 'مدیریت کارخانگی', legacy: ['manage_content'] },
      { key: 'homework.my.view', label: 'مشاهده کارخانگی خود شاگرد' },
      { key: 'quiz.take', label: 'کوییز / آزمون' },
      { key: 'quiz.manage', label: 'ساخت کوییز', legacy: ['manage_content'] }
    ]
  },
  {
    key: 'finance',
    label: 'مالی',
    permissions: [
      { key: 'finance.center.manage', label: 'مرکز مالی', legacy: ['manage_finance'] },
      { key: 'finance.government.view', label: 'داشبورد مالی دولت', legacy: ['manage_finance'] },
      { key: 'finance.memberships.manage', label: 'عضویت‌های مالی', legacy: ['manage_finance'] },
      { key: 'finance.student_profile.view', label: 'پروفایل مالی شاگرد', legacy: ['manage_finance'] },
      { key: 'finance.bills.manage', label: 'بل‌ها / صورتحساب‌ها', legacy: ['manage_finance'] },
      { key: 'finance.payments.manage', label: 'پرداخت‌ها', legacy: ['manage_finance'] },
      { key: 'finance.receipts.approve', label: 'تایید رسیدهای مالی', legacy: ['manage_finance'] },
      { key: 'finance.receipts.reject', label: 'رد رسیدهای مالی', legacy: ['manage_finance'] },
      { key: 'finance.receipts.follow_up', label: 'پیگیری رسیدهای مالی', legacy: ['manage_finance'] },
      { key: 'finance.discounts.manage', label: 'تخفیف‌ها', legacy: ['manage_finance'] },
      { key: 'finance.exemptions.manage', label: 'معافیت‌ها', legacy: ['manage_finance'] },
      { key: 'finance.reliefs.manage', label: 'کمک/Relief مالی', legacy: ['manage_finance'] },
      { key: 'finance.transport.manage', label: 'فیس ترانسپورت', legacy: ['manage_finance'] },
      { key: 'finance.reports.view', label: 'گزارش‌های مالی', legacy: ['manage_finance', 'view_reports'] },
      { key: 'finance.month_close.manage', label: 'بستن ماه مالی', legacy: ['manage_finance'] },
      { key: 'finance.documents.manage', label: 'سند/آرشیف مالی', legacy: ['manage_finance'] },
      { key: 'finance.lifecycle_effects.manage', label: 'اثر مالی تغییرات آموزشی', legacy: ['manage_finance'] },
      { key: 'finance.my.view', label: 'پرداخت شاگرد / مالی خود شاگرد' },
      { key: 'finance.receipt.submit', label: 'ثبت رسید توسط کاربر' }
    ]
  },
  {
    key: 'content',
    label: 'محتوا و سایت',
    permissions: [
      { key: 'content.news.manage', label: 'مدیریت اخبار', legacy: ['manage_content'] },
      { key: 'content.news.archive', label: 'آرشیف اخبار', legacy: ['manage_content'] },
      { key: 'content.news.categories', label: 'دسته‌بندی اخبار', legacy: ['manage_content'] },
      { key: 'content.gallery.manage', label: 'مدیریت گالری', legacy: ['manage_content'] },
      { key: 'content.pages.manage', label: 'مدیریت صفحات عمومی', legacy: ['manage_content'] },
      { key: 'content.contacts.manage', label: 'تماس‌ها و درخواست دمو', legacy: ['manage_platform_requests'] },
      { key: 'content.faq.manage', label: 'سوالات متداول', legacy: ['manage_content'] },
      { key: 'content.terms.manage', label: 'قوانین و شرایط', legacy: ['manage_content'] }
    ]
  },
  {
    key: 'reports',
    label: 'گزارش‌ها و نظارت',
    permissions: [
      { key: 'reports.builder.view', label: 'گزارش‌ساز عمومی', legacy: ['view_reports'] },
      { key: 'reports.students.view', label: 'گزارش شاگرد', legacy: ['view_reports'] },
      { key: 'reports.teachers.view', label: 'گزارش استاد', legacy: ['view_reports'] },
      { key: 'reports.government_finance.view', label: 'گزارش مالی دولت', legacy: ['manage_finance', 'view_reports'] },
      { key: 'reports.schools.view', label: 'گزارش مالکیت/مکتب‌ها', legacy: ['view_reports'] },
      { key: 'reports.logs.view', label: 'لاگ‌های سیستم', legacy: ['view_reports'] },
      { key: 'reports.alerts.view', label: 'هشدارها و SLA', legacy: ['view_reports'] },
      { key: 'reports.admin_search.use', label: 'جستجوی مدیریتی', legacy: ['view_reports'] }
    ]
  },
  {
    key: 'schools',
    label: 'مکتب‌ها و سیستم افغانستان',
    permissions: [
      { key: 'schools.dashboard.view', label: 'داشبورد مکاتب افغانستان', legacy: ['view_reports'] },
      { key: 'schools.map.view', label: 'نقشه مکاتب', legacy: ['view_reports'] },
      { key: 'schools.manage', label: 'مدیریت مکاتب', legacy: ['manage_users'] },
      { key: 'schools.reports.view', label: 'گزارش مکاتب', legacy: ['view_reports'] },
      { key: 'schools.create', label: 'ایجاد مکتب', legacy: ['manage_users'] },
      { key: 'schools.edit', label: 'ویرایش مکتب', legacy: ['manage_users'] },
      { key: 'schools.documents.manage', label: 'اسناد مکتب', legacy: ['manage_users'] },
      { key: 'schools.province_stats.view', label: 'آمار ولایات', legacy: ['view_reports'] }
    ]
  },
  {
    key: 'settings',
    label: 'تنظیمات سیستم',
    permissions: [
      { key: 'settings.general.manage', label: 'تنظیمات عمومی سایت', legacy: ['manage_content'] },
      { key: 'settings.login.manage', label: 'تنظیمات ورود', legacy: ['manage_users'] },
      { key: 'settings.student_ids.manage', label: 'تنظیم شماره اساس و ریجیستر نمبر', legacy: ['manage_content'] },
      { key: 'settings.brand.manage', label: 'تنظیم برند/لوگو/اطلاعات تماس', legacy: ['manage_content'] },
      { key: 'settings.academic.manage', label: 'تنظیمات سال/ترم/نوبت', legacy: ['manage_content', 'manage_schedule'] },
      { key: 'settings.security.manage', label: 'تنظیمات امنیتی و دسترسی', legacy: ['manage_users'] },
      { key: 'access_school_manager', label: 'دسترسی پست مدیر مکتب' },
      { key: 'access_head_teacher', label: 'دسترسی پست سر معلم مکتب' }
    ]
  }
];

export const PERMISSION_OPTIONS = PERMISSION_GROUPS.flatMap((group) => (
  group.permissions.map((permission) => ({ ...permission, groupKey: group.key, groupLabel: group.label }))
));

export const LEGACY_PERMISSION_MAP = PERMISSION_OPTIONS.reduce((acc, permission) => {
  (permission.legacy || []).forEach((legacyKey) => {
    if (!acc[legacyKey]) acc[legacyKey] = [];
    acc[legacyKey].push(permission.key);
  });
  return acc;
}, {});

export const expandLegacyPermissions = (permissions = []) => {
  const next = new Set();
  (Array.isArray(permissions) ? permissions : []).forEach((permission) => {
    const key = String(permission || '').trim();
    if (!key) return;
    next.add(key);
    (LEGACY_PERMISSION_MAP[key] || []).forEach((mapped) => next.add(mapped));
  });
  return Array.from(next);
};
