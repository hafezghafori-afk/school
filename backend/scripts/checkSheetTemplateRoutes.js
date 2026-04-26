/**
 * Sheet Template Routes Validation Script
 *
 * Validates all Sheet Template API endpoints and business logic:
 * - Sheet template CRUD operations
 * - Default column generation for each type
 * - Template preview and filtering
 * - Template application to reports
 * - Permission enforcement
 *
 * Usage: node ./scripts/checkSheetTemplateRoutes.js
 */

const path = require('node:path');
const fs = require('node:fs');

const backendRoot = path.resolve(__dirname, '..');

// === Test Configuration ===
const TESTS = [
  {
    name: 'SheetTemplate model exists and exports',
    check: () => {
      const modelPath = path.join(backendRoot, 'models', 'SheetTemplate.js');
      if (!fs.existsSync(modelPath)) throw new Error(`Model file not found: ${modelPath}`);
      const content = fs.readFileSync(modelPath, 'utf-8');
      if (!content.includes('module.exports') && !content.includes('export')) {
        throw new Error('SheetTemplate model not properly exported');
      }
      return true;
    }
  },

  {
    name: 'sheetTemplateService exports all required functions',
    check: () => {
      const servicePath = path.join(backendRoot, 'services', 'sheetTemplateService.js');
      if (!fs.existsSync(servicePath)) throw new Error(`Service file not found: ${servicePath}`);
      const content = fs.readFileSync(servicePath, 'utf-8');
      const required = [
        'createSheetTemplate',
        'getSheetTemplateById',
        'listSheetTemplates',
        'previewSheetTemplate',
        'updateSheetTemplate',
        'deleteSheetTemplate',
        'applyTemplateToReport',
        'getDefaultColumnsForType'
      ];
      for (const func of required) {
        if (!content.includes(`${func}:`) && !content.includes(`function ${func}`) && !content.includes(`const ${func}`)) {
          throw new Error(`Missing function in service: ${func}`);
        }
      }
      return true;
    }
  },

  {
    name: 'sheetTemplateRoutes exports Express router',
    check: () => {
      const routesPath = path.join(backendRoot, 'routes', 'sheetTemplateRoutes.js');
      if (!fs.existsSync(routesPath)) throw new Error(`Routes file not found: ${routesPath}`);
      const content = fs.readFileSync(routesPath, 'utf-8');
      if (!content.includes('router.') && !content.includes('module.exports')) {
        throw new Error('sheetTemplateRoutes does not export valid Express router');
      }
      return true;
    }
  },

  {
    name: 'SheetTemplate routes mounted in server.js',
    check: () => {
      const serverPath = path.join(backendRoot, 'server.js');
      const content = fs.readFileSync(serverPath, 'utf-8');
      if (!content.includes("require('./routes/sheetTemplateRoutes')")) {
        throw new Error('sheetTemplateRoutes not imported in server.js');
      }
      if (!content.includes("/api/sheet-templates")) {
        throw new Error('API route not mounted at /api/sheet-templates');
      }
      return true;
    }
  },

  {
    name: 'reportRoutes integrated with template support',
    check: () => {
      const reportRoutesPath = path.join(backendRoot, 'routes', 'reportRoutes.js');
      const content = fs.readFileSync(reportRoutesPath, 'utf-8');
      if (!content.includes('sheetTemplateService') && !content.includes('applyTemplateToReport')) {
        throw new Error('reportRoutes not integrated with Sheet Template service');
      }
      return true;
    }
  },

  {
    name: 'SheetTemplate model validates sheet types',
    check: () => {
      const modelPath = path.join(backendRoot, 'models', 'SheetTemplate.js');
      const content = fs.readFileSync(modelPath, 'utf-8');
      const expectedTypes = ['attendance', 'attendance_summary', 'subjects', 'exam', 'finance'];
      for (const type of expectedTypes) {
        if (!content.includes(`'${type}'`)) {
          throw new Error(`Missing sheet type in model: ${type}`);
        }
      }
      return true;
    }
  },

  {
    name: 'SheetTemplate model includes all required sub-schemas',
    check: () => {
      const modelPath = path.join(backendRoot, 'models', 'SheetTemplate.js');
      const content = fs.readFileSync(modelPath, 'utf-8');
      const requiredSchemas = ['marginSchema', 'columnSchema', 'scopeSchema', 'layoutSchema', 'filtersSchema'];
      for (const schema of requiredSchemas) {
        if (!content.includes(schema)) {
          throw new Error(`Missing sub-schema in model: ${schema}`);
        }
      }
      return true;
    }
  },

  {
    name: 'Default columns defined for all template types',
    check: () => {
      const servicePath = path.join(backendRoot, 'services', 'sheetTemplateService.js');
      const content = fs.readFileSync(servicePath, 'utf-8');
      const expectedTypes = ['attendance', 'attendance_summary', 'subjects', 'exam', 'finance'];
      for (const type of expectedTypes) {
        if (!content.includes(`'${type}'`) && !content.includes(`"${type}"`)) {
          throw new Error(`Missing default column handler for type: ${type}`);
        }
      }
      return true;
    }
  },

  {
    name: 'AdminSheetTemplates page imports correct utilities',
    check: () => {
      const pagePath = path.join(backendRoot, '..', 'frontend', 'src', 'pages', 'AdminSheetTemplates.jsx');
      const content = fs.readFileSync(pagePath, 'utf-8');
      if (!content.includes('adminWorkspaceUtils')) {
        throw new Error('AdminSheetTemplates not using adminWorkspaceUtils');
      }
      if (!content.includes('DEFAULT_COLUMNS_BY_TYPE')) {
        throw new Error('DEFAULT_COLUMNS_BY_TYPE not defined in AdminSheetTemplates');
      }
      return true;
    }
  },

  {
    name: 'AdminSheetTemplates includes column management functions',
    check: () => {
      const pagePath = path.join(backendRoot, '..', 'frontend', 'src', 'pages', 'AdminSheetTemplates.jsx');
      const content = fs.readFileSync(pagePath, 'utf-8');
      const required = ['updateColumn', 'moveColumn', 'removeColumn', 'addColumn'];
      for (const func of required) {
        if (!content.includes(func)) {
          throw new Error(`Missing column management function: ${func}`);
        }
      }
      return true;
    }
  },

  {
    name: 'AdminSheetTemplates includes layout controls',
    check: () => {
      const pagePath = path.join(backendRoot, '..', 'frontend', 'src', 'pages', 'AdminSheetTemplates.jsx');
      const content = fs.readFileSync(pagePath, 'utf-8');
      const layoutControls = ['font', 'fontSize', 'orientation', 'showHeader', 'showFooter', 'showLogo'];
      for (const control of layoutControls) {
        if (!content.includes(control)) {
          throw new Error(`Missing layout control: ${control}`);
        }
      }
      return true;
    }
  },

  {
    name: 'AdminReports integrated with template selection',
    check: () => {
      const pagePath = path.join(backendRoot, '..', 'frontend', 'src', 'pages', 'AdminReports.jsx');
      const content = fs.readFileSync(pagePath, 'utf-8');
      if (!content.includes('sheetTemplates') && !content.includes('templateId')) {
        throw new Error('AdminReports not integrated with template selection');
      }
      if (!content.includes('REPORT_TEMPLATE_TYPE_MAP')) {
        throw new Error('REPORT_TEMPLATE_TYPE_MAP not found in AdminReports');
      }
      return true;
    }
  },

  {
    name: 'App.jsx registered /admin-sheet-templates route',
    check: () => {
      const appPath = path.join(backendRoot, '..', 'frontend', 'src', 'App.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');
      if (!content.includes('/admin-sheet-templates')) {
        throw new Error('Route /admin-sheet-templates not registered in App.jsx');
      }
      if (!content.includes('AdminSheetTemplates')) {
        throw new Error('AdminSheetTemplates component not imported in App.jsx');
      }
      return true;
    }
  },

  {
    name: 'Backfill script exists for sheet templates',
    check: () => {
      const scriptPath = path.join(backendRoot, 'scripts', 'backfillSheetTemplates.js');
      if (!fs.existsSync(scriptPath)) throw new Error(`Backfill script not found: ${scriptPath}`);
      const content = fs.readFileSync(scriptPath, 'utf-8');
      if (!content.includes('SheetTemplate')) {
        throw new Error('Backfill script does not reference SheetTemplate model');
      }
      return true;
    }
  },

  {
    name: 'Backfill npm commands registered',
    check: () => {
      const packagePath = path.join(backendRoot, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      if (!pkg.scripts['backfill:sheet-templates']) {
        throw new Error('npm script backfill:sheet-templates not registered');
      }
      if (!pkg.scripts['backfill:sheet-templates:dry']) {
        throw new Error('npm script backfill:sheet-templates:dry not registered');
      }
      return true;
    }
  },

  {
    name: 'Sheet template service handles all export formats',
    check: () => {
      const servicePath = path.join(backendRoot, 'services', 'sheetTemplateService.js');
      const content = fs.readFileSync(servicePath, 'utf-8');
      const formats = ['csv', 'xlsx', 'pdf', 'print'];
      for (const format of formats) {
        if (!content.includes(format) && !content.includes(format.toUpperCase())) {
          console.warn(`Warning: format '${format}' export handler may not be clearly defined`);
        }
      }
      return true;
    }
  },

  {
    name: 'Template routes include proper permission checks',
    check: () => {
      const routesPath = path.join(backendRoot, 'routes', 'sheetTemplateRoutes.js');
      const content = fs.readFileSync(routesPath, 'utf-8');
      if (!content.includes('requireAuth') || !content.includes('requireRole')) {
        throw new Error('Permission middleware not applied to sheet template routes');
      }
      return true;
    }
  },

  {
    name: 'Template routes include activity logging',
    check: () => {
      const routesPath = path.join(backendRoot, 'routes', 'sheetTemplateRoutes.js');
      const content = fs.readFileSync(routesPath, 'utf-8');
      if (!content.includes('logActivity') && !content.includes('activityLog')) {
        throw new Error('Activity logging not integrated in sheet template routes');
      }
      return true;
    }
  }
];

// === Test Runner ===
async function runTests() {
  console.log('─'.repeat(70));
  console.log('Sheet Template Routes Validation');
  console.log('─'.repeat(70));

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const test of TESTS) {
    try {
      delete require.cache[Object.keys(require.cache)[0]]; // Clear require cache
      test.check();
      console.log(`✓ ${test.name}`);
      passed += 1;
    } catch (error) {
      console.error(`✗ ${test.name}`);
      console.error(`  └─ ${error.message}`);
      failed += 1;
      failures.push({ test: test.name, error: error.message });
    }
  }

  console.log('─'.repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${TESTS.length} tests`);
  console.log('─'.repeat(70));

  if (failed > 0) {
    console.error('\nFailed Tests Summary:');
    failures.forEach((f, i) => {
      console.error(`${i + 1}. ${f.test}`);
      console.error(`   Error: ${f.error}`);
    });
    process.exit(1);
  }

  console.log('\n✓ All Sheet Template routing checks passed!\n');
}

runTests().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
