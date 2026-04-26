require('dotenv').config();

const mongoose = require('mongoose');
const { AFGHAN_SOLAR_MONTHS, IRANIAN_TO_AFGHAN_SOLAR_MONTHS } = require('../utils/afghanDate');

const ENGLISH_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const IRANIAN_MONTHS = Object.keys(IRANIAN_TO_AFGHAN_SOLAR_MONTHS);
const MONTH_TOKEN_BOUNDARY = '[\\s\\u200c\\-_/،,:;()\\[\\]{}]+';

const getMongoUri = () => process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

function escapeRegex(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasStandaloneToken(value = '', token = '', isLatin = false) {
  const escapedToken = escapeRegex(token);
  const regex = isLatin
    ? new RegExp(`\\b${escapedToken}\\b`)
    : new RegExp(`(^|${MONTH_TOKEN_BOUNDARY})${escapedToken}(?=$|${MONTH_TOKEN_BOUNDARY})`);
  return regex.test(value);
}

function scanValue(value, path, hits) {
  if (typeof value === 'string') {
    IRANIAN_MONTHS.forEach((token) => {
      if (hasStandaloneToken(value, token, false)) {
        hits.push({ family: 'iranian_solar', token, path, preview: value.slice(0, 160) });
      }
    });
    ENGLISH_MONTHS.forEach((token) => {
      if (hasStandaloneToken(value, token, true)) {
        hits.push({ family: 'english_gregorian', token, path, preview: value.slice(0, 160) });
      }
    });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, `${path}[${index}]`, hits));
    return;
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    Object.entries(value).forEach(([key, nested]) => {
      scanValue(nested, path ? `${path}.${key}` : key, hits);
    });
  }
}

async function main() {
  await mongoose.connect(getMongoUri());
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const report = [];

    for (const collectionInfo of collections) {
      const collection = db.collection(collectionInfo.name);
      const docs = await collection.find({}).toArray();
      const matches = [];

      docs.forEach((doc) => {
        const hits = [];
        scanValue(doc, '', hits);
        if (hits.length) {
          matches.push({
            _id: String(doc._id),
            hits: hits.slice(0, 10)
          });
        }
      });

      if (matches.length) {
        report.push({
          collection: collectionInfo.name,
          count: matches.length,
          matches: matches.slice(0, 5)
        });
      }
    }

    console.log(JSON.stringify({
      afghanMonths: AFGHAN_SOLAR_MONTHS,
      iranianMonths: IRANIAN_MONTHS,
      englishMonths: ENGLISH_MONTHS,
      collectionsWithNonAfghanMonthLabels: report
    }, null, 2));
  } finally {
    await mongoose.connection.close();
  }
}

main().catch((error) => {
  console.error('Month label scan failed:', error);
  process.exitCode = 1;
});
