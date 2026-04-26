const DEFAULT_API_BASE = 'http://localhost:5000';

const normalizeBase = (value = '', fallback = DEFAULT_API_BASE) => {
  const trimmed = String(value || '').trim();
  // In development, if value is empty, return empty string to use proxy
  if (import.meta.env.DEV && !trimmed) {
    return '';
  }
  if (!trimmed) return fallback;
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

// In development, use empty string to rely on Vite proxy
const DEV_FALLBACK_API_BASE = '';
const fallbackBase = import.meta.env.DEV ? DEV_FALLBACK_API_BASE : DEFAULT_API_BASE;
export const API_BASE = normalizeBase(import.meta.env.VITE_API_BASE, fallbackBase);

// Debug: Log the API_BASE value
console.log('API_BASE:', API_BASE);
console.log('import.meta.env.DEV:', import.meta.env.DEV);
console.log('VITE_API_BASE:', import.meta.env.VITE_API_BASE);

export const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE).origin;
  } catch {
    return '';
  }
})();
