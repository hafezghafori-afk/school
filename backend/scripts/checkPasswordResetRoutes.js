const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const express = require('express');
const bcrypt = require('bcryptjs');

// The forgot-password route used to answer «لینک بازیابی ... ارسال شد» without
// ever creating a token or sending an email. These cases pin the real flow:
// a hashed single-use token, a mail to the account's own address, honest
// failures, and a link that never follows a forged Origin header.

delete process.env.PUBLIC_APP_URL;
delete process.env.CORS_ORIGIN;

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const users = [
  { _id: 'u-staff', name: 'مریم احمدی', email: 'maryam@example-school.af', role: 'instructor', password: 'old-hash' },
  { _id: 'u-staff-2', name: 'زهرا', email: 'zahra@example-school.af', role: 'admin', password: 'old-hash' },
  { _id: 'u-staff-3', name: 'فاطمه', email: 'fatima@example-school.af', role: 'admin', password: 'old-hash' },
  { _id: 'u-student', name: 'شاگرد', email: 'pupil@example-school.af', role: 'student', password: 'old-hash' },
  { _id: 'u-synthetic', name: 'حسینه', email: 'teacher.6aa29440435da82ba5d3e75d@imangirlsschool.local', role: 'instructor', password: 'old-hash' },
  { _id: 'u-demo', name: 'Demo Admin', email: 'demo.admin@school.local', role: 'admin', password: 'old-hash', isDemo: true }
];

const userMock = {
  async findOne({ email }) {
    return users.find((user) => user.email === email) || null;
  },
  async updateOne({ _id }, update) {
    const user = users.find((item) => item._id === _id);
    if (!user) return { matchedCount: 0 };
    Object.assign(user, update.$set || {});
    return { matchedCount: 1 };
  }
};

let tokens = [];
let nextTokenId = 1;
const matches = (row, filter = {}) => Object.entries(filter).every(([key, expected]) => {
  const actual = row[key];
  if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
    if ('$gt' in expected) return actual instanceof Date && actual > expected.$gt;
    return false;
  }
  return actual === expected;
});

const tokenMock = {
  async findOne(filter) {
    return tokens.find((row) => matches(row, filter)) || null;
  },
  async deleteMany(filter) {
    tokens = tokens.filter((row) => !matches(row, filter));
  },
  async deleteOne({ _id }) {
    tokens = tokens.filter((row) => row._id !== _id);
  },
  async create(doc) {
    const row = { _id: `t-${nextTokenId++}`, consumedAt: null, createdAt: new Date(), ...doc };
    tokens.push(row);
    return row;
  },
  async findOneAndUpdate(filter, update) {
    const row = tokens.find((item) => matches(item, filter));
    if (!row) return null;
    Object.assign(row, update.$set || {});
    return row;
  }
};

const sentMail = [];
let mailMode = 'ok';
const mailerMock = {
  async sendMail(message) {
    if (mailMode === 'throw') throw new Error('connect ETIMEDOUT');
    if (mailMode === 'fail') return { ok: false, message: 'SMTP تنظیم نشده است' };
    sentMail.push(message);
    return { ok: true };
  }
};

function loadRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'authRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    if (parentFile.endsWith('/routes/authRoutes.js')) {
      if (request === '../models/User') return userMock;
      if (request === '../models/PasswordResetToken') return tokenMock;
      if (request === '../models/AfghanSchool') return {};
      if (request === '../models/AuthOtpChallenge') return {};
      if (request === '../utils/mailer') return mailerMock;
      if (request === '../utils/activity') return { logActivity: async () => {} };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve(routePath)];
    return require(routePath);
  } finally {
    Module._load = originalLoad;
  }
}

function assertCase(condition, message) {
  if (!condition) throw new Error(message);
}

async function createServer(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function post(server, targetPath, body, headers = {}) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${targetPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

const tokenFromMail = (mail) => {
  const match = String(mail?.text || '').match(/reset-password\?token=([a-f0-9]{64})/);
  return match ? match[1] : '';
};

async function run() {
  const originalConsole = { log: console.log, error: console.error, warn: console.warn };
  const server = await createServer(loadRouter());
  const site = { origin: 'https://www.imangirlschool.com' };

  try {
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};

    const unknown = await post(server, '/api/auth/forgot-password', { email: 'nobody@example-school.af' }, site);
    assertCase(unknown.status === 200 && unknown.data?.success === true, 'Unknown email must get the same neutral success answer.');
    assertCase(sentMail.length === 0, 'Unknown email must not send mail.');

    const demo = await post(server, '/api/auth/forgot-password', { email: 'demo.admin@school.local' }, site);
    assertCase(demo.status === 200 && sentMail.length === 0, 'Demo accounts must never get a reset mail.');

    const student = await post(server, '/api/auth/forgot-password', { email: 'pupil@example-school.af' }, site);
    assertCase(student.status === 403, `Students keep the «go to administration» answer, got ${student.status}.`);

    const synthetic = await post(server, '/api/auth/forgot-password', { email: 'teacher.6aa29440435da82ba5d3e75d@imangirlsschool.local' }, site);
    assertCase(synthetic.status === 422 && synthetic.data?.success === false, `Placeholder mailbox must be refused honestly, got ${synthetic.status}.`);
    assertCase(sentMail.length === 0 && tokens.length === 0, 'Placeholder mailbox must not create a token or send mail.');

    const sent = await post(server, '/api/auth/forgot-password', { email: '  Maryam@Example-School.af ' }, site);
    assertCase(sent.status === 200 && sent.data?.success === true, `Staff reset request should succeed, got ${sent.status}.`);
    assertCase(sentMail.length === 1 && sentMail[0].to === 'maryam@example-school.af', 'Reset mail must go to the account address.');
    const token = tokenFromMail(sentMail[0]);
    assertCase(token, 'Reset mail must carry a 64-hex token link.');
    assertCase(String(sentMail[0].text).includes('https://www.imangirlschool.com/reset-password?token='), 'Link must point at the requesting allowed frontend.');
    assertCase(tokens.length === 1 && tokens[0].tokenHash === sha256(token) && !JSON.stringify(tokens).includes(token), 'Only the token hash may be stored.');
    assertCase(tokens[0].expiresAt > new Date(), 'Token must carry a future expiry.');

    const repeat = await post(server, '/api/auth/forgot-password', { email: 'maryam@example-school.af' }, site);
    assertCase(repeat.status === 200 && sentMail.length === 1 && tokens.length === 1, 'A repeat inside the cooldown must not mail a second link.');

    const forged = await post(server, '/api/auth/forgot-password', { email: 'zahra@example-school.af' }, { origin: 'https://evil.example' });
    assertCase(forged.status === 200 && sentMail.length === 2, 'Forged-origin request still mails the real owner.');
    assertCase(String(sentMail[1].text).includes('https://www.imangirlschool.com/reset-password?token=') && !String(sentMail[1].text).includes('evil.example'), 'A forged Origin must never become the link host.');

    mailMode = 'fail';
    const unsent = await post(server, '/api/auth/forgot-password', { email: 'fatima@example-school.af' }, site);
    assertCase(unsent.status === 424 && unsent.data?.success === false, `Unsendable mail must be reported, not claimed as sent (got ${unsent.status}).`);
    assertCase(!tokens.some((row) => row.user === 'u-staff-3'), 'A token whose mail failed must be removed.');

    mailMode = 'throw';
    const thrown = await post(server, '/api/auth/forgot-password', { email: 'fatima@example-school.af' }, site);
    assertCase(thrown.status === 424, `An SMTP exception must be reported as unsent mail, got ${thrown.status}.`);
    mailMode = 'ok';

    const badFormat = await post(server, '/api/auth/reset-password', { token: 'abc', password: 'newpass1' });
    assertCase(badFormat.status === 400, 'Malformed token must be refused.');

    const shortPassword = await post(server, '/api/auth/reset-password', { token, password: '123' });
    assertCase(shortPassword.status === 400, 'Short password must be refused.');
    assertCase(tokens.find((row) => row.tokenHash === sha256(token))?.consumedAt === null, 'A refused password must not burn the link.');

    const reset = await post(server, '/api/auth/reset-password', { token, password: 'new-pass-77' });
    assertCase(reset.status === 200 && reset.data?.success === true, `Valid reset should succeed, got ${reset.status}.`);
    const maryam = users.find((user) => user._id === 'u-staff');
    assertCase(await bcrypt.compare('new-pass-77', maryam.password), 'New password must be stored as a bcrypt hash.');

    const reused = await post(server, '/api/auth/reset-password', { token, password: 'another-pass' });
    assertCase(reused.status === 400, 'A used link must not work twice.');
    assertCase(await bcrypt.compare('new-pass-77', maryam.password), 'A reused link must not change the password.');

    const zahraToken = tokenFromMail(sentMail[1]);
    tokens.find((row) => row.tokenHash === sha256(zahraToken)).expiresAt = new Date(Date.now() - 1000);
    const expired = await post(server, '/api/auth/reset-password', { token: zahraToken, password: 'new-pass-88' });
    assertCase(expired.status === 400, 'An expired link must be refused.');
    assertCase(users.find((user) => user._id === 'u-staff-2').password === 'old-hash', 'An expired link must not change the password.');

    Object.assign(console, originalConsole);
    console.log('check:password-reset-routes PASS');
  } finally {
    Object.assign(console, originalConsole);
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('check:password-reset-routes FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
