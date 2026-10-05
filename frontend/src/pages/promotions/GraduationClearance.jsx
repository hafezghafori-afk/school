import React, { useCallback, useEffect, useState } from 'react';
import { errorMessage, fetchJson, formatNumber } from '../adminWorkspaceUtils';
import { formatStudentDisplayLabel } from '../../utils/studentSearch';
import { formatAmount } from './promotionLabels';

// «تصفیه حساب فارغ‌ها»: what each graduate of the batch still owes the school
// right now, over their whole account, so the finance office can clear them
// before certificates and documents are handed over.

export default function GraduationClearance({ batchId, onPrint }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchJson(`/api/promotions/batches/${batchId}/clearance`);
      setData(response);
    } catch (loadError) {
      setError(errorMessage(loadError, 'دریافت تصفیه حساب فارغ‌ها ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <div className="admin-workspace-empty">در حال بارگذاری تصفیه حساب...</div>;
  if (error) return <div className="admin-workspace-message error">{error}</div>;
  if (!data?.students?.length) return null;

  const { summary } = data;
  return (
    <div className="promotion-clearance" data-testid="promotion-clearance">
      <div className="promotion-clearance-head">
        <strong>تصفیه حساب فارغ‌ها</strong>
        <div className="promotion-chips">
          <span className="admin-workspace-badge info">فارغ: {formatNumber(summary.graduates)}</span>
          <span className="admin-workspace-badge good">تصفیه‌شده: {formatNumber(summary.cleared)}</span>
          <span className={`admin-workspace-badge ${summary.withDebt ? 'danger' : 'muted'}`}>بدهکار: {formatNumber(summary.withDebt)}</span>
          {summary.debtAmount ? <span className="admin-workspace-badge danger">مجموع باقی: {formatAmount(summary.debtAmount)}</span> : null}
        </div>
        <div className="admin-workspace-inline-actions">
          <button type="button" className="admin-workspace-button-ghost" onClick={load} disabled={loading}>تازه‌سازی</button>
          <button type="button" className="admin-workspace-button-ghost" onClick={() => onPrint?.(data)}>چاپ تصفیه حساب</button>
        </div>
      </div>
      <div className="admin-workspace-table-wrap">
        <table className="admin-workspace-table">
          <thead>
            <tr>
              <th>شاگرد</th>
              <th>مجموع بل‌ها</th>
              <th>پرداخت‌شده</th>
              <th>باقی</th>
              <th>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((entry, index) => (
              <tr key={entry.transactionId}>
                <td data-label="شاگرد">{formatStudentDisplayLabel({ fullName: entry.student?.fullName, asasNumber: entry.student?.asasNumber || entry.student?.admissionNo }, { index: index + 1 })}</td>
                <td data-label="مجموع بل‌ها">{formatAmount(entry.totalDue)}</td>
                <td data-label="پرداخت‌شده">{formatAmount(entry.totalPaid)}</td>
                <td data-label="باقی">
                  {entry.outstanding > 0 ? <strong className="promotion-debt">{formatAmount(entry.outstanding)}</strong> : '—'}
                  {entry.openCount ? <small>{formatNumber(entry.openCount)} بل باز</small> : null}
                </td>
                <td data-label="وضعیت">
                  <span className={`admin-workspace-badge ${entry.cleared ? 'good' : 'danger'}`}>{entry.cleared ? 'تصفیه شده' : 'بدهکار'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
