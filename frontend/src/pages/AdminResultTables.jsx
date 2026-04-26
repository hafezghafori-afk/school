import React, { useEffect, useMemo, useState } from 'react';
import './AdminWorkspace.css';

import {
  errorMessage,
  fetchJson,
  formatNumber,
  normalizeOptions,
  postJson,
  toLocaleDateTime
} from './adminWorkspaceUtils';

const EMPTY_REFERENCE = {
  templates: [],
  configs: [],
  sessions: []
};

const EMPTY_GENERATE_FORM = {
  templateId: '',
  configId: '',
  sessionId: '',
  note: ''
};

const EMPTY_CONFIG_FORM = {
  name: '',
  code: '',
  orientation: 'landscape',
  headerText: '',
  footerText: ''
};

function tableStatusBadge(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'published') return 'good';
  if (normalized === 'generated') return 'info';
  return 'muted';
}

export default function AdminResultTables() {
  const [reference, setReference] = useState(EMPTY_REFERENCE);
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [generateForm, setGenerateForm] = useState(EMPTY_GENERATE_FORM);
  const [configForm, setConfigForm] = useState(EMPTY_CONFIG_FORM);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [busyAction, setBusyAction] = useState('');

  const templates = useMemo(() => normalizeOptions(reference.templates, ['title', 'code']), [reference.templates]);
  const configs = useMemo(() => normalizeOptions(reference.configs, ['name', 'code']), [reference.configs]);
  const sessions = useMemo(() => normalizeOptions(reference.sessions, ['title', 'code']), [reference.sessions]);
  const previewRows = selectedTable?.rows?.slice(0, 20) || [];

  const showMessage = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const hydrateDefaults = (referenceData) => {
    setGenerateForm((current) => ({
      ...current,
      templateId: current.templateId || referenceData.templates?.[0]?.id || '',
      configId: current.configId || referenceData.configs?.[0]?.id || '',
      sessionId: current.sessionId || referenceData.sessions?.[0]?.id || ''
    }));
  };

  const loadAll = async ({ tableId = '' } = {}) => {
    try {
      const [referenceData, tableData] = await Promise.all([
        fetchJson('/api/result-tables/reference-data'),
        fetchJson('/api/result-tables')
      ]);
      setReference({
        templates: referenceData.templates || [],
        configs: referenceData.configs || [],
        sessions: referenceData.sessions || []
      });
      setTables(tableData.items || []);
      hydrateDefaults(referenceData);

      const selectedId = tableId || selectedTable?.id || tableData.items?.[0]?.id || '';
      if (selectedId) {
        try {
          const detail = await fetchJson(`/api/result-tables/${selectedId}`);
          setSelectedTable(detail.item || null);
        } catch {
          setSelectedTable(null);
        }
      } else {
        setSelectedTable(null);
      }
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت داده‌های جدول نتیجه ناموفق بود.'), 'error');
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateChange = (event) => {
    const { name, value } = event.target;
    setGenerateForm((current) => ({ ...current, [name]: value }));
  };

  const handleConfigChange = (event) => {
    const { name, value } = event.target;
    setConfigForm((current) => ({ ...current, [name]: value }));
  };

  const inspectTable = async (tableId) => {
    try {
      setBusyAction(`inspect:${tableId}`);
      const data = await fetchJson(`/api/result-tables/${tableId}`);
      setSelectedTable(data.item || null);
    } catch (error) {
      showMessage(errorMessage(error, 'بارگذاری جزئیات جدول ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const generateTable = async () => {
    try {
      setBusyAction('generate');
      const payload = {
        templateId: generateForm.templateId,
        configId: generateForm.configId,
        sessionId: generateForm.sessionId,
        note: generateForm.note
      };
      const data = await postJson('/api/result-tables/generate', payload);
      setSelectedTable(data.item || null);
      showMessage('جدول نتیجه تولید شد.');
      await loadAll({ tableId: data.item?.id || '' });
    } catch (error) {
      showMessage(errorMessage(error, 'تولید جدول نتیجه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const publishTable = async (table) => {
    try {
      setBusyAction(`publish:${table.id}`);
      const data = await postJson(`/api/result-tables/${table.id}/publish`, {});
      setSelectedTable(data.item || null);
      showMessage('جدول نتیجه publish شد.');
      await loadAll({ tableId: table.id });
    } catch (error) {
      showMessage(errorMessage(error, 'publish جدول نتیجه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const createConfig = async () => {
    try {
      setBusyAction('config');
      if (!configForm.name.trim()) {
        throw new Error('نام config الزامی است.');
      }
      const data = await postJson('/api/result-tables/configs', configForm);
      showMessage('config جدید ذخیره شد.');
      setConfigForm(EMPTY_CONFIG_FORM);
      setGenerateForm((current) => ({ ...current, configId: data.item?.id || current.configId }));
      await loadAll({ tableId: selectedTable?.id || '' });
    } catch (error) {
      showMessage(errorMessage(error, 'ذخیره config ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="admin-workspace-page">
      <div className="admin-workspace-shell">
        <section className="admin-workspace-hero">
          <div className="admin-workspace-badges">
            <span className="admin-workspace-badge">Phase 5</span>
            <span className="admin-workspace-badge info">Generate / Publish</span>
          </div>
          <h1>موتور جدول نتایج</h1>
          <p>Template، config، preview rowها و publish رسمی جدول‌ها از همین صفحه مدیریت می‌شود و snapshot rowها بعد از generate ثابت می‌مانند.</p>
          <div className="admin-workspace-meta">
            <span>Templateها: {formatNumber(templates.length)}</span>
            <span>Configها: {formatNumber(configs.length)}</span>
            <span>جدول‌ها: {formatNumber(tables.length)}</span>
          </div>
        </section>

        {message && <div className={`admin-workspace-message ${messageTone === 'error' ? 'error' : ''}`}>{message}</div>}

        <section className="admin-workspace-grid">
          <article className="admin-workspace-card" data-span="5">
            <h2>تولید جدول</h2>
            <p className="admin-workspace-subtitle">یک template و config انتخاب کن، سپس برای یک exam session جدول نتیجه بساز.</p>
            <div className="admin-workspace-form">
              <div className="admin-workspace-form-grid">
                <div className="admin-workspace-field">
                  <label htmlFor="result-template">Template</label>
                  <select id="result-template" name="templateId" value={generateForm.templateId} onChange={handleGenerateChange}>
                    <option value="">انتخاب template</option>
                    {templates.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="result-config">Config</label>
                  <select id="result-config" name="configId" value={generateForm.configId} onChange={handleGenerateChange}>
                    <option value="">پیش‌فرض سیستم</option>
                    {configs.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="result-session">Session</label>
                  <select id="result-session" name="sessionId" value={generateForm.sessionId} onChange={handleGenerateChange}>
                    <option value="">انتخاب session</option>
                    {sessions.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="result-note">یادداشت</label>
                  <input id="result-note" name="note" value={generateForm.note} onChange={handleGenerateChange} placeholder="یادداشت اختیاری" />
                </div>
              </div>
              <div className="admin-workspace-actions">
                <button type="button" className="admin-workspace-button-ghost" onClick={() => loadAll()} disabled={!!busyAction}>بازخوانی</button>
                <button type="button" className="admin-workspace-button" onClick={generateTable} disabled={busyAction === 'generate' || !generateForm.templateId}>generate</button>
              </div>
            </div>
          </article>

          <article className="admin-workspace-card" data-span="7">
            <h2>ثبت config جدید</h2>
            <p className="admin-workspace-subtitle">برای چاپ‌های رسمی می‌توانی config مستقل با header، footer و orientation جدا بسازی.</p>
            <div className="admin-workspace-form">
              <div className="admin-workspace-form-grid">
                <div className="admin-workspace-field">
                  <label htmlFor="config-name">نام</label>
                  <input id="config-name" name="name" value={configForm.name} onChange={handleConfigChange} placeholder="مثال: Official Landscape" />
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="config-code">کد</label>
                  <input id="config-code" name="code" value={configForm.code} onChange={handleConfigChange} placeholder="OFFICIAL-LANDSCAPE" />
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="config-orientation">Orientation</label>
                  <select id="config-orientation" name="orientation" value={configForm.orientation} onChange={handleConfigChange}>
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="config-header">Header</label>
                  <input id="config-header" name="headerText" value={configForm.headerText} onChange={handleConfigChange} placeholder="متن هدر" />
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="config-footer">Footer</label>
                  <input id="config-footer" name="footerText" value={configForm.footerText} onChange={handleConfigChange} placeholder="متن فوتر" />
                </div>
              </div>
              <div className="admin-workspace-actions">
                <button type="button" className="admin-workspace-button-secondary" onClick={createConfig} disabled={busyAction === 'config'}>ذخیره config</button>
              </div>
            </div>
          </article>

          <article className="admin-workspace-card" data-span="5">
            <h2>جزئیات جدول</h2>
            <p className="admin-workspace-subtitle">جزئیات جدول انتخاب‌شده، تعداد row، و preview اولیهٔ snapshotها در اینجا دیده می‌شود.</p>
            {selectedTable ? (
              <div className="admin-workspace-form">
                <div className="admin-workspace-badges">
                  <span className={`admin-workspace-badge ${tableStatusBadge(selectedTable.status)}`}>{selectedTable.status || '---'}</span>
                  <span className="admin-workspace-badge info">{selectedTable.templateType || 'template'}</span>
                </div>
                <div className="admin-workspace-meta">
                  <span>عنوان: {selectedTable.title || '---'}</span>
                  <span>کد: {selectedTable.code || '---'}</span>
                </div>
                <div className="admin-workspace-meta">
                  <span>Rows: {formatNumber(selectedTable.rowCount)}</span>
                  <span>Generated: {toLocaleDateTime(selectedTable.generatedAt)}</span>
                  <span>Published: {toLocaleDateTime(selectedTable.publishedAt)}</span>
                </div>
                {selectedTable.status !== 'published' && (
                  <div className="admin-workspace-inline-actions">
                    <button
                      type="button"
                      className="admin-workspace-button-secondary"
                      onClick={() => publishTable(selectedTable)}
                      disabled={busyAction === `publish:${selectedTable.id}`}
                    >
                      publish
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="admin-workspace-empty">هنوز جدولی انتخاب نشده است.</div>
            )}
          </article>

          <article className="admin-workspace-card" data-span="7">
            <h2>Preview rowها</h2>
            {previewRows.length ? (
              <div className="admin-workspace-table-wrap">
                <table className="admin-workspace-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Display</th>
                      <th>وضعیت</th>
                      <th>فیصدی</th>
                      <th>Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.serialNo || '---'}</td>
                        <td>{row.displayName || '---'}</td>
                        <td>{row.resultStatus || row.rowType || '---'}</td>
                        <td>{row.percentage ?? '---'}</td>
                        <td>{row.rank ?? '---'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-workspace-empty">برای جدول انتخاب‌شده preview row موجود نیست.</div>
            )}
          </article>

          <article className="admin-workspace-card">
            <h2>فهرست جدول‌ها</h2>
            <div className="admin-workspace-table-wrap">
              <table className="admin-workspace-table">
                <thead>
                  <tr>
                    <th>عنوان</th>
                    <th>Template</th>
                    <th>Rows</th>
                    <th>وضعیت</th>
                    <th>Generated</th>
                    <th>اقدام</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.length ? tables.map((table) => (
                    <tr key={table.id}>
                      <td>{table.title || '---'}</td>
                      <td>{table.templateType || table.template?.title || '---'}</td>
                      <td>{formatNumber(table.rowCount)}</td>
                      <td><span className={`admin-workspace-badge ${tableStatusBadge(table.status)}`}>{table.status || '---'}</span></td>
                      <td>{toLocaleDateTime(table.generatedAt)}</td>
                      <td>
                        <div className="admin-workspace-inline-actions">
                          <button
                            type="button"
                            className="admin-workspace-button-ghost"
                            onClick={() => inspectTable(table.id)}
                            disabled={busyAction === `inspect:${table.id}`}
                          >
                            preview
                          </button>
                          {table.status !== 'published' && (
                            <button
                              type="button"
                              className="admin-workspace-button-secondary"
                              onClick={() => publishTable(table)}
                              disabled={busyAction === `publish:${table.id}`}
                            >
                              publish
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="6">
                        <div className="admin-workspace-empty">هنوز جدولی تولید نشده است.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}