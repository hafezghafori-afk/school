function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'خطای سرور';
  res.status(status).json({ message });
}

module.exports = errorHandler;
