const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(repoRoot, 'docs', 'security');
const outFile = path.join(outDir, 'security-audit-latest.json');
const toRel = (p) => path.relative(repoRoot, p).replace(/\\/g, '/');
const auditReportRel = toRel(outFile);

const scanRoots = ['backend', 'frontend', 'docs'];
const ignoredDirs = new Set(['node_modules', 'dist', '.git', 'uploads', 'test-results', 'playwright-report']);
const allowedExt = new Set(['.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css', '.html', '.env', '.example', '.yml', '.yaml']);

const rules = [
  {
    id: 'hardcoded_jwt_fallback',
    severity: 'high',
    regex: /JWT_SECRET\s*[:=]\s*['"`]?(dev_secret|changeme|change_me)['"`]?/i
  },
  {
    id: 'possible_mail_password_literal',
    severity: 'high',
    regex: /(SMTP_PASS|MAIL_PASS)\s*[:=]\s*['"`][^'"`]{4,}['"`]/i
  },
  {
    id: 'possible_api_key_literal',
    severity: 'medium',
    regex: /(API_KEY|SECRET_KEY|ACCESS_TOKEN)\s*[:=]\s*['"`][A-Za-z0-9_\-]{16,}['"`]/i
  },
  {
    id: 'suspicious_credential_phrase',
    severity: 'high',
    regex: /(Paris\.com@|imanschool\.official@gmail\.com\s+رمز|gmail\.com.+password)/i
  }
];

const readSafeText = (filePath) => {
  const stat = fs.statSync(filePath);
  if (stat.size > 1024 * 1024) return '';
  return fs.readFileSync(filePath, 'utf8');
};

const collectFiles = (dir, results = []) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, results);
      continue;
    }
    const relPath = toRel(fullPath);
    if (relPath === auditReportRel) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (allowedExt.has(ext) || entry.name.endsWith('.env.example')) {
      results.push(fullPath);
    }
  }
  return results;
};

const shouldSkipRuleForFile = (ruleId, relPath) => {
  if (ruleId === 'hardcoded_jwt_fallback' && relPath.endsWith('.env.example')) return true;
  return false;
};

const findMatches = (filePath, relPath, content) => {
  const hits = [];
  const lines = content.split(/\r?\n/);
  for (const rule of rules) {
    if (shouldSkipRuleForFile(rule.id, relPath)) continue;
    const re = new RegExp(rule.regex.source, rule.regex.flags);
    lines.forEach((line, index) => {
      if (re.test(line)) {
        hits.push({
          rule: rule.id,
          severity: rule.severity,
          line: index + 1,
          snippet: line.trim().slice(0, 200)
        });
      }
    });
  }
  return hits;
};

const checkWeakEnv = () => {
  const envPath = path.join(repoRoot, 'backend', '.env');
  if (!fs.existsSync(envPath)) return [];
  const raw = fs.readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.trim().startsWith('#')) continue;
    const [k, ...rest] = line.split('=');
    if (!k) continue;
    const key = k.trim();
    const value = rest.join('=').trim();
    if (key === 'JWT_SECRET') {
      if (!value || value === 'dev_secret' || value.length < 24) {
        found.push({
          rule: 'weak_jwt_secret_env',
          severity: 'high',
          file: 'backend/.env',
          line: i + 1,
          snippet: 'JWT_SECRET=***'
        });
      }
    }
    if (key === 'SMTP_PASS' && value && value.length < 8) {
      found.push({
        rule: 'weak_smtp_password_length',
        severity: 'medium',
        file: 'backend/.env',
        line: i + 1,
        snippet: 'SMTP_PASS=***'
      });
    }
  }
  return found;
};

const checkGitignoreCoverage = () => {
  const checks = [
    { file: path.join(repoRoot, 'frontend', '.gitignore'), mustInclude: '.env', id: 'frontend_env_not_ignored' },
    { file: path.join(repoRoot, 'backend', '.gitignore'), mustInclude: '.env', id: 'backend_env_not_ignored' }
  ];

  const findings = [];
  for (const check of checks) {
    if (!fs.existsSync(check.file)) {
      findings.push({
        rule: check.id,
        severity: 'high',
        file: path.relative(repoRoot, check.file).replace(/\\/g, '/'),
        line: 1,
        snippet: 'missing .gitignore'
      });
      continue;
    }

    const content = fs.readFileSync(check.file, 'utf8');
    if (!content.split(/\r?\n/).map((l) => l.trim()).includes(check.mustInclude)) {
      findings.push({
        rule: check.id,
        severity: 'high',
        file: path.relative(repoRoot, check.file).replace(/\\/g, '/'),
        line: 1,
        snippet: 'missing .env ignore rule'
      });
    }
  }
  return findings;
};

const run = () => {
  const findings = [];
  const files = scanRoots.flatMap((root) => {
    const dir = path.join(repoRoot, root);
    return fs.existsSync(dir) ? collectFiles(dir) : [];
  });

  for (const filePath of files) {
    const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    let content = '';
    try {
      content = readSafeText(filePath);
    } catch {
      continue;
    }
    if (!content) continue;

    const hits = findMatches(filePath, rel, content);
    hits.forEach((hit) => {
      findings.push({
        ...hit,
        file: rel
      });
    });
  }

  findings.push(...checkWeakEnv());
  findings.push(...checkGitignoreCoverage());

  const bySeverity = findings.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    scannedFiles: files.length,
    totals: {
      findings: findings.length,
      high: bySeverity.high || 0,
      medium: bySeverity.medium || 0,
      low: bySeverity.low || 0
    },
    findings
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Security audit report saved: ${path.relative(repoRoot, outFile)}`);
  console.log(`Findings: total=${report.totals.findings}, high=${report.totals.high}, medium=${report.totals.medium}, low=${report.totals.low}`);
};

run();
