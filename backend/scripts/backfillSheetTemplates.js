#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');

const SheetTemplate = require('../models/SheetTemplate');
const { getPreparedSheetTemplateSeeds } = require('../services/sheetTemplateService');

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function comparableTemplate(template) {
  return {
    title: String(template.title || '').trim(),
    type: String(template.type || '').trim(),
    columns: (template.columns || []).map((item) => ({
      key: item.key,
      label: item.label,
      order: item.order,
      visible: item.visible
    })),
    layout: template.layout || {},
    note: String(template.note || '').trim()
  };
}

async function run() {
  const dryRun = hasFlag('--dry-run');
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

  await mongoose.connect(mongoUri);

  const summary = { created: 0, existing: 0, updated: 0, dryRun };
  const seeds = getPreparedSheetTemplateSeeds();

  for (const payload of seeds) {
    const existing = await SheetTemplate.findOne({ code: payload.code });

    if (!existing) {
      summary.created += 1;
      if (!dryRun) {
        await SheetTemplate.create(payload);
      }
      continue;
    }

    summary.existing += 1;
    if (JSON.stringify(comparableTemplate(existing)) !== JSON.stringify(comparableTemplate(payload))) {
      summary.updated += 1;
      if (!dryRun) {
        Object.assign(existing, payload);
        await existing.save();
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[backfillSheetTemplates] failed:', error?.message || error);
    try {
      await mongoose.disconnect();
    } catch (_) {
      // Ignore disconnect errors during shutdown.
    }
    process.exit(1);
  });
