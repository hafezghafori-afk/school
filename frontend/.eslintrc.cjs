module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    jest: true,
    es2022: true
  },
  plugins: ['react-hooks'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  rules: {
    'no-undef': 'error',
    'no-redeclare': 'error'
  }
};
