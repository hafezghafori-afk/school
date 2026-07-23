const Counter = require('../models/Counter');

const escapeRegex = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function resolveMonthParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('finance_number_date_invalid');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return { year, month, monthKey: `${year}${month}` };
}

function parseSerial(value = '', prefix = '', monthKey = '') {
  const match = String(value || '').match(new RegExp(`^${escapeRegex(prefix)}-${escapeRegex(monthKey)}-(\\d+)$`, 'i'));
  return match ? Math.max(0, Number(match[1]) || 0) : 0;
}

async function initializeCounter({ model, field, prefix, monthKey, counterId }) {
  if (await Counter.exists({ _id: counterId })) return;
  const rows = await model.find({
    [field]: { $regex: `^${escapeRegex(prefix)}-${monthKey}-\\d+$`, $options: 'i' }
  }).select(field).lean();
  const maximum = rows.reduce((value, item) => Math.max(value, parseSerial(item?.[field], prefix, monthKey)), 0);
  try {
    await Counter.findByIdAndUpdate(
      counterId,
      { $max: { seq: maximum } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (Number(error?.code) !== 11000) throw error;
  }
}

async function nextFinanceDocumentNumber({ model, field, prefix = '', date = new Date(), width = 4 } = {}) {
  if (!model || !field || !prefix) throw new Error('finance_number_configuration_invalid');
  const normalizedPrefix = String(prefix).trim().toUpperCase();
  const { monthKey } = resolveMonthParts(date);
  const counterId = `finance-number:${normalizedPrefix}:${monthKey}`;
  await initializeCounter({ model, field, prefix: normalizedPrefix, monthKey, counterId });
  const counter = await Counter.findByIdAndUpdate(
    counterId,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return `${normalizedPrefix}-${monthKey}-${String(counter.seq).padStart(width, '0')}`;
}

module.exports = {
  nextFinanceDocumentNumber,
  parseSerial,
  resolveMonthParts
};
