const express = require('express');

const assertCase = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function createServer() {
  const app = express();
  app.use(express.json());
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function request(server, targetPath, { method = 'GET', body } = {}) {
  const address = server.address();
  const headers = {};
  let payload;

  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch('http://127.0.0.1:' + address.port + targetPath, {
    method,
    headers,
    body: payload
  });

  return {
    status: response.status,
    text: await response.text()
  };
}

async function run() {
  const cases = [];
  const server = await createServer();

  const check = async (label, handler) => {
    try {
      await handler();
      cases.push({ label, status: 'PASS' });
    } catch (error) {
      cases.push({ label, status: 'FAIL', error: error.message });
    }
  };

  try {
    await check('legacy order receipt submission route is unmounted', async () => {
      const response = await request(server, '/api/orders/submit', { method: 'POST', body: { courseId: 'course-1' } });
      assertCase(response.status === 404, 'Expected 404 for removed receipt submission route, got ' + response.status);
    });

    await check('legacy order pending finance inbox route is unmounted', async () => {
      const response = await request(server, '/api/orders/pending');
      assertCase(response.status === 404, 'Expected 404 for removed pending inbox route, got ' + response.status);
    });

    await check('legacy order finance follow-up route is unmounted', async () => {
      const response = await request(server, '/api/orders/legacy-id/follow-up', { method: 'POST', body: { note: 'x' } });
      assertCase(response.status === 404, 'Expected 404 for removed follow-up route, got ' + response.status);
    });

    await check('legacy order finance approval route is unmounted', async () => {
      const response = await request(server, '/api/orders/approve/legacy-id', { method: 'POST' });
      assertCase(response.status === 404, 'Expected 404 for removed approval route, got ' + response.status);
    });

    await check('legacy order finance rejection route is unmounted', async () => {
      const response = await request(server, '/api/orders/reject/legacy-id', { method: 'POST', body: { reason: 'x' } });
      assertCase(response.status === 404, 'Expected 404 for removed rejection route, got ' + response.status);
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  cases.forEach((item) => {
    if (item.status === 'PASS') {
      console.log('PASS  legacy order route smoke: ' + item.label);
    } else {
      console.error('FAIL  legacy order route smoke: ' + item.label + '\n  ' + item.error);
    }
  });

  const failed = cases.filter((item) => item.status === 'FAIL');
  if (failed.length) {
    throw new Error('Legacy order route smoke failed: ' + failed.length + ' case(s).');
  }

  console.log('\nLegacy order route smoke passed: ' + cases.length + ' case(s).');
}

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
