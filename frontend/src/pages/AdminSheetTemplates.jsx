import React, { useEffect, useMemo, useState } from 'react';
import './AdminWorkspace.css';

import {
  downloadBlob,
  errorMessage,
  fetchBlob,
  fetchJson,
  fetchText,
  formatNumber,
  normalizeOptions,
  openHtmlDocument,
  postJson,
  toLocaleDateTime
} from './adminWorkspaceUtils';

const TEMPLATE_TYPES = [
  { id: '', title: 'همه شقه‌ها' },
  { id: 'attendance', title: 'شقه حاضری روزانه' },
  { id: 'attendance_summary', title: 'شقه خلاصه حاضری' },
  { id: 'subjects', title: 'شقه مضامین صنف' },
  { id: 'exam', title: 'شقه امتحان' },
  { id: 'finance', title: 'شقه مالی' }
];

const EMPTY_FILTERS = {
  type: '',
  academicYearId: '',
  classId: '',
  termId: '',
  examId: '',
  month: '',
  dateFrom: '',
  dateTo: ''
};

const SUMMARY_LABELS = {
  totalRows: 'تعداد ردیف‌ها',
  totalStudents: 'شاگردان',
  totalClasses: 'صنف‌ها',
  totalSubjects: 'مضامین',
  totalTeachers: 'استادان',
  presentDays: 'حاضر',
  absentDays: 'غیرحاضر',
  sickDays: 'مریض',
  leaveDays: 'رخصتی',
  totalDue: 'قابل پرداخت',
  totalOutstanding: 'باقی‌مانده',
  averageScore: 'اوسط نمره',
  maxScore: 'بلندترین نمره'
};

function getTypeLabel(type = '') {
  return TEMPLATE_TYPES.find((item) => item.id === type)?.title || type || 'همه شقه‌ها';
}

function getOptionId(option = {}) {
  return option.id || option._id || '';
}

function getOptionLabel(option = {}) {
  const pieces = [option.uiLabel || option.title || option.name || option.code];
  if (option.subject) pieces.push(option.subject);
  if (option.heldAt) pieces.push(toLocaleDateTime(option.heldAt));
  return pieces.filter(Boolean).join(' - ') || '---';
}

function compactFilters(filters = {}) {
  return Object.entries(filters).reduce((acc, [key, value]) => {
    if (key === 'type') return acc;
    if (value == null || value === '') return acc;
    acc[key] = value;
    return acc;
  }, {});
}

function getTemplateHint(template = null) {
  if (!template) return 'از فهرست سمت راست یک شقه آماده را انتخاب کنید.';
  if (template.type === 'exam') {
    return 'برای شقه امتحان، انتخاب جلسه امتحان ضروری است؛ دیتا از بخش امتحانات خوانده می‌شود.';
  }
  if (template.type === 'subjects') {
    return 'این شقه مضامین و استادان مربوط به صنف را از تخصیص‌های آموزشی می‌گیرد.';
  }
  if (template.type === 'attendance' || template.type === 'attendance_summary') {
    return 'این شقه از ثبت حاضری سیستم ساخته می‌شود و با فیلتر صنف، تاریخ و ماه دقیق‌تر می‌شود.';
  }
  return 'این شقه آماده است و فقط با فیلترهای همین صفحه تولید می‌شود.';
}

function getPreviewMessage(preview = null) {
  return preview?.meta?.message || 'برای دیدن معلومات، فیلترها را تنظیم کنید و پیش‌نمایش را بزنید.';
}

function getSummaryEntries(preview = null) {
  const summary = preview?.summary && typeof preview.summary === 'object' ? preview.summary : {};
  const entries = Object.entries(summary)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 6);

  if (entries.length) {
    return entries.map(([key, value]) => ({
      label: SUMMARY_LABELS[key] || key,
      value: typeof value === 'number' ? formatNumber(value) : String(value)
    }));
  }

  const totalRows = Array.isArray(preview?.rows) ? preview.rows.length : Number(preview?.meta?.totalRows || 0);
  return [{ label: 'تعداد ردیف‌ها', value: formatNumber(totalRows) }];
}

export default function AdminSheetTemplates() {
  const [items, setItems] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [academicTerms, setAcademicTerms] = useState([]);
  const [classes, setClasses] = useState([]);
  const [examSessions, setExamSessions] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [busyAction, setBusyAction] = useState('');

  const templateTypes = useMemo(() => normalizeOptions(TEMPLATE_TYPES, ['title', 'id']), []);
  const yearOptions = useMemo(() => normalizeOptions(academicYears, ['title', 'code']), [academicYears]);
  const termOptions = useMemo(() => normalizeOptions(academicTerms, ['title', 'code']), [academicTerms]);
  const classOptions = useMemo(() => normalizeOptions(classes, ['title', 'code']), [classes]);
  const examSessionOptions = useMemo(() => normalizeOptions(examSessions, ['title', 'code']), [examSessions]);

  const filteredTemplates = useMemo(() => {
    return items.filter((item) => !filters.type || item.type === filters.type);
  }, [filters.type, items]);

  const selectedTemplate = useMemo(() => {
    return items.find((item) => String(item.id) === String(selectedTemplateId)) || null;
  }, [items, selectedTemplateId]);

  const filteredExamSessionOptions = useMemo(() => {
    return examSessionOptions.filter((item) => {
      if (filters.academicYearId && item.academicYearId !== filters.academicYearId) return false;
      if (filters.classId && item.classId !== filters.classId) return false;
      if (filters.termId && item.termId !== filters.termId) return false;
      return true;
    });
  }, [examSessionOptions, filters.academicYearId, filters.classId, filters.termId]);

  const previewColumns = Array.isArray(preview?.columns) ? preview.columns : [];
  const previewRows = Array.isArray(preview?.rows) ? preview.rows : [];
  const summaryEntries = useMemo(() => getSummaryEntries(preview), [preview]);

  const showMessage = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const loadReference = async () => {
    const data = await fetchJson('/api/reports/reference-data');
    setAcademicYears(data.academicYears || []);
    setAcademicTerms(data.academicTerms || []);
    setClasses(data.classes || []);
    setExamSessions(data.examSessions || []);
  };

  const loadTemplates = async () => {
    const data = await fetchJson('/api/sheet-templates');
    const rows = data.items || [];
    setItems(rows);
    setSelectedTemplateId((current) => current || rows[0]?.id || '');
  };

  const loadAll = async () => {
    try {
      setBusyAction('load');
      await Promise.all([loadReference(), loadTemplates()]);
    } catch (error) {
      showMessage(errorMessage(error, 'بارگذاری شقه‌ها ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!filteredTemplates.length) {
      setSelectedTemplateId('');
      setPreview(null);
      return;
    }

    if (!filteredTemplates.some((item) => String(item.id) === String(selectedTemplateId))) {
      setSelectedTemplateId(filteredTemplates[0]?.id || '');
      setPreview(null);
    }
  }, [filteredTemplates, selectedTemplateId]);

  const updateFilter = (event) => {
    const { name, value } = event.target;
    setFilters((current) => {
      const next = { ...current, [name]: value };
      if (['academicYearId', 'classId', 'termId'].includes(name)) {
        next.examId = '';
      }
      return next;
    });
  };

  const selectTemplate = (template) => {
    setSelectedTemplateId(template?.id || '');
    setPreview(null);
    showMessage(`${template?.title || 'شقه'} انتخاب شد.`);
  };

  const buildPreviewFilters = () => compactFilters(filters);

  const runPreview = async () => {
    if (!selectedTemplateId) return;
    try {
      setBusyAction('preview');
      const data = await postJson(`/api/sheet-templates/${selectedTemplateId}/preview`, {
        filters: buildPreviewFilters()
      });
      setPreview(data.preview || null);
      showMessage('پیش‌نمایش آماده شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'پیش‌نمایش شقه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const exportFromTemplate = async (kind = 'csv') => {
    if (!selectedTemplateId) return;
    try {
      setBusyAction(`export:${kind}`);
      if (kind === 'print') {
        const { text, filename, contentType } = await fetchText(`/api/sheet-templates/${selectedTemplateId}/export.print`, {
          filters: buildPreviewFilters()
        });
        const opened = openHtmlDocument(text, filename);
        if (!opened) {
          downloadBlob(new Blob([text], { type: contentType }), filename);
        }
      } else {
        const endpoint = kind === 'xlsx'
          ? `/api/sheet-templates/${selectedTemplateId}/export.xlsx`
          : kind === 'pdf'
            ? `/api/sheet-templates/${selectedTemplateId}/export.pdf`
            : `/api/sheet-templates/${selectedTemplateId}/export.csv`;
        const { blob, filename } = await fetchBlob(endpoint, {
          filters: buildPreviewFilters()
        });
        downloadBlob(blob, filename);
      }
      showMessage('خروجی شقه دریافت شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'گرفتن خروجی شقه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPreview(null);
    showMessage('فیلترها پاک شد.');
  };

  return (
    <main className="admin-workspace-page" dir="rtl">
      <div className="admin-workspace-shell">
        <section className="admin-workspace-hero">
          <h1>فهرست شقه‌های آماده</h1>
          <p>
            شقه‌ها از قبل در سیستم آماده شده‌اند. فقط نوع شقه و فیلترهای لازم را انتخاب کنید، سپس پیش‌نمایش یا خروجی رسمی بگیرید.
          </p>
          <div className="admin-workspace-actions">
            <button type="button" className="admin-workspace-button-ghost" onClick={loadAll} disabled={busyAction === 'load'}>
              بروزرسانی
            </button>
            <button type="button" className="admin-workspace-button" onClick={runPreview} disabled={busyAction === 'preview' || !selectedTemplateId}>
              پیش‌نمایش
            </button>
          </div>
        </section>

        {message ? <div className={`admin-workspace-message ${messageTone === 'error' ? 'error' : ''}`}>{message}</div> : null}

        <section className="admin-workspace-grid">
          <article className="admin-workspace-card" data-span="4">
            <h2>فهرست شقه</h2>
            <p className="admin-workspace-subtitle">نوع شقه را فیلتر کنید و یکی از قالب‌های آماده را انتخاب نمایید.</p>

            <div className="admin-workspace-form">
              <div className="admin-workspace-field">
                <label htmlFor="sheet-type-filter">نوع شقه</label>
                <select id="sheet-type-filter" name="type" value={filters.type} onChange={updateFilter}>
                  {templateTypes.map((item) => (
                    <option key={item.id || 'all'} value={item.id}>{item.uiLabel}</option>
                  ))}
                </select>
              </div>

              <div className="admin-workspace-template-list">
                {filteredTemplates.length ? filteredTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`admin-workspace-template-item ${String(selectedTemplateId) === String(template.id) ? 'active' : ''}`}
                    onClick={() => selectTemplate(template)}
                  >
                    <strong>{template.title}</strong>
                    <span>{getTypeLabel(template.type)}</span>
                    <em>{template.note || template.code}</em>
                  </button>
                )) : (
                  <div className="admin-workspace-empty">برای این نوع، شقه آماده پیدا نشد.</div>
                )}
              </div>
            </div>
          </article>

          <article className="admin-workspace-card" data-span="8">
            <div className="admin-education-card-head">
              <div>
                <h2>{selectedTemplate?.title || 'شقه انتخاب نشده'}</h2>
                <p className="admin-workspace-subtitle">{getTemplateHint(selectedTemplate)}</p>
              </div>
              {selectedTemplate ? (
                <div className="admin-workspace-badges">
                  <span className="admin-workspace-badge good">آماده</span>
                  <span className="admin-workspace-badge info">{getTypeLabel(selectedTemplate.type)}</span>
                </div>
              ) : null}
            </div>

            <div className="admin-workspace-form-grid">
              <div className="admin-workspace-field">
                <label htmlFor="sheet-academic-year">سال تعلیمی</label>
                <select id="sheet-academic-year" name="academicYearId" value={filters.academicYearId} onChange={updateFilter}>
                  <option value="">همه سال‌ها</option>
                  {yearOptions.map((item) => (
                    <option key={getOptionId(item)} value={getOptionId(item)}>{getOptionLabel(item)}</option>
                  ))}
                </select>
              </div>

              <div className="admin-workspace-field">
                <label htmlFor="sheet-class">صنف</label>
                <select id="sheet-class" name="classId" value={filters.classId} onChange={updateFilter}>
                  <option value="">همه صنف‌ها</option>
                  {classOptions.map((item) => (
                    <option key={getOptionId(item)} value={getOptionId(item)}>{getOptionLabel(item)}</option>
                  ))}
                </select>
              </div>

              <div className="admin-workspace-field">
                <label htmlFor="sheet-term">دوره / ترم</label>
                <select id="sheet-term" name="termId" value={filters.termId} onChange={updateFilter}>
                  <option value="">همه دوره‌ها</option>
                  {termOptions.map((item) => (
                    <option key={getOptionId(item)} value={getOptionId(item)}>{getOptionLabel(item)}</option>
                  ))}
                </select>
              </div>

              <div className="admin-workspace-field">
                <label htmlFor="sheet-exam">جلسه امتحان</label>
                <select id="sheet-exam" name="examId" value={filters.examId} onChange={updateFilter}>
                  <option value="">انتخاب نشده</option>
                  {filteredExamSessionOptions.map((item) => (
                    <option key={getOptionId(item)} value={getOptionId(item)}>{getOptionLabel(item)}</option>
                  ))}
                </select>
              </div>

              <div className="admin-workspace-field">
                <label htmlFor="sheet-month">ماه</label>
                <input id="sheet-month" name="month" value={filters.month} onChange={updateFilter} placeholder="مثلا حمل یا 1403-01" />
              </div>

              <div className="admin-workspace-field">
                <label htmlFor="sheet-date-from">از تاریخ</label>
                <input id="sheet-date-from" type="date" name="dateFrom" value={filters.dateFrom} onChange={updateFilter} />
              </div>

              <div className="admin-workspace-field">
                <label htmlFor="sheet-date-to">تا تاریخ</label>
                <input id="sheet-date-to" type="date" name="dateTo" value={filters.dateTo} onChange={updateFilter} />
              </div>
            </div>

            <div className="admin-workspace-actions admin-workspace-section-actions">
              <button type="button" className="admin-workspace-button" onClick={runPreview} disabled={busyAction === 'preview' || !selectedTemplateId}>
                پیش‌نمایش
              </button>
              <button type="button" className="admin-workspace-button-secondary" onClick={() => exportFromTemplate('pdf')} disabled={busyAction === 'export:pdf' || !selectedTemplateId}>
                PDF
              </button>
              <button type="button" className="admin-workspace-button-secondary" onClick={() => exportFromTemplate('xlsx')} disabled={busyAction === 'export:xlsx' || !selectedTemplateId}>
                Excel
              </button>
              <button type="button" className="admin-workspace-button-ghost" onClick={() => exportFromTemplate('csv')} disabled={busyAction === 'export:csv' || !selectedTemplateId}>
                CSV
              </button>
              <button type="button" className="admin-workspace-button-ghost" onClick={() => exportFromTemplate('print')} disabled={busyAction === 'export:print' || !selectedTemplateId}>
                چاپ
              </button>
              <button type="button" className="admin-workspace-button-ghost" onClick={resetFilters}>
                پاک کردن فیلتر
              </button>
            </div>
          </article>

          <article className="admin-workspace-card">
            <div className="admin-education-card-head">
              <div>
                <h2>پیش‌نمایش شقه</h2>
                <p className="admin-workspace-subtitle">
                  {preview?.generatedAt ? `تولید شده در ${toLocaleDateTime(preview.generatedAt)}` : getPreviewMessage(preview)}
                </p>
              </div>
              <div className="admin-workspace-chip-row">
                <span className="admin-workspace-chip">{selectedTemplate?.code || 'بدون کد'}</span>
                <span className="admin-workspace-chip">{previewRows.length ? `${formatNumber(previewRows.length)} ردیف` : 'بدون ردیف'}</span>
              </div>
            </div>

            {preview ? (
              <>
                <div className="admin-workspace-summary admin-workspace-preview-summary">
                  {summaryEntries.map((item) => (
                    <div className="admin-workspace-stat" key={`${item.label}-${item.value}`}>
                      <strong>{item.value}</strong>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>

                {previewRows.length && previewColumns.length ? (
                  <div className="admin-workspace-table-wrap">
                    <table className="admin-workspace-table">
                      <thead>
                        <tr>
                          {previewColumns.map((column) => (
                            <th key={column.key}>{column.label || column.key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, rowIndex) => (
                          <tr key={`preview-row-${rowIndex}`}>
                            {previewColumns.map((column) => (
                              <td key={`${rowIndex}-${column.key}`}>{row?.[column.key] ?? ''}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="admin-workspace-empty">{getPreviewMessage(preview)}</div>
                )}
              </>
            ) : (
              <div className="admin-workspace-empty">هنوز پیش‌نمایش تولید نشده است.</div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}
