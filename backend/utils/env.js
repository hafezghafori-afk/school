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

const getCorsOptions = () => {
  const configured = parseCorsOrigins();
  const devDefaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ];

  const allowList = new Set(configured.length ? configured : (isProduction() ? [] : devDefaults));
  const openInDev = !isProduction() && allowList.size === 0;

  return {
    origin(origin, callback) {
      // Allow server-to-server and same-origin requests without Origin header.
      if (!origin) return callback(null, true);
      if (openInDev || allowList.has(origin)) return callback(null, true);
      // In development, allow LAN testing from private-network device browsers.
      if (!isProduction() && isDevLanOrigin(origin)) return callback(null, true);
      return callback(new Error('CORS blocked for this origin'));
    }
  };
};

module.exports = {
  getJwtSecret,
  getCorsOptions,
  isProduction
};
