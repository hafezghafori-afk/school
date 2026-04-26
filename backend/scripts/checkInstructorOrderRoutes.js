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
    await check('legacy join request route is unmounted', async () => {
      const response = await request(server, '/api/orders/join-request', {
        method: 'POST',
        body: { courseId: 'course-1' }
      });
      assertCase(response.status === 404, 'Expected 404 for removed join request route, got ' + response.status);
    });

    await check('legacy instructor courses route is unmounted', async () => {
      const response = await request(server, '/api/orders/instructor/courses');
      assertCase(response.status === 404, 'Expected 404 for removed instructor courses route, got ' + response.status);
    });

    await check('legacy instructor pending route is unmounted', async () => {
      const response = await request(server, '/api/orders/instructor/pending');
      assertCase(response.status === 404, 'Expected 404 for removed instructor pending route, got ' + response.status);
    });

    await check('legacy instructor approve route is unmounted', async () => {
      const response = await request(server, '/api/orders/instructor/approve/legacy-id', { method: 'POST' });
      assertCase(response.status === 404, 'Expected 404 for removed instructor approve route, got ' + response.status);
    });

    await check('legacy instructor reject route is unmounted', async () => {
      const response = await request(server, '/api/orders/instructor/reject/legacy-id', { method: 'POST', body: { reason: 'x' } });
      assertCase(response.status === 404, 'Expected 404 for removed instructor reject route, got ' + response.status);
    });

    await check('legacy instructor roster route is unmounted', async () => {
      const response = await request(server, '/api/orders/instructor/course-students?courseId=course-1');
      assertCase(response.status === 404, 'Expected 404 for removed instructor roster route, got ' + response.status);
    });

    await check('legacy instructor add-student route is unmounted', async () => {
      const response = await request(server, '/api/orders/instructor/add-student', { method: 'POST', body: { courseId: 'course-1', studentId: 'student-1' } });
      assertCase(response.status === 404, 'Expected 404 for removed instructor add-student route, got ' + response.status);
    });

    await check('legacy instructor remove-student route is unmounted', async () => {
      const response = await request(server, '/api/orders/instructor/remove-student/legacy-id', { method: 'DELETE' });
      assertCase(response.status === 404, 'Expected 404 for removed instructor remove-student route, got ' + response.status);
    });

    await check('legacy student order list route is unmounted', async () => {
      const response = await request(server, '/api/orders/user/legacy-user');
      assertCase(response.status === 404, 'Expected 404 for removed student order list route, got ' + response.status);
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  cases.forEach((item) => {
    if (item.status === 'PASS') {
      console.log('PASS  instructor route smoke: ' + item.label);
    } else {
      console.error('FAIL  instructor route smoke: ' + item.label + '\n  ' + item.error);
    }
  });

  const failed = cases.filter((item) => item.status === 'FAIL');
  if (failed.length) {
    throw new Error('Instructor route smoke failed: ' + failed.length + ' case(s).');
  }

  console.log('\nInstructor route smoke passed: ' + cases.length + ' case(s).');
}

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
