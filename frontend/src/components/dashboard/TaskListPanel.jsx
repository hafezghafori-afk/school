import React from 'react';
import { Link } from 'react-router-dom';

export default function TaskListPanel({
  title,
  subtitle = '',
  items = [],
  emptyText = 'موردی برای نمایش وجود ندارد.',
  actionLabel = '',
  actionTo = '',
  renderMeta,
  hideHead = false
}) {
  const hasHead = !hideHead && Boolean(title || subtitle || (actionLabel && actionTo));

  return (
    <div className="dashboard-task-panel">
      {hasHead ? (
        <div className="dashboard-task-panel__head">
          <div>
            {title ? <h3>{title}</h3> : null}
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          {actionLabel && actionTo ? <Link className="dash-mini-btn" to={actionTo}>{actionLabel}</Link> : null}
        </div>
      ) : null}
      {!items.length ? (
        <div className="dash-note">{emptyText}</div>
      ) : (
        <div className="dashboard-task-panel__list">
          {items.map((item) => (
            <div key={item.id || item.key || item.label} className="dashboard-task-panel__item">
              <div>
                <strong>{item.title}</strong>
                {item.subtitle ? <span>{item.subtitle}</span> : null}
              </div>
              {renderMeta ? renderMeta(item) : (item.meta ? <span>{item.meta}</span> : null)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
