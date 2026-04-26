const { spawn, execFileSync } = require('node:child_process');
const net = require('node:net');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let shuttingDown = false;
const isSmokeMode = process.argv.includes('--smoke');
let detectedFrontendPort = null;
let detectedBackendPort = null;
let loggedFrontendProbeSnippet = false;
let readySummaryPrinted = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function printReadySummary() {
  if (readySummaryPrinted || detectedFrontendPort == null || detectedBackendPort == null) {
    return;
  }

  readySummaryPrinted = true;
  const frontendUrl = `http://localhost:${detectedFrontendPort}/`;
  const backendUrl = `http://localhost:${detectedBackendPort}`;
  const healthUrl = `${backendUrl}/api/health`;

  console.log('');
  console.log('==================================================');
  console.log('   Development Servers Ready');
  console.log(`   Frontend: ${frontendUrl}`);
  console.log(`   Backend:  ${backendUrl}`);
  console.log(`   Health:   ${healthUrl}`);
  console.log('   Stop:     Ctrl+C');
  console.log('==================================================');
  console.log('');
}

function killChildTree(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;

  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }

    process.kill(child.pid, 'SIGTERM');
  } catch {
    // Ignore cleanup failures during shutdown.
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    killChildTree(child);
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 250);
}

function startService(label, args, extraEnv = {}, onOutput = null) {
  const child = spawn(
    process.platform === 'win32' ? 'cmd.exe' : npmCommand,
    process.platform === 'win32' ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args,
    {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...extraEnv
      }
    }
  );

  const forwardStream = (stream, target) => {
    if (!stream) return;
    stream.on('data', (chunk) => {
      const text = chunk.toString();
      target.write(text);
      if (onOutput) onOutput(text);
    });
  };

  forwardStream(child.stdout, process.stdout);
  forwardStream(child.stderr, process.stderr);

  children.push(child);

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const details = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.log(`[dev] ${label} stopped with ${details}`);
    shutdown(code ?? 0);
  });

  child.on('error', (error) => {
    if (shuttingDown) return;
    console.error(`[dev] Failed to start ${label}: ${error.message}`);
    shutdown(1);
  });
}

async function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();

    tester.once('error', () => {
      resolve(false);
    });

    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port);
  });
}

async function findAvailablePort(preferredPort) {
  let port = preferredPort;

  while (!(await isPortFree(port))) {
    port += 1;
  }

  return port;
}

async function waitForHttpOk(label, targets, timeoutMs = 60000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const resolvedTargets = typeof targets === 'function' ? targets() : targets;
    const normalizedTargets = Array.isArray(resolvedTargets) ? resolvedTargets : [resolvedTargets];

    for (const target of normalizedTargets) {
      try {
        const response = await fetch(target.url, {
          signal: AbortSignal.timeout(1500)
        });
        const body = target.validate ? await response.text() : '';
        const valid = response.ok && (!target.validate || target.validate(body, response));

        if (!valid && label === 'frontend' && response.ok && !loggedFrontendProbeSnippet) {
          loggedFrontendProbeSnippet = true;
          console.log(`[smoke] frontend probe mismatch at ${target.url}: ${body.slice(0, 180).replace(/\s+/g, ' ')}`);
        }

        if (valid) {
          console.log(`[smoke] ${label} is reachable at ${target.url} (${response.status})`);
          return;
        }
      } catch {
        // Keep polling until the service is ready or the timeout expires.
      }
    }

    await delay(1000);
  }

  throw new Error(`${label} did not become ready within ${Math.round(timeoutMs / 1000)}s`);
}

async function waitForDetectedFrontendPort(fallbackPort, timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (detectedFrontendPort != null) {
      return detectedFrontendPort;
    }

    await delay(250);
  }

  return fallbackPort;
}

async function runSmokeChecks({ frontendPort, backendPort }) {
  try {
    await Promise.all([
      (async () => {
        const resolvedFrontendPort = await waitForDetectedFrontendPort(frontendPort);
        await waitForHttpOk('frontend', {
          url: `http://localhost:${resolvedFrontendPort}/`,
          validate: (body) => body.includes('@vite/client') && (body.includes('Academy Pro') || body.includes('/src/main.jsx'))
        });
      })(),
      waitForHttpOk('backend', {
        url: `http://127.0.0.1:${backendPort}/api/health`,
        validate: (body) => body.includes('"status":"OK"')
      })
    ]);
    shutdown(0);
  } catch (error) {
    console.error(`[smoke] ${error.message}`);
    shutdown(1);
  }
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  const preferredBackendPort = 5000;
  const preferredFrontendPort = 3000;
  const backendPort = await findAvailablePort(preferredBackendPort);
  const frontendPort = await findAvailablePort(preferredFrontendPort);
  let backendOutputBuffer = '';
  let frontendOutputBuffer = '';

  if (backendPort !== preferredBackendPort) {
    console.log(`[dev] Port ${preferredBackendPort} is busy, using ${backendPort} for backend`);
  }
  if (frontendPort !== preferredFrontendPort) {
    console.log(`[dev] Port ${preferredFrontendPort} is busy, using ${frontendPort} for frontend`);
  }

  console.log('[dev] Booting development servers...');
  console.log(`[dev] Requested backend port:  ${backendPort}`);
  console.log(`[dev] Requested frontend port: ${frontendPort}`);
  console.log('[dev] Final URLs will be printed once both services are ready.');

  startService(
    'backend',
    ['--prefix', 'backend', 'run', 'start'],
    {
      PORT: String(backendPort)
    },
    (text) => {
      backendOutputBuffer += stripAnsi(text);
      const match = backendOutputBuffer.match(/Server is running on:\s*http:\/\/localhost:(\d+)/);
      if (match) {
        detectedBackendPort = Number(match[1]);
        printReadySummary();
      }
    }
  );
  startService(
    'frontend',
    ['--prefix', 'frontend', 'run', 'dev', '--', '--port', String(frontendPort)],
    {
      VITE_PROXY_TARGET: `http://localhost:${backendPort}`
    },
    (text) => {
      frontendOutputBuffer += stripAnsi(text);
      const match = frontendOutputBuffer.match(/Local:\s+http:\/\/localhost:(\d+)\//);
      if (match) {
        detectedFrontendPort = Number(match[1]);
        printReadySummary();
      }
    }
  );

  if (isSmokeMode) {
    runSmokeChecks({ frontendPort, backendPort });
  }
}

main().catch((error) => {
  console.error(`[dev] ${error.message}`);
  shutdown(1);
});
