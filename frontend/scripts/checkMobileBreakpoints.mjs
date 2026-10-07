import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Keeps the mobile work from drifting back into what it set out to fix.
 *
 * The project reached 57 distinct `max-width` values across 88 stylesheets, so
 * one page became a phone layout at 720px and the page next to it at 980px —
 * the same user, one session, two behaviours. The mobile work settled on two
 * lines, 640px for phone rules and 900px for the shell, and migrates the old
 * ones a page at a time as each page is touched.
 *
 * A bulk rewrite of 57 breakpoints would be a large, untestable change for no
 * measured benefit, so this does not demand one. It holds the count where it is
 * and lets it only fall: a new ad-hoc breakpoint fails, removing one lowers the
 * baseline below. Lower the number in the same commit that removes them.
 *
 * It also guards `100vh`, which on a phone is taller than the visible area
 * whenever the address bar is showing, so the bottom of the page sits under it.
 * `100dvh` is the measurement that follows the bar. Print stylesheets and the
 * mobile files that define the two lines are exempt.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

// The two lines every new rule should use.
const APPROVED_WIDTHS = new Set([640, 900]);

// Where the project stands today. These only ever go down.
const LEGACY_BREAKPOINT_BUDGET = 134;
// `100vh` on its own, with no `100dvh` line after it to override where the unit
// is understood. Bounded panels (`max-height: calc(100vh - 112px)`) are counted
// here too and are deliberately still on the list: a dropdown that resizes every
// time the address bar slides is worse than one that does not, so those were
// left alone and only full-viewport heights were paired.
const UNPAIRED_VH_BUDGET = 24;

const EXEMPT_FILES = new Set([
  'src/styles/mobile.css',
  'src/components/mobile/mobile-shell.css',
  'src/components/ui/responsive-table.css'
]);

let failures = 0;
const logPass = (message) => console.log(`PASS  ${message}`);
const logFail = (message) => {
  failures += 1;
  console.error(`FAIL  ${message}`);
};

const collectCss = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectCss(full));
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
};

const files = collectCss(srcDir);
let adHoc = 0;
let viewportHeights = 0;
const adHocWidths = new Map();

for (const file of files) {
  const relative = path.relative(rootDir, file).replace(/\\/g, '/');
  const source = fs.readFileSync(file, 'utf8');

  if (!EXEMPT_FILES.has(relative)) {
    for (const match of source.matchAll(/@media[^{]*?\(\s*max-width:\s*(\d+)px/g)) {
      const width = Number(match[1]);
      if (APPROVED_WIDTHS.has(width)) continue;
      adHoc += 1;
      adHocWidths.set(width, (adHocWidths.get(width) || 0) + 1);
    }
  }

  // A print sheet is sized for paper, so its heights are not a phone's problem.
  if (!relative.includes('print')) {
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      if (!/\b100vh\b/.test(line)) return;
      // The pattern this project uses is the old value first and the dynamic one
      // on the next line, so a browser without `dvh` keeps what it had.
      if (/\b100dvh\b/.test(lines[index + 1] || '')) return;
      viewportHeights += 1;
    });
  }
}

const topWidths = [...adHocWidths.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([width, count]) => `${width}px x${count}`)
  .join(', ');

if (adHoc > LEGACY_BREAKPOINT_BUDGET) {
  logFail(
    `ad-hoc breakpoints rose to ${adHoc} (budget ${LEGACY_BREAKPOINT_BUDGET}). `
    + 'New rules belong at max-width 640px (phone) or 900px (shell). Most common: '
    + topWidths
  );
} else {
  logPass(`ad-hoc breakpoints: ${adHoc} of ${LEGACY_BREAKPOINT_BUDGET} allowed`);
  if (adHoc < LEGACY_BREAKPOINT_BUDGET) {
    console.log(`      ${LEGACY_BREAKPOINT_BUDGET - adHoc} fewer than the budget — lower LEGACY_BREAKPOINT_BUDGET to ${adHoc}.`);
  }
}

if (viewportHeights > UNPAIRED_VH_BUDGET) {
  logFail(
    `unpaired 100vh rose to ${viewportHeights} (budget ${UNPAIRED_VH_BUDGET}). `
    + 'Follow it with the same property at 100dvh so the mobile address bar is accounted for.'
  );
} else {
  logPass(`unpaired 100vh: ${viewportHeights} of ${UNPAIRED_VH_BUDGET} allowed`);
  if (viewportHeights < UNPAIRED_VH_BUDGET) {
    console.log(`      ${UNPAIRED_VH_BUDGET - viewportHeights} fewer than the budget — lower UNPAIRED_VH_BUDGET to ${viewportHeights}.`);
  }
}

if (failures > 0) {
  console.error(`\nMobile breakpoint check failed with ${failures} problem(s).`);
  process.exit(1);
}

console.log('\nMobile breakpoint check completed successfully.');
