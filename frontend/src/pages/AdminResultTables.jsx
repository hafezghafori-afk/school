import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './AdminWorkspace.css';

import {
  downloadBlob,
  errorMessage,
  fetchBlob,
  fetchJson,
  formatNumber,
  normalizeOptions,
  postJson,
  toLocaleDateTime
} from './adminWorkspaceUtils';
import { studentMatchesSearch } from '../utils/studentSearch';

const EMPTY_REFERENCE = { templates: [], configs: [], sessions: [], academicYears: [], classes: [] };
const EMPTY_GENERATE_FORM = {
  templateId: '', configId: '', scopeType: 'class_aggregate', sessionId: '', academicYearId: '', classId: '', note: ''
};
const EMPTY_CONFIG_FORM = {
  name: '', code: '', orientation: 'landscape', fontSize: 10, headerText: 'جدول نتایج عمومی شاگردان',
  footerText: '', ministryTitle: 'وزارت معارف', directorateTitle: 'ریاست معارف شهر کابل',
  districtTitle: '', schoolTitle: '', studentsPerPage: 3, logoUrl: '', secondaryLogoUrl: '',
  signatureLabels: 'تأیید مکتب، تأیید آمریت حوزه/ولسوالی، عضو مسلکی نتایج، تأیید مدیریت عمومی نتایج، تأیید ریاست معارف'
};

const RESULT_LABELS = {
  passed: 'کامیاب', failed: 'ناکام', conditional: 'مشروط', pending: 'ناتکمیل',
  absent: 'غایب', excused: 'معذرتی', not_applicable: 'شامل نیست'
};
const TABLE_STATUS_LABELS = { generated: 'تولیدشده', published: 'نشرشده', archived: 'آرشیف‌شده', draft: 'پیش‌نویس' };

function statusTone(status = '') {
  if (status === 'published' || status === 'approved') return 'good';
  if (status === 'generated' || status === 'submitted' || status === 'active') return 'info';
  return 'muted';
}

function stageState(subject, stage) {
  const approved = stage === 'fourHalf' ? subject.fourHalfSessions : subject.annualSessions;
  const candidates = stage === 'fourHalf' ? subject.fourHalfCandidates : subject.annualCandidates;
  if (approved?.length) return { label: 'تأییدشده', tone: 'good' };
  if (candidates?.length) return { label: candidates.map((item) => item.statusLabel || item.status).join('، '), tone: 'info' };
  return { label: 'ساخته نشده', tone: 'muted' };
}

function fileFallback(table, kind) {
  return `${table?.code || 'result-table'}.${kind}`;
}

function percentageLabel(summary = {}) {
  const explicit = summary?.percentage;
  const possible = Number(summary?.possible);
  const obtained = Number(summary?.obtained);
  const value = explicit !== null && explicit !== undefined && explicit !== ''
    ? explicit
    : (Number.isFinite(obtained) && Number.isFinite(possible) && possible > 0 ? (obtained / possible) * 100 : null);
  const numeric = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(numeric)) return '—';
  return `${Number.isInteger(numeric) ? numeric : numeric.toFixed(2)}٪`;
}

export default function AdminResultTables() {
  const [reference, setReference] = useState(EMPTY_REFERENCE);
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [generateForm, setGenerateForm] = useState(EMPTY_GENERATE_FORM);
  const [configForm, setConfigForm] = useState(EMPTY_CONFIG_FORM);
  const [readiness, setReadiness] = useState(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [busyAction, setBusyAction] = useState('');
  const [tableQuery, setTableQuery] = useState('');
  const [tablePage, setTablePage] = useState(1);
  const [previewStudentQuery, setPreviewStudentQuery] = useState('');

  const templates = useMemo(() => normalizeOptions(reference.templates, ['title', 'code']), [reference.templates]);
  const configs = useMemo(() => normalizeOptions(reference.configs, ['name', 'code']), [reference.configs]);
  const sessions = useMemo(() => normalizeOptions(reference.sessions, ['title', 'code']), [reference.sessions]);
  const academicYears = useMemo(() => normalizeOptions(reference.academicYears, ['title', 'code']), [reference.academicYears]);
  const classes = useMemo(() => normalizeOptions(
    (reference.classes || []).filter((item) => !generateForm.academicYearId || String(item.academicYearId || '') === String(generateForm.academicYearId)),
    ['title', 'code']
  ), [reference.classes, generateForm.academicYearId]);
  const filteredTables = useMemo(() => {
    const query = tableQuery.trim().toLowerCase();
    return (tables || []).filter((item) => !query || `${item.title} ${item.code} ${item.schoolClass?.title || ''}`.toLowerCase().includes(query));
  }, [tables, tableQuery]);
  const tablePageCount = Math.max(1, Math.ceil(filteredTables.length / 10));
  const pagedTables = filteredTables.slice((tablePage - 1) * 10, tablePage * 10);
  const previewRows = useMemo(() => (
    (selectedTable?.rows || [])
      .filter((row) => studentMatchesSearch(row, previewStudentQuery, [row?.displayName, row?.cells?.identity]))
      .slice(0, 10)
  ), [previewStudentQuery, selectedTable?.rows]);
  const previewSubjects = selectedTable?.metadata?.subjects || previewRows[0]?.cells?.subjects?.map((item) => ({ id: item.subjectId, name: item.subjectName })) || [];

  const showMessage = (value, tone = 'info') => {
    setMessage(value);
    setMessageTone(tone);
  };

  const hydrateDefaults = (data) => {
    const officialTemplate = data.templates?.find((item) => item.code === 'RESULTS_CLASS_OFFICIAL') || data.templates?.[0];
    setGenerateForm((current) => ({
      ...current,
      templateId: current.templateId || officialTemplate?.id || '',
      configId: current.configId || data.configs?.find((item) => item.isDefault)?.id || data.configs?.[0]?.id || '',
      sessionId: current.sessionId || data.sessions?.[0]?.id || '',
      academicYearId: current.academicYearId || data.academicYears?.find((item) => item.isActive)?.id || data.academicYears?.[0]?.id || ''
    }));
  };

  const loadAll = async ({ tableId = '' } = {}) => {
    try {
      const [referenceData, tableData] = await Promise.all([
        fetchJson('/api/result-tables/reference-data'),
        fetchJson('/api/result-tables')
      ]);
      setReference({
        templates: referenceData.templates || [], configs: referenceData.configs || [], sessions: referenceData.sessions || [],
        academicYears: referenceData.academicYears || [], classes: referenceData.classes || []
      });
      setTables(tableData.items || []);
      hydrateDefaults(referenceData);
      const selectedId = tableId || selectedTable?.id || tableData.items?.[0]?.id || '';
      if (!selectedId) return setSelectedTable(null);
      const detail = await fetchJson(`/api/result-tables/${selectedId}`);
      setSelectedTable(detail.item || null);
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت معلومات جدول نتایج ناموفق بود.'), 'error');
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { if (tablePage > tablePageCount) setTablePage(tablePageCount); }, [tablePage, tablePageCount]);

  const handleGenerateChange = (event) => {
    const { name, value } = event.target;
    setGenerateForm((current) => {
      const next = { ...current, [name]: value, ...(name === 'academicYearId' ? { classId: '' } : {}) };
      if (name === 'scopeType' && value === 'class_aggregate') {
        next.templateId = reference.templates?.find((item) => item.code === 'RESULTS_CLASS_OFFICIAL')?.id || next.templateId;
      }
      return next;
    });
    if (['scopeType', 'academicYearId', 'classId'].includes(name)) setReadiness(null);
  };

  const checkReadiness = async () => {
    try {
      if (!generateForm.academicYearId || !generateForm.classId) throw new Error('سال تعلیمی و صنف را انتخاب کنید.');
      setBusyAction('readiness');
      const query = new URLSearchParams({ academicYearId: generateForm.academicYearId, classId: generateForm.classId });
      const data = await fetchJson(`/api/result-tables/readiness?${query}`);
      setReadiness(data);
      showMessage(data.ready ? 'تمام شقه‌های لازم تأیید شده‌اند؛ نتیجه آمادهٔ تولید است.' : 'موارد ناتکمیل را از جدول زیر اصلاح کنید.', data.ready ? 'info' : 'error');
      return data;
    } catch (error) {
      showMessage(errorMessage(error, 'کنترل آمادگی نتایج ناموفق بود.'), 'error');
      return null;
    } finally { setBusyAction(''); }
  };

  const generateTable = async () => {
    try {
      setBusyAction('generate');
      if (!generateForm.templateId) throw new Error('قالب جدول را انتخاب کنید.');
      if (generateForm.scopeType === 'class_aggregate' && readiness?.ready !== true) throw new Error('ابتدا کنترل آمادگی را اجرا و همه موارد ناتکمیل را رفع کنید.');
      const data = await postJson('/api/result-tables/generate', {
        ...generateForm,
        sessionId: generateForm.scopeType === 'session' ? generateForm.sessionId : undefined
      });
      setSelectedTable(data.item || null);
      showMessage('نسخهٔ تازهٔ جدول نتیجه تولید و snapshot شد.');
      await loadAll({ tableId: data.item?.id || '' });
    } catch (error) {
      showMessage(errorMessage(error, 'تولید جدول نتیجه ناموفق بود.'), 'error');
    } finally { setBusyAction(''); }
  };

  const publishTable = async (table) => {
    try {
      setBusyAction(`publish:${table.id}`);
      const data = await postJson(`/api/result-tables/${table.id}/publish`, {});
      setSelectedTable(data.item || null);
      showMessage('جدول نتیجه نشر و قفل شد. اصلاح بعدی باید در نسخهٔ تازه انجام شود.');
      await loadAll({ tableId: table.id });
    } catch (error) {
      showMessage(errorMessage(error, 'نشر جدول نتیجه ناموفق بود.'), 'error');
    } finally { setBusyAction(''); }
  };

  const inspectTable = async (tableId) => {
    try {
      setBusyAction(`inspect:${tableId}`);
      const data = await fetchJson(`/api/result-tables/${tableId}`);
      setSelectedTable(data.item || null);
    } catch (error) {
      showMessage(errorMessage(error, 'بازکردن جزئیات جدول ناموفق بود.'), 'error');
    } finally { setBusyAction(''); }
  };

  const exportTable = async (table, kind) => {
    try {
      setBusyAction(`export:${kind}`);
      const { blob, filename, contentType } = await fetchBlob(`/api/result-tables/${table.id}/export.${kind}${kind === 'print' ? '?auto=1' : ''}`, {}, { method: 'GET' });
      if (kind === 'print') {
        const url = URL.createObjectURL(new Blob([blob], { type: contentType || 'text/html' }));
        window.open(url, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        downloadBlob(blob, filename || fileFallback(table, kind));
      }
    } catch (error) {
      showMessage(errorMessage(error, `ساخت خروجی ${kind} ناموفق بود.`), 'error');
    } finally { setBusyAction(''); }
  };

  const createConfig = async () => {
    try {
      setBusyAction('config');
      if (!configForm.name.trim()) throw new Error('نام تنظیم الزامی است.');
      const payload = {
        ...configForm,
        studentsPerPage: 3,
        logoMode: configForm.logoUrl ? 'custom' : 'site',
        signatureLabels: configForm.signatureLabels.split(/[،,]/).map((item) => item.trim()).filter(Boolean)
      };
      const data = await postJson('/api/result-tables/configs', payload);
      showMessage('تنظیم چاپ رسمی ذخیره شد.');
      setConfigForm(EMPTY_CONFIG_FORM);
      setGenerateForm((current) => ({ ...current, configId: data.item?.id || current.configId }));
      await loadAll({ tableId: selectedTable?.id || '' });
    } catch (error) {
      showMessage(errorMessage(error, 'ذخیرهٔ تنظیم ناموفق بود.'), 'error');
    } finally { setBusyAction(''); }
  };

  return (
    <div className="admin-workspace-page" dir="rtl">
      <div className="admin-workspace-shell">
        <section className="admin-workspace-hero">
          <div className="admin-workspace-badges"><span className="admin-workspace-badge">نتایج عمومی</span><span className="admin-workspace-badge info">۴۰ + ۶۰ = ۱۰۰</span></div>
          <h1>مرکز مدیریت جدول نتایج</h1>
          <p>کنترل آمادگی شقه‌ها، تولید نسخهٔ ثابت، پیش‌نمایش، PDF، اکسل، چاپ و نشر رسمی از همین صفحه انجام می‌شود.</p>
          <div className="admin-workspace-meta"><span>قالب‌ها: {formatNumber(templates.length)}</span><span>تنظیم‌ها: {formatNumber(configs.length)}</span><span>جدول‌ها: {formatNumber(tables.length)}</span></div>
        </section>

        {message && <div className={`admin-workspace-message ${messageTone === 'error' ? 'error' : ''}`}>{message}</div>}

        <section className="admin-workspace-grid">
          <article className="admin-workspace-card" data-span="12">
            <h2>۱. ساخت جدول نتیجه</h2>
            <p className="admin-workspace-subtitle">برای نتیجهٔ عمومی، سال و صنف را انتخاب کنید؛ سیستم دو شقهٔ تأییدشدهٔ هر مضمون را کنترل می‌کند.</p>
            <div className="admin-workspace-form-grid">
              <div className="admin-workspace-field"><label htmlFor="result-scope">نوع نتیجه</label><select id="result-scope" name="scopeType" value={generateForm.scopeType} onChange={handleGenerateChange}><option value="class_aggregate">نتیجهٔ عمومی صنف (۴۰ + ۶۰)</option><option value="session">نتیجهٔ یک شقه</option></select></div>
              <div className="admin-workspace-field"><label htmlFor="result-template">قالب</label><select id="result-template" name="templateId" value={generateForm.templateId} onChange={handleGenerateChange}><option value="">انتخاب قالب</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.uiLabel}</option>)}</select></div>
              <div className="admin-workspace-field"><label htmlFor="result-config">تنظیم چاپ</label><select id="result-config" name="configId" value={generateForm.configId} onChange={handleGenerateChange}><option value="">پیش‌فرض سیستم</option>{configs.map((item) => <option key={item.id} value={item.id}>{item.uiLabel}</option>)}</select></div>
              {generateForm.scopeType === 'session' ? <div className="admin-workspace-field"><label htmlFor="result-session">شقهٔ تأییدشده</label><select id="result-session" name="sessionId" value={generateForm.sessionId} onChange={handleGenerateChange}><option value="">انتخاب شقه</option>{sessions.map((item) => <option key={item.id} value={item.id}>{item.uiLabel}</option>)}</select></div> : <>
                <div className="admin-workspace-field"><label htmlFor="result-academic-year">سال تعلیمی</label><select id="result-academic-year" name="academicYearId" value={generateForm.academicYearId} onChange={handleGenerateChange}><option value="">انتخاب سال</option>{academicYears.map((item) => <option key={item.id} value={item.id}>{item.uiLabel}</option>)}</select></div>
                <div className="admin-workspace-field"><label htmlFor="result-class">صنف</label><select id="result-class" name="classId" value={generateForm.classId} onChange={handleGenerateChange}><option value="">انتخاب صنف</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.uiLabel}</option>)}</select></div>
              </>}
              <div className="admin-workspace-field"><label htmlFor="result-note">یادداشت نسخه</label><input id="result-note" name="note" value={generateForm.note} onChange={handleGenerateChange} placeholder="یادداشت اختیاری" /></div>
            </div>
            <div className="admin-workspace-actions">
              <button type="button" className="admin-workspace-button-ghost" onClick={() => loadAll()} disabled={!!busyAction}>بازخوانی</button>
              {generateForm.scopeType === 'class_aggregate' && <button type="button" className="admin-workspace-button-secondary" onClick={checkReadiness} disabled={busyAction === 'readiness'}>{busyAction === 'readiness' ? 'در حال کنترل...' : 'کنترل آمادگی شقه‌ها'}</button>}
              <button type="button" className="admin-workspace-button" onClick={generateTable} disabled={busyAction === 'generate' || !generateForm.templateId}>تولید نسخهٔ نتیجه</button>
            </div>

            {generateForm.scopeType === 'class_aggregate' && readiness && <div className="result-readiness-panel">
              <div className="result-readiness-summary">
                <div><strong>{readiness.ready ? 'آمادهٔ تولید' : 'نیازمند تکمیل'}</strong><span>قاعده: حداقل ۱۶/۴۰، ۴۰/۶۰ و ۵۵/۱۰۰ در هر مضمون</span></div>
                <div className="result-readiness-progress"><b>{formatNumber(readiness.progress?.approvedSessionCount || 0)} از {formatNumber(readiness.progress?.requiredSessionCount || 0)} شقه تأیید</b><progress max="100" value={readiness.progress?.percentage || 0} /></div>
              </div>
              <div className="admin-workspace-table-wrap"><table className="admin-workspace-table"><thead><tr><th>مضمون</th><th>استاد</th><th>چهارنیم‌ماهه</th><th>سالانه</th><th>آمادگی</th><th>اقدام</th></tr></thead><tbody>
                {(readiness.subjects || []).map((subject) => {
                  const four = stageState(subject, 'fourHalf'); const annual = stageState(subject, 'annual');
                  const issue = (readiness.issues || []).find((item) => item.subjectId === subject.id);
                  return <tr key={subject.id}><td><b>{subject.name}</b><small>{subject.code}</small></td><td>{subject.teacherAssignments?.map((item) => item.teacherName).filter(Boolean).join('، ') || 'تعیین نشده'}</td><td><span className={`admin-workspace-badge ${four.tone}`}>{four.label}</span></td><td><span className={`admin-workspace-badge ${annual.tone}`}>{annual.label}</span></td><td><span className={`admin-workspace-badge ${subject.ready ? 'good' : 'muted'}`}>{subject.ready ? 'کامل' : 'ناتکمیل'}</span></td><td>{issue?.actionUrl ? <Link className="admin-workspace-button-ghost result-action-link" to={issue.actionUrl}>{issue.message}</Link> : '—'}</td></tr>;
                })}
              </tbody></table></div>
              {(readiness.issues || []).filter((item) => !item.subjectId).map((issue) => <div key={issue.code} className="admin-workspace-message error">{issue.message}</div>)}
            </div>}
          </article>

          <article className="admin-workspace-card" data-span="12">
            <details>
              <summary><h2>۲. تنظیم ظاهر چاپ رسمی</h2><span>لوگوها، عنوان‌ها، سه شاگرد در هر صفحه و محل‌های تأیید</span></summary>
              <p className="admin-workspace-subtitle">این تنظیم هنگام تولید snapshot می‌شود؛ تغییر بعدی، جدول قبلی را عوض نمی‌کند.</p>
              <div className="admin-workspace-form-grid">
                <div className="admin-workspace-field"><label htmlFor="config-name">نام تنظیم</label><input id="config-name" name="name" value={configForm.name} onChange={(e) => setConfigForm((c) => ({ ...c, [e.target.name]: e.target.value }))} placeholder="مثال: جدول رسمی ۱۴۰۵" /></div>
                <div className="admin-workspace-field"><label htmlFor="config-code">کد</label><input id="config-code" name="code" value={configForm.code} onChange={(e) => setConfigForm((c) => ({ ...c, [e.target.name]: e.target.value }))} placeholder="OFFICIAL-1405" /></div>
                <div className="admin-workspace-field"><label htmlFor="config-school">نام مکتب</label><input id="config-school" name="schoolTitle" value={configForm.schoolTitle} onChange={(e) => setConfigForm((c) => ({ ...c, [e.target.name]: e.target.value }))} placeholder="در صورت خالی بودن از تنظیمات مکتب خوانده می‌شود" /></div>
                <div className="admin-workspace-field"><label htmlFor="config-ministry">عنوان وزارت</label><input id="config-ministry" name="ministryTitle" value={configForm.ministryTitle} onChange={(e) => setConfigForm((c) => ({ ...c, [e.target.name]: e.target.value }))} /></div>
                <div className="admin-workspace-field"><label htmlFor="config-directorate">عنوان ریاست</label><input id="config-directorate" name="directorateTitle" value={configForm.directorateTitle} onChange={(e) => setConfigForm((c) => ({ ...c, [e.target.name]: e.target.value }))} /></div>
                <div className="admin-workspace-field"><label htmlFor="config-district">حوزه/آمریت</label><input id="config-district" name="districtTitle" value={configForm.districtTitle} onChange={(e) => setConfigForm((c) => ({ ...c, [e.target.name]: e.target.value }))} /></div>
                <div className="admin-workspace-field"><label htmlFor="config-logo">لوگوی مکتب</label><input id="config-logo" name="logoUrl" value={configForm.logoUrl} onChange={(e) => setConfigForm((c) => ({ ...c, [e.target.name]: e.target.value }))} placeholder="آدرس اختیاری" /></div>
                <div className="admin-workspace-field"><label htmlFor="config-ministry-logo">لوگوی وزارت</label><input id="config-ministry-logo" name="secondaryLogoUrl" value={configForm.secondaryLogoUrl} onChange={(e) => setConfigForm((c) => ({ ...c, [e.target.name]: e.target.value }))} placeholder="آدرس اختیاری" /></div>
                <div className="admin-workspace-field"><label htmlFor="config-font-size">اندازهٔ خط چاپ</label><input id="config-font-size" type="number" min="10" max="14" name="fontSize" value={configForm.fontSize} onChange={(e) => setConfigForm((c) => ({ ...c, fontSize: Number(e.target.value || 10) }))} /></div>
                <div className="admin-workspace-field"><label htmlFor="config-per-page">شاگرد در هر صفحه</label><input id="config-per-page" type="number" name="studentsPerPage" value="3" disabled title="قالب رسمی مطابق نمونه در هر صفحه سه شاگرد دارد." /></div>
                <div className="admin-workspace-field"><label htmlFor="config-header">عنوان جدول</label><input id="config-header" name="headerText" value={configForm.headerText} onChange={(e) => setConfigForm((c) => ({ ...c, [e.target.name]: e.target.value }))} /></div>
                <div className="admin-workspace-field"><label htmlFor="config-signatures">تأییدهای پایین جدول</label><input id="config-signatures" name="signatureLabels" value={configForm.signatureLabels} onChange={(e) => setConfigForm((c) => ({ ...c, [e.target.name]: e.target.value }))} /></div>
                <div className="admin-workspace-field"><label htmlFor="config-footer">متن پایین</label><input id="config-footer" name="footerText" value={configForm.footerText} onChange={(e) => setConfigForm((c) => ({ ...c, [e.target.name]: e.target.value }))} /></div>
              </div>
              <div className="admin-workspace-actions"><button type="button" className="admin-workspace-button-secondary" onClick={createConfig} disabled={busyAction === 'config'}>ذخیرهٔ تنظیم</button></div>
            </details>
          </article>

          <article className="admin-workspace-card" data-span="5">
            <h2>۳. جزئیات نسخه</h2>
            {selectedTable ? <div className="admin-workspace-form">
              <div className="admin-workspace-badges"><span className={`admin-workspace-badge ${statusTone(selectedTable.status)}`}>{TABLE_STATUS_LABELS[selectedTable.status] || selectedTable.status}</span><span className="admin-workspace-badge info">نسخه {selectedTable.version || 1}</span><span className="admin-workspace-badge info">{selectedTable.rowCount || 0} شاگرد</span></div>
              <div className="admin-workspace-meta"><span>{selectedTable.title}</span><span>تولید: {toLocaleDateTime(selectedTable.generatedAt)}</span>{selectedTable.publishedAt && <span>نشر: {toLocaleDateTime(selectedTable.publishedAt)}</span>}</div>
              <div className="admin-workspace-actions result-export-actions">
                <button type="button" className="admin-workspace-button-ghost" onClick={() => exportTable(selectedTable, 'pdf')}>PDF</button>
                <button type="button" className="admin-workspace-button-ghost" onClick={() => exportTable(selectedTable, 'xlsx')}>اکسل</button>
                <button type="button" className="admin-workspace-button-ghost" onClick={() => exportTable(selectedTable, 'csv')}>CSV</button>
                <button type="button" className="admin-workspace-button-secondary" onClick={() => exportTable(selectedTable, 'print')}>چاپ</button>
                {selectedTable.status !== 'published' && <button type="button" className="admin-workspace-button" onClick={() => publishTable(selectedTable)}>تأیید و نشر</button>}
              </div>
              {selectedTable.status === 'published' && <p className="admin-workspace-subtitle">این نسخه قفل است. برای اصلاح، شقه را اصلاح و نسخهٔ تازه تولید کنید.</p>}
            </div> : <div className="admin-workspace-empty">هنوز جدولی انتخاب نشده است.</div>}
          </article>

          <article className="admin-workspace-card" data-span="7">
            <h2>پیش‌نمایش ساختار رسمی سه‌ردیفی</h2>
            <div className="admin-workspace-field">
              <label htmlFor="result-preview-student-search">جستجوی شاگرد در نسخه</label>
              <input
                id="result-preview-student-search"
                type="search"
                value={previewStudentQuery}
                onChange={(event) => setPreviewStudentQuery(event.target.value)}
                placeholder="نام، نام پدر یا نمبر اساس شاگرد"
              />
            </div>
            {previewRows.length ? <div className="admin-workspace-table-wrap"><table className="admin-workspace-table result-official-preview"><thead><tr><th>شماره</th><th>شهرت شاگرد</th><th>مرحله</th>{previewSubjects.map((subject) => <th key={subject.id || subject.code}>{subject.name}</th>)}<th>مجموع</th><th>فیصدی</th><th>نتیجه</th><th>درجه</th><th>ملاحظات</th></tr></thead><tbody>
              {previewRows.map((row) => {
                const scores = new Map((row.cells?.subjects || []).map((item) => [String(item.subjectId || item.subjectCode || ''), item]));
                const stages = [
                  { key: 'fourHalf', label: 'چهارنیم ماهه', scoreKey: 'fourHalf' },
                  { key: 'annual', label: 'سالانه', scoreKey: 'annual' },
                  { key: 'general', label: 'نتیجه نهایی', scoreKey: 'total' }
                ];
                return <React.Fragment key={row.id}>{stages.map((stage, index) => <tr key={`${row.id}:${stage.key}`} className={index === 2 ? 'result-preview-student-end' : ''}>
                  {index === 0 && <><td rowSpan="3">{row.serialNo}</td><td rowSpan="3"><b>{row.displayName}</b><small>{row.cells?.identity?.fatherName ? `ولد ${row.cells.identity.fatherName}` : ''}</small>{(row.cells?.identity?.asasNumber || row.cells?.identity?.admissionNo) ? <small>{`اساس: ${row.cells.identity.asasNumber || row.cells.identity.admissionNo}`}</small> : null}</td></>}
                  <td><b>{stage.label}</b></td>
                  {previewSubjects.map((subject) => { const item = scores.get(String(subject.id || subject.code || '')) || {}; return <td key={subject.id || subject.code}>{item[stage.scoreKey] ?? '—'}</td>; })}
                  <td>{row.cells?.stageTotals?.[stage.key]?.obtained ?? '—'}</td><td>{percentageLabel(row.cells?.stageTotals?.[stage.key])}</td>
                  {index === 0 && <><td rowSpan="3">{RESULT_LABELS[row.resultStatus] || row.resultStatus || '—'}</td><td rowSpan="3">{row.rank ?? '—'}</td><td rowSpan="3">{row.membershipStatusLabel || 'فعال'}</td></>}
                </tr>)}</React.Fragment>;
              })}
            </tbody></table></div> : <div className="admin-workspace-empty">برای نسخهٔ انتخاب‌شده داده‌ای موجود نیست.</div>}
          </article>

          <article className="admin-workspace-card" data-span="12">
            <div className="result-list-header"><div><h2>نسخه‌های تولیدشده</h2><span>نمایش ۱۰ نسخه در هر صفحه</span></div><div className="admin-workspace-field"><label htmlFor="result-table-search">جست‌وجو</label><input id="result-table-search" value={tableQuery} onChange={(e) => { setTableQuery(e.target.value); setTablePage(1); }} placeholder="عنوان، کد یا صنف" /></div></div>
            <div className="admin-workspace-table-wrap"><table className="admin-workspace-table"><thead><tr><th>عنوان</th><th>صنف/سال</th><th>نسخه</th><th>شاگرد</th><th>وضعیت</th><th>تاریخ تولید</th><th>اقدام</th></tr></thead><tbody>
              {pagedTables.length ? pagedTables.map((table) => <tr key={table.id}><td><b>{table.title}</b><small>{table.code}</small></td><td>{table.schoolClass?.title || '—'} / {table.academicYear?.title || '—'}</td><td>{table.version || 1}</td><td>{formatNumber(table.rowCount)}</td><td><span className={`admin-workspace-badge ${statusTone(table.status)}`}>{TABLE_STATUS_LABELS[table.status] || table.status}</span></td><td>{toLocaleDateTime(table.generatedAt)}</td><td><div className="admin-workspace-inline-actions"><button type="button" className="admin-workspace-button-ghost" onClick={() => inspectTable(table.id)}>مشاهده</button><button type="button" className="admin-workspace-button-ghost" onClick={() => exportTable(table, 'pdf')}>PDF</button>{table.status !== 'published' && <button type="button" className="admin-workspace-button-secondary" onClick={() => publishTable(table)}>نشر</button>}</div></td></tr>) : <tr><td colSpan="7"><div className="admin-workspace-empty">جدولی پیدا نشد.</div></td></tr>}
            </tbody></table></div>
            <div className="result-pagination"><button type="button" className="admin-workspace-button-ghost" disabled={tablePage <= 1} onClick={() => setTablePage((page) => page - 1)}>صفحهٔ قبلی</button><span>صفحه {formatNumber(tablePage)} از {formatNumber(tablePageCount)}</span><button type="button" className="admin-workspace-button-ghost" disabled={tablePage >= tablePageCount} onClick={() => setTablePage((page) => page + 1)}>صفحهٔ بعدی</button></div>
          </article>
        </section>
      </div>
    </div>
  );
}
