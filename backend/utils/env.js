const warned = new Set();

const isProduction = () => String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const warnOnce = (key, message) => {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
};

const getJwtSecret = () => {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (secret && secret !== 'dev_secret') return secret;

  if (isProduction()) {
    throw new Error('JWT_SECRET is missing or weak in production environment');
  }

  warnOnce(
    'jwt-secret',
    '[security] JWT_SECRET is not set (or is "dev_secret"). Using development fallback only.'
  );
  return secret || 'dev_secret';
};

const parseCorsOrigins = () => {
  const raw = String(process.env.CORS_ORIGIN || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const isPrivateIpv4Host = (host = '') => {
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;

  const match = host.match(/^172\.(\d{1,3})\./);
  if (!match) return false;

  const secondOctet = Number(match[1]);
  return Number.isInteger(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
};

const isDevLanOrigin = (origin = '') => {
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    return isPrivateIpv4Host(hostname);
  } catch {
    return false;
  }
};

const DEPLOYED_FRONTEND_ORIGINS = [
  'https://school-swart-delta.vercel.app',
  'https://imangirlschool.com',
  'https://www.imangirlschool.com'
];
const CANONICAL_FRONTEND_ORIGIN = 'https://www.imangirlschool.com';
const DEV_FRONTEND_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const getFrontendAllowList = () => new Set([
  ...DEPLOYED_FRONTEND_ORIGINS,
  ...parseCorsOrigins(),
  ...(!isProduction() ? DEV_FRONTEND_ORIGINS : [])
]);

// Base URL for links the backend emails out (e.g. password reset). The
// request's Origin is only trusted when it is an allowed frontend, so a forged
// Origin header can never point a reset link at someone else's site.
const getPublicAppUrl = (req = null) => {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const origin = String(req?.get?.('origin') || '').trim().replace(/\/+$/, '');
  if (origin && getFrontendAllowList().has(origin)) return origin;
  if (origin && !isProduction() && isDevLanOrigin(origin)) return origin;
  return CANONICAL_FRONTEND_ORIGIN;
};

const getCorsOptions = () => {
  const configured = parseCorsOrigins();

  // Always allow the deployed frontend domains, even if NODE_ENV is not set on Render.
  const allowList = getFrontendAllowList();
  const openInDev = !isProduction() && configured.length === 0;

  return {
    exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length'],
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (openInDev || allowList.has(origin)) return callback(null, true);
      if (!isProduction() && isDevLanOrigin(origin)) return callback(null, true);
      return callback(new Error('CORS blocked for this origin'));
    }
  };
};

module.exports = {
  getJwtSecret,
  getCorsOptions,
  getPublicAppUrl,
  isProduction
};
