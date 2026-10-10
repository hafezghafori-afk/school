// Off-site, encrypted copies of the v2 database backups (databaseBackupService).
//
// The only backups that existed before 2026-10 were made by hand, before a
// risky operation, onto one developer's machine. This packs a finished v2
// backup directory into one encrypted file, keeps it in an R2 bucket, and
// prunes old copies on a daily/monthly schedule; .github/workflows/db-backup-
// nightly.yml runs it every night and restores the result into a throwaway
// database to prove it is usable.
//
// File format (.sbk): "SBK1" | salt(16) | iv(12) | AES-256-GCM(gzip(frames)) | tag(16)
//   key   = scrypt(passphrase, salt), header bytes are authenticated as AAD
//   frame = uint32 path length | path (utf8) | uint64 size | file bytes
//   a zero path length ends the stream, so a truncated file never decrypts.
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand
} = require('@aws-sdk/client-s3');

const MAGIC = Buffer.from('SBK1');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES;
const SCRYPT_OPTIONS = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const MIN_PASSPHRASE_LENGTH = 16;
const BACKUP_PREFIX = 'db-backups/';
const SINGLE_PUT_LIMIT = 64 * 1024 * 1024;
const PART_SIZE = 16 * 1024 * 1024;

function backupError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function assertPassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw backupError('BACKUP_PASSPHRASE_WEAK', `DB_BACKUP_PASSPHRASE must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
}

const deriveKey = (passphrase, salt) => crypto.scryptSync(passphrase, salt, 32, SCRYPT_OPTIONS);

function listFiles(rootDir) {
  const result = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw backupError('BACKUP_SYMLINK', `Symbolic links are not packed: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) result.push(absolute);
    }
  };
  visit(rootDir);
  return result;
}

async function* frames(sourceDir) {
  for (const absolute of listFiles(sourceDir)) {
    const relative = path.relative(sourceDir, absolute).split(path.sep).join('/');
    const name = Buffer.from(relative, 'utf8');
    const data = await fsp.readFile(absolute);
    const head = Buffer.alloc(4 + name.length + 8);
    head.writeUInt32BE(name.length, 0);
    name.copy(head, 4);
    head.writeBigUInt64BE(BigInt(data.length), 4 + name.length);
    yield head;
    yield data;
  }
  yield Buffer.alloc(4); // end marker
}

// Packs sourceDir into one encrypted file; returns its size and sha256.
async function encryptDirectory({ sourceDir, outFile, passphrase }) {
  assertPassphrase(passphrase);
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const header = Buffer.concat([MAGIC, salt, iv]);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  cipher.setAAD(header);

  await fsp.writeFile(outFile, header, { flag: 'wx' });
  await pipeline(Readable.from(frames(sourceDir)), zlib.createGzip({ level: 9 }), cipher, fs.createWriteStream(outFile, { flags: 'a' }));
  await fsp.appendFile(outFile, cipher.getAuthTag());

  const bytes = await fsp.readFile(outFile);
  return { size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

// Chunks in, exact-size slices out, without re-concatenating everything held.
class ByteQueue {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }

  push(chunk) {
    if (!chunk.length) return;
    this.chunks.push(chunk);
    this.length += chunk.length;
  }

  take(count) {
    const out = Buffer.allocUnsafe(count);
    let offset = 0;
    while (offset < count) {
      const head = this.chunks[0];
      const needed = count - offset;
      if (head.length <= needed) {
        head.copy(out, offset);
        offset += head.length;
        this.chunks.shift();
      } else {
        head.copy(out, offset, 0, needed);
        this.chunks[0] = head.subarray(needed);
        offset += needed;
      }
    }
    this.length -= count;
    return out;
  }
}

function safeRelativePath(value) {
  const normalized = String(value || '');
  const segments = normalized.split('/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\\') || normalized.includes('\0')
    || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw backupError('BACKUP_PATH_INVALID', `Unsafe path inside backup: ${normalized}`);
  }
  return segments;
}

// Decrypts an .sbk file into outDir (which must not exist yet). Files are
// written to outDir + ".partial" and only moved into place once the GCM tag has
// verified the whole stream, so a wrong passphrase or a damaged file never
// leaves half a backup behind.
async function decryptToDirectory({ inFile, outDir, passphrase }) {
  assertPassphrase(passphrase);
  const target = path.resolve(outDir);
  if (fs.existsSync(target)) throw backupError('BACKUP_OUT_EXISTS', `Output directory already exists: ${target}`);
  const { size } = await fsp.stat(inFile);
  if (size < HEADER_BYTES + TAG_BYTES) throw backupError('BACKUP_FILE_INVALID', 'Not an encrypted backup file.');

  const handle = await fsp.open(inFile, 'r');
  const header = Buffer.alloc(HEADER_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await handle.read(header, 0, HEADER_BYTES, 0);
    await handle.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw backupError('BACKUP_FILE_INVALID', 'Not an encrypted backup file.');
  const salt = header.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
  const iv = header.subarray(MAGIC.length + SALT_BYTES);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);

  const staging = `${target}.partial`;
  await fsp.rm(staging, { recursive: true, force: true });
  await fsp.mkdir(staging, { recursive: true });

  const queue = new ByteQueue();
  let state = { need: 4, step: 'nameLength' };
  let name = '';
  let ended = false;
  const files = [];
  const parse = async () => {
    while (queue.length >= state.need) {
      if (ended) throw backupError('BACKUP_FILE_INVALID', 'Data after the end marker.');
      const bytes = queue.take(state.need);
      if (state.step === 'nameLength') {
        const nameLength = bytes.readUInt32BE(0);
        if (nameLength === 0) {
          ended = true;
          state = { need: 1, step: 'trailing' };
        } else {
          state = { need: nameLength, step: 'name' };
        }
      } else if (state.step === 'name') {
        name = bytes.toString('utf8');
        state = { need: 8, step: 'size' };
      } else if (state.step === 'size') {
        state = { need: Number(bytes.readBigUInt64BE(0)), step: 'data' };
        if (state.need === 0) await parse.write(Buffer.alloc(0));
      } else {
        await parse.write(bytes);
      }
    }
  };
  parse.write = async (data) => {
    const segments = safeRelativePath(name);
    const destination = path.join(staging, ...segments);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, data);
    files.push(segments.join('/'));
    state = { need: 4, step: 'nameLength' };
  };

  try {
    const gunzip = zlib.createGunzip();
    const source = fs.createReadStream(inFile, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 });
    const consume = (async () => {
      for await (const chunk of gunzip) {
        queue.push(chunk);
        await parse();
      }
    })();
    await Promise.all([pipeline(source, decipher, gunzip), consume]);
    if (!ended) throw backupError('BACKUP_FILE_INVALID', 'Backup ends early (no end marker).');
    await fsp.rename(staging, target);
    return { outDir: target, files };
  } catch (error) {
    await fsp.rm(staging, { recursive: true, force: true });
    if (error?.code && String(error.code).startsWith('BACKUP_')) throw error;
    throw backupError('BACKUP_DECRYPT_FAILED', `Wrong passphrase or damaged backup file (${error?.message || error}).`);
  }
}

// ---- R2 ---------------------------------------------------------------------

function getBackupR2() {
  const bucket = String(process.env.R2_BACKUP_BUCKET_NAME || process.env.R2_UPLOADS_BUCKET_NAME || process.env.R2_STUDENT_BUCKET_NAME || '').trim();
  const missing = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT'].filter((name) => !String(process.env[name] || '').trim());
  if (!bucket) missing.push('R2_BACKUP_BUCKET_NAME');
  if (missing.length) throw backupError('BACKUP_R2_CONFIG_MISSING', `Missing: ${missing.join(', ')}`);
  return {
    bucket,
    client: new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT.trim().replace(/\/+$/, ''),
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID.trim(),
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY.trim()
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED'
    })
  };
}

const backupKeyFor = (date = new Date()) => {
  const stamp = date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
  return `${BACKUP_PREFIX}${stamp.slice(0, 4)}/${stamp.slice(5, 7)}/school-db-${stamp}.sbk`;
};

function backupDateFromKey(key = '') {
  const match = /school-db-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.sbk$/.exec(String(key));
  if (!match) return null;
  const date = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function uploadBackupFile(r2, key, filePath, metadata = {}) {
  const { size } = await fsp.stat(filePath);
  const common = { Bucket: r2.bucket, Key: key, ContentType: 'application/octet-stream', Metadata: metadata };
  if (size <= SINGLE_PUT_LIMIT) {
    await r2.client.send(new PutObjectCommand({ ...common, Body: await fsp.readFile(filePath) }));
  } else {
    const { UploadId } = await r2.client.send(new CreateMultipartUploadCommand(common));
    const handle = await fsp.open(filePath, 'r');
    try {
      const parts = [];
      for (let PartNumber = 1, position = 0; position < size; PartNumber += 1) {
        const length = Math.min(PART_SIZE, size - position);
        const chunk = Buffer.alloc(length);
        const { bytesRead } = await handle.read(chunk, 0, length, position);
        if (!bytesRead) throw backupError('BACKUP_READ_SHORT', `Could not read ${filePath}`);
        const part = await r2.client.send(new UploadPartCommand({ Bucket: r2.bucket, Key: key, UploadId, PartNumber, Body: chunk.subarray(0, bytesRead) }));
        parts.push({ PartNumber, ETag: part.ETag });
        position += bytesRead;
      }
      await r2.client.send(new CompleteMultipartUploadCommand({ Bucket: r2.bucket, Key: key, UploadId, MultipartUpload: { Parts: parts } }));
    } catch (error) {
      await r2.client.send(new AbortMultipartUploadCommand({ Bucket: r2.bucket, Key: key, UploadId })).catch(() => {});
      throw error;
    } finally {
      await handle.close();
    }
  }
  const head = await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }));
  if (Number(head.ContentLength) !== size) {
    throw backupError('BACKUP_UPLOAD_SIZE_MISMATCH', `Uploaded ${head.ContentLength} bytes, expected ${size}.`);
  }
  return { key, size };
}

async function downloadBackupFile(r2, key, filePath) {
  const object = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
  await pipeline(object.Body, fs.createWriteStream(filePath, { flags: 'wx' }));
  return filePath;
}

async function listBackupObjects(r2) {
  const objects = [];
  let ContinuationToken;
  do {
    const page = await r2.client.send(new ListObjectsV2Command({ Bucket: r2.bucket, Prefix: BACKUP_PREFIX, ContinuationToken }));
    for (const item of page.Contents || []) {
      const date = backupDateFromKey(item.Key);
      if (date) objects.push({ key: item.Key, date, size: Number(item.Size || 0) });
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return objects.sort((left, right) => left.date - right.date);
}

// Keeps every backup from the last `dailyDays` days, the first backup of each
// of the last `monthlyMonths` calendar months, and always the newest one.
function selectExpiredBackups(objects = [], now = new Date(), { dailyDays = 30, monthlyMonths = 12 } = {}) {
  const dated = objects.filter((item) => item?.date instanceof Date && !Number.isNaN(item.date.getTime()))
    .sort((left, right) => left.date - right.date);
  if (!dated.length) return [];
  const keep = new Set([dated[dated.length - 1].key]);
  const dailyCutoff = now.getTime() - dailyDays * 24 * 60 * 60 * 1000;
  const monthlyCutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthlyMonths - 1), 1);
  const firstOfMonth = new Map();
  for (const item of dated) {
    if (item.date.getTime() >= dailyCutoff) keep.add(item.key);
    if (item.date.getTime() >= monthlyCutoff) {
      const month = item.date.toISOString().slice(0, 7);
      if (!firstOfMonth.has(month)) firstOfMonth.set(month, item.key);
    }
  }
  firstOfMonth.forEach((key) => keep.add(key));
  return dated.filter((item) => !keep.has(item.key));
}

async function pruneBackups(r2, now = new Date(), options = {}) {
  const objects = await listBackupObjects(r2);
  const expired = selectExpiredBackups(objects, now, options);
  for (const item of expired) {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: item.key }));
  }
  return { total: objects.length, deleted: expired.length, kept: objects.length - expired.length };
}

module.exports = {
  BACKUP_PREFIX,
  MIN_PASSPHRASE_LENGTH,
  backupDateFromKey,
  backupKeyFor,
  decryptToDirectory,
  downloadBackupFile,
  encryptDirectory,
  getBackupR2,
  listBackupObjects,
  pruneBackups,
  selectExpiredBackups,
  uploadBackupFile
};
