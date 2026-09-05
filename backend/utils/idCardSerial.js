const Counter = require('../models/Counter');

// شمارهٔ سریالِ کارتِ هویت — همان تکنیکِ atomic $inc رویِ Counter که برایِ شمارهٔ
// اسنادِ مالی (financeNumberSequence.js) و نمبر اساسِ شاگرد استفاده شده. کلیدِ کانتر
// و خودِ سریال هردو بر اساسِ schoolCode ساخته می‌شوند تا رویِ چند مکتب هم یکتا بمانند
// (سریال یک ایندکسِ unique دارد رویِ IdCard).
async function nextIdCardSerial({ schoolCode = '', year = new Date().getFullYear() } = {}) {
  const normalizedCode = String(schoolCode || 'SCH').trim().toUpperCase() || 'SCH';
  const counterId = `idcard:${normalizedCode}:${year}`;
  const counter = await Counter.findByIdAndUpdate(
    counterId,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return `AF-${normalizedCode}-${year}-${String(counter.seq).padStart(4, '0')}`;
}

module.exports = { nextIdCardSerial };
