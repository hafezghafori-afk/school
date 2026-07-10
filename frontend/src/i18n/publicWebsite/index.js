import fa from './fa';
import en from './en';
import ps from './ps';

export const publicWebsiteLocales = { fa, en, ps };

export const getPublicWebsiteLocale = (language = 'fa') => (
  publicWebsiteLocales[language] || publicWebsiteLocales.fa
);

export const publicLanguageOptions = Object.values(publicWebsiteLocales)
  .map(({ code, label }) => ({ code, label }));
