// Deterministic JSON serialization: object keys are sorted recursively so the
// same logical content always produces the same string — and therefore the same
// hash — regardless of the order properties happened to be inserted in.
//
// Used for GovernmentFinanceSnapshot.sourceDigest (Phase 1 of the مرکز مالی دولت
// review, finding P8): an official record's digest must be reproducible from its
// stored content so a version chain can be verified, and `JSON.stringify` alone
// is order-sensitive.

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return value;
  // Date -> ISO string, Mongoose ObjectId -> hex string, anything else that
  // knows how to reduce itself to JSON. Recurse in case toJSON returns an object.
  if (typeof value.toJSON === 'function') return canonicalize(value.toJSON());
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

module.exports = { canonicalize, canonicalStringify };
