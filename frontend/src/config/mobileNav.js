// چیدمانِ ناوبریِ مبایل — یک جا برای هر چیزی که نوارِ پایین و کشوی «همه» لازم دارند.
//
// چرا این فایل جدا است: کارت‌های پنلِ مدیر (`modernManagementSections` در
// AdminPanel.jsx) به شمارنده‌ها و وضعیتِ همان کامپوننت وصل‌اند و از بیرون قابلِ
// خواندن نیستند. نوارِ پایینِ مبایل هم نباید ۴۰ ابزار را نشان بدهد — پنج خانه
// بیشتر جا نمی‌شود. پس این فایل یک انتخابِ عمدی است، نه نسخهٔ دومِ آن فهرست:
// مقصدهایی که روی گوشی واقعاً به کار می‌آیند، با همان کلیدهای دسترسی و همان
// نام‌های گروه که پنل استفاده می‌کند. فهرستِ کاملِ ابزارها همان پنل است و از
// انتهای کشو یک لینک به آن می‌رود.

export const MOBILE_BREAKPOINT = 900;

// همان عنوان‌های گروه که AdminPanel.jsx دارد — اگر آن‌جا عوض شد، این‌جا هم.
export const GROUP_SCHOOL = 'مکتب، کاربران و تنظیمات';
export const GROUP_STUDENTS = 'ثبت‌نام و شاگردان';
export const GROUP_EDUCATION = 'آموزش و برنامه';
export const GROUP_FINANCE = 'مالی';
export const GROUP_REPORTS = 'گزارش‌ها و لاگ‌ها';
export const GROUP_COMMS = 'ارتباطات';

// کلیدِ خانهٔ «همه» — نوارِ پایین روی این کلید کشو را باز می‌کند، نه مسیر.
export const DRAWER_TAB_KEY = '__drawer__';

const DRAWER_TAB = { key: DRAWER_TAB_KEY, label: 'همه', icon: 'fa-bars' };

// هر خانه: `to` مسیر، `permission` کلید (یا کلیدها) — بدونِ دسترسی، خانه حذف
// می‌شود و خانهٔ بعدی جایش را می‌گیرد. «همه» همیشه آخرین خانه است.
const TABS_BY_ROLE = {
  admin: [
    { key: 'home', label: 'خانه', icon: 'fa-house', to: '/dashboard' },
    { key: 'students', label: 'شاگردان', icon: 'fa-user-graduate', to: '/student-management', permission: ['students.manage', 'users.manage'] },
    { key: 'finance', label: 'مالی', icon: 'fa-money-bill-wave', to: '/admin-finance', permission: 'manage_finance' },
    { key: 'attendance', label: 'حاضری', icon: 'fa-clipboard-check', to: '/attendance-manager', permission: ['attendance.manage', 'manage_content'] },
    DRAWER_TAB
  ],
  instructor: [
    { key: 'home', label: 'خانه', icon: 'fa-house', to: '/dashboard' },
    { key: 'attendance', label: 'حاضری', icon: 'fa-clipboard-check', to: '/attendance-manager' },
    { key: 'grades', label: 'نمرات', icon: 'fa-pen-to-square', to: '/grade-manager' },
    { key: 'timetable', label: 'اوقات', icon: 'fa-calendar-days', to: '/timetable/my-teacher-view' },
    DRAWER_TAB
  ],
  student: [
    { key: 'home', label: 'خانه', icon: 'fa-house', to: '/dashboard' },
    { key: 'grades', label: 'نمرات', icon: 'fa-award', to: '/my-grades' },
    { key: 'attendance', label: 'حاضری', icon: 'fa-clipboard-check', to: '/my-attendance' },
    { key: 'timetable', label: 'اوقات', icon: 'fa-calendar-days', to: '/timetable/student-view' },
    DRAWER_TAB
  ],
  // داشبورد والد یک صفحهٔ واحد با بخش‌های لنگردار است، نه چند مسیر. این خانه‌ها
  // به همان لنگرهایی می‌روند که خودِ صفحه در «دسترسی سریع» معرفی می‌کند
  // (`#attendance`، `#finance`، `#receipts`)؛ عنوان‌ها هم از همان‌جا آمده تا
  // اسم تب و اسم بخش یکی باشد. والد مسیر جداگانه‌ای برای نمرات ندارد —
  // «حاضری و پیشرفت» خودش حضور و نمره و درس امروز را دارد.
  parent: [
    { key: 'home', label: 'خانه', icon: 'fa-house', to: '/parent-dashboard' },
    { key: 'attendance', label: 'حاضری', icon: 'fa-clipboard-check', to: '/parent-dashboard#attendance' },
    { key: 'finance', label: 'فیس', icon: 'fa-money-bill-wave', to: '/parent-dashboard#finance' },
    { key: 'receipts', label: 'رسیدها', icon: 'fa-file-invoice', to: '/parent-dashboard#receipts' },
    DRAWER_TAB
  ]
};

// محتوای کشو برای هر نقش. برای مدیر همان شش گروهِ پنل، ولی فقط مقصدهایی که روی
// گوشی قابلِ استفاده‌اند. برای بقیهٔ نقش‌ها یک فهرستِ کوتاهِ خودشان.
const DRAWER_BY_ROLE = {
  admin: [
    {
      title: GROUP_SCHOOL,
      items: [
        { label: 'کاربران و سطوح دسترسی', to: '/admin-users', permission: 'manage_users' },
        { label: 'فهرست کارکنان مکتب', to: '/school-staff', permission: ['users.manage', 'manage_finance'] },
        { label: 'کارت‌های هویت', to: '/id-cards', permission: ['manage_users', 'manage_content'] },
        { label: 'تنظیمات سیستم و سایت', to: '/admin-settings', permission: 'manage_content' }
      ]
    },
    {
      title: GROUP_STUDENTS,
      items: [
        { label: 'مدیریت شاگردان', to: '/student-management', permission: ['students.manage', 'users.manage'] },
        { label: 'ثبت شاگرد جدید', to: '/student-registration', permission: ['manage_enrollments', 'manage_users'] },
        { label: 'درخواست‌های ثبت‌نام', to: '/admin-enrollments', permission: 'manage_enrollments' },
        { label: 'پرونده‌های سوانح', to: '/afghan-sawaneh', permission: 'sawaneh.card.view' },
        { label: 'مرکز ارتقای صنف', to: '/admin-promotions', permission: 'education.promotions.manage' }
      ]
    },
    {
      title: GROUP_EDUCATION,
      items: [
        { label: 'مدیریت آموزش و صنوف', to: '/admin-education', permission: 'manage_content' },
        { label: 'ثبت و بررسی حاضری', to: '/attendance-manager', permission: ['attendance.manage', 'manage_content'] },
        { label: 'مدیریت نمرات', to: '/grade-manager', permission: ['grades.manage', 'manage_content'] },
        { label: 'مدیریت کارخانگی', to: '/homework-manager', permission: ['homework.manage', 'manage_content'] },
        { label: 'مرکز تقسیم اوقات', to: '/timetable', permission: ['manage_schedule', 'view_schedule'] }
      ]
    },
    {
      title: GROUP_FINANCE,
      items: [
        { label: 'مالی شاگردان', to: '/admin-finance', permission: 'manage_finance' },
        { label: 'مالی دولتی و مصارف', to: '/admin-government-finance', permission: 'manage_finance' },
        { label: 'عضویت‌های مالی', to: '/admin-financial-memberships', permission: 'manage_finance' }
      ]
    },
    {
      title: GROUP_REPORTS,
      items: [
        { label: 'گزارش‌ها', to: '/admin-reports', permission: 'view_reports' },
        { label: 'آمار و ارقام', to: '/admin-stats', permission: ['view_reports', 'manage_finance'] },
        { label: 'لاگ فعالیت‌ها', to: '/admin-logs', permission: 'view_reports' }
      ]
    },
    {
      title: GROUP_COMMS,
      items: [
        { label: 'مرکز ارتباطات', to: '/admin-communications', permission: ['manage_platform_requests', 'manage_content'] },
        { label: 'پیام‌ها', to: '/chat' },
        { label: 'اعلان‌ها', to: '/admin-notifications' }
      ]
    }
  ],
  instructor: [
    {
      title: 'کارِ صنف',
      items: [
        { label: 'ثبت حاضری', to: '/attendance-manager' },
        { label: 'ثبت نمرات', to: '/grade-manager' },
        { label: 'کارخانگی', to: '/homework-manager' },
        { label: 'تقسیم اوقات من', to: '/timetable/my-teacher-view' }
      ]
    },
    {
      title: 'گزارش و ارتباط',
      items: [
        { label: 'گزارش کاری من', to: '/instructor-report' },
        { label: 'پیام‌ها', to: '/chat' },
        { label: 'تقویم', to: '/schedule' }
      ]
    }
  ],
  student: [
    {
      title: 'درس و نتیجه',
      items: [
        { label: 'نمرات من', to: '/my-grades' },
        { label: 'حاضری من', to: '/my-attendance' },
        { label: 'کارخانگی من', to: '/my-homework' },
        { label: 'تقسیم اوقات', to: '/timetable/student-view' }
      ]
    },
    {
      title: 'مالی و ارتباط',
      items: [
        { label: 'فیس من', to: '/my-finance' },
        { label: 'پیام‌ها', to: '/chat' },
        { label: 'تقویم', to: '/schedule' }
      ]
    }
  ],
  parent: [
    {
      title: 'وضعیت فرزند',
      items: [
        { label: 'داشبورد والد', to: '/parent-dashboard' },
        { label: 'گزارش شاگرد', to: '/student-report' }
      ]
    },
    {
      title: 'ارتباط',
      items: [
        { label: 'پیام‌ها', to: '/chat' },
        { label: 'تقویم', to: '/schedule' }
      ]
    }
  ]
};

// عنوانِ نوارِ بالا. از نگاشتِ مسیر خوانده می‌شود نه از `document.title`، چون
// usePageMeta فقط تایتلِ مرورگر را می‌نویسد و به React برنمی‌گرداند. ترتیب مهم
// است: دقیق‌ترین مسیر اول.
const ROUTE_TITLES = [
  ['/admin-finance/profile', 'پروندهٔ مالی شاگرد'],
  ['/admin-finance', 'مالی شاگردان'],
  ['/admin-government-finance', 'مالی دولتی و مصارف'],
  ['/admin-financial-memberships', 'عضویت‌های مالی'],
  ['/admin-communications', 'مرکز ارتباطات'],
  ['/admin-notifications', 'اعلان‌ها'],
  ['/admin-education', 'آموزش و صنوف'],
  ['/admin-enrollments', 'درخواست‌های ثبت‌نام'],
  ['/admin-promotions', 'مرکز ارتقای صنف'],
  ['/admin-result-tables', 'جدول‌های نتایج'],
  ['/admin-sheet-templates', 'قالب‌های شیت'],
  ['/admin-settings', 'تنظیمات سیستم'],
  ['/admin-reports', 'گزارش‌ها'],
  ['/admin-stats', 'آمار و ارقام'],
  ['/admin-logs', 'لاگ فعالیت‌ها'],
  ['/admin-users', 'کاربران و دسترسی‌ها'],
  ['/admin-exams', 'امتحانات'],
  ['/admin-instructor-report', 'گزارش استادان'],
  ['/admin', 'پنل مدیریت'],
  ['/afghan-sawaneh/reports', 'گزارش‌های سوانح'],
  ['/afghan-sawaneh', 'پرونده‌های سوانح'],
  ['/afghan-school', 'مدیریت مکتب'],
  ['/academy', 'مدیریت آکادمی'],
  ['/short-term-center', 'مرکز کورس‌های کوتاه‌مدت'],
  ['/timetable/my-teacher-view', 'تقسیم اوقات من'],
  ['/timetable/student-view', 'تقسیم اوقات صنف'],
  ['/timetable', 'مرکز تقسیم اوقات'],
  ['/student-management', 'مدیریت شاگردان'],
  ['/student-registration', 'ثبت شاگرد جدید'],
  ['/teacher-registration', 'پروندهٔ کارمند'],
  ['/school-staff', 'کارکنان مکتب'],
  ['/online-registrations', 'ثبت‌نام‌های آنلاین'],
  ['/id-cards', 'کارت‌های هویت'],
  ['/student-report', 'گزارش شاگرد'],
  ['/instructor-report', 'گزارش کاری من'],
  ['/grade-manager', 'مدیریت نمرات'],
  ['/attendance-manager', 'ثبت حاضری'],
  ['/homework-manager', 'مدیریت کارخانگی'],
  ['/my-grades', 'نمرات من'],
  ['/my-attendance', 'حاضری من'],
  ['/my-homework', 'کارخانگی من'],
  ['/my-finance', 'فیس من'],
  ['/parent-dashboard', 'داشبورد والد'],
  ['/dashboard', 'داشبورد'],
  ['/profile', 'پروفایل'],
  ['/chat', 'پیام‌ها'],
  ['/schedule', 'تقویم'],
  ['/recordings', 'آرشیف جلسات'],
  ['/payment', 'پرداخت'],
  ['/submit-receipt', 'ثبت رسید'],
  ['/add-course', 'افزودن کورس'],
  ['/quiz', 'آزمون']
];

const ROLE_FALLBACK = 'admin';

const resolveRoleKey = (role) => (
  Object.prototype.hasOwnProperty.call(TABS_BY_ROLE, role) ? role : ROLE_FALLBACK
);

// `can` همان hasEffectivePermission در App.jsx است و به‌صورتِ prop می‌آید تا
// این فایل به App.jsx وابسته نشود (App.jsx خودش MobileShell را import می‌کند).
const allowed = (entry, can) => {
  if (!entry?.permission) return true;
  if (typeof can !== 'function') return true;
  return can(entry.permission);
};

export const getMobileTabs = (role, can) => {
  const tabs = TABS_BY_ROLE[resolveRoleKey(role)] || [];
  return tabs.filter((tab) => tab.key === DRAWER_TAB_KEY || allowed(tab, can));
};

export const getMobileDrawerGroups = (role, can) => {
  const groups = DRAWER_BY_ROLE[resolveRoleKey(role)] || [];
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => allowed(item, can)) }))
    .filter((group) => group.items.length > 0);
};

// مسیرِ خالصِ یک خانه، بدون query و بدون لنگر — برای مقایسه با آدرس فعلی.
export const tabPathOf = (tab) => String(tab?.to || '').split('#')[0].split('?')[0];

// لنگرِ یک خانه، اگر داشته باشد.
export const tabHashOf = (tab) => {
  const index = String(tab?.to || '').indexOf('#');
  return index === -1 ? '' : String(tab.to).slice(index);
};

export const getMobilePageTitle = (pathname = '') => {
  const path = String(pathname || '');
  const match = ROUTE_TITLES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return match ? match[1] : 'سامانهٔ مکتب';
};

// روی خانهٔ یک تب دکمهٔ بازگشت لازم نیست — کاربر همان‌جاست که نوار نشان می‌دهد.
export const isMobileTabRoot = (pathname, role, can) => {
  const path = String(pathname || '');
  return getMobileTabs(role, can).some((tab) => tab.to && tabPathOf(tab) === path);
};
