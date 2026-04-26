const mongoose = require('mongoose');

const READY_STATES = Object.freeze({
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
});

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
  if (status.connected) return next();

  return res.status(503).json({
    message: 'سرویس دیتابیس در دسترس نیست',
    database: status
  });
}

module.exports = {
  getDatabaseStatus,
  requireDatabase
};
