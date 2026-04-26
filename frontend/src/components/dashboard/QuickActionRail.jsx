import React from 'react';
import { Link } from 'react-router-dom';

export default function QuickActionRail({ actions = [], className = '' }) {
  return (
    <div className={['dashboard-quick-rail', className].filter(Boolean).join(' ')}>
      {actions.map((action) => (
        <Link
          key={action.to}
          to={action.to}
          className="dashboard-quick-link"
          data-tone={action.tone || 'teal'}
        >
          <strong>{action.label}</strong>
          {action.caption ? <span>{action.caption}</span> : null}
        </Link>
      ))}
    </div>
  );
}
