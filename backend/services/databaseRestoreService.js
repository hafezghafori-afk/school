const crypto = require('node:crypto');
const fs = require('node:fs');
const { EJSON } = require('bson');
const {
  resolveManifestFile,
  validateCollectionName
} = require('./databaseBackupService');

const COLLECTION_OPTION_KEYS = new Set([
  'capped',
  'size',
  'max',
  'storageEngine',
  'validator',
  'validationLevel',
  'validationAction',
  'indexOptionDefaults',
  'viewOn',
  'pipeline',
  'collation',
  'timeseries',
  'expireAfterSeconds',
  'clusteredIndex',
  'changeStreamPreAndPostImages'
]);

const INDEX_OPTION_KEYS = new Set([
  'name',
  'unique',
  'sparse',
  'expireAfterSeconds',
  'partialFilterExpression',
  'collation',
  'wildcardProjection',
  'hidden',
  'weights',
  'default_language',
  'language_override',
  'textIndexVersion',
  '2dsphereIndexVersion',
  'bits',
  'min',
  'max',
  'bucketSize',
  'storageEngine'
]);

function pickOptions(value, allowed) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  for (const [key, item] of Object.entries(source)) {
    if (allowed.has(key) && item !== undefined) result[key] = item;
  }
  return result;
}

function documentSetDigest(docs = []) {
  const serialized = docs.map((doc) => EJSON.stringify(doc, null, 0, { relaxed: false })).sort();
  const hash = crypto.createHash('sha256');
  for (const item of serialized) {
    hash.update(String(Buffer.byteLength(item)));
    hash.update(':');
    hash.update(item);
    hash.update('\n');
  }
  return hash.digest('hex');
}

function readCollectionDocuments(backupDir, entry) {
  const filePath = resolveManifestFile(backupDir, entry.file);
  const docs = EJSON.parse(fs.readFileSync(filePath, 'utf8'), { relaxed: false });
  if (!Array.isArray(docs) || docs.length !== Number(entry.count)) {
    throw new Error(`restore_collection_source_invalid:${entry.collection}`);
  }
  return docs;
}

async function listUserCollections(targetDb) {
  const listed = await targetDb.listCollections({}, { nameOnly: false }).toArray();
  return listed.filter((entry) => entry?.name && !String(entry.name).startsWith('system.'));
}

async function assertEmptyDatabase(targetDb) {
  const listed = await listUserCollections(targetDb);
  if (listed.length) {
    throw new Error(`restore_target_database_not_empty:${listed.map((entry) => entry.name).join(',')}`);
  }
  return true;
}

async function verifyCollectionIndexes(collection, expectedIndexes = []) {
  if (typeof collection.indexes !== 'function') return;
  const actual = await collection.indexes();
  for (const expected of expectedIndexes) {
    if (!expected?.key || expected.name === '_id_') continue;
    const match = actual.find((item) => item.name === expected.name);
    const expectedOptions = pickOptions(expected, INDEX_OPTION_KEYS);
    const optionsMatch = match && Object.entries(expectedOptions).every(([key, value]) => (
      EJSON.stringify(match[key], null, 0, { relaxed: false })
      === EJSON.stringify(value, null, 0, { relaxed: false })
    ));
    if (
      !match
      || EJSON.stringify(match.key, null, 0, { relaxed: false })
        !== EJSON.stringify(expected.key, null, 0, { relaxed: false })
      || !optionsMatch
    ) {
      throw new Error(`restore_index_verification_failed:${collection.collectionName || 'unknown'}:${expected.name || 'unnamed'}`);
    }
  }
}

async function restoreManifestIntoEmptyDatabase({ targetDb, backupDir = '', manifest = null } = {}) {
  if (!targetDb || !manifest) throw new Error('restore_target_and_manifest_required');
  await assertEmptyDatabase(targetDb);

  const restored = [];
  for (const entry of manifest.database?.collections || []) {
    const collectionName = validateCollectionName(entry.collection);
    const collection = await targetDb.createCollection(
      collectionName,
      pickOptions(entry.options, COLLECTION_OPTION_KEYS)
    );
    const docs = readCollectionDocuments(backupDir, entry);
    if (docs.length) await collection.insertMany(docs, { ordered: true });
    for (const index of entry.indexes || []) {
      if (!index?.key || index.name === '_id_') continue;
      await collection.createIndex(index.key, pickOptions(index, INDEX_OPTION_KEYS));
    }

    const restoredDocs = await collection.find({}).toArray();
    if (
      restoredDocs.length !== docs.length
      || documentSetDigest(restoredDocs) !== documentSetDigest(docs)
    ) {
      throw new Error(`restore_collection_verification_failed:${collectionName}`);
    }
    await verifyCollectionIndexes(collection, entry.indexes || []);
    restored.push({
      collection: collectionName,
      count: restoredDocs.length,
      digest: documentSetDigest(restoredDocs)
    });
  }

  for (const view of manifest.database?.views || []) {
    await targetDb.createCollection(validateCollectionName(view.collection), {
      viewOn: validateCollectionName(view.viewOn),
      pipeline: Array.isArray(view.pipeline) ? view.pipeline : [],
      ...(view.collation ? { collation: view.collation } : {})
    });
  }

  return {
    collections: restored.length,
    views: (manifest.database?.views || []).length,
    restored
  };
}

module.exports = {
  assertEmptyDatabase,
  documentSetDigest,
  pickOptions,
  readCollectionDocuments,
  restoreManifestIntoEmptyDatabase
};
