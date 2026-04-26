const crypto = require('crypto');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const archiver = require('archiver');
const { PassThrough } = require('stream');

const FinanceDocumentArchive = require('../models/FinanceDocumentArchive');
const {
  buildFinanceDeliveryLiveStatus,
  buildFinanceDeliveryLiveSummary
} = require('./financeDeliveryLiveStatus');

const DOCUMENT_TYPE_PREFIX = Object.freeze({
  student_statement: 'SFP',
  parent_statement: 'PFP',
  month_close_pack: 'MCP',
  batch_statement_pack: 'BSP'
});

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeObjectId(value = null) {
  const normalized = normalizeText(value?._id || value || '');
  return mongoose.isValidObjectId(normalized) ? normalized : null;
}

function getActorLabel(req = {}) {
  return normalizeText(
    req?.user?.name
    || req?.user?.userName
    || req?.user?.email
    || req?.user?.username
    || req?.user?.role
    || 'system'
  );
}

function buildRandomCode(length = 6) {
  return crypto.randomBytes(Math.max(4, length)).toString('hex').slice(0, length).toUpperCase();
}

function buildFinanceDocumentNo(documentType = 'student_statement') {
  const prefix = DOCUMENT_TYPE_PREFIX[documentType] || 'FDC';
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '');
  return `${prefix}-${datePart}-${timePart}-${buildRandomCode(5)}`;
}

function buildFinanceVerificationCode(documentType = 'student_statement') {
  const prefix = DOCUMENT_TYPE_PREFIX[documentType] || 'FDC';
  return `FV-${prefix}-${buildRandomCode(10)}`;
}

function buildVerificationUrl(req = {}, verificationCode = '') {
  const protocol = normalizeText(req?.headers?.['x-forwarded-proto']) || req?.protocol || 'http';
  const host = normalizeText(req?.headers?.['x-forwarded-host']) || normalizeText(req?.get?.('host')) || 'localhost';
  return `${protocol}://${host}/api/finance/documents/verify/${encodeURIComponent(verificationCode)}`;
}

async function buildFinanceDocumentDescriptor({ req, documentType = 'student_statement' } = {}) {
  const verificationCode = buildFinanceVerificationCode(documentType);
  const verificationUrl = buildVerificationUrl(req, verificationCode);
  return {
    documentNo: buildFinanceDocumentNo(documentType),
    verificationCode,
    verificationUrl,
    verificationQrBuffer: await QRCode.toBuffer(verificationUrl, {
      type: 'png',
      margin: 1,
      width: 160,
      errorCorrectionLevel: 'M'
    })
  };
}

function buildAccessEntry({ req, eventType = 'generated', note = '' } = {}) {
  return {
    eventType,
    at: new Date(),
    actorId: normalizeText(req?.user?.id || req?.user?._id || ''),
    actorName: getActorLabel(req),
    actorRole: normalizeText(req?.user?.role || req?.user?.orgRole || ''),
    ipAddress: normalizeText(req?.headers?.['x-forwarded-for'] || req?.ip || req?.socket?.remoteAddress || ''),
    userAgent: normalizeText(req?.headers?.['user-agent'] || ''),
    note: normalizeText(note)
  };
}

function buildSha256(buffer = Buffer.alloc(0)) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

const populateArchiveQuery = (query) => query
  .populate('generatedBy', 'name')
  .populate('classId', 'title titleDari code')
  .populate('academicYearId', 'title code')
  .populate('sourceMonthCloseId', 'monthKey')
  .populate('studentMembershipId', '_id')
  .populate('studentId', 'fullName admissionNo');

function serializeArchiveUser(value = null, fallback = '') {
  if (!value) {
    return fallback ? { _id: null, name: fallback } : null;
  }
  if (value?._id) {
    return {
      _id: value._id,
      name: normalizeText(value?.name || fallback)
    };
  }
  return fallback ? { _id: null, name: fallback } : null;
}

function serializeFinanceDocumentArchive(item = null) {
  if (!item) return null;
  const plain = item?.toObject ? item.toObject() : { ...(item || {}) };
  const deliveryLog = Array.isArray(plain.deliveryLog)
    ? plain.deliveryLog.map((entry) => {
        const liveStatus = buildFinanceDeliveryLiveStatus({
          ...entry,
          occurredAt: entry?.status === 'delivered'
            ? (plain.lastDeliveredAt || entry?.sentAt || null)
            : (entry?.sentAt || null)
        });
        return {
          channel: normalizeText(entry?.channel),
          status: normalizeText(entry?.status),
          recipient: normalizeText(entry?.recipient),
          recipientCount: Number(entry?.recipientCount || 0),
          linkedAudienceNotified: entry?.linkedAudienceNotified === true,
          subject: normalizeText(entry?.subject),
          provider: normalizeText(entry?.provider),
          providerMessageId: normalizeText(entry?.providerMessageId),
          providerStatus: normalizeText(entry?.providerStatus),
          note: normalizeText(entry?.note),
          errorMessage: normalizeText(entry?.errorMessage),
          failureCode: normalizeText(entry?.failureCode),
          retryable: entry?.retryable === true,
          nextRetryAt: entry?.nextRetryAt || null,
          sentAt: entry?.sentAt || null,
          sentBy: serializeArchiveUser(entry?.sentBy, entry?.sentByLabel),
          liveStatus
        };
      })
    : [];
  const liveStatusSummary = buildFinanceDeliveryLiveSummary(
    deliveryLog.map((entry) => entry.liveStatus)
  );
  return {
    ...plain,
    generatedBy: serializeArchiveUser(plain.generatedBy, plain.generatedByLabel),
    classTitle: plain.classId?.titleDari || plain.classId?.title || '',
    academicYearTitle: plain.academicYearId?.title || plain.academicYearId?.code || '',
    monthCloseKey: plain.sourceMonthCloseId?.monthKey || '',
    deliveryCount: Number(plain.deliveryCount || 0),
    lastDeliveredAt: plain.lastDeliveredAt || null,
    lastDeliveryStatus: normalizeText(plain.lastDeliveryStatus),
    deliveryLog,
    liveStatus: liveStatusSummary.latest,
    liveStatusSummary,
    verification: {
      code: normalizeText(plain.verificationCode),
      url: normalizeText(plain.verificationUrl)
    }
  };
}

async function createFinanceDocumentArchive({
  req,
  descriptor = {},
  documentType = 'student_statement',
  filename = '',
  contentType = 'application/pdf',
  buffer = Buffer.alloc(0),
  title = '',
  subjectName = '',
  membershipLabel = '',
  batchLabel = '',
  studentMembershipId = null,
  studentId = null,
  classId = null,
  academicYearId = null,
  sourceMonthCloseId = null,
  monthKey = '',
  childDocuments = [],
  meta = {},
  accessEvents = ['generated', 'downloaded']
} = {}) {
  const generatedAt = new Date();
  const actorId = normalizeObjectId(req?.user?.id || req?.user?._id || null);
  const accessLog = Array.isArray(accessEvents)
    ? accessEvents.map((eventType) => buildAccessEntry({
        req,
        eventType,
        note: eventType === 'generated' ? `Generated ${descriptor.documentNo || ''}` : ''
      }))
    : [];

  const archive = await FinanceDocumentArchive.create({
    documentType,
    documentNo: normalizeText(descriptor.documentNo),
    verificationCode: normalizeText(descriptor.verificationCode),
    verificationUrl: normalizeText(descriptor.verificationUrl),
    filename: normalizeText(filename),
    contentType: normalizeText(contentType) || 'application/pdf',
    sizeBytes: Buffer.isBuffer(buffer) ? buffer.length : 0,
    sha256: Buffer.isBuffer(buffer) ? buildSha256(buffer) : '',
    status: 'active',
    generatedAt,
    generatedBy: actorId,
    generatedByLabel: getActorLabel(req),
    studentMembershipId: normalizeObjectId(studentMembershipId),
    studentId: normalizeObjectId(studentId),
    classId: normalizeObjectId(classId),
    academicYearId: normalizeObjectId(academicYearId),
    sourceMonthCloseId: normalizeObjectId(sourceMonthCloseId),
    monthKey: normalizeText(monthKey),
    title: normalizeText(title),
    subjectName: normalizeText(subjectName),
    membershipLabel: normalizeText(membershipLabel),
    batchLabel: normalizeText(batchLabel),
    downloadCount: accessEvents.includes('downloaded') ? 1 : 0,
    verifyCount: 0,
    lastDownloadedAt: accessEvents.includes('downloaded') ? generatedAt : null,
    lastVerifiedAt: null,
    deliveryCount: 0,
    lastDeliveredAt: null,
    lastDeliveryStatus: '',
    childDocuments: Array.isArray(childDocuments) ? childDocuments : [],
    deliveryLog: [],
    accessLog,
    meta: meta && typeof meta === 'object' ? meta : {}
  });

  const saved = await populateArchiveQuery(
    FinanceDocumentArchive.findById(archive._id)
  );
  return serializeFinanceDocumentArchive(saved);
}

async function listFinanceDocumentArchives(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit || 12) || 12, 1), 50);
  const query = {};
  const documentType = normalizeText(filters.documentType);
  const classId = normalizeObjectId(filters.classId);
  const academicYearId = normalizeObjectId(filters.academicYearId);
  const monthCloseId = normalizeObjectId(filters.sourceMonthCloseId);
  const monthKey = normalizeText(filters.monthKey);
  const status = normalizeText(filters.status);

  if (documentType) query.documentType = documentType;
  if (classId) query.classId = classId;
  if (academicYearId) query.academicYearId = academicYearId;
  if (monthCloseId) query.sourceMonthCloseId = monthCloseId;
  if (monthKey) query.monthKey = monthKey;
  if (status) query.status = status;

  const items = await populateArchiveQuery(
    FinanceDocumentArchive.find(query)
  )
    .sort({ generatedAt: -1, createdAt: -1 })
    .limit(limit);

  return items.map((item) => serializeFinanceDocumentArchive(item));
}

async function getFinanceDocumentArchiveById(archiveId = '') {
  const normalizedId = normalizeObjectId(archiveId);
  if (!normalizedId) return null;
  const item = await populateArchiveQuery(
    FinanceDocumentArchive.findById(normalizedId)
  );
  return serializeFinanceDocumentArchive(item);
}

async function verifyFinanceDocumentArchive({ verificationCode = '', req } = {}) {
  const normalizedCode = normalizeText(verificationCode).toUpperCase();
  if (!normalizedCode) return null;
  const item = await FinanceDocumentArchive.findOne({ verificationCode: normalizedCode });
  if (!item || String(item.status || '') !== 'active') return null;

  item.verifyCount = Number(item.verifyCount || 0) + 1;
  item.lastVerifiedAt = new Date();
  item.accessLog = Array.isArray(item.accessLog) ? item.accessLog : [];
  item.accessLog.push(buildAccessEntry({ req, eventType: 'verified' }));
  await item.save();

  const saved = await populateArchiveQuery(
    FinanceDocumentArchive.findById(item._id)
  );
  return serializeFinanceDocumentArchive(saved);
}

async function recordFinanceDocumentDelivery({
  archiveId = '',
  req,
  channel = 'email',
  status = 'sent',
  recipient = '',
  recipientCount = 0,
  linkedAudienceNotified = false,
  subject = '',
  provider = '',
  providerMessageId = '',
  providerStatus = '',
  note = '',
  errorMessage = '',
  failureCode = '',
  retryable = false,
  nextRetryAt = null
} = {}) {
  const normalizedId = normalizeObjectId(archiveId);
  if (!normalizedId) return null;
  const item = await FinanceDocumentArchive.findById(normalizedId);
  if (!item) return null;

  const deliveredAt = new Date();
  item.deliveryLog = Array.isArray(item.deliveryLog) ? item.deliveryLog : [];
  item.deliveryLog.push({
    channel: normalizeText(channel) || 'email',
    status: normalizeText(status) || 'sent',
    recipient: normalizeText(recipient),
    recipientCount: Number(recipientCount || 0),
    linkedAudienceNotified: linkedAudienceNotified === true,
    subject: normalizeText(subject),
    provider: normalizeText(provider),
    providerMessageId: normalizeText(providerMessageId),
    providerStatus: normalizeText(providerStatus),
    note: normalizeText(note),
    errorMessage: normalizeText(errorMessage),
    failureCode: normalizeText(failureCode),
    retryable: retryable === true,
    nextRetryAt: nextRetryAt || null,
    sentAt: deliveredAt,
    sentBy: normalizeObjectId(req?.user?.id || req?.user?._id || null),
    sentByLabel: getActorLabel(req)
  });
  item.lastDeliveryStatus = normalizeText(status) || 'sent';
  if (status === 'sent' || status === 'resent' || status === 'delivered') {
    item.deliveryCount = Number(item.deliveryCount || 0) + 1;
    item.lastDeliveredAt = deliveredAt;
    item.accessLog = Array.isArray(item.accessLog) ? item.accessLog : [];
    item.accessLog.push(buildAccessEntry({
      req,
      eventType: 'emailed',
      note: normalizeText(note) || `Delivered ${item.documentNo || ''}`
    }));
  }
  await item.save();

  const saved = await populateArchiveQuery(
    FinanceDocumentArchive.findById(item._id)
  );
  return serializeFinanceDocumentArchive(saved);
}

async function buildFinanceDocumentZipBuffer({
  entries = [],
  manifest = {},
  manifestName = 'manifest.json'
} = {}) {
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];

    output.on('data', (chunk) => chunks.push(chunk));
    output.on('end', () => resolve(Buffer.concat(chunks)));
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);

    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      if (!entry?.name || !Buffer.isBuffer(entry?.buffer)) return;
      archive.append(entry.buffer, { name: entry.name });
    });

    archive.append(JSON.stringify(manifest || {}, null, 2), { name: manifestName });
    archive.finalize();
  });
}

module.exports = {
  buildFinanceDocumentDescriptor,
  buildFinanceDocumentZipBuffer,
  buildFinanceDocumentNo,
  buildFinanceVerificationCode,
  createFinanceDocumentArchive,
  getFinanceDocumentArchiveById,
  listFinanceDocumentArchives,
  recordFinanceDocumentDelivery,
  serializeFinanceDocumentArchive,
  verifyFinanceDocumentArchive
};
