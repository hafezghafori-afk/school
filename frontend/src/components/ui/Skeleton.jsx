import React from 'react';
import './Skeleton.css';

// Placeholder shapes shown while data loads. A skeleton beats a bare spinner
// here because it says "this page has a table and it is coming" instead of
// leaving the user to wonder whether anything is happening at all.

export function Skeleton({ width, height, radius, className = '', style = {} }) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

export function SkeletonText({ lines = 3, width = '100%' }) {
  return (
    <span className="skeleton-text" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height="0.85rem"
          // A slightly short last line reads as a paragraph rather than a block.
          width={index === lines - 1 ? '62%' : width}
        />
      ))}
    </span>
  );
}

export function SkeletonTable({ rows = 6, columns = 5 }) {
  return (
    <div className="skeleton-table" aria-hidden="true">
      <div className="skeleton-table-head">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} height="0.8rem" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div className="skeleton-table-row" key={rowIndex}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} height="0.75rem" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }) {
  return (
    <div className="skeleton-cards" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div className="skeleton-card" key={index}>
          <Skeleton height="1.4rem" width="45%" />
          <Skeleton height="2.1rem" width="70%" />
          <Skeleton height="0.7rem" width="88%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ count = 5 }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div className="skeleton-list-row" key={index}>
          <Skeleton width="42px" height="42px" radius="50%" />
          <span className="skeleton-list-body">
            <Skeleton height="0.85rem" width="38%" />
            <Skeleton height="0.7rem" width="66%" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function SkeletonForm({ fields = 4 }) {
  return (
    <div className="skeleton-form" aria-hidden="true">
      {Array.from({ length: fields }).map((_, index) => (
        <span className="skeleton-form-field" key={index}>
          <Skeleton height="0.7rem" width="30%" />
          <Skeleton height="2.4rem" />
        </span>
      ))}
    </div>
  );
}

const VARIANTS = {
  text: SkeletonText,
  table: SkeletonTable,
  cards: SkeletonCards,
  list: SkeletonList,
  form: SkeletonForm
};

/** Pick a skeleton shape by name, so DataState can take `skeleton="table"`. */
export function SkeletonBlock({ variant = 'text', ...props }) {
  const Component = VARIANTS[variant] || SkeletonText;
  return <Component {...props} />;
}

export default Skeleton;
