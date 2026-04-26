import React from 'react';

export default function DashboardShell({
  className = '',
  hero = null,
  stats = null,
  quickActions = null,
  main = null,
  side = null
}) {
  const classes = ['dash-page', className].filter(Boolean).join(' ');

  return (
    <section className={classes}>
      {hero}
      {stats ? <div className="dash-stats">{stats}</div> : null}
      {quickActions}
      {(main || side) ? (
        <div className="dash-layout">
          <div className="dash-grid">{main}</div>
          <aside className="dash-side">{side}</aside>
        </div>
      ) : null}
    </section>
  );
}
