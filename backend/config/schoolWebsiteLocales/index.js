const fa = require('./fa');
const en = require('./en');
const ps = require('./ps');

const locales = { fa, en, ps };

const getSchoolWebsiteLocale = (language = 'fa') => locales[language] || locales.fa;

module.exports = {
  getSchoolWebsiteLocale
};
