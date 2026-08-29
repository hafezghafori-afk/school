/**
 * READ-ONLY logical backup of a MongoDB database to local JSONL files.
 *
 * Same "--uri / --dns" style as the other diagnostic scripts, so it can dump a
 * remote Atlas (mongodb+srv://) database from a machine whose resolver refuses
 * SRV lookups. Reads every collection; writes nothing to the database.
 *
 * Output: backend/backups/<timestamp>[-<label>]/
 *   <collection>.jsonl        one JSON document per line
 *   _manifest.json            { db, takenAt, collections: [{name, count}] }
 *
 * Usage (from backend/):
 *   node scripts/backupAtlas.js --uri='mongodb+srv://...' --dns=8.8.8.8,1.1.1.1 --label=pre-admission-evidence-repair
 *   node scripts/backupAtlas.js --uri='...' --dns=8.8.8.8,1.1.1.1 --out=../my-backup-dir
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns');
const mongoose = require('mongoose');

const backendRoot = path.resolve(__dirname, '..');
const backupRoot = path.join(backendRoot, 'backups');

function arg(name) {
  for (const t of process.argv.slice(2)) {
    if (t.startsWith(`--${name}=`)) return t.slice(name.length + 3).trim();
  }
  return '';
}

const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
const cleanLabel = (v) => String(v || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

async function run() {
  const uri = arg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  const dnsServers = arg('dns');
  if (dnsServers) {
    dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(`DNS servers: ${dns.getServers().join(', ')}`);
  }

  const outDir = arg('out')
    ? path.resolve(backendRoot, arg('out'))
    : path.join(backupRoot, `${stamp()}${cleanLabel(arg('label')) ? `-${cleanLabel(arg('label'))}` : ''}`);

  console.log(`connecting to: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;
  console.log(`DB: ${db.databaseName}`);
  console.log(`output: ${outDir}\n`);
  fs.mkdirSync(outDir, { recursive: true });

  const { EJSON } = require('bson');
  const collections = (await db.listCollections().toArray())
    .filter((c) => c.type !== 'view')
    .map((c) => c.name)
    .sort();

  const manifest = { db: db.databaseName, takenAt: new Date().toISOString(), source: uri.replace(/\/\/[^@]*@/, '//***@'), collections: [] };

  for (const name of collections) {
    const file = path.join(outDir, `${name}.jsonl`);
    const stream = fs.createWriteStream(file, { encoding: 'utf8' });
    const cursor = db.collection(name).find({}, { noCursorTimeout: false });
    let count = 0;
    for await (const doc of cursor) {
      stream.write(`${EJSON.stringify(doc)}\n`);
      count += 1;
    }
    await new Promise((res, rej) => stream.end((err) => (err ? rej(err) : res())));
    manifest.collections.push({ name, count });
    console.log(`  ${name.padEnd(38)} ${count}`);
  }

  fs.writeFileSync(path.join(outDir, '_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const total = manifest.collections.reduce((s, c) => s + c.count, 0);
  console.log(`\nbackup complete: ${collections.length} collections, ${total} documents`);
  console.log(outDir);

  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
