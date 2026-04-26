import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const docsPerfDir = path.resolve(frontendRoot, '..', 'docs', 'performance');
const historyFile = path.join(docsPerfDir, 'lighthouse-history.json');
const latestFile = path.join(docsPerfDir, 'lighthouse-latest.json');

const dateNow = new Date();
const dateIso = dateNow.toISOString();
const dateSlug = dateIso.slice(0, 10);
const defaultUrl = 'http://127.0.0.1:4173/';
const targetUrl = process.env.LIGHTHOUSE_TARGET_URL || defaultUrl;

const tempDir = path.join(frontendRoot, '.tmp-lighthouse');
const mobileTemp = path.join(tempDir, 'mobile.json');
const desktopTemp = path.join(tempDir, 'desktop.json');

const lighthouseBin = process.platform === 'win32'
  ? path.join(frontendRoot, 'node_modules', '.bin', 'lighthouse.cmd')
  : path.join(frontendRoot, 'node_modules', '.bin', 'lighthouse');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function scoreOf(category) {
  if (!category || typeof category.score !== 'number') return null;
  return Math.round(category.score * 100);
}

function toFixedOrNull(value, digits) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function extractSummary(lhr) {
  const audits = lhr?.audits || {};
  const categories = lhr?.categories || {};
  const metric = (id, unit, transform = (v) => v) => {
    const numeric = audits[id]?.numericValue;
    const normalized = numeric == null ? null : transform(numeric);
    const rounded = normalized == null
      ? null
      : toFixedOrNull(normalized, unit === 's' ? 2 : unit === 'score' ? 3 : 0);
    const display = rounded == null
      ? ''
      : unit === 's'
        ? `${rounded} s`
        : unit === 'ms'
          ? `${rounded} ms`
          : `${rounded}`;
    return {
      value: rounded,
      display
    };
  };

  return {
    scores: {
      performance: scoreOf(categories.performance),
      accessibility: scoreOf(categories.accessibility),
      bestPractices: scoreOf(categories['best-practices']),
      seo: scoreOf(categories.seo)
    },
    metrics: {
      firstContentfulPaint: metric('first-contentful-paint', 's', (v) => v / 1000),
      largestContentfulPaint: metric('largest-contentful-paint', 's', (v) => v / 1000),
      totalBlockingTime: metric('total-blocking-time', 'ms'),
      speedIndex: metric('speed-index', 's', (v) => v / 1000),
      cumulativeLayoutShift: metric('cumulative-layout-shift', 'score')
    }
  };
}

function delta(current, previous) {
  if (typeof current !== 'number' || typeof previous !== 'number') return null;
  return Number((current - previous).toFixed(2));
}

function deltaCell(value) {
  if (value == null) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}`;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function waitForUrl(url, timeoutMs, previewProc) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    if (previewProc && previewProc.exitCode != null) {
      throw new Error('vite preview exited before Lighthouse started');
    }
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await sleep(700);
  }
  throw new Error(`timeout waiting for preview server: ${url}`);
}

function stopPreview(previewProc) {
  if (!previewProc || previewProc.exitCode != null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(previewProc.pid), '/f', '/t'], { stdio: 'ignore' });
  } else {
    previewProc.kill('SIGTERM');
  }
}

function resolveChromePath() {
  if (process.env.LIGHTHOUSE_CHROME_PATH) return process.env.LIGHTHOUSE_CHROME_PATH;
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    const match = candidates.find((candidate) => fs.existsSync(candidate));
    if (match) return match;
  }
  return chromium.executablePath();
}

async function runLighthouse(mode, outputPath, chromePath) {
  const args = [
    targetUrl,
    '--quiet',
    '--output=json',
    `--output-path=${outputPath}`,
    '--only-categories=performance,accessibility,best-practices,seo',
    `--chrome-path=${chromePath}`,
    '--chrome-flags=--headless --no-sandbox --disable-gpu --disable-dev-shm-usage'
  ];
  if (mode === 'desktop') args.push('--preset=desktop');
  const result = process.platform === 'win32'
    ? await runCommand('cmd', ['/c', lighthouseBin, ...args], { cwd: frontendRoot })
    : await runCommand(lighthouseBin, args, { cwd: frontendRoot });

  if (result.code !== 0) {
    const hasOutput = fs.existsSync(outputPath);
    const isTempCleanupError = /EPERM|Permission denied/i.test(result.stderr);
    if (!(hasOutput && isTempCleanupError)) {
      throw new Error(`lighthouse ${mode} run failed with code ${result.code}`);
    }
    console.warn(`Lighthouse ${mode} returned non-zero due temp cleanup issue; using generated report.`);
  }
}

async function main() {
  fs.mkdirSync(docsPerfDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const chromePath = resolveChromePath();
  let previewProc = null;

  try {
    if (!process.env.LIGHTHOUSE_TARGET_URL) {
      previewProc = spawn(
        process.platform === 'win32' ? 'cmd' : 'npm',
        process.platform === 'win32'
          ? ['/c', 'npm', 'run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort']
          : ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
        { cwd: frontendRoot, stdio: 'ignore' }
      );
      await waitForUrl(targetUrl, 90_000, previewProc);
    }

    await runLighthouse('mobile', mobileTemp, chromePath);
    await runLighthouse('desktop', desktopTemp, chromePath);

    const mobileLhr = readJson(mobileTemp, null);
    const desktopLhr = readJson(desktopTemp, null);
    if (!mobileLhr || !desktopLhr) {
      throw new Error('failed to parse Lighthouse reports');
    }

    const current = {
      date: dateIso,
      targetUrl,
      mobile: extractSummary(mobileLhr),
      desktop: extractSummary(desktopLhr)
    };

    const history = readJson(historyFile, []);
    const previous = history.length ? history[history.length - 1] : null;
    const nextHistory = [...history, current].slice(-60);

    fs.writeFileSync(historyFile, `${JSON.stringify(nextHistory, null, 2)}\n`, 'utf8');
    fs.writeFileSync(latestFile, `${JSON.stringify(current, null, 2)}\n`, 'utf8');

    const scoreNames = [
      ['performance', 'Performance'],
      ['accessibility', 'Accessibility'],
      ['bestPractices', 'Best Practices'],
      ['seo', 'SEO']
    ];

    const metricNames = [
      ['firstContentfulPaint', 'FCP (s)'],
      ['largestContentfulPaint', 'LCP (s)'],
      ['totalBlockingTime', 'TBT (ms)'],
      ['speedIndex', 'Speed Index (s)'],
      ['cumulativeLayoutShift', 'CLS']
    ];

    const mdLines = [
      `# Lighthouse Baseline (${dateSlug})`,
      '',
      `Target URL: \`${targetUrl}\``,
      `Generated at: \`${dateIso}\``,
      '',
      '## Category Scores',
      '',
      '| Category | Mobile | Desktop |',
      '|---|---:|---:|'
    ];

    for (const [key, label] of scoreNames) {
      mdLines.push(`| ${label} | ${current.mobile.scores[key] ?? 'n/a'} | ${current.desktop.scores[key] ?? 'n/a'} |`);
    }

    mdLines.push('', '## Core Metrics', '', '| Metric | Mobile | Desktop |', '|---|---:|---:|');
    for (const [key, label] of metricNames) {
      const mobileValue = current.mobile.metrics[key]?.display || current.mobile.metrics[key]?.value || 'n/a';
      const desktopValue = current.desktop.metrics[key]?.display || current.desktop.metrics[key]?.value || 'n/a';
      mdLines.push(`| ${label} | ${mobileValue} | ${desktopValue} |`);
    }

    if (previous) {
      mdLines.push('', '## Trend vs Previous Run', '', '| Metric | Mobile Delta | Desktop Delta |', '|---|---:|---:|');
      for (const [key, label] of scoreNames) {
        const dMobile = delta(current.mobile.scores[key], previous.mobile?.scores?.[key]);
        const dDesktop = delta(current.desktop.scores[key], previous.desktop?.scores?.[key]);
        mdLines.push(`| ${label} score | ${deltaCell(dMobile)} | ${deltaCell(dDesktop)} |`);
      }
      for (const [key, label] of metricNames) {
        const dMobile = delta(current.mobile.metrics[key]?.value, previous.mobile?.metrics?.[key]?.value);
        const dDesktop = delta(current.desktop.metrics[key]?.value, previous.desktop?.metrics?.[key]?.value);
        mdLines.push(`| ${label} | ${deltaCell(dMobile)} | ${deltaCell(dDesktop)} |`);
      }
    } else {
      mdLines.push('', '## Trend', '', 'No previous baseline exists yet. This run is the baseline seed.');
    }

    mdLines.push(
      '',
      '## Notes',
      '- This baseline can run while backend is offline; API calls may fail but layout and static rendering remain measurable.',
      '- Use `docs/performance/lighthouse-history.json` for trend tracking.'
    );

    const reportFile = path.join(docsPerfDir, `lighthouse-baseline-${dateSlug}.md`);
    fs.writeFileSync(reportFile, `${mdLines.join('\n')}\n`, 'utf8');

    console.log(`Lighthouse baseline saved: ${reportFile}`);
  } finally {
    stopPreview(previewProc);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore temp cleanup issues on Windows
    }
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
