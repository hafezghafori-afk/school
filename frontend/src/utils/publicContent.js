// Shared normalizers for the public marketing/school pages (Home, About, …).
//
// Every list the school can edit from Admin Settings arrives here as an array of
// { title, text, value, icon } rows (already localized to one language by the
// backend). The school often fills only some columns, so each normalizer is
// deliberately forgiving: a partially filled row still renders instead of being
// silently dropped and snapping the section back to its hard-coded fallback.

export const normalizeCardList = (items, fallback, { requireText = true } = {}) => {
  if (!Array.isArray(items) || !items.length) return fallback;
  const normalized = items
    .map((item, index) => ({
      title: String(item?.title || '').trim(),
      text: String(item?.text || item?.desc || '').trim(),
      icon: String(item?.value || item?.icon || fallback[index]?.icon || 'fa-circle-check').trim()
    }))
    .filter((item) => (requireText ? item.title && item.text : item.title || item.text));
  return normalized.length ? normalized : fallback;
};

export const normalizeStats = (items, fallback) => {
  if (!Array.isArray(items) || !items.length) return fallback;
  const normalized = items
    .map((item) => {
      const value = String(item?.value ?? '').trim();
      const title = String(item?.title ?? '').trim();
      const label = String(item?.label || item?.text || item?.desc || '').trim();
      // When the «مقدار» column is empty, the first thing the admin typed
      // becomes the big number and the rest becomes the caption.
      return value
        ? { value, label: label || title }
        : { value: title || label, label: title ? label : '' };
    })
    .filter((item) => item.value);
  return normalized.length ? normalized : fallback;
};

export const normalizeHighlights = (items, fallback, { limit = 4 } = {}) => {
  if (!Array.isArray(items) || !items.length) return fallback;
  const normalized = items.map((item) => String(item?.title || '').trim()).filter(Boolean);
  if (!normalized.length) return fallback;
  return limit ? normalized.slice(0, limit) : normalized;
};

export const normalizeTimeline = (items, fallback) => {
  if (!Array.isArray(items) || !items.length) return fallback;
  const normalized = items
    .map((item) => ({
      year: String(item?.year || item?.title || item?.value || '').trim(),
      text: String(item?.text || item?.desc || item?.label || '').trim()
    }))
    .filter((item) => item.year || item.text);
  return normalized.length ? normalized : fallback;
};
