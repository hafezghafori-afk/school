const mongoose = require('mongoose');

const READY_STATES = Object.freeze({
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
});

// Mongoose reports "connected" the moment the TCP/auth handshake finishes -
// well before server.js's own post-connect boot sequence (index repairs,
// reference-data seeding, the finance bill payment mirror repair) has run.
// requireDatabase used to gate on readyState alone, so on a busy production
// deploy real requests were already being served - and served slowly,
// competing with the boot sequence for the same connection - before that
// sequence (including a self-heal touching hundreds of financial records)
// had finished. appReady tracks the *whole* boot sequence, not just the DB
// handshake; server.js calls markAppReady() once every startup step
// resolves.
let appReady = false;

function markAppReady() {
  appReady = true;
}

function isAppReady() {
  return appReady;
}

function getDatabaseStatus() {
  const { readyState, host, name } = mongoose.connection;

  return {
    connected: readyState === 1,
    readyState,
    state: READY_STATES[readyState] || 'unknown',
    host: host || null,
    name: name || null
  };
}

function requireDatabase(req, res, next) {
  const status = getDatabaseStatus();
  if (!status.connected) {
    return res.status(503).json({
      message: 'سرویس دیتابیس در دسترس نیست',
      database: status
    });
  }
  if (!appReady) {
    return res.status(503).json({
      message: 'سرور در حال آماده‌سازی نهایی است؛ چند لحظه دیگر دوباره تلاش کنید.',
      database: status,
      starting: true
    });
  }
  return next();
}

module.exports = {
  getDatabaseStatus,
  requireDatabase,
  markAppReady,
  isAppReady
};
