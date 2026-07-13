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

 