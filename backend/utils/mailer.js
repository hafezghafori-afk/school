const nodemailer = require('nodemailer');

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const connectionTimeout = Math.max(1000, Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 5000);
  const greetingTimeout = Math.max(1000, Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 5000);
  const socketTimeout = Math.max(1000, Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 10000);
  const port = Number(SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    // 465 is implicit TLS; 587/25 upgrade with STARTTLS. Forcing `false` on 465
    // made nodemailer speak plain text to a TLS port and every send timed out.
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout,
    greetingTimeout,
    socketTimeout
  });
}

async function sendMail({ to, subject, text, html }) {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, message: 'SMTP تنظیم نشده است' };
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transport.sendMail({ from, to, subject, text, html });
  return { ok: true };
}

module.exports = { sendMail };
