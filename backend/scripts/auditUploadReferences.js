/**
 * READ-ONLY: which records point at uploaded files that no longer exist?
 *
 * Until 2026-10 uploads lived only on Render's ephemeral disk, which a deploy,
 * restart or 15-minute idle spin-down wipes, while the database kept the paths.
 * This walks every document of every collection, collects each string that is an
 * "uploads/..." path, and checks it against storage (local disk, then the R2
 * bucket when R2_UPLOADS_BUCKET_NAME / R2_STUDENT_BUCKET_NAME and the R2
 * credentials are set). Nothing is written anywhere.
 *
 * Usage (from backend/):
 *   node scripts/auditUploadReferences.js --uri='mongodb+srv://...' --dns=8.8.8.8,1.1.1.1
 *   node scripts/auditUploadReferences.js --uri='...' --details     (one line per missing file)
 *
 * Run it with the same R2 variables as the server, or every R2-stored file will
 * look missing.
 */
require('dotenv').config();
const dns = require('node:dns');
const mongoose = require('mongoose');
const { describeUploadStorage, normalizeUploadKey, uploadedFileExists } = require('../services/uploadStorageService');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

function arg(name) {
  for (const token of process.argv.slice(2)) {
    if (token.startsWith(`--${name}=`)) return token.slice(name.length + 3).trim();
  }
  return '';
}
const has = (name) => process.argv.slice(2).includes(`--${name}`);

// A readable handle for a record, without printing personal fields wholesale.
function recordLabel(doc = {}) {
  const info = doc.personalInfo || {};
  const dariName = [info.firstNameDari, info.lastNameDari].filter(Boolean).join(' ');
  const name = dariName || [info.firstName, info.lastName].filter(Boolean).join(' ') || doc.studentName || doc.fullName || doc.name || doc.title || '';
  const number = doc.asasNumber || doc.receiptNumber || doc.orderNumber || doc.employmentInfo?.employeeId || '';
  return [name, number].filter(Boolean).join(' · ');
}

function collectUploadPaths(value, pathSoFar, out) {
  if (typeof value === 'string') {
    const key = normalizeUploadKey(value);
    if (key) out.push({ field: pathSoFar, key });
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (value instanceof Date || Buffer.isBuffer(value) || value._bsontype) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUploadPaths(item, `${pathSoFar}[${index}]`, out));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    collectUploadPaths(child, pathSoFar ? `${pathSoFar}.${key}` : key, out);
  }
}

async function run() {
  const uri = arg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  const dnsServers = arg('dns');
  if (dnsServers) dns.setServers(dnsServers.split(',').map((item) => item.trim()).filter(Boolean));

  const storage = describeUploadStorage();
  console.log(`storage checked: ${storage.storage}${storage.storage === 'local' ? ' (local disk only - R2 is not configured in this shell)' : ''}`);
  console.log(`connecting to: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;

  const existence = new Map();
  const exists = async (key) => {
    if (!existence.has(key)) existence.set(key, await uploadedFileExists(key));
    return existence.get(key);
  };

  const summary = [];
  const missing = [];
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((item) => item.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();

  for (const name of collections) {
    const fields = new Map();
    for await (const doc of db.collection(name).find({})) {
      const refs = [];
      collectUploadPaths(doc, '', refs);
      for (const ref of refs) {
        const field = ref.field.replace(/\[\d+\]/g, '[]');
        const row = fields.get(field) || { collection: name, field, total: 0, missing: 0 };
        row.total += 1;
        if (!(await exists(ref.key))) {
          row.missing += 1;
          missing.push({ collection: name, id: String(doc._id), field: ref.field, key: ref.key, label: recordLabel(doc) });
        }
        fields.set(field, row);
      }
    }
    summary.push(...fields.values());
  }

  if (!summary.length) {
    console.log('\nNo record points at an uploads/ path.');
  } else {
    console.log('\ncollection.field                                   files   missing');
    for (const row of summary) {
      console.log(`${`${row.collection}.${row.field}`.padEnd(50)} ${String(row.total).padStart(6)}  ${String(row.missing).padStart(8)}`);
    }
    const total = summary.reduce((sum, row) => sum + row.total, 0);
    console.log(`\n${missing.length} of ${total} referenced files are missing (${existence.size} distinct paths checked).`);
  }

  if (has('details') && missing.length) {
    console.log('\nmissing files:');
    for (const item of missing) {
      console.log(`- ${item.collection} ${item.id}${item.label ? ` (${item.label})` : ''} ${item.field} -> ${item.key}`);
    }
  } else if (missing.length) {
    console.log('Re-run with --details for one line per missing file.');
  }
}

run()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
