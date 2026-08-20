// Finance/report records (FeeOrder, FeePayment, FinanceBill, FinanceRelief,
// Discount, FeeExemption, Attendance, ExamResult, ...) all carry
// studentId -> StudentCore, and reports have been reading
// StudentCore.admissionNo as "نمبر اساس". In practice this school enters the
// admission number on the AfghanStudent record instead (asasNumber field,
// filled in through the admission/enrollment forms) - StudentCore.admissionNo
// is a separate, largely-unused field. Every one of these docs also carries
// `student` -> User (required, always present), and AfghanStudent has
// linkedUserId -> the same User, so that's the bridge back to the real
// number.
//
// This resolves that bridge in one batch query instead of N+1 lookups per
// report row.

const AfghanStudent = require('../models/AfghanStudent');

function extractId(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '').trim();
  return String(value).trim();
}

/**
 * @param {Array<string|object>} userIds - User ids (or populated User docs / anything with ._id)
 * @returns {Promise<Map<string, string>>} userId -> asasNumber
 */
async function resolveAsasNumbersByUserIds(userIds = []) {
  const ids = [...new Set((userIds || []).map(extractId).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await AfghanStudent.find({ linkedUserId: { $in: ids } })
    .select('linkedUserId asasNumber')
    .lean();
  const map = new Map();
  rows.forEach((row) => {
    const key = extractId(row.linkedUserId);
    const value = String(row.asasNumber || '').trim();
    if (key && value && !map.has(key)) map.set(key, value);
  });
  return map;
}

/**
 * Batch-resolve directly from one or more arrays of docs that each carry a
 * `student` (User ref) field - the common shape for FeeOrder/FeePayment/
 * FinanceBill/FinanceRelief/Discount/FeeExemption/Attendance/ExamResult docs.
 * @param {...Array<object>} docArrays
 */
async function resolveAsasNumberMapForDocs(...docArrays) {
  const userIds = [];
  for (const docs of docArrays) {
    if (!Array.isArray(docs)) continue;
    for (const doc of docs) {
      const id = extractId(doc?.student);
      if (id) userIds.push(id);
    }
  }
  return resolveAsasNumbersByUserIds(userIds);
}

/**
 * Best admission number for one doc: StudentCore.admissionNo first (the
 * canonical field, when someone has actually filled it in), falling back to
 * the AfghanStudent.asasNumber this school actually uses.
 * @param {object} doc - a FeeOrder/FeePayment/... doc (populated or not)
 * @param {Map<string, string>} asasNumberMap - from resolveAsasNumberMapForDocs
 */
function pickAdmissionNo(doc = {}, asasNumberMap = new Map()) {
  const fromCore = String(doc?.studentId?.admissionNo || '').trim();
  if (fromCore) return fromCore;
  return asasNumberMap.get(extractId(doc?.student)) || '';
}

module.exports = { resolveAsasNumbersByUserIds, resolveAsasNumberMapForDocs, pickAdmissionNo };
