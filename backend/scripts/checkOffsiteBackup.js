const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const Module = require('module');

// The nightly off-site backup is the only copy of the database outside Atlas.
// These cases pin what makes it trustworthy: a byte-exact round trip, refusal of
// a wrong passphrase / tampered / truncated file without leaving a partial
// restore behind, no path escapes, a retention rule that never drops the newest
// or a month's first copy, and a workflow that never publishes the backup.

const backendRoot = path.join(__dirname, '..');
const servicePath = path.join(backendRoot, 'services', 'offsiteBackupService.js');
const workflowPath = path.join(backendRoot, '..', '.github', 'workflows', 'db-backup-nightly.yml');
const PASSPHRASE = 'correct horse battery staple 2026';

function assertCase(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectFailure(promise, code, message) {
  try {
    await promise;
  } catch (error) {
    const matches = code instanceof RegExp ? code.test(String(error.code)) : error.code === code;
    assertCase(matches, `${message}: expected ${code}, got ${error.code} (${error.message})`);
    return;
  }
  throw new Error(`${message}: expected ${code}, but it succeeded`);
}

// --- in-memory bucket for the R2 helpers ------------------------------------------
const bucket = new Map();
class Command {
  constructor(input) {
    this.input = input;
  }
}
const fakeS3 = {
  PutObjectCommand: class PutObjectCommand extends Command {},
  HeadObjectCommand: class HeadObjectCommand extends Command {},
  GetObjectCommand: class GetObjectCommand extends Command {},
  DeleteObjectCommand: class DeleteObjectCommand extends Command {},
  ListObjectsV2Command: class ListObjectsV2Command extends Command {},
  CreateMultipartUploadCommand: class CreateMultipartUploadCommand extends Command {},
  UploadPartCommand: class UploadPartCommand extends Command {},
  CompleteMultipartUploadCommand: class CompleteMultipartUploadCommand extends Command {},
  AbortMultipartUploadCommand: class AbortMultipartUploadCommand extends Command {},
  S3Client: class S3Client {
    async send(command) {
      const { input } = command;
      switch (command.constructor.name) {
        case 'PutObjectCommand':
          bucket.set(input.Key, Buffer.from(input.Body));
          return {};
        case 'HeadObjectCommand':
          return { ContentLength: bucket.get(input.Key)?.length };
        case 'DeleteObjectCommand':
          bucket.delete(input.Key);
          return {};
        case 'ListObjectsV2Command': {
          // two keys per page, to exercise the continuation loop
          const keys = [...bucket.keys()].filter((key) => key.startsWith(input.Prefix)).sort();
          const start = Number(input.ContinuationToken || 0);
          const page = keys.slice(start, start + 2);
          const more = start + 2 < keys.length;
          return { Contents: page.map((Key) => ({ Key, Size: bucket.get(Key).length })), IsTruncated: more, NextContinuationToken: more ? String(start + 2) : undefined };
        }
        default:
          throw new Error(`unexpected ${command.constructor.name}`);
      }
    }
  }
};

function loadService() {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@aws-sdk/client-s3' && String(parent?.filename || '').replace(/\\/g, '/').endsWith('/services/offsiteBackupService.js')) return fakeS3;
    return originalLoad.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve(servicePath)];
    return require(servicePath);
  } finally {
    Module._load = originalLoad;
  }
}

// Builds an .sbk by hand (same layout as the service) around arbitrary frames.
function craftArchive(file, frames, { endMarker = true } = {}) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const header = Buffer.concat([Buffer.from('SBK1'), salt, iv]);
  const key = crypto.scryptSync(PASSPHRASE, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(header);
  const parts = [];
  for (const [name, data] of frames) {
    const nameBytes = Buffer.from(name);
    const head = Buffer.alloc(4 + nameBytes.length + 8);
    head.writeUInt32BE(nameBytes.length, 0);
    nameBytes.copy(head, 4);
    head.writeBigUInt64BE(BigInt(data.length), 4 + nameBytes.length);
    parts.push(head, data);
  }
  if (endMarker) parts.push(Buffer.alloc(4));
  const body = Buffer.concat([cipher.update(zlib.gzipSync(Buffer.concat(parts))), cipher.final()]);
  fs.writeFileSync(file, Buffer.concat([header, body, cipher.getAuthTag()]));
}

function readTree(root) {
  const out = {};
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else out[path.relative(root, absolute).split(path.sep).join('/')] = fs.readFileSync(absolute).toString('base64');
    }
  };
  visit(root);
  return out;
}

// The whole nightly run — backup, encrypt, upload, decrypt, restore drill,
// prune — against the MongoDB in MONGO_URI (CI's service container). Skipped
// when MONGO_URI is not set explicitly, so it never touches a developer's
// default local database by accident.
async function endToEnd() {
  if (!process.env.MONGO_URI) {
    console.log('[check:offsite-backup] MONGO_URI not set - skipping the end-to-end drill');
    return;
  }
  const serverUri = process.env.MONGO_URI.replace(/\/[^/?]*(\?|$)/, '/$1');
  Object.assign(process.env, {
    DB_BACKUP_PASSPHRASE: PASSPHRASE,
    R2_ACCESS_KEY_ID: 'k',
    R2_SECRET_ACCESS_KEY: 's',
    R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
    R2_BACKUP_BUCKET_NAME: 'school-backups'
  });
  bucket.clear();
  const { run: runBackup } = require('./offsiteBackup');
  const originalLog = console.log;
  const lines = [];
  console.log = (...parts) => lines.push(parts.join(' '));
  try {
    await runBackup([`--restore-drill-uri=${serverUri}`, '--prune']);
  } finally {
    console.log = originalLog;
  }
  const keys = [...bucket.keys()];
  assertCase(keys.length === 1 && /^db-backups\/\d{4}\/\d{2}\/school-db-.*\.sbk$/.test(keys[0]), `One encrypted backup expected in the bucket, got ${keys.join(', ')}.`);
  assertCase(lines.some((line) => /^restore drill: all \d+ collections restored and verified/.test(line)), `The restore drill must pass:\n${lines.join('\n')}`);
  assertCase(!lines.join('\n').includes(PASSPHRASE), 'The passphrase must never be printed.');

  const mongoose = require('mongoose');
  const connection = await mongoose.createConnection(serverUri).asPromise();
  try {
    const { databases } = await connection.getClient().db().admin().listDatabases();
    assertCase(!databases.some((db) => db.name.startsWith('restore_drill_')), 'The restore drill database must be dropped afterwards.');
  } finally {
    await connection.close();
  }
}

async function run() {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assertCase(/schedule:/.test(workflow) && /cron:/.test(workflow), 'The backup workflow must run on a schedule.');
  assertCase(/secrets\.DB_BACKUP_PASSPHRASE/.test(workflow) && /secrets\.MONGO_URI/.test(workflow), 'The workflow must take the passphrase and database URI from secrets.');
  assertCase(/--restore-drill-uri=/.test(workflow) && /image: mongo:/.test(workflow), 'Every run must restore the backup into a throwaway MongoDB service.');
  assertCase(!/upload-artifact/.test(workflow), 'The repository is public: a backup must never become a workflow artifact.');

  const service = loadService();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'offsite-backup-check-'));
  try {
    const source = path.join(temp, 'source');
    fs.mkdirSync(path.join(source, 'database'), { recursive: true });
    fs.writeFileSync(path.join(source, 'manifest.json'), JSON.stringify({ formatVersion: 2, note: 'شاگردان صنف دهم' }));
    fs.writeFileSync(path.join(source, 'database', 'students.json'), JSON.stringify([{ name: 'مریم', secret: 'PLAINTEXT-MARKER' }]));
    fs.writeFileSync(path.join(source, 'database', 'empty.json'), '');
    fs.writeFileSync(path.join(source, 'database', 'large.bin'), crypto.randomBytes(5 * 1024 * 1024));

    const archive = path.join(temp, 'backup.sbk');
    const packed = await service.encryptDirectory({ sourceDir: source, outFile: archive, passphrase: PASSPHRASE });
    const raw = fs.readFileSync(archive);
    assertCase(raw.subarray(0, 4).toString() === 'SBK1' && packed.size === raw.length, 'The file starts with the SBK1 header and its size is reported.');
    assertCase(packed.sha256 === crypto.createHash('sha256').update(raw).digest('hex'), 'The reported sha256 is the file hash.');
    assertCase(!raw.includes(Buffer.from('PLAINTEXT-MARKER')) && !raw.includes(Buffer.from('formatVersion')), 'Nothing readable may survive in the encrypted file.');

    const restored = path.join(temp, 'restored');
    const result = await service.decryptToDirectory({ inFile: archive, outDir: restored, passphrase: PASSPHRASE });
    assertCase(JSON.stringify(readTree(restored)) === JSON.stringify(readTree(source)), 'Decryption must reproduce every file byte for byte, empty ones included.');
    assertCase(result.files.length === 4, `Four files expected, got ${result.files.length}.`);

    await expectFailure(service.decryptToDirectory({ inFile: archive, outDir: restored, passphrase: PASSPHRASE }), 'BACKUP_OUT_EXISTS', 'An existing output directory');
    await expectFailure(service.encryptDirectory({ sourceDir: source, outFile: path.join(temp, 'weak.sbk'), passphrase: 'short' }), 'BACKUP_PASSPHRASE_WEAK', 'A short passphrase');

    const wrongOut = path.join(temp, 'wrong');
    await expectFailure(service.decryptToDirectory({ inFile: archive, outDir: wrongOut, passphrase: `${PASSPHRASE}!` }), 'BACKUP_DECRYPT_FAILED', 'A wrong passphrase');
    assertCase(!fs.existsSync(wrongOut) && !fs.existsSync(`${wrongOut}.partial`), 'A failed decrypt leaves nothing behind.');

    // Damage is refused (which check trips first depends on where it lands) and
    // never leaves a restore directory behind.
    for (const [label, bytes] of [
      ['a flipped byte in the data', (() => { const copy = Buffer.from(raw); copy[Math.floor(copy.length / 2)] ^= 0x01; return copy; })()],
      ['a flipped byte in the header', (() => { const copy = Buffer.from(raw); copy[6] ^= 0x01; return copy; })()],
      ['a truncated file', Buffer.concat([raw.subarray(0, raw.length - 4096), raw.subarray(raw.length - 16)])]
    ]) {
      const damaged = path.join(temp, 'damaged.sbk');
      const out = path.join(temp, 'damaged');
      fs.writeFileSync(damaged, bytes);
      await expectFailure(service.decryptToDirectory({ inFile: damaged, outDir: out, passphrase: PASSPHRASE }), /^BACKUP_/, label);
      assertCase(!fs.existsSync(out) && !fs.existsSync(`${out}.partial`), `${label} must not leave a restore behind.`);
    }

    const escape = path.join(temp, 'escape.sbk');
    craftArchive(escape, [['manifest.json', Buffer.from('{}')], ['../outside.txt', Buffer.from('x')]]);
    await expectFailure(service.decryptToDirectory({ inFile: escape, outDir: path.join(temp, 'escape'), passphrase: PASSPHRASE }), 'BACKUP_PATH_INVALID', 'A path escaping the backup');
    assertCase(!fs.existsSync(path.join(temp, 'outside.txt')) && !fs.existsSync(path.join(temp, 'escape')), 'Nothing is written outside the output directory.');

    const noEnd = path.join(temp, 'no-end.sbk');
    craftArchive(noEnd, [['manifest.json', Buffer.from('{}')]], { endMarker: false });
    await expectFailure(service.decryptToDirectory({ inFile: noEnd, outDir: path.join(temp, 'no-end'), passphrase: PASSPHRASE }), 'BACKUP_FILE_INVALID', 'A stream without its end marker');

    // ---- keys and retention -------------------------------------------------------
    const stamp = new Date('2026-10-10T21:30:05Z');
    const key = service.backupKeyFor(stamp);
    assertCase(key === 'db-backups/2026/10/school-db-2026-10-10T21-30-05Z.sbk', `Unexpected key ${key}`);
    assertCase(service.backupDateFromKey(key).getTime() === stamp.getTime(), 'Keys parse back to their date.');
    assertCase(service.backupDateFromKey('db-backups/notes.txt') === null, 'Foreign keys have no date.');

    const now = new Date('2026-10-10T22:00:00Z');
    const daily = [];
    for (let day = 0; day < 400; day += 1) {
      const date = new Date(now.getTime() - day * 24 * 60 * 60 * 1000 - 30 * 60 * 1000);
      daily.push({ key: service.backupKeyFor(date), date });
    }
    const expired = service.selectExpiredBackups(daily, now);
    const expiredKeys = new Set(expired.map((item) => item.key));
    const kept = daily.filter((item) => !expiredKeys.has(item.key));
    assertCase(!expiredKeys.has(daily[0].key), 'The newest backup is never deleted.');
    assertCase(daily.slice(0, 30).every((item) => !expiredKeys.has(item.key)), 'The last 30 days are all kept.');
    const monthStarts = kept.filter((item) => item.date.getTime() < now.getTime() - 30 * 24 * 60 * 60 * 1000);
    assertCase(monthStarts.every((item) => item.date.getUTCDate() === 1), 'Older copies kept are the first of their month.');
    assertCase(new Set(monthStarts.map((item) => item.date.toISOString().slice(0, 7))).size === monthStarts.length, 'At most one older copy per month.');
    assertCase(expired.every((item) => item.date.getTime() < now.getTime() - 30 * 24 * 60 * 60 * 1000), 'Nothing from the last 30 days is selected.');
    assertCase(kept.length >= 30 && kept.length <= 43 && expired.length === daily.length - kept.length, `Unexpected retention split: ${kept.length} kept.`);
    assertCase(service.selectExpiredBackups([], now).length === 0, 'An empty bucket has nothing to prune.');
    assertCase(service.selectExpiredBackups([daily[399]], now).length === 0, 'A single (old) backup is the newest and stays.');

    // ---- R2 helpers against the in-memory bucket ------------------------------------
    process.env.R2_ACCESS_KEY_ID = 'k';
    process.env.R2_SECRET_ACCESS_KEY = 's';
    process.env.R2_ENDPOINT = 'https://example.r2.cloudflarestorage.com';
    process.env.R2_BACKUP_BUCKET_NAME = 'school-backups';
    const r2 = service.getBackupR2();
    const uploaded = await service.uploadBackupFile(r2, key, archive, { sha256: packed.sha256 });
    assertCase(uploaded.size === raw.length && bucket.get(key).equals(raw), 'The encrypted file is uploaded unchanged.');
    bucket.set('db-backups/readme.txt', Buffer.from('not a backup'));
    for (const item of daily.slice(1, 70)) bucket.set(item.key, Buffer.from('old'));
    const pruned = await service.pruneBackups(r2, now);
    assertCase(pruned.deleted > 0 && bucket.has(key) && bucket.has('db-backups/readme.txt'), 'Pruning keeps the newest copy and never touches foreign keys.');
    assertCase(daily.slice(1, 30).every((item) => bucket.has(item.key)), 'Pruning keeps the last 30 days.');
    delete process.env.R2_BACKUP_BUCKET_NAME;
    delete process.env.R2_ENDPOINT;
    let missingError = null;
    try {
      service.getBackupR2();
    } catch (error) {
      missingError = error;
    }
    assertCase(missingError?.code === 'BACKUP_R2_CONFIG_MISSING' && /R2_ENDPOINT/.test(missingError.message), 'Missing R2 settings are named.');

    await endToEnd();
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
    ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BACKUP_BUCKET_NAME', 'DB_BACKUP_PASSPHRASE'].forEach((name) => { delete process.env[name]; });
  }
}

run()
  .then(() => {
    console.log('[check:offsite-backup] ok');
  })
  .catch((error) => {
    console.error('[check:offsite-backup] failed');
    console.error(error);
    process.exit(1);
  });
