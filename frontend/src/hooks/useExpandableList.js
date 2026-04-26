import { useEffect, useMemo, useState } from 'react';

export default function useExpandableList(items, options = {}) {
  const previewCount = Number(options.previewCount) > 0 ? Number(options.previewCount) : 3;
  const storageKey = String(options.storageKey || '').trim();

  const [isExpanded, setIsExpanded] = useState(() => {
    if (!storageKey) return false;
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });

  const safeItems = Array.isArray(items) ? items : [];
  const hasMore = safeItems.length > previewCount;
  const hiddenCount = Math.max(safeItems.length - previewCount, 0);

  const visibleItems = useMemo(() => (
    isExpanded ? safeItems : safeItems.slice(0, previewCount)
  ), [isExpanded, safeItems, previewCount]);

  useEffect(() => {
    if (safeItems.length === 0) return;
    if (!hasMore && isExpanded) {
      setIsExpanded(false);
    }
  }, [safeItems.length, hasMore, isExpanded]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, isExpanded ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [storageKey, isExpanded]);

  return {
    isExpanded,
    setIsExpanded,
    toggleExpanded: () => setIsExpanded((prev) => !prev),
    hasMore,
    hiddenCount,
    visibleItems,
    totalCount: safeItems.length,
    previewCount
  };
}
