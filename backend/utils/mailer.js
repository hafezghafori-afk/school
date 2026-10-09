const nodemailer = require('nodemailer');

// Render's free web services block outbound SMTP (ports 25/465/587), so on
// Render mail has to leave over HTTPS. With BREVO_API_KEY set, every sendMail
// goes through Brevo's transactional API; without it, SMTP is used as before.
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 10000;

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

// "مکتب ایمان <info@example.com>" → { name: 'مکتب ایمان', email: 'info@example.com' }
function parseAddress(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(.*)<\s*([^<>\s]+@[^<>\s]+)\s*>$/);
  if (!match) return { email: raw };
  const name = match[1].trim().replace(/^"(.*)"$/, '$1').trim();
  return name ? { email: match[2], name } : { email: match[2] };
}

const parseRecipients = (to) => (Array.isArray(to) ? to : String(to || '').split(','))
  .map((item) => parseAddress(item))
  .filter((item) => item?.email);

const getFromAddress = () => process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '';

// Mirrors the SMTP path: a missing setting answers { ok: false }, while a
// configured provider that refuses the mail throws, as nodemailer does.
async function sendViaBrevo({ to, subject, text, html }) {
  const sender = parseAddress(getFromAddress());
  if (!sender?.email) return { ok: false, message: 'MAIL_FROM برای Brevo تنظیم نشده است' };
  const recipients = parseRecipients(to);
  if (!recipients.length) return { ok: false, message: 'گیرندهٔ ایمیل مشخص نیست' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BREVO_TIMEOUT_MS);
  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': String(process.env.BREVO_API_KEY).trim(),
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender,
        to: recipients,
        subject,
        ...(html ? { htmlContent: html } : {}),
        ...(text ? { textContent: text } : {})
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      // e.g. "Brevo 401: unauthorized: IP not authorized" or "Brevo 400: sender is not valid"
      throw new Error(`Brevo ${response.status}: ${body?.message || body?.code || response.statusText}`);
    }
    return { ok: true };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Brevo timeout after ${BREVO_TIMEOUT_MS}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function sendMail({ to, subject, text, html }) {
  if (String(process.env.BREVO_API_KEY || '').trim()) {
    return sendViaBrevo({ to, subject, text, html });
  }
  const transport = getTransport();
  if (!transport) {
    return { ok: false, message: 'SMTP تنظیم نشده است' };
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transport.sendMail({ from, to, subject, text, html });
  return { ok: true };
}

module.exports = { sendMail, parseAddress };
