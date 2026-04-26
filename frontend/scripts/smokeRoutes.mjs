import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const criticalRoutes = [
  { path: '/', componentFile: 'src/pages/Home.jsx' },
  { path: '/login', componentFile: 'src/pages/Login.jsx' },
  { path: '/dashboard', componentFile: 'src/pages/Dashboard.jsx' },
  { path: '/admin', componentFile: 'src/pages/AdminPanel.jsx' },
  { path: '/chat', componentFile: 'src/pages/ChatPage.jsx' },
  { path: '/profile', componentFile: 'src/pages/Profile.jsx' }
];

const appFile = path.join(rootDir, 'src', 'App.jsx');
const appSource = fs.readFileSync(appFile, 'utf8');

let failures = 0;

const logPass = (message) => console.log(`PASS  ${message}`);
const logFail = (message) => {
  failures += 1;
  console.error(`FAIL  ${message}`);
};

const parseJsx = (filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  parse(source, {
    sourceType: 'module',
    plugins: ['jsx']
  });
};

try {
  parseJsx(appFile);
  logPass('src/App.jsx syntax check');
} catch (error) {
  logFail(`src/App.jsx syntax error: ${error.message}`);
}

for (const item of criticalRoutes) {
  const routeToken = `path="${item.path}"`;
  if (appSource.includes(routeToken)) {
    logPass(`route exists: ${item.path}`);
  } else {
    logFail(`route missing in App.jsx: ${item.path}`);
  }

  const targetFile = path.join(rootDir, item.componentFile);
  if (!fs.existsSync(targetFile)) {
    logFail(`component file missing: ${item.componentFile}`);
    continue;
  }

  try {
    parseJsx(targetFile);
    logPass(`component syntax: ${item.componentFile}`);
  } catch (error) {
    logFail(`component syntax error in ${item.componentFile}: ${error.message}`);
  }
}

if (failures > 0) {
  console.error(`\nRoute smoke check failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('\nRoute smoke check completed successfully.');
