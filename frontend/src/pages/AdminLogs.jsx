import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './AdminContent.css';

import { API_BASE } from '../config/api';
import { formatAfghanDateTime } from '../utils/afghanDate';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const ACTION_LABELS = {
  admin_access_matrix_export_csv: 'برآمدگیری CSV جدول دسترسی (مدیریت)',
  admin_access_matrix_print: 'چاپ جدول دسترسی (مدیریت)',
  admin_users_access_matrix_export_csv: 'برآمدگیری CSV جدول دسترسی کاربران (مدیریت کاربران)',
  admin_users_access_matrix_print: 'چاپ جدول دسترسی کاربران (مدیریت کاربران)',
  admin_users_org_role_matrix_export_csv: 'برآمدگیری CSV جدول نقش سازمانی کاربران (مدیریت کاربران)',
  admin_users_org_role_matrix_print: 'چاپ جدول نقش سازمانی کاربران (مدیریت کاربران)',
  admin_create_user: 'ایجاد کاربر جدید',
  admin_change_role: 'تغییر نقش کاربر',
  admin_update_permissions: 'به‌روزرسانی اجازه‌ها',
  create_schedule: 'ایجاد جدول زمانی',
  copy_schedule_week: 'کپی هفته جدول زمانی',
  create_course: 'ایجاد مضمون جدید',
  finance_create_bill: 'ایجاد بل مالی',
  finance_approve_receipt: 'تایید رسید پرداخت',
  finance_add_adjustment: 'افزودن تعدیل مالی',
  finance_run_reminders: 'ارسال یادآوری‌های مالی',
  finance_set_installments: 'تنظیم اقساط',
  finance_upsert_fee_plan: 'به‌روزرسانی پلان فیس',
  approve_profile_update_request: 'تایید درخواست ویرایش پروفایل',
  reject_profile_update_request: 'رد درخواست ویرایش پروفایل',
  timetable_access_forbidden: 'تلاش دسترسی غیرمجاز به تقسیم اوقات'
};

const ORG_ROLE_OPTIONS = [
  { key: 'student', label: 'شاگرد' },
  { key: 'instructor', label: 'استاد' },
  { key: 'finance_manager', label: 'مدیر مالی' },
  { key: 'finance_lead', label: 'آمریت مالی' },
  { key: 'school_manager', label: 'مدیر مکتب' },
  { key: 'academic_manager', label: 'مدیر تدریسی' },
  { key: 'head_teacher', label: 'سر معلم مکتب' },
  { key: 'general_president', label: 'ریاست عمومی' }
];

const ORG_ROLE_LABELS = {
  student: '\u0634\u0627\u06af\u0631\u062f',
  instructor: '\u0627\u0633\u062a\u0627\u062f',
  finance_manager: '\u0645\u062f\u06cc\u0631 \u0645\u0627\u0644\u06cc',
  finance_lead: '\u0622\u0645\u0631\u06cc\u062a \u0645\u0627\u0644\u06cc',
  school_manager: '\u0645\u062f\u06cc\u0631 \u0645\u06a9\u062a\u0628',
  academic_manager: '\u0645\u062f\u06cc\u0631 \u062a\u062f\u0631\u06cc\u0633\u06cc',
  head_teacher: '\u0633\u0631 \u0645\u0639\u0644\u0645 \u0645\u06a9\u062a\u0628',
  general_president: '\u0631\u06cc\u0627\u0633\u062a \u0639\u0645\u0648\u0645\u06cc'
};

const DEVICE_LABELS = {
  desktop: '\u062f\u0633\u06a9\u062a\u0627\u067e',
  mobile: '\u0645\u0648\u0628\u0627\u06cc\u0644',
  tablet: '\u062a\u0628\u0644\u062a',
  bot: '\u0631\u0628\u0627\u062a',
  unknown: '\u0646\u0627\u0645\u0634\u062e\u0635'
};

const CONTEXT_LABELS = {
  backend: 'بک‌اند',
  schedule: 'جدول زمانی',
  finance: 'مالی',
  user_management: 'مدیریت کاربران',
  profile: 'پروفایل',
  content: 'محتوا',
  education: 'آموزش و پرورش'
};
const ACTION_PRESETS = [
  { key: '', label: 'همه عملیات‌ها', actions: [] },
  {
    key: 'report_exports',
    label: 'فقط خروجی/چاپ گزارش‌ها',
    actions: [
      'admin_access_matrix_export_csv',
      'admin_access_matrix_print',
      'admin_users_access_matrix_export_csv',
      'admin_users_access_matrix_print',
      'admin_users_org_role_matrix_export_csv',
      'admin_users_org_role_matrix_print'
    ]
  },
  {
    key: 'timetable_security',
    label: 'امنیت تقسیم اوقات (403)',
    actions: ['timetable_access_forbidden']
  }
];

const actionLabel = (action = '') => ACTION_LABELS[action] || action;
const orgRoleLabel = (value = '') => ORG_ROLE_LABELS[String(value || '').trim()] || value || '';
const deviceLabel = (value = '') => DEVICE_LABELS[String(value || '').trim()] || value || '';
const contextLabel = (value = '') => CONTEXT_LABELS[String(value || '').trim()] || value || '';

export default function AdminLogs() {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({
    orgRole: '',
    action: '',
    preset: '',
    dateFrom: '',
    dateTo: '',
    ip: '',
    device: '',
    reason: '',
    sensitive: ''
  });

  const activePreset = useMemo(
    () => ACTION_PRESETS.find((item) => item.key === filters.preset) || ACTION_PRESETS[0],
    [filters.preset]
  );

  const toQuery = () => {
    const params = new URLSearchParams();
    if (filters.orgRole) params.set('orgRole', filters.orgRole);
    if (filters.action) {
      params.set('action', filters.action);
    } else if (activePreset.actions.length) {
      params.set('action_in', activePreset.actions.join(','));
    }
    if (filters.dateFrom) params.set('date_from', filters.dateFrom);
    if (filters.dateTo) params.set('date_to', filters.dateTo);
    if (filters.ip) params.set('ip', filters.ip);
    if (filters.device) params.set('device', filters.device);
    if (filters.reason) params.set('reason', filters.reason);
    if (filters.sensitive) params.set('sensitive', filters.sensitive);
    return params.toString();
  };

  const loadItems = async () => {
    try {
      const query = toQuery();
      const res = await fetch(`${API_BASE}/api/admin-logs${query ? `?${query}` : ''}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage('خطا در دریافت لاگ‌ها');
        return;
      }
      setItems(data.items || []);
      setMessage('');
    } catch {
      setMessage('خطا در ارتباط با سرور');
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCsv = () => {
    const token = localStorage.getItem('token') || '';
    const query = toQuery();
    const url = `${API_BASE}/api/admin-logs/export.csv${query ? `?${query}` : ''}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const link = document.createElement('a');
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.download = 'admin-activity-logs.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      })
      .catch(() => setMessage('خطا در دانلود CSV'));
  };

  const summary = useMemo(() => {
    return items.reduce((acc, item) => {
      const action = String(item?.action || '');
      acc.total += 1;
      if (action.includes('export_csv')) acc.csv += 1;
      if (action.includes('print')) acc.print += 1;
      if (action === 'timetable_access_forbidden') acc.forbidden += 1;
      if (item?.reason) acc.sensitive += 1;
      return acc;
    }, { total: 0, csv: 0, print: 0, sensitive: 0, forbidden: 0 });
  }, [items]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const preset = String(params.get('preset') || '').trim();
    const action = String(params.get('action') || '').trim();
    const reason = String(params.get('reason') || '').trim();
    const sensitive = String(params.get('sensitive') || '').trim();

    if (!preset && !action && !reason && !sensitive) return;

    setFilters((prev) => ({
      ...prev,
      ...(preset ? { preset } : {}),
      ...(action ? { action } : {}),
      ...(reason ? { reason } : {}),
      ...(sensitive ? { sensitive } : {})
    }));
  }, [location.search]);

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  return (
    <section className="admin-content-page">
      <div className="card-back">
        <button type="button" onClick={() => window.history.back()}>بازگشت</button>
      </div>

      <div className="admin-content-hero">
        <div>
          <h2>لاگ اقدامات ادمین</h2>
          <p>فیلتر، بررسی و خروجی CSV از فعالیت‌های سیستمی.</p>
        </div>
      </div>

      <div className="logs-summary-grid">
        <div className="logs-summary-card">
          <span>کل لاگ‌ها</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="logs-summary-card">
          <span>خروجی CSV</span>
          <strong>{summary.csv}</strong>
        </div>
        <div className="logs-summary-card">
          <span>عملیات چاپ</span>
          <strong>{summary.print}</strong>
        </div>
        <div className="logs-summary-card">
          <span>عملیات حساس</span>
          <strong>{summary.sensitive}</strong>
        </div>
        <div className="logs-summary-card">
          <span>دسترسی غیرمجاز تقسیم اوقات</span>
          <strong>{summary.forbidden}</strong>
        </div>
      </div>

      <div className="admin-content-form">
        <div className="form-grid">
          <select value={filters.orgRole} onChange={(e) => setFilters((prev) => ({ ...prev, orgRole: e.target.value }))}>
            <option value="">همه نقش‌های سازمانی</option>
            {ORG_ROLE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
          <input
            value={filters.action}
            onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))}
            placeholder="فیلتر بر اساس عملیات"
          />
          <select
            value={filters.preset}
            onChange={(e) => setFilters((prev) => ({ ...prev, preset: e.target.value, action: '' }))}
          >
            {ACTION_PRESETS.map((preset) => (
              <option key={preset.key} value={preset.key}>{preset.label}</option>
            ))}
          </select>
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))} />
          <input type="date" value={filters.dateTo} onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))} />
          <input value={filters.ip} onChange={(e) => setFilters((prev) => ({ ...prev, ip: e.target.value }))} placeholder="IP" />
          <select value={filters.device} onChange={(e) => setFilters((prev) => ({ ...prev, device: e.target.value }))}>
            <option value="">همه دستگاه‌ها</option>
            <option value="desktop">{deviceLabel('desktop')}</option>
            <option value="mobile">{deviceLabel('mobile')}</option>
            <option value="tablet">{deviceLabel('tablet')}</option>
            <option value="bot">{deviceLabel('bot')}</option>
            <option value="unknown">{deviceLabel('unknown')}</option>
          </select>
          <input
            value={filters.reason}
            onChange={(e) => setFilters((prev) => ({ ...prev, reason: e.target.value }))}
            placeholder={'\u062f\u0644\u06cc\u0644 \u06cc\u0627 \u06a9\u0644\u0645\u0647 \u06a9\u0644\u06cc\u062f\u06cc'}
          />
          <select value={filters.sensitive} onChange={(e) => setFilters((prev) => ({ ...prev, sensitive: e.target.value }))}>
            <option value="">همه لاگ‌ها</option>
            <option value="true">فقط حساس</option>
          </select>
        </div>
        <div className="form-actions">
          <button type="button" onClick={loadItems}>اعمال فیلتر</button>
          <button type="button" className="danger" onClick={exportCsv}>دانلود CSV</button>
        </div>
      </div>

      {message && <div className="form-message">{message}</div>}

      <div className="admin-content-list">
        {items.map((item) => (
          <div key={item._id} className="admin-content-item">
            <div>
              <strong>{actionLabel(item.action)}</strong>
              <span>{formatAfghanDateTime(item.createdAt, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }) || '-'}</span>
              <span>
                {item.actor?.name || 'کاربر نامشخص'}
                {item.actor?.email ? ` | ${item.actor.email}` : ''}
                {item.actorOrgRole ? ` | ${orgRoleLabel(item.actorOrgRole)}` : ''}
                {item.meta?.context ? ` | ${contextLabel(item.meta.context)}` : ''}
              </span>
              <span>
                {item.httpMethod || '-'}
                {item.route ? ` | ${item.route}` : ''}
                {item.ip ? ` | ${item.ip}` : ''}
                {item.clientDevice ? ` | ${deviceLabel(item.clientDevice)}` : ''}
              </span>
              {!!item.reason && <span>{'\u062f\u0644\u06cc\u0644'}: {item.reason}</span>}
              <details className="log-meta-details">
                <summary>جزئیات بیشتر</summary>
                <pre>{JSON.stringify(item.meta || {}, null, 2)}</pre>
              </details>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
