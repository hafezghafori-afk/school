const ExpenseCategoryDefinition = require('../models/ExpenseCategoryDefinition');
const { EXPENSE_CHART } = require('../config/expenseChart');

// ExpenseEntry.category / ExpenseEntry.subCategory store the *keys*
// ("payroll" / "teacher_salary", "کرایه" / "item_2"), while the human-readable
// Persian text lives on ExpenseCategoryDefinition (admins can rename it there).
// A key with no definition row falls back to the built-in chart's label, and
// only then to the key itself - without this map reports print raw keys like
// "payroll" / "teacher_salary".
async function loadExpenseCategoryLabelMap() {
  const definitions = await ExpenseCategoryDefinition.find({})
    .select('key label subCategories.key subCategories.label')
    .lean();
  const categoryLabels = new Map();
  const subCategoryLabels = new Map();
  const setLabels = (categoryKey, label, subCategories) => {
    const key = String(categoryKey || '').trim();
    if (!key) return;
    const text = String(label || '').trim();
    if (text) categoryLabels.set(key, text);
    for (const sub of Array.isArray(subCategories) ? subCategories : []) {
      const subKey = String(sub?.key || '').trim();
      const subText = String(sub?.label || '').trim();
      if (subKey && subText) subCategoryLabels.set(`${key}::${subKey}`, subText);
    }
  };
  EXPENSE_CHART.forEach((item) => setLabels(item.key, item.label, item.subCategories));
  definitions.forEach((definition) => setLabels(definition?.key, definition?.label, definition?.subCategories));

  return {
    category: (key) => categoryLabels.get(String(key || '').trim()) || String(key || '').trim(),
    subCategory: (categoryKey, subKey) => subCategoryLabels.get(
      `${String(categoryKey || '').trim()}::${String(subKey || '').trim()}`
    ) || ''
  };
}

module.exports = { loadExpenseCategoryLabelMap };
