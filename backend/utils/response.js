function ok(res, data = {}, message = 'OK') {
  return res.json({ success: true, message, ...data });
}

function fail(res, message = 'خطا', status = 400) {
  return res.status(status).json({ success: false, message });
}

module.exports = { ok, fail };
