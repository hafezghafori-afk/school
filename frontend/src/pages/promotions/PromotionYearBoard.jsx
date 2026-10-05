import React from 'react';
import { formatNumber } from '../adminWorkspaceUtils';
import { formatAfghanDate } from '../../utils/afghanDate';
import { classLabel } from './promotionLabels';

// Every class of the source year at a glance - who still has current
// students to promote, who was promoted (and when), who has conditional
// students waiting for the second chance - so nothing is forgotten at year end.

function boardStatus(row) {
  const batch = row.latestBatch;
  if (!batch || batch.status === 'rolled_back') {
    if (!row.currentStudents) return { label: 'بدون شاگرد جاری', tone: 'info' };
    return { label: batch ? 'بازگردانی شد؛ دوباره ارتقا دهید' : 'ارتقا نشده', tone: '' };
  }
  if (row.currentStudents > row.heldCount) return { label: 'بخشی ارتقا یافته', tone: 'info' };
  return { label: 'ارتقا یافته', tone: 'good' };
}

export default function PromotionYearBoard({ board, loading, selectedClassId, onSelect }) {
  if (loading) {
    return <div className="admin-workspace-empty">در حال بارگذاری صنف‌های این سال...</div>;
  }
  if (!board?.classes?.length) {
    return <div className="admin-workspace-empty">در این سال تعلیمی صنفی ثبت نشده است.</div>;
  }
  return (
    <div className="promotion-board" role="list" aria-label="صنف‌های سال مبدا">
      {board.classes.map((row) => {
        const status = boardStatus(row);
        const selected = row.schoolClass.id === selectedClassId;
        return (
          <button
            type="button"
            role="listitem"
            key={row.schoolClass.id}
            className={`promotion-board-item ${selected ? 'is-selected' : ''}`}
            aria-pressed={selected}
            onClick={() => onSelect(row.schoolClass.id)}
            data-testid={`promotion-board-class-${row.schoolClass.id}`}
          >
            <strong>{classLabel(row.schoolClass)}</strong>
            <span className="promotion-board-count">{formatNumber(row.currentStudents)} شاگرد جاری</span>
            <span className={`admin-workspace-badge ${status.tone}`}>{status.label}</span>
            {row.isTerminal ? <small>صنف دوازدهم — فارغ‌التحصیلی</small> : null}
            {row.heldCount ? <small>{formatNumber(row.heldCount)} مشروط در انتظار چانس دوم</small> : null}
            {row.latestBatch && row.latestBatch.status !== 'rolled_back' ? (
              <small>
                آخرین ارتقا: {formatAfghanDate(row.latestBatch.appliedAt, { year: 'numeric', month: 'long', day: 'numeric' }) || '---'}
              </small>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
