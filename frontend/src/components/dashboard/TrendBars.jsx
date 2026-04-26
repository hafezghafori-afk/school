import React from 'react';

const toNumber = (value) => Number(value || 0) || 0;

export default function TrendBars({
  title,
  subtitle = '',
  items = [],
  valueKey = 'value',
  valueFormatter = (value) => String(value),
  emptyText = 'داده‌ای برای نمایش وجود ندارد.'
}) {
  const maxValue = Math.max(1, ...items.map((item) => toNumber(item?.[valueKey])));

  return (
    <div className="dashboard-trend-panel">
      <div className="dashboard-task-panel__head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
      </div>
      {!items.length ? (
        <div className="dash-note">{emptyText}</div>
      ) : (
        <div className="dashboard-trend-panel__bars">
          {items.map((item) => (
            <div key={item.id || item.key || item.label} className="dashboard-trend-panel__row">
              <div className="dashboard-trend-panel__copy">
                <strong>{item.label}</strong>
                <span>{valueFormatter(item[valueKey])}</span>
              </div>
              <div className="dashboard-trend-panel__track">
                <span
                  className="dashboard-trend-panel__fill"
                  style={{ width: `${Math.max(8, (toNumber(item[valueKey]) / maxValue) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
