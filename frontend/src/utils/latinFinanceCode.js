export const toEnglishAlphaNumeric = (value = '') => String(value || '')
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

export const formatFinanceCode = (value = '', fallback = '-') => {
  const code = toEnglishAlphaNumeric(value).trim();
  return code || fallback;
};
