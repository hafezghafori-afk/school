// Human-readable Persian labels and severity buckets for ActivityLog `action` values.
// The backend logs ~200 distinct action strings across the whole app (see backend/utils/activity.js
// callers). This file only curates the ones an admin is most likely to search/scan for; anything
// missing falls back to a readable humanized version of the raw key instead of a translation.

const ACTION_LABELS = {
  // نمرات و امتحانات
  grade_upsert: 'ثبت/ویرایش نمره',
  create_exam_type: 'ایجاد نوع امتحان',
  create_exam_session: 'ایجاد شقهٔ امتحان',
  bootstrap_exam_session: 'راه‌اندازی شقهٔ امتحان',
  update_exam_session: 'ویرایش شقهٔ امتحان',
  delete_exam_session_draft: 'حذف پیش‌نویس شقهٔ امتحان',
  initialize_exam_session_roster: 'مقداردهی فهرست شاگردان امتحان',
  sync_exam_session_roster: 'همگام‌سازی فهرست شاگردان امتحان',
  save_exam_sheet_marks: 'ثبت نمرات شقه',
  upsert_exam_mark: 'ثبت/ویرایش نمرهٔ امتحان',
  recompute_exam_results: 'محاسبهٔ دوبارهٔ نتایج امتحان',
  create_exam_session_revision: 'ایجاد نسخهٔ اصلاحی شقه',
  update_exam_session_status: 'تغییر وضعیت شقهٔ امتحان',
  result_table_config_create: 'ایجاد تنظیم جدول نتایج',
  result_table_generate: 'تولید جدول نتایج',
  result_table_publish: 'نشر جدول نتایج',
  result_table_export_pdf: 'خروجی PDF جدول نتایج',
  result_table_export_xlsx: 'خروجی Excel جدول نتایج',
  result_table_export_csv: 'خروجی CSV جدول نتایج',
  result_table_export_print: 'خروجی چاپی جدول نتایج',

  // حاضری
  attendance_upsert: 'ثبت/ویرایش حاضری شاگرد',
  employee_attendance_upsert: 'ثبت/ویرایش حاضری کارمند',

  // کارهای خانگی و کویز
  create_homework: 'ایجاد کار خانگی',
  update_homework: 'ویرایش کار خانگی',
  delete_homework: 'حذف کار خانگی',
  submit_homework: 'ارسال کار خانگی توسط شاگرد',
  grade_homework_submission: 'نمره‌دهی کار خانگی',
  create_quiz: 'ایجاد کویز',

  // صنف‌ها و مضامین
  create_course: 'ایجاد صنف/کورس',
  update_course: 'ویرایش صنف/کورس',
  delete_course: 'حذف صنف/کورس',
  create_school_class: 'ایجاد صنف مکتب',
  update_school_class: 'ویرایش صنف مکتب',
  delete_school_class: 'حذف صنف مکتب',
  create_subject: 'ایجاد مضمون',
  update_subject: 'ویرایش مضمون',
  delete_subject: 'حذف مضمون',
  create_academic_year: 'ایجاد سال تعلیمی',
  update_academic_year: 'ویرایش سال تعلیمی',
  delete_academic_year: 'حذف سال تعلیمی',
  create_instructor_subject: 'تخصیص مضمون به استاد',
  update_instructor_subject: 'ویرایش تخصیص مضمون استاد',
  delete_instructor_subject: 'حذف تخصیص مضمون استاد',
  student_join_request: 'درخواست پیوستن شاگرد',
  instructor_approve_join_request: 'تأیید درخواست پیوستن توسط استاد',
  instructor_reject_join_request: 'رد درخواست پیوستن توسط استاد',
  instructor_add_student_to_course: 'افزودن شاگرد به صنف توسط استاد',
  update_student_enrollment: 'ویرایش ثبت‌نام شاگرد',

  // مدیریت کاربران / دسترسی
  admin_create_user: 'ایجاد کاربر',
  admin_update_user_role: 'تغییر نقش کاربر',
  admin_update_user_permissions: 'تغییر صلاحیت‌های کاربر',
  admin_update_user_status: 'تغییر وضعیت حساب کاربر',
  admin_update_user_profile: 'ویرایش پروفایل کاربر',
  admin_deactivate_user: 'غیرفعال‌سازی کاربر',
  approve_profile_update_request: 'تأیید درخواست ویرایش پروفایل',
  reject_profile_update_request: 'رد درخواست ویرایش پروفایل',
  profile_request_follow_up_update: 'پیگیری درخواست ویرایش پروفایل',
  approve_access_request: 'تأیید درخواست دسترسی',
  reject_access_request: 'رد درخواست دسترسی',
  request_permission_access: 'درخواست دسترسی/صلاحیت',
  change_email: 'تغییر ایمیل',
  change_password: 'تغییر رمز عبور',
  update_avatar: 'تغییر عکس پروفایل',
  remove_avatar: 'حذف عکس پروفایل',
  instructor_create_student: 'ایجاد شاگرد توسط استاد',

  // پروندهٔ شاگرد
  update_student_profile: 'ویرایش پروندهٔ شاگرد',
  add_student_remark: 'ثبت یادداشت برای شاگرد',
  add_student_transfer: 'ثبت انتقال شاگرد',
  add_student_document: 'افزودن سند شاگرد',
  link_student_guardian: 'اتصال سرپرست به شاگرد',
  unlink_student_guardian: 'قطع اتصال سرپرست از شاگرد',

  // مالی — عمومی
  finance_create_treasury_account: 'ایجاد حساب خزانه‌داری',
  finance_update_treasury_account: 'ویرایش حساب خزانه‌داری',
  finance_create_treasury_transaction: 'ثبت تراکنش خزانه‌داری',
  finance_create_treasury_transfer: 'ثبت انتقال بین حساب‌های خزانه',
  finance_reconcile_treasury_account: 'تطبیق حساب خزانه‌داری',
  finance_create_expense_category: 'ایجاد کتگوری مصارف',
  finance_update_expense_category: 'ویرایش کتگوری مصارف',
  finance_create_financial_year: 'ایجاد سال مالی',
  finance_update_financial_year: 'ویرایش سال مالی',
  finance_activate_financial_year: 'فعال‌سازی سال مالی',
  finance_close_financial_year: 'بستن سال مالی',
  finance_budget_request_review: 'بررسی درخواست بودجه',
  finance_budget_start_revision: 'شروع اصلاح بودجه',
  finance_create_procurement_commitment: 'ثبت تعهد تدارکاتی',
  finance_submit_procurement_commitment: 'ارسال تعهد تدارکاتی',
  finance_settle_procurement_commitment: 'تصفیهٔ تعهد تدارکاتی',
  finance_create_expense_entry: 'ثبت سند مصرف',
  finance_update_expense_entry: 'ویرایش سند مصرف',
  finance_submit_expense_entry: 'ارسال سند مصرف',
  finance_approve_expense_entry: 'تأیید سند مصرف',
  finance_void_expense_entry: 'باطل‌کردن سند مصرف',
  finance_delete_expense_entry: 'حذف سند مصرف',
  finance_generate_government_snapshot: 'تولید گزارش دولتی مالی',
  finance_export_government_snapshot_pdf: 'خروجی PDF گزارش دولتی مالی',
  finance_upsert_fee_plan: 'ثبت/ویرایش پلان فیس',
  finance_update_fee_plan_status: 'تغییر وضعیت پلان فیس',
  finance_delete_fee_plan: 'حذف پلان فیس',
  finance_create_bill: 'ایجاد بل',
  finance_generate_bills: 'تولید بل‌ها',
  finance_edit_bill: 'ویرایش بل',
  finance_anomaly_admission_settle_batch: 'تصفیهٔ دسته‌ای موارد غیرعادی پذیرش',
  finance_sync_payments_to_treasury: 'همگام‌سازی پرداخت‌ها با خزانه',
  finance_admission_receipt_correction_batch: 'اصلاح دسته‌ای رسیدهای پذیرش',
  finance_payment_scope_repair_batch: 'ترمیم دسته‌ای دامنهٔ پرداخت‌ها',
  finance_payment_approval_batch: 'تأیید دسته‌ای پرداخت‌ها',
  finance_submit_month_close: 'ارسال بستن ماه مالی',
  finance_reject_month_close: 'رد بستن ماه مالی',
  finance_reopen_month: 'بازگشایی ماه مالی بسته‌شده',
  export_finance_month_close_pdf: 'خروجی PDF بستن ماه مالی',
  save_finance_delivery_provider_config: 'ذخیرهٔ تنظیم ارائه‌دهندهٔ ارسال',
  rotate_finance_delivery_provider_credentials: 'چرخش اعتبارنامهٔ ارائه‌دهندهٔ ارسال',
  sync_finance_delivery_provider_status: 'همگام‌سازی وضعیت ارائه‌دهندهٔ ارسال',
  save_finance_delivery_template_draft: 'ذخیرهٔ پیش‌نویس شقهٔ ارسال',
  request_finance_delivery_template_review: 'درخواست بازبینی شقهٔ ارسال',
  approve_finance_delivery_template_version: 'تأیید نسخهٔ شقهٔ ارسال',
  reject_finance_delivery_template_version: 'رد نسخهٔ شقهٔ ارسال',
  publish_finance_delivery_template_version: 'نشر نسخهٔ شقهٔ ارسال',
  archive_finance_delivery_template_version: 'آرشیف نسخهٔ شقهٔ ارسال',
  rollback_finance_delivery_template_version: 'بازگردانی نسخهٔ شقهٔ ارسال',
  create_finance_delivery_campaign: 'ایجاد کمپاین ارسال مالی',
  update_finance_delivery_campaign_status: 'تغییر وضعیت کمپاین ارسال مالی',
  deliver_finance_document_archive: 'ارسال آرشیف اسناد مالی',
  export_finance_batch_statement_pack: 'خروجی دسته‌ای صورت‌حساب‌ها',
  create_fee_payment: 'ثبت پرداخت فیس',
  create_discount_registry: 'ثبت تخفیف',
  deduplicate_discount_registry: 'حذف تکرار تخفیف‌ها',
  update_discount_registry: 'ویرایش تخفیف',
  cancel_discount_registry: 'لغو تخفیف',
  create_fee_exemption: 'ثبت معافیت فیس',
  update_fee_exemption: 'ویرایش معافیت فیس',
  cancel_fee_exemption: 'لغو معافیت فیس',
  create_transport_fee: 'ثبت کرایهٔ ترانسپورت',
  export_student_finance_statement_pack: 'خروجی صورت‌حساب مالی شاگرد',
  export_student_finance_statement_pdf: 'خروجی PDF صورت‌حساب مالی شاگرد',
  export_parent_finance_statement_pack: 'خروجی صورت‌حساب مالی برای والدین',
  export_parent_finance_statement_pdf: 'خروجی PDF صورت‌حساب مالی برای والدین',

  // ارتقا
  promotion_rule_create: 'ایجاد قاعدهٔ ارتقا',
  promotion_apply: 'اجرای ارتقا',
  promotion_rollback: 'بازگردانی ارتقا',

  // صنف مجازی و ضبط
  virtual_class_create: 'ایجاد صنف مجازی',
  virtual_class_update: 'ویرایش صنف مجازی',
  virtual_class_start: 'شروع صنف مجازی',
  virtual_class_end: 'پایان صنف مجازی',
  virtual_class_delete: 'حذف صنف مجازی',
  create_recording: 'ایجاد ضبط جلسه',
  delete_recording: 'حذف ضبط جلسه',

  // تقسیم اوقات
  save_daily_timetable_draft: 'ذخیرهٔ پیش‌نویس تقسیم اوقات روزانه',
  publish_daily_timetable_draft: 'نشر تقسیم اوقات روزانه',
  delete_daily_timetable_draft: 'حذف پیش‌نویس تقسیم اوقات روزانه',
  clear_daily_timetable_draft: 'پاک‌کردن پیش‌نویس تقسیم اوقات روزانه',
  create_timetable_config: 'ایجاد تنظیم تقسیم اوقات',
  create_timetable_entry: 'ایجاد خانهٔ تقسیم اوقات',
  update_timetable_entry: 'ویرایش خانهٔ تقسیم اوقات',
  timetable_publish: 'نشر تقسیم اوقات',
  timetable_access_forbidden: 'تلاش دسترسی غیرمجاز به تقسیم اوقات',

  // پیام و تماس
  chat_message_send: 'ارسال پیام چت',
  contact_follow_up_update: 'پیگیری پیام تماس',

  // ماژول/درس
  create_module: 'ایجاد ماژول',
  create_lesson: 'ایجاد درس',
  update_module: 'ویرایش ماژول',
  delete_module: 'حذف ماژول',
  update_lesson: 'ویرایش درس',
  delete_lesson: 'حذف درس',

  // گزارش‌ها
  report_run: 'اجرای گزارش',
  report_export_csv: 'خروجی CSV گزارش',
  report_export_xlsx: 'خروجی Excel گزارش',
  report_export_pdf: 'خروجی PDF گزارش',
  report_export_print: 'خروجی چاپی گزارش',

  // عمومی/عمل‌های کوتاه که در بخش‌های مختلف (مالی و غیره) تکرار می‌شوند
  submit: 'ارسال',
  approve: 'تأیید',
  approved: 'تأیید شد',
  reject: 'رد',
  rejected: 'رد شد',
  edit: 'ویرایش',
  void: 'باطل‌کردن',
  resolved: 'حل شد',
  assigned: 'واگذار شد',
  snoozed: 'به تعویق افتاد',
  reopened: 'بازگشایی شد',
  noted: 'یادداشت ثبت شد',
  saved: 'ذخیره شد',
  closed: 'بسته شد',
  requested: 'درخواست شد',
  revision_started: 'اصلاحیه آغاز شد',
  review_requested: 'درخواست بازبینی شد'
};

// Keyword → severity, checked in order against the raw action string (case-insensitive).
// 'danger' = destructive/irreversible, 'warn' = access/approval-sensitive, 'good' = positive resolution.
const SEVERITY_RULES = [
  [/delete|remove|void|reject|deactivate|cancel|reopen|blocked|forbidden/i, 'danger'],
  [/rollback|change_role|permission|access|admin_level|correction|repair/i, 'warn'],
  [/approve|publish|activate|resolve|settle|reconcile/i, 'good']
];

export function getActionSeverity(action = '') {
  const value = String(action || '');
  for (const [pattern, severity] of SEVERITY_RULES) {
    if (pattern.test(value)) return severity;
  }
  return 'info';
}

export function getActionLabel(action = '') {
  const key = String(action || '').trim();
  if (!key) return '---';
  if (ACTION_LABELS[key]) return ACTION_LABELS[key];
  // Fallback: humanize unknown snake_case keys instead of leaving raw English visible.
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getTargetTypeLabel(targetType = '') {
  const labels = {
    SchoolClass: 'صنف',
    Subject: 'مضمون',
    AcademicYear: 'سال تعلیمی',
    Grade: 'نمره',
    Homework: 'کار خانگی',
    HomeworkSubmission: 'ارسالی کار خانگی',
    ExamSession: 'شقهٔ امتحان',
    ExamMark: 'نمرهٔ امتحان',
    ExamType: 'نوع امتحان',
    StudentCore: 'پروندهٔ شاگرد',
    StudentMembership: 'عضویت شاگرد',
    User: 'کاربر',
    FeePayment: 'پرداخت فیس',
    FeeOrder: 'بل فیس',
    FeeExemption: 'معافیت فیس',
    FinanceRelief: 'تخفیف مالی',
    FinanceBill: 'بل مالی',
    FinanceReceipt: 'رسید مالی',
    Discount: 'تخفیف',
    TransportFee: 'کرایهٔ ترانسپورت',
    VirtualClassSession: 'صنف مجازی',
    VirtualRecording: 'ضبط جلسه',
    Quiz: 'کویز',
    Module: 'ماژول',
    Lesson: 'درس'
  };
  const key = String(targetType || '').trim();
  if (!key) return '';
  return labels[key] || key;
}

// Best-effort deep links for target types with a stable, verified admin route.
// Anything not listed here is shown as plain text — a wrong guess would be worse than no link.
const TARGET_LINKS = {
  SchoolClass: (id) => `/courses/${id}`
};

export function getTargetLink(targetType = '', targetId = '') {
  const builder = TARGET_LINKS[String(targetType || '').trim()];
  if (!builder || !targetId) return '';
  return builder(targetId);
}
