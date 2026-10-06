import React, { useEffect, useRef } from 'react';

// One overlay for the page's drawer and its small dialogs: Escape and the
// backdrop both ask to close (the caller decides whether that is allowed),
// focus moves inside on open and returns to the opener on close.
export default function HomeworkDialog({
  open,
  title,
  subtitle = '',
  onRequestClose,
  variant = 'modal',
  footer = null,
  children,
  labelledBy = 'homework-dialog-title'
}) {
  const panelRef = useRef(null);
  // Escape must see the caller's latest close handler (the drawer's one
  // checks for unsaved edits), not the one from the render that opened it.
  const closeRef = useRef(onRequestClose);
  closeRef.current = onRequestClose;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const timer = setTimeout(() => {
      const target = panelRef.current?.querySelector('[data-autofocus]')
        || panelRef.current?.querySelector('input, textarea, select, button');
      target?.focus();
    }, 30);
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`hw-overlay hw-overlay--${variant}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onRequestClose?.();
      }}
    >
      <section
        ref={panelRef}
        className={`hw-dialog hw-dialog--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <header className="hw-dialog-head">
          <div>
            <h3 id={labelledBy}>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="hw-icon-btn" onClick={() => onRequestClose?.()} aria-label="بستن">
            <i className="fa fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="hw-dialog-body">{children}</div>
        {footer && <footer className="hw-dialog-foot">{footer}</footer>}
      </section>
    </div>
  );
}
