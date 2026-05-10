function toEnglishAlphaNumeric(value = '') {
  return String(value || '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function formatFinanceCode(value = '', fallback = '') {
  const code = toEnglishAlphaNumeric(value).trim();
  return code || fallback;
}

module.exports = {
  toEnglishAlphaNumeric,
  formatFinanceCode
};
