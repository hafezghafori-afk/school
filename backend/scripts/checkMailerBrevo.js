const assert = require('assert/strict');
const path = require('path');

// Render's free plan blocks SMTP ports, so production mail goes through
// Brevo's HTTPS API whenever BREVO_API_KEY is set. These cases pin the request
// Brevo receives and keep the failure contract the callers rely on:
// missing settings → { ok: false }, a refused send → throw.

const MAIL_ENV = ['BREVO_API_KEY', 'MAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
const mailerPath = path.join(__dirname, '..', 'utils', 'mailer.js');
const originalFetch = global.fetch;

const withEnv = (values) => {
  for (const key of MAIL_ENV) delete process.env[key];
  Object.assign(process.env, values);
};

const loadMailer = () => {
  delete require.cache[require.resolve(mailerPath)];
  return require(mailerPath);
};

let calls = [];
let nextResponse = null;
global.fetch = async (url, init) => {
  calls.push({ url, init, body: JSON.parse(init.body) });
  if (typeof nextResponse === 'function') return nextResponse(init);
  return nextResponse || { ok: true, status: 201, json: async () => ({ messageId: '<m1@brevo>' }) };
};

const message = { to: 'maryam@example-school.af', subject: 'بازیابی رمز عبور', text: 'متن', html: '<p>متن</p>' };

async function run() {
  const { parseAddress } = loadMailer();
  assert.deepEqual(parseAddress('مکتب دخترانه ایمان <school@example.org>'), { email: 'school@example.org', name: 'مکتب دخترانه ایمان' });
  assert.deepEqual(parseAddress('"School" <school@example.org>'), { email: 'school@example.org', name: 'School' });
  assert.deepEqual(parseAddress(' school@example.org '), { email: 'school@example.org' });
  assert.equal(parseAddress(''), null);

  // Brevo path: header, endpoint, sender, recipients and both bodies.
  withEnv({ BREVO_API_KEY: ' xkeysib-test ', MAIL_FROM: 'مکتب دخترانه ایمان <school@example.org>', SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'x@gmail.com', SMTP_PASS: 'p' });
  calls = [];
  const sent = await loadMailer().sendMail(message);
  assert.deepEqual(sent, { ok: true });
  assert.equal(calls.length, 1, 'Brevo must win over SMTP when its key is set.');
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['api-key'], 'xkeysib-test', 'API key must be sent trimmed in the api-key header.');
  assert.deepEqual(calls[0].body.sender, { email: 'school@example.org', name: 'مکتب دخترانه ایمان' });
  assert.deepEqual(calls[0].body.to, [{ email: 'maryam@example-school.af' }]);
  assert.equal(calls[0].body.subject, message.subject);
  assert.equal(calls[0].body.htmlContent, message.html);
  assert.equal(calls[0].body.textContent, message.text);

  // Comma-joined recipient lists (contact inbox) become separate entries.
  calls = [];
  await loadMailer().sendMail({ ...message, to: 'a@example.org, b@example.org' });
  assert.deepEqual(calls[0].body.to, [{ email: 'a@example.org' }, { email: 'b@example.org' }]);

  // Sender falls back to SMTP_FROM so an existing Render setup keeps working.
  withEnv({ BREVO_API_KEY: 'xkeysib-test', SMTP_FROM: 'school@example.org' });
  calls = [];
  await loadMailer().sendMail(message);
  assert.deepEqual(calls[0].body.sender, { email: 'school@example.org' });

  // Missing sender is a configuration gap, not a thrown error.
  withEnv({ BREVO_API_KEY: 'xkeysib-test' });
  calls = [];
  const noSender = await loadMailer().sendMail(message);
  assert.equal(noSender.ok, false);
  assert.equal(calls.length, 0, 'No request may be made without a sender.');

  // A refused send throws with Brevo's own reason, so the log names the fix.
  withEnv({ BREVO_API_KEY: 'xkeysib-test', MAIL_FROM: 'school@example.org' });
  nextResponse = { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ code: 'unauthorized', message: 'unauthorized: IP not authorized' }) };
  await assert.rejects(() => loadMailer().sendMail(message), /Brevo 401: unauthorized: IP not authorized/);

  // A hung request is cut off and reported as a timeout.
  nextResponse = (init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => originalSetTimeout(fn, 5);
  try {
    await assert.rejects(() => loadMailer().sendMail(message), /Brevo timeout/);
  } finally {
    global.setTimeout = originalSetTimeout;
    nextResponse = null;
  }

  // Without a Brevo key and without SMTP: unchanged "not configured" answer.
  withEnv({});
  calls = [];
  const unset = await loadMailer().sendMail(message);
  assert.deepEqual(unset, { ok: false, message: 'SMTP تنظیم نشده است' });
  assert.equal(calls.length, 0);

  console.log('check:mailer-brevo PASS');
}

run()
  .catch((error) => {
    console.error('check:mailer-brevo FAIL');
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
  });
