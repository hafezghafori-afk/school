import React from 'react';
import './AppErrorBoundary.css';

// Without a boundary, one thrown render error blanks the whole app to a white
// screen with no text — the single worst version of "the database is broken",
// because there is nothing at all to read or press. This catches it and leaves
// the user something to do.

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the stack in the console for whoever is debugging the report.
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // A crash belongs to the view that caused it; navigating away must clear it,
    // otherwise the error card follows the user around the whole app.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app-error-boundary" role="alert">
        <div className="app-error-card">
          <span className="app-error-icon" aria-hidden="true">⚠️</span>
          <h2>این بخش باز نشد</h2>
          <p>
            در نمایش این صفحه خطایی رخ داد. اطلاعات شما در دیتابیس محفوظ است و چیزی
            از بین نرفته است.
          </p>
          <div className="app-error-actions">
            <button
              type="button"
              className="app-error-button"
              onClick={() => this.setState({ error: null })}
            >
              تلاشِ دوباره
            </button>
            <button
              type="button"
              className="app-error-button is-ghost"
              onClick={() => window.location.reload()}
            >
              بارگذاری دوبارهٔ صفحه
            </button>
            <a className="app-error-button is-ghost" href="/">بازگشت به خانه</a>
          </div>
          <details className="app-error-details">
            <summary>جزئیات فنی (برای گزارش به پشتیبانی)</summary>
            <pre>{String(error?.message || error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
