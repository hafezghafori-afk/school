const express = require('express');

const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const {
  createTableConfig,
  generateResultTable,
  getResultTable,
  listResultTableReferenceData,
  listResultTables,
  listTableConfigs,
  listTableTemplates,
  publishResultTable
} = require('../services/resultTableService');
const { logActivity } = require('../utils/activity');

const router = express.Router();

function getResultTableErrorStatus(code = '') {
  if (code === 'result_table_not_found') return 404;
  if (code.startsWith('result_table_')) return 400;
  return 500;
}

router.get('/reference-data', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const data = await listResultTableReferenceData();
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load result table reference data.' });
  }
});

router.get('/templates', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const items = await listTableTemplates();
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load table templates.' });
  }
});

router.get('/configs', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const items = await listTableConfigs();
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load table configs.' });
  }
});

router.post('/configs', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    if (!String(req.body?.name || '').trim()) {
      return res.status(400).json({ success: false, message: 'Config name is required.' });
    }
    const item = await createTableConfig(req.body || {});
    await logActivity({
      req,
      action: 'result_table_config_create',
      targetType: 'result_table_config',
      targetId: item?.id || '',
      meta: {
        resultTableConfigId: item?.id || '',
        configName: item?.name || '',
        configCode: item?.code || '',
        orientation: req.body?.orientation || ''
      }
    });
    return res.json({ success: true, item });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create the table config.' });
  }
});

router.get('/', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const items = await listResultTables(req.query || {});
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load result tables.' });
  }
});

router.post('/generate', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    if (!req.body?.templateId) {
      return res.status(400).json({ success: false, message: 'Template is required.' });
    }
    const item = await generateResultTable(req.body || {}, req.user?.id || null);
    await logActivity({
      req,
      action: 'result_table_generate',
      targetType: 'result_table',
      targetId: item?.id || '',
      meta: {
        resultTableId: item?.id || '',
        templateId: String(req.body?.templateId || item?.template?.id || ''),
        configId: String(req.body?.configId || item?.config?.id || ''),
        sessionId: String(req.body?.sessionId || item?.session?.id || ''),
        rowCount: Number(item?.rowCount || item?.rows?.length || 0)
      }
    });
    return res.json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getResultTableErrorStatus(code)).json({ success: false, message: code || 'Failed to generate the result table.' });
  }
});

router.post('/:tableId/publish', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const item = await publishResultTable(req.params.tableId);
    await logActivity({
      req,
      action: 'result_table_publish',
      targetType: 'result_table',
      targetId: item?.id || String(req.params.tableId || ''),
      meta: {
        resultTableId: item?.id || String(req.params.tableId || ''),
        status: item?.status || '',
        rowCount: Number(item?.rowCount || item?.rows?.length || 0),
        publishedAt: item?.publishedAt || null
      }
    });
    return res.json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getResultTableErrorStatus(code)).json({ success: false, message: code || 'Failed to publish the result table.' });
  }
});

router.get('/:tableId', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const item = await getResultTable(req.params.tableId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Result table was not found.' });
    }
    return res.json({ success: true, item });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load the result table.' });
  }
});

module.exports = router;