import React from 'react';

function clampProgress(value) {
  const number = Number(value || 0);
  if (Number.isNaN(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

export default function KpiRingCard({
  label,
  value,
  hint = '',
  progress = 0,
  tone = 'teal',
  className = ''
}) {
  const normalizedProgress = clampProgress(progress);
  const classes = ['dashboard-kpi-card', className].filter(Boolean).join(' ');

  return (
    <article className={classes} data-tone={tone}>
      <div className="dashboard-kpi-card__ring" style={{ '--progress': `${normalizedProgress}%` }}>
        <strong>{Math.round(normalizedProgress)}%</strong>
      </div>
      <div className="dashboard-kpi-card__copy">
        <span>{label}</span>
        <h3>{value}</h3>
        {hint ? <small>{hint}</small> : null}
      </div>
    </article>
  );
}
