const http = require('http');
const https = require('https');
const mongoose = require('mongoose');

const FinanceDocumentArchive = require('../models/FinanceDocumentArchive');
const FinanceDeliveryCampaign = require('../models/FinanceDeliveryCampaign');
const FinanceDeliveryProviderConfig = require('../models/FinanceDeliveryProviderConfig');
const FinanceDeliveryTemplate = require('../models/FinanceDeliveryTemplate');
const SchoolClass = require('../models/SchoolClass');
const AcademicYear = require('../models/AcademicYear');
const User = require('../models/User');
const StudentCore = require('../models/StudentCore');
const StudentProfile = require('../models/StudentProfile');
const UserNotification = require('../models/UserNotification');
const { sendMail } = require('../utils/mailer');
const { logActivity } = require('../utils/activity');
const {
  getFinanceDocumentArchiveById,
  recordFinanceDocumentDelivery
} = require('../utils/financeDocumentArchive');
const {
  buildFinanceDeliveryLiveStatus,
  buildFinanceDeliveryLiveSummary
} = require('../utils/financeDeliveryLiveStatus');

const FINANCE_DELIVERY_AUTOMATION_ENABLED = String(process.env.FINANCE_DELIVERY_AUTOMATION_ENABLED || 'false').toLowerCase() === 'true';
const FINANCE_DELIVERY_INTERVAL_MINUTES = Math.max(15, Number(process.env.FINANCE_DELIVERY_INTERVAL_MIN || 360));
const FINANCE_DELIVERY_PROVIDER_TIMEOUT_MS = Math.min(60000, Math.max(3000, Number(process.env.FINANCE_DELIVERY_PROVIDER_TIMEOUT_MS || 15000)));
const FINANCE_DELIVERY_RECOVERY_GRACE_MINUTES = Math.max(5, Number(process.env.FINANCE_DELIVERY_RECOVERY_GRACE_MIN || 20));
const SUPPORTED_DELIVERY_CHANNELS = new Set(['email', 'portal', 'sms', 'whatsapp']);
const SUCCESS_DELIVERY_STATUSES = new Set(['sent', 'resent', 'delivered']);
const RETRYABLE_DELIVERY_STATUSES = new Set(['failed']);
const CHANNEL_WEBHOOK_ENV = Object.freeze({
  sms: 'FINANCE_SMS_WEBHOOK_URL',
  whatsapp: 'FINANCE_WHATSAPP_WEBHOOK_URL'
});
const CHANNEL_PROVIDER_MODE_ENV = Object.freeze({
  sms: 'FINANCE_SMS_PROVIDER_MODE',
  whatsapp: 'FINANCE_WHATSAPP_PROVIDER_MODE'
});
const CHANNEL_PROVIDER_NAME_ENV = Object.freeze({
  sms: 'FINANCE_SMS_PROVIDER_NAME',
  whatsapp: 'FINANCE_WHATSAPP_PROVIDER_NAME'
});
const CHANNEL_PROVIDER_STATUS_WEBHOOK_ENV = Object.freeze({
  sms: 'FINANCE_SMS_STATUS_WEBHOOK_URL',
  whatsapp: 'FINANCE_WHATSAPP_STATUS_WEBHOOK_URL'
});
const CHANNEL_PROVIDER_FROM_ENV = Object.freeze({
  sms: 'FINANCE_SMS_PROVIDER_FROM',
  whatsapp: 'FINANCE_WHATSAPP_PROVIDER_FROM'
});
const CHANNEL_PROVIDER_API_BASE_ENV = Object.freeze({
  sms: 'FINANCE_SMS_PROVIDER_API_BASE_URL',
  whatsapp: 'FINANCE_WHATSAPP_PROVIDER_API_BASE_URL'
});
const CHANNEL_PROVIDER_ACCOUNT_SID_ENV = Object.freeze({
  sms: 'FINANCE_SMS_TWILIO_ACCOUNT_SID',
  whatsapp: 'FINANCE_WHATSAPP_TWILIO_ACCOUNT_SID'
});
const CHANNEL_PROVIDER_AUTH_TOKEN_ENV = Object.freeze({
  sms: 'FINANCE_SMS_TWILIO_AUTH_TOKEN',
  whatsapp: 'FINANCE_WHATSAPP_TWILIO_AUTH_TOKEN'
});
const CHANNEL_PROVIDER_ACCESS_TOKEN_ENV = Object.freeze({
  whatsapp: 'FINANCE_WHATSAPP_META_ACCESS_TOKEN'
});
const CHANNEL_PROVIDER_PHONE_NUMBER_ID_ENV = Object.freeze({
  whatsapp: 'FINANCE_WHATSAPP_META_PHONE_NUMBER_ID'
});
const FINANCE_DELIVERY_PROVIDER_CONFIG_CHANNELS = Object.freeze(['sms', 'whatsapp']);
const FINANCE_DELIVERY_PROVIDER_SECRET_FIELDS = Object.freeze([
  'accountSid',
  'authToken',
  'accessToken',
  'phoneNumberId',
  'webhookToken'
]);
const FINANCE_DELIVERY_PROVIDER_METADATA_FIELDS = Object.freeze([
  'mode',
  'provider',
  'isActive',
  'webhookUrl',
  'statusWebhookUrl',
  'fromHandle',
  'apiBaseUrl',
  'note'
]);
const FINANCE_DELIVERY_PROVIDER_MODE_OPTIONS = Object.freeze({
  sms: ['mock', 'webhook', 'twilio'],
  whatsapp: ['mock', 'webhook', 'twilio', 'meta']
});
const FINANCE_DELIVERY_RETRY_SCHEDULE_MINUTES = Object.freeze(
  String(process.env.FINANCE_DELIVERY_RETRY_SCHEDULE_MIN || '15,60,360,1440')
    .split(',')
    .map((item) => Number(item) || 0)
    .filter((item) => item > 0)
);

let automationRunning = false;

const normalizeText = (value = '') => String(value || '').trim();

const normalizeObjectId = (value = null) => {
  const normalized = normalizeText(value?._id || value || '');
  return mongoose.isValidObjectId(normalized) ? normalized : null;
};

const getActorLabel = (req = {}) => normalizeText(
  req?.user?.name
  || req?.user?.userName
  || req?.user?.email
  || req?.user?.username
  || req?.user?.role
  || 'system'
);

const createSystemReq = (app, actorUserId = null) => ({
  user: actorUserId ? { id: actorUserId } : null,
  app,
  headers: {},
  method: 'SYSTEM',
  originalUrl: '/system/finance-delivery-automation',
  ip: '127.0.0.1'
});

const serializeArchiveUser = (value = null, fallback = '') => {
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
};

const serializeFinanceDeliveryProviderAuditEntry = (entry = {}) => ({
  action: normalizeText(entry?.action),
  at: entry?.at || null,
  by: serializeArchiveUser(entry?.by, entry?.byLabel),
  note: normalizeText(entry?.note),
  changedFields: Array.isArray(entry?.changedFields)
    ? entry.changedFields.map((item) => normalizeText(item)).filter(Boolean)
    : [],
  rotatedFields: Array.isArray(entry?.rotatedFields)
    ? entry.rotatedFields.map((item) => normalizeText(item)).filter(Boolean)
    : [],
  credentialVersion: Math.max(1, Number(entry?.credentialVersion || 1) || 1)
});

const normalizeChannel = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  return SUPPORTED_DELIVERY_CHANNELS.has(normalized) ? normalized : 'email';
};

const normalizeOptionalBooleanFilter = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  if (['true', '1', 'yes', 'ready', 'retryable'].includes(normalized)) return true;
  if (['false', '0', 'no', 'blocked', 'non_retryable', 'not_retryable'].includes(normalized)) return false;
  return null;
};

const normalizeProviderMode = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'mock') return 'mock';
  if (normalized === 'twilio') return 'twilio';
  if (normalized === 'meta') return 'meta';
  return 'webhook';
};

const normalizeProviderConfigChannel = (value = '') => {
  const normalized = normalizeChannel(value);
  return FINANCE_DELIVERY_PROVIDER_CONFIG_CHANNELS.includes(normalized) ? normalized : 'sms';
};

const getAllowedProviderModes = (channel = 'sms') => (
  FINANCE_DELIVERY_PROVIDER_MODE_OPTIONS[normalizeProviderConfigChannel(channel)]
  || FINANCE_DELIVERY_PROVIDER_MODE_OPTIONS.sms
);

const normalizeProviderModeForChannel = (channel = 'sms', value = '') => {
  const normalized = normalizeProviderMode(value || 'webhook');
  const allowedModes = getAllowedProviderModes(channel);
  if (allowedModes.includes(normalized)) return normalized;
  return allowedModes.includes('webhook') ? 'webhook' : allowedModes[0];
};

const buildDefaultProviderName = (channel = 'sms', mode = 'webhook') => (
  mode === 'mock'
    ? `mock_${channel}_gateway`
    : mode === 'twilio'
      ? `twilio_${channel}_gateway`
      : mode === 'meta'
        ? 'meta_whatsapp_gateway'
        : `generic_${channel}_gateway`
);

const buildEnvChannelProviderConfig = (channel = 'sms') => {
  const normalizedChannel = normalizeProviderConfigChannel(channel);
  const mode = normalizeProviderModeForChannel(
    normalizedChannel,
    process.env[CHANNEL_PROVIDER_MODE_ENV[normalizedChannel]] || 'webhook'
  );
  const provider = normalizeText(
    process.env[CHANNEL_PROVIDER_NAME_ENV[normalizedChannel]]
    || buildDefaultProviderName(normalizedChannel, mode)
  );
  return {
    channel: normalizedChannel,
    mode,
    provider,
    isActive: true,
    webhookUrl: normalizeText(process.env[CHANNEL_WEBHOOK_ENV[normalizedChannel]] || ''),
    statusWebhookUrl: normalizeText(process.env[CHANNEL_PROVIDER_STATUS_WEBHOOK_ENV[normalizedChannel]] || ''),
    fromHandle: normalizeText(process.env[CHANNEL_PROVIDER_FROM_ENV[normalizedChannel]] || ''),
    apiBaseUrl: normalizeText(process.env[CHANNEL_PROVIDER_API_BASE_ENV[normalizedChannel]] || ''),
    accountSid: normalizeText(process.env[CHANNEL_PROVIDER_ACCOUNT_SID_ENV[normalizedChannel]] || ''),
    authToken: normalizeText(process.env[CHANNEL_PROVIDER_AUTH_TOKEN_ENV[normalizedChannel]] || ''),
    accessToken: normalizeText(process.env[CHANNEL_PROVIDER_ACCESS_TOKEN_ENV[normalizedChannel]] || ''),
    phoneNumberId: normalizeText(process.env[CHANNEL_PROVIDER_PHONE_NUMBER_ID_ENV[normalizedChannel]] || ''),
    webhookToken: normalizeText(process.env.FINANCE_DELIVERY_PROVIDER_WEBHOOK_TOKEN || ''),
    note: '',
    credentialVersion: 1,
    lastRotatedAt: null,
    lastRotatedBy: null,
    source: 'environment',
    updatedAt: null,
    updatedBy: null,
    auditTrail: []
  };
};

const buildStoredChannelProviderConfig = (doc = null) => {
  const normalizedChannel = normalizeProviderConfigChannel(doc?.channel);
  const mode = normalizeProviderModeForChannel(normalizedChannel, doc?.mode || 'webhook');
  return {
    channel: normalizedChannel,
    mode,
    provider: normalizeText(doc?.provider || buildDefaultProviderName(normalizedChannel, mode)),
    isActive: doc?.isActive !== false,
    webhookUrl: normalizeText(doc?.webhookUrl || ''),
    statusWebhookUrl: normalizeText(doc?.statusWebhookUrl || ''),
    fromHandle: normalizeText(doc?.fromHandle || ''),
    apiBaseUrl: normalizeText(doc?.apiBaseUrl || ''),
    accountSid: normalizeText(doc?.accountSid || ''),
    authToken: normalizeText(doc?.authToken || ''),
    accessToken: normalizeText(doc?.accessToken || ''),
    phoneNumberId: normalizeText(doc?.phoneNumberId || ''),
    webhookToken: normalizeText(doc?.webhookToken || ''),
    note: normalizeText(doc?.note || ''),
    source: 'database',
    credentialVersion: Math.max(1, Number(doc?.credentialVersion || 1) || 1),
    lastRotatedAt: doc?.lastRotatedAt || null,
    lastRotatedBy: serializeArchiveUser(doc?.lastRotatedBy, doc?.lastRotatedByLabel),
    updatedAt: doc?.updatedAt || doc?.createdAt || null,
    updatedBy: serializeArchiveUser(doc?.updatedBy, doc?.updatedByLabel),
    auditTrail: Array.isArray(doc?.auditTrail) ? doc.auditTrail.map((entry) => serializeFinanceDeliveryProviderAuditEntry(entry)) : []
  };
};

const buildProviderWebhookPath = ({ mode = 'webhook', provider = '' } = {}) => {
  const providerKey = mode === 'twilio'
    ? 'twilio'
    : mode === 'meta'
      ? 'meta'
      : normalizeText(provider || 'generic');
  return `/api/finance/delivery/providers/${encodeURIComponent(providerKey || 'generic')}/status`;
};

const buildAbsoluteFinanceRouteUrl = (req = null, pathName = '') => {
  const normalizedPath = normalizeText(pathName);
  if (!normalizedPath) return '';
  const protocol = normalizeText(req?.headers?.['x-forwarded-proto']) || req?.protocol || 'http';
  const host = normalizeText(req?.headers?.['x-forwarded-host']) || normalizeText(req?.get?.('host')) || '';
  if (!host) return normalizedPath;
  return `${protocol}://${host}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
};

const maskProviderSecret = (value = '') => {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  if (normalized.length <= 8) return `${normalized.slice(0, 1)}${'*'.repeat(Math.max(2, normalized.length - 2))}${normalized.slice(-1)}`;
  return `${normalized.slice(0, 3)}${'*'.repeat(Math.max(4, normalized.length - 5))}${normalized.slice(-2)}`;
};

const getFinanceProviderRequiredFields = (channel = 'sms', mode = 'webhook') => {
  const normalizedChannel = normalizeProviderConfigChannel(channel);
  const normalizedMode = normalizeProviderModeForChannel(normalizedChannel, mode);
  if (normalizedMode === 'webhook') return ['webhookUrl'];
  if (normalizedMode === 'twilio') return ['accountSid', 'authToken', 'fromHandle'];
  if (normalizedMode === 'meta') return ['accessToken', 'phoneNumberId'];
  return [];
};

const serializeFinanceDeliveryProviderConfig = (config = {}, { req = null } = {}) => {
  const normalizedChannel = normalizeProviderConfigChannel(config?.channel);
  const normalizedMode = normalizeProviderModeForChannel(normalizedChannel, config?.mode || 'webhook');
  const provider = normalizeText(config?.provider || buildDefaultProviderName(normalizedChannel, normalizedMode));
  const requiredFields = getFinanceProviderRequiredFields(normalizedChannel, normalizedMode);
  const missingRequiredFields = requiredFields.filter((field) => !normalizeText(config?.[field] || ''));
  const webhookPath = buildProviderWebhookPath({ mode: normalizedMode, provider });
  const webhookUrl = buildAbsoluteFinanceRouteUrl(req, webhookPath);
  return {
    channel: normalizedChannel,
    mode: normalizedMode,
    provider,
    isActive: config?.isActive !== false,
    webhookUrl: normalizeText(config?.webhookUrl || ''),
    statusWebhookUrl: normalizeText(config?.statusWebhookUrl || ''),
    fromHandle: normalizeText(config?.fromHandle || ''),
    apiBaseUrl: normalizeText(config?.apiBaseUrl || ''),
    note: normalizeText(config?.note || ''),
    source: normalizeText(config?.source || 'environment') || 'environment',
    credentialVersion: Math.max(1, Number(config?.credentialVersion || 1) || 1),
    lastRotatedAt: config?.lastRotatedAt || null,
    lastRotatedBy: serializeArchiveUser(config?.lastRotatedBy, config?.lastRotatedByLabel),
    updatedAt: config?.updatedAt || null,
    updatedBy: config?.updatedBy || null,
    auditTrail: (Array.isArray(config?.auditTrail) ? config.auditTrail : [])
      .map((entry) => serializeFinanceDeliveryProviderAuditEntry(entry))
      .sort((left, right) => new Date(right?.at || 0).getTime() - new Date(left?.at || 0).getTime()),
    fields: {
      accountSid: { configured: Boolean(normalizeText(config?.accountSid || '')), masked: maskProviderSecret(config?.accountSid || '') },
      authToken: { configured: Boolean(normalizeText(config?.authToken || '')), masked: maskProviderSecret(config?.authToken || '') },
      accessToken: { configured: Boolean(normalizeText(config?.accessToken || '')), masked: maskProviderSecret(config?.accessToken || '') },
      phoneNumberId: { configured: Boolean(normalizeText(config?.phoneNumberId || '')), masked: maskProviderSecret(config?.phoneNumberId || '') },
      webhookToken: { configured: Boolean(normalizeText(config?.webhookToken || '')), masked: maskProviderSecret(config?.webhookToken || '') }
    },
    readiness: {
      configured: config?.isActive !== false && missingRequiredFields.length === 0,
      missingRequiredFields,
      providerKey: normalizedMode === 'twilio' ? 'twilio' : normalizedMode === 'meta' ? 'meta' : provider,
      webhookPath,
      webhookUrl,
      providerCallbackUrl: normalizeText(config?.statusWebhookUrl || '') || (normalizedMode === 'twilio' || normalizedMode === 'meta' ? webhookUrl : ''),
      inboundTokenRequired: Boolean(normalizeText(config?.webhookToken || ''))
    }
  };
};

const appendFinanceDeliveryProviderAuditEntry = (doc, {
  action = 'config_saved',
  note = '',
  changedFields = [],
  rotatedFields = [],
  actorId = null,
  actorLabel = '',
  at = new Date()
} = {}) => {
  if (!doc) return;
  if (!Array.isArray(doc.auditTrail)) {
    doc.auditTrail = [];
  }
  doc.auditTrail.unshift({
    action,
    by: actorId,
    byLabel: actorLabel,
    at,
    note: normalizeText(note),
    changedFields: Array.isArray(changedFields) ? changedFields.map((item) => normalizeText(item)).filter(Boolean) : [],
    rotatedFields: Array.isArray(rotatedFields) ? rotatedFields.map((item) => normalizeText(item)).filter(Boolean) : [],
    credentialVersion: Math.max(1, Number(doc.credentialVersion || 1) || 1)
  });
  if (doc.auditTrail.length > 25) {
    doc.auditTrail = doc.auditTrail.slice(0, 25);
  }
};

async function getChannelProviderConfig(channel = 'sms') {
  const normalizedChannel = normalizeProviderConfigChannel(channel);
  const stored = await FinanceDeliveryProviderConfig.findOne({ channel: normalizedChannel })
    .populate('updatedBy', 'name')
    .populate('lastRotatedBy', 'name')
    .populate('auditTrail.by', 'name')
    .lean();
  return stored ? buildStoredChannelProviderConfig(stored) : buildEnvChannelProviderConfig(normalizedChannel);
}

async function listFinanceDeliveryProviderConfigs({ req = null } = {}) {
  const items = [];
  for (const channel of FINANCE_DELIVERY_PROVIDER_CONFIG_CHANNELS) {
    const config = await getChannelProviderConfig(channel);
    items.push(serializeFinanceDeliveryProviderConfig(config, { req }));
  }
  return items;
}

async function saveFinanceDeliveryProviderConfig(channel = 'sms', payload = {}, req = null) {
  const normalizedChannel = normalizeProviderConfigChannel(channel);
  const actorId = normalizeObjectId(req?.user?.id || req?.user?._id || null);
  const actorLabel = getActorLabel(req);
  const now = new Date();
  const mode = normalizeProviderModeForChannel(normalizedChannel, payload?.mode || 'webhook');
  const clearSecrets = Array.isArray(payload?.clearSecrets)
    ? payload.clearSecrets.map((item) => normalizeText(item)).filter((item) => FINANCE_DELIVERY_PROVIDER_SECRET_FIELDS.includes(item))
    : [];
  let doc = await FinanceDeliveryProviderConfig.findOne({ channel: normalizedChannel });
  const isNewDoc = !doc;
  if (!doc) {
    doc = new FinanceDeliveryProviderConfig({ channel: normalizedChannel });
  }

  const changedFields = [];
  const rotatedFields = [];
  const nextValues = {
    mode,
    provider: normalizeText(payload?.provider || buildDefaultProviderName(normalizedChannel, mode)),
    isActive: payload?.isActive !== false,
    webhookUrl: normalizeText(payload?.webhookUrl || ''),
    statusWebhookUrl: normalizeText(payload?.statusWebhookUrl || ''),
    fromHandle: normalizeText(payload?.fromHandle || ''),
    apiBaseUrl: normalizeText(payload?.apiBaseUrl || ''),
    note: normalizeText(payload?.note || '')
  };
  FINANCE_DELIVERY_PROVIDER_METADATA_FIELDS.forEach((field) => {
    const nextValue = nextValues[field];
    const previousValue = field === 'isActive'
      ? doc[field] !== false
      : normalizeText(doc?.[field] || '');
    const comparableNext = field === 'isActive' ? Boolean(nextValue) : nextValue;
    if (previousValue !== comparableNext) {
      changedFields.push(field);
    }
    doc[field] = nextValue;
  });

  FINANCE_DELIVERY_PROVIDER_SECRET_FIELDS.forEach((field) => {
    const previousValue = normalizeText(doc?.[field] || '');
    if (clearSecrets.includes(field)) {
      if (previousValue) {
        doc[field] = '';
        rotatedFields.push(field);
      }
      return;
    }
    const nextValue = normalizeText(payload?.[field] || '');
    if (nextValue && nextValue !== previousValue) {
      doc[field] = nextValue;
      rotatedFields.push(field);
    }
  });

  if (rotatedFields.length) {
    const previousVersion = Math.max(1, Number(doc.credentialVersion || 1) || 1);
    doc.credentialVersion = isNewDoc ? previousVersion : previousVersion + 1;
    doc.lastRotatedAt = now;
    doc.lastRotatedBy = actorId;
    doc.lastRotatedByLabel = actorLabel;
  } else if (!doc.credentialVersion) {
    doc.credentialVersion = 1;
  }

  doc.updatedBy = actorId;
  doc.updatedByLabel = actorLabel;
  if (isNewDoc) {
    appendFinanceDeliveryProviderAuditEntry(doc, {
      action: 'created',
      note: nextValues.note,
      changedFields,
      rotatedFields,
      actorId,
      actorLabel,
      at: now
    });
  } else if (changedFields.length) {
    appendFinanceDeliveryProviderAuditEntry(doc, {
      action: 'config_saved',
      note: nextValues.note,
      changedFields,
      actorId,
      actorLabel,
      at: now
    });
  }
  if (!isNewDoc && rotatedFields.length) {
    appendFinanceDeliveryProviderAuditEntry(doc, {
      action: clearSecrets.length && !rotatedFields.some((field) => normalizeText(payload?.[field] || ''))
        ? 'secrets_cleared'
        : 'credentials_rotated',
      note: nextValues.note,
      rotatedFields,
      actorId,
      actorLabel,
      at: now
    });
  }
  await doc.save();
  const saved = await FinanceDeliveryProviderConfig.findById(doc._id)
    .populate('updatedBy', 'name')
    .populate('lastRotatedBy', 'name')
    .populate('auditTrail.by', 'name')
    .lean();
  return serializeFinanceDeliveryProviderConfig(buildStoredChannelProviderConfig(saved), { req });
}

async function rotateFinanceDeliveryProviderCredentials(channel = 'sms', payload = {}, req = null) {
  const normalizedChannel = normalizeProviderConfigChannel(channel);
  const actorId = normalizeObjectId(req?.user?.id || req?.user?._id || null);
  const actorLabel = getActorLabel(req);
  const note = normalizeText(payload?.note || payload?.rotationNote || '');
  const clearSecrets = Array.isArray(payload?.clearSecrets)
    ? payload.clearSecrets.map((item) => normalizeText(item)).filter((item) => FINANCE_DELIVERY_PROVIDER_SECRET_FIELDS.includes(item))
    : [];
  const providedSecretFields = FINANCE_DELIVERY_PROVIDER_SECRET_FIELDS.filter((field) => normalizeText(payload?.[field] || ''));
  if (!providedSecretFields.length && !clearSecrets.length) {
    const error = new Error('برای rotation حداقل یک credential جدید یا clearSecrets لازم است.');
    error.statusCode = 400;
    throw error;
  }
  if (!note) {
    const error = new Error('برای rotation credential، ثبت یادداشت الزامی است.');
    error.statusCode = 400;
    throw error;
  }

  let doc = await FinanceDeliveryProviderConfig.findOne({ channel: normalizedChannel });
  const isNewDoc = !doc;
  if (!doc) {
    doc = new FinanceDeliveryProviderConfig({ channel: normalizedChannel });
  }

  const now = new Date();
  const rotatedFields = [];
  FINANCE_DELIVERY_PROVIDER_SECRET_FIELDS.forEach((field) => {
    const previousValue = normalizeText(doc?.[field] || '');
    if (clearSecrets.includes(field)) {
      if (previousValue) {
        doc[field] = '';
        rotatedFields.push(field);
      }
      return;
    }
    const nextValue = normalizeText(payload?.[field] || '');
    if (nextValue && nextValue !== previousValue) {
      doc[field] = nextValue;
      rotatedFields.push(field);
    }
  });

  if (!rotatedFields.length) {
    const error = new Error('هیچ credential جدیدی برای rotation ثبت نشد.');
    error.statusCode = 400;
    throw error;
  }

  const previousVersion = Math.max(1, Number(doc.credentialVersion || 1) || 1);
  doc.credentialVersion = isNewDoc ? previousVersion : previousVersion + 1;
  doc.lastRotatedAt = now;
  doc.lastRotatedBy = actorId;
  doc.lastRotatedByLabel = actorLabel;
  doc.updatedBy = actorId;
  doc.updatedByLabel = actorLabel;
  if (isNewDoc) {
    appendFinanceDeliveryProviderAuditEntry(doc, {
      action: 'created',
      note,
      rotatedFields,
      actorId,
      actorLabel,
      at: now
    });
  }
  appendFinanceDeliveryProviderAuditEntry(doc, {
    action: clearSecrets.length && !providedSecretFields.length ? 'secrets_cleared' : 'credentials_rotated',
    note,
    rotatedFields,
    actorId,
    actorLabel,
    at: now
  });
  await doc.save();
  const saved = await FinanceDeliveryProviderConfig.findById(doc._id)
    .populate('updatedBy', 'name')
    .populate('lastRotatedBy', 'name')
    .populate('auditTrail.by', 'name')
    .lean();
  return serializeFinanceDeliveryProviderConfig(buildStoredChannelProviderConfig(saved), { req });
}

async function listFinanceDeliveryProviderWebhookTokens(providerKey = '') {
  const normalizedProviderKey = normalizeProviderWebhookKey(providerKey);
  const configs = await Promise.all(
    FINANCE_DELIVERY_PROVIDER_CONFIG_CHANNELS.map((channel) => getChannelProviderConfig(channel))
  );
  const relevant = configs.filter((config) => {
    if (normalizedProviderKey === 'twilio') return config.mode === 'twilio';
    if (normalizedProviderKey === 'meta') return config.mode === 'meta';
    return config.mode === 'webhook';
  });
  return Array.from(new Set(
    relevant
      .map((item) => normalizeText(item?.webhookToken || ''))
      .filter(Boolean)
  ));
}

const buildNextRetryAt = (attemptNumber = 1, fromDate = new Date()) => {
  const retryMinutes = Number(FINANCE_DELIVERY_RETRY_SCHEDULE_MINUTES[Math.max(0, attemptNumber - 1)] || 0);
  if (!retryMinutes) return null;
  const next = new Date(fromDate);
  next.setMinutes(next.getMinutes() + retryMinutes);
  return next;
};

const extractProviderMessageId = (payload = null) => normalizeText(
  payload?.providerMessageId
  || payload?.messageId
  || payload?.id
  || payload?.sid
  || payload?.referenceId
  || payload?.data?.providerMessageId
  || payload?.data?.messageId
  || payload?.data?.id
  || ''
);

const extractProviderStatus = (payload = null) => normalizeText(
  payload?.providerStatus
  || payload?.status
  || payload?.state
  || payload?.data?.providerStatus
  || payload?.data?.status
  || payload?.data?.state
  || ''
);

const extractProviderFailureCode = (payload = null) => normalizeText(
  payload?.failureCode
  || payload?.errorCode
  || payload?.code
  || payload?.error?.code
  || payload?.data?.failureCode
  || payload?.data?.errorCode
  || payload?.data?.code
  || ''
).toLowerCase();

const extractProviderMessage = (payload = null) => normalizeText(
  payload?.message
  || payload?.detail
  || payload?.description
  || payload?.error
  || payload?.error?.message
  || payload?.data?.message
  || payload?.data?.detail
  || ''
);

const normalizeFailureReason = ({ message = '', statusCode = 0, failureCode = '' } = {}) => {
  const explicitFailureCode = normalizeText(failureCode).toLowerCase();
  if (explicitFailureCode) {
    const retryable = ['provider_timeout', 'provider_unavailable', 'rate_limited', 'transport_error'].includes(explicitFailureCode);
    return { failureCode: explicitFailureCode, retryable };
  }

  const normalizedMessage = normalizeText(message).toLowerCase();
  if (normalizedMessage.includes('channel_not_configured')) {
    return { failureCode: 'channel_not_configured', retryable: false };
  }
  if (normalizedMessage.includes('unsupported_channel')) {
    return { failureCode: 'unsupported_channel', retryable: false };
  }
  if (normalizedMessage.includes('invalid_recipient')) {
    return { failureCode: 'invalid_recipient', retryable: false };
  }
  if (normalizedMessage.includes('rate_limit') || normalizedMessage.includes('too_many_requests') || Number(statusCode) === 429) {
    return { failureCode: 'rate_limited', retryable: true };
  }
  if (normalizedMessage.includes('timeout') || normalizedMessage.includes('timed out') || Number(statusCode) === 408 || Number(statusCode) === 504) {
    return { failureCode: 'provider_timeout', retryable: true };
  }
  if (normalizedMessage.includes('econnrefused') || normalizedMessage.includes('enotfound') || normalizedMessage.includes('econnreset')) {
    return { failureCode: 'transport_error', retryable: true };
  }
  if (Number(statusCode) === 400 || Number(statusCode) === 422) {
    return { failureCode: 'invalid_recipient', retryable: false };
  }
  if (Number(statusCode) === 401 || Number(statusCode) === 403) {
    return { failureCode: 'auth_failed', retryable: false };
  }
  if (Number(statusCode) >= 500) {
    return { failureCode: 'provider_unavailable', retryable: true };
  }
  return {
    failureCode: normalizedMessage ? 'provider_rejected' : 'delivery_failed',
    retryable: false
  };
};

const normalizeFinanceDeliveryEmails = (value = '') => Array.from(new Set(
  (Array.isArray(value) ? value : String(value || '').split(/[\n,;]+/))
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean)
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
));

const normalizeFinanceDeliveryPhones = (value = '') => Array.from(new Set(
  (Array.isArray(value) ? value : String(value || '').split(/[\n,;]+/))
    .map((item) => normalizeText(item).replace(/[\s()-]+/g, ''))
    .filter(Boolean)
    .filter((item) => /^\+?[0-9]{7,16}$/.test(item))
));

const normalizeFinanceDeliveryHandles = (value = '', channel = 'email') => (
  normalizeChannel(channel) === 'email'
    ? normalizeFinanceDeliveryEmails(value)
    : normalizeFinanceDeliveryPhones(value)
);

const FINANCE_DELIVERY_TEMPLATE_LIBRARY = Object.freeze({
  monthly_statement: {
    key: 'monthly_statement',
    label: 'Monthly Statement',
    description: 'برای ارسال ماهانه استیتمنت و مانده متعلم یا ولی.',
    recommendedChannels: ['email', 'sms', 'whatsapp'],
    defaultSubject: 'Finance statement {{documentNo}}',
    defaultBody: [
      'Your finance statement {{documentNo}} is ready.',
      'Student: {{subjectName}}',
      'Academic Year: {{academicYearTitle}}',
      'Verification: {{verificationUrl}}',
      '{{note}}'
    ].join('\n')
  },
  month_close_notice: {
    key: 'month_close_notice',
    label: 'Month Close Notice',
    description: 'برای اطلاع‌رسانی بسته بستن ماه و اسناد مدیریتی.',
    recommendedChannels: ['email', 'portal'],
    defaultSubject: 'Month close pack {{documentNo}}',
    defaultBody: [
      'The month close package {{documentNo}} is ready.',
      'Month: {{monthKey}}',
      'Batch: {{batchLabel}}',
      'Verification: {{verificationUrl}}',
      '{{note}}'
    ].join('\n')
  },
  balance_followup: {
    key: 'balance_followup',
    label: 'Balance Follow-up',
    description: 'برای reminder مانده و پیگیری پرداخت.',
    recommendedChannels: ['sms', 'whatsapp', 'email'],
    defaultSubject: 'Payment follow-up {{documentNo}}',
    defaultBody: [
      'Please review finance document {{documentNo}}.',
      'Student: {{subjectName}}',
      'Verification: {{verificationUrl}}',
      '{{note}}'
    ].join('\n')
  },
  sponsor_update: {
    key: 'sponsor_update',
    label: 'Sponsor Update',
    description: 'برای گزارش به تمویل‌کننده یا مدیریت خیریه.',
    recommendedChannels: ['email', 'portal'],
    defaultSubject: 'Sponsor update {{documentNo}}',
    defaultBody: [
      'Finance document {{documentNo}} has been generated.',
      'Subject: {{subjectName}}',
      'Class: {{classTitle}}',
      'Verification: {{verificationUrl}}',
      '{{note}}'
    ].join('\n')
  }
});

const FINANCE_DELIVERY_TEMPLATE_VARIABLES = Object.freeze([
  {
    key: 'documentNo',
    label: 'Document No',
    description: 'Official finance document number.',
    sample: 'MCP-202603-001'
  },
  {
    key: 'documentType',
    label: 'Document Type',
    description: 'Canonical archive document type.',
    sample: 'student_statement'
  },
  {
    key: 'subjectName',
    label: 'Subject Name',
    description: 'Student, guardian, or batch subject name.',
    sample: 'Student Alpha'
  },
  {
    key: 'title',
    label: 'Title',
    description: 'Display title for the finance document.',
    sample: 'Finance statement 1406-03'
  },
  {
    key: 'batchLabel',
    label: 'Batch Label',
    description: 'Batch/class label used on grouped documents.',
    sample: 'Class One Core | 1406 | 2026-03'
  },
  {
    key: 'verificationUrl',
    label: 'Verification URL',
    description: 'Verification link or QR target for the archived document.',
    sample: 'https://example.test/finance/verify/FV-MCP-1'
  },
  {
    key: 'monthKey',
    label: 'Month Key',
    description: 'Target accounting month of the document or campaign.',
    sample: '2026-03'
  },
  {
    key: 'classTitle',
    label: 'Class Title',
    description: 'Resolved class title for the scoped audience.',
    sample: 'Class One Core'
  },
  {
    key: 'academicYearTitle',
    label: 'Academic Year',
    description: 'Resolved academic year title for the scope.',
    sample: '1406'
  },
  {
    key: 'campaignName',
    label: 'Campaign Name',
    description: 'Delivery campaign label used in preview and send logs.',
    sample: 'Monthly statement campaign'
  },
  {
    key: 'channel',
    label: 'Channel',
    description: 'Selected delivery channel for the template.',
    sample: 'email'
  },
  {
    key: 'note',
    label: 'Note',
    description: 'Manual note added by the finance operator.',
    sample: 'Follow up before 5 PM'
  }
]);

const FINANCE_DELIVERY_TEMPLATE_VARIABLE_SET = new Set(
  FINANCE_DELIVERY_TEMPLATE_VARIABLES.map((item) => item.key)
);

const getFinanceDeliveryTemplateLibraryItem = (templateKey = '') => (
  FINANCE_DELIVERY_TEMPLATE_LIBRARY[normalizeText(templateKey)] || null
);

const normalizeFinanceDeliveryTemplateApprovalStage = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  if (['draft', 'pending_review', 'approved', 'rejected'].includes(normalized)) return normalized;
  return 'draft';
};

const serializeFinanceDeliveryTemplateVersion = (version = {}, {
  publishedVersionNumber = 1,
  draftVersionNumber = null
} = {}) => {
  const versionNumber = Number(version?.versionNumber || 0) || 0;
  const derivedStatus = version?.isSystem === true
    ? (publishedVersionNumber === 1 ? 'published' : 'archived')
    : (versionNumber === publishedVersionNumber ? 'published' : (versionNumber === draftVersionNumber ? 'draft' : 'archived'));
  const approvalStage = version?.isSystem === true
    ? 'approved'
    : normalizeFinanceDeliveryTemplateApprovalStage(
      version?.approvalStage
      || (versionNumber === publishedVersionNumber ? 'approved' : (versionNumber === draftVersionNumber ? 'draft' : 'approved'))
    );
  return {
    versionNumber,
    status: derivedStatus,
    approvalStage,
    subject: normalizeText(version?.subject),
    body: normalizeText(version?.body),
    changeNote: normalizeText(version?.changeNote),
    source: normalizeText(version?.source || (version?.isSystem ? 'system' : 'custom')),
    isSystem: version?.isSystem === true,
    createdAt: version?.createdAt || null,
    updatedAt: version?.updatedAt || null,
    reviewRequestedAt: version?.reviewRequestedAt || null,
    reviewRequestedBy: serializeArchiveUser(version?.reviewRequestedBy, version?.reviewRequestedByLabel),
    reviewNote: normalizeText(version?.reviewNote),
    approvedAt: version?.approvedAt || null,
    approvedBy: serializeArchiveUser(version?.approvedBy, version?.approvedByLabel),
    approvalNote: normalizeText(version?.approvalNote),
    rejectedAt: version?.rejectedAt || null,
    rejectedBy: serializeArchiveUser(version?.rejectedBy, version?.rejectedByLabel),
    rejectionNote: normalizeText(version?.rejectionNote),
    publishedAt: version?.publishedAt || null,
    archivedAt: version?.archivedAt || null,
    createdBy: serializeArchiveUser(version?.createdBy, version?.createdByLabel),
    updatedBy: serializeArchiveUser(version?.updatedBy, version?.updatedByLabel),
    publishedBy: serializeArchiveUser(version?.publishedBy, version?.publishedByLabel),
    archivedBy: serializeArchiveUser(version?.archivedBy, version?.archivedByLabel),
    canRequestReview: version?.isSystem !== true && derivedStatus === 'draft' && approvalStage !== 'pending_review',
    canApprove: version?.isSystem !== true && derivedStatus === 'draft' && approvalStage === 'pending_review',
    canReject: version?.isSystem !== true && derivedStatus === 'draft' && approvalStage === 'pending_review',
    canPublish: version?.isSystem !== true && derivedStatus === 'draft' && approvalStage === 'approved'
  };
};

const serializeFinanceDeliveryTemplateHistory = (entry = {}) => ({
  action: normalizeText(entry?.action),
  versionNumber: Number(entry?.versionNumber || 0) || null,
  fromVersionNumber: Number(entry?.fromVersionNumber || 0) || null,
  toVersionNumber: Number(entry?.toVersionNumber || 0) || null,
  note: normalizeText(entry?.note),
  at: entry?.at || null,
  by: serializeArchiveUser(entry?.by, entry?.byLabel)
});

const buildFinanceDeliveryTemplateSystemVersion = (template = {}) => ({
  versionNumber: 1,
  subject: normalizeText(template?.defaultSubject),
  body: normalizeText(template?.defaultBody),
  changeNote: 'system baseline',
  source: 'system',
  isSystem: true,
  createdAt: null,
  updatedAt: null,
  publishedAt: null,
  archivedAt: null,
  createdBy: null,
  updatedBy: null,
  publishedBy: null,
  archivedBy: null
});

const buildFinanceDeliveryTemplateItem = (template = {}, registry = null) => {
  const publishedVersionNumber = Number(registry?.currentPublishedVersion || 1) || 1;
  const draftVersionNumber = Number(registry?.currentDraftVersion || 0) || null;
  const systemVersion = serializeFinanceDeliveryTemplateVersion(
    buildFinanceDeliveryTemplateSystemVersion(template),
    { publishedVersionNumber, draftVersionNumber }
  );
  const customVersions = (Array.isArray(registry?.versions) ? registry.versions : [])
    .map((entry) => serializeFinanceDeliveryTemplateVersion(entry, {
      publishedVersionNumber,
      draftVersionNumber
    }));
  const versions = [systemVersion, ...customVersions]
    .sort((left, right) => Number(right?.versionNumber || 0) - Number(left?.versionNumber || 0));
  const publishedVersion = versions.find((entry) => Number(entry?.versionNumber || 0) === publishedVersionNumber) || systemVersion;
  const draftVersion = versions.find((entry) => Number(entry?.versionNumber || 0) === draftVersionNumber) || null;
  const history = (Array.isArray(registry?.history) ? registry.history : [])
    .map((entry) => serializeFinanceDeliveryTemplateHistory(entry))
    .sort((left, right) => new Date(right?.at || 0).getTime() - new Date(left?.at || 0).getTime());

  return {
    key: template.key,
    label: template.label,
    description: template.description,
    recommendedChannels: Array.isArray(template.recommendedChannels) ? template.recommendedChannels : [],
    defaultSubject: normalizeText(publishedVersion?.subject || template?.defaultSubject),
    defaultBody: normalizeText(publishedVersion?.body || template?.defaultBody),
    publishedVersionNumber,
    draftVersionNumber,
    publishedVersion,
    draftVersion,
    versions,
    history,
    hasCustomizations: customVersions.length > 0,
    currentVersionNumber: publishedVersionNumber,
    approvalSummary: {
      draft: versions.filter((entry) => entry.approvalStage === 'draft').length,
      pendingReview: versions.filter((entry) => entry.approvalStage === 'pending_review').length,
      approved: versions.filter((entry) => entry.approvalStage === 'approved').length,
      rejected: versions.filter((entry) => entry.approvalStage === 'rejected').length
    },
    pendingReviewVersionNumber: versions.find((entry) => entry.approvalStage === 'pending_review' && entry.isSystem !== true)?.versionNumber || null,
    rolloutMetrics: {
      totalCampaigns: 0,
      activeCampaigns: 0,
      automatedCampaigns: 0,
      deliveredTargets: 0,
      failedTargets: 0,
      lastUsedAt: null,
      byChannel: {}
    }
  };
};

const resolveFinanceDeliveryTemplateVersion = (template = {}, registry = null, {
  versionNumber = null,
  preferDraft = false
} = {}) => {
  const item = buildFinanceDeliveryTemplateItem(template, registry);
  const numericVersion = Number(versionNumber || 0) || null;
  if (numericVersion != null) {
    const explicitVersion = item.versions.find((entry) => Number(entry?.versionNumber || 0) === numericVersion);
    if (explicitVersion) return explicitVersion;
  }
  if (preferDraft && item.draftVersion) {
    return item.draftVersion;
  }
  return item.publishedVersion || item.versions[0] || null;
};

const buildFinanceDeliveryTemplateRolloutMetrics = (campaigns = []) => {
  const items = Array.isArray(campaigns) ? campaigns : [];
  const byChannel = items.reduce((acc, item) => {
    const key = normalizeChannel(item?.channel || 'email');
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});
  const lastUsedAt = items.reduce((latest, item) => {
    const candidate = item?.lastRunAt || item?.updatedAt || item?.createdAt || null;
    if (!candidate) return latest;
    if (!latest) return candidate;
    return new Date(candidate).getTime() >= new Date(latest).getTime() ? candidate : latest;
  }, null);
  return {
    totalCampaigns: items.length,
    activeCampaigns: items.filter((item) => normalizeText(item?.status) === 'active').length,
    automatedCampaigns: items.filter((item) => item?.automationEnabled === true).length,
    deliveredTargets: items.reduce((sum, item) => sum + Number(item?.successCount || 0), 0),
    failedTargets: items.reduce((sum, item) => sum + Number(item?.failureCount || 0), 0),
    lastUsedAt,
    byChannel
  };
};

async function listFinanceDeliveryTemplates() {
  const keys = Object.keys(FINANCE_DELIVERY_TEMPLATE_LIBRARY);
  const [registries, campaigns] = await Promise.all([
    FinanceDeliveryTemplate.find({ key: { $in: keys } }).lean(),
    FinanceDeliveryCampaign.find({ messageTemplateKey: { $in: keys } })
      .select('messageTemplateKey status channel automationEnabled successCount failureCount lastRunAt updatedAt createdAt')
      .lean()
  ]);
  const registryMap = new Map(
    registries.map((item) => [normalizeText(item?.key), item])
  );
  const campaignsByKey = campaigns.reduce((acc, item) => {
    const key = normalizeText(item?.messageTemplateKey);
    if (!key) return acc;
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(item);
    return acc;
  }, new Map());
  return keys.map((key) => {
    const item = buildFinanceDeliveryTemplateItem(
      FINANCE_DELIVERY_TEMPLATE_LIBRARY[key],
      registryMap.get(key) || null
    );
    return {
      ...item,
      rolloutMetrics: buildFinanceDeliveryTemplateRolloutMetrics(campaignsByKey.get(key) || [])
    };
  });
}

const listFinanceDeliveryTemplateVariables = () => FINANCE_DELIVERY_TEMPLATE_VARIABLES.map((item) => ({ ...item }));

const extractFinanceTemplateVariables = (template = '') => Array.from(new Set(
  Array.from(String(template || '').matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g))
    .map((match) => normalizeText(match?.[1] || ''))
    .filter(Boolean)
));

const validateFinanceTemplateStrings = ({
  subject = '',
  body = ''
} = {}) => {
  const usedVariables = Array.from(new Set([
    ...extractFinanceTemplateVariables(subject),
    ...extractFinanceTemplateVariables(body)
  ]));
  const unknownVariables = usedVariables.filter((key) => !FINANCE_DELIVERY_TEMPLATE_VARIABLE_SET.has(key));
  return {
    usedVariables,
    unknownVariables,
    valid: unknownVariables.length === 0
  };
};

const renderFinanceTemplateString = (template = '', variables = {}) => String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => (
  normalizeText(variables?.[key] || '')
));

const buildFinanceDeliveryTemplateContext = (archive = {}, options = {}) => {
  const title = normalizeText(archive?.title || archive?.subjectName || archive?.documentNo || 'Finance document');
  const verificationUrl = normalizeText(archive?.verification?.url || archive?.verificationUrl || '');
  const noteText = normalizeText(options?.note || '');
  return {
    title,
    documentNo: normalizeText(archive?.documentNo || ''),
    documentType: normalizeText(archive?.documentType || ''),
    subjectName: normalizeText(archive?.subjectName || archive?.batchLabel || ''),
    batchLabel: normalizeText(archive?.batchLabel || ''),
    verificationUrl,
    note: noteText,
    monthKey: normalizeText(archive?.monthKey || ''),
    classTitle: normalizeText(archive?.classTitle || ''),
    academicYearTitle: normalizeText(archive?.academicYearTitle || ''),
    campaignName: normalizeText(options?.campaignName || ''),
    channel: normalizeChannel(options?.channel || 'email')
  };
};

const buildFinanceDeliveryMessage = (archive = {}, {
  note = '',
  channel = 'email',
  campaignName = '',
  messageTemplateKey = '',
  messageTemplateSubject = '',
  messageTemplateBody = ''
} = {}) => {
  const title = normalizeText(archive?.title || archive?.subjectName || archive?.documentNo || 'Finance document');
  const verificationUrl = normalizeText(archive?.verification?.url || archive?.verificationUrl || '');
  const noteText = normalizeText(note);
  const template = FINANCE_DELIVERY_TEMPLATE_LIBRARY[normalizeText(messageTemplateKey)] || null;
  const templateContext = buildFinanceDeliveryTemplateContext(archive, {
    note: noteText,
    campaignName,
    channel
  });
  const fallbackSubject = `Finance document ${normalizeText(archive?.documentNo || '')}`.trim();
  const fallbackText = [
    `Document: ${title}`,
    `Document No: ${normalizeText(archive?.documentNo || '-') || '-'}`,
    `Type: ${normalizeText(archive?.documentType || '-') || '-'}`,
    archive?.subjectName ? `Subject: ${normalizeText(archive.subjectName)}` : '',
    archive?.batchLabel ? `Batch: ${normalizeText(archive.batchLabel)}` : '',
    verificationUrl ? `Verification: ${verificationUrl}` : '',
    noteText ? `Note: ${noteText}` : ''
  ].filter(Boolean).join('\n');
  const subjectLine = renderFinanceTemplateString(
    normalizeText(messageTemplateSubject || template?.defaultSubject || fallbackSubject),
    templateContext
  ) || fallbackSubject;
  const text = renderFinanceTemplateString(
    normalizeText(messageTemplateBody || template?.defaultBody || fallbackText),
    templateContext
  ) || fallbackText;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.7;color:#0f172a">
      <h2 style="margin:0 0 12px">Finance Delivery Center</h2>
      <p><strong>Document:</strong> ${title}</p>
      <p><strong>Document No:</strong> ${normalizeText(archive?.documentNo || '-') || '-'}</p>
      <p><strong>Type:</strong> ${normalizeText(archive?.documentType || '-') || '-'}</p>
      ${archive?.subjectName ? `<p><strong>Subject:</strong> ${normalizeText(archive.subjectName)}</p>` : ''}
      ${archive?.batchLabel ? `<p><strong>Batch:</strong> ${normalizeText(archive.batchLabel)}</p>` : ''}
      ${verificationUrl ? `<p><strong>Verification:</strong> <a href="${verificationUrl}">${verificationUrl}</a></p>` : ''}
      ${noteText ? `<p><strong>Note:</strong> ${noteText}</p>` : ''}
      ${(campaignName || template?.label) ? `<p><strong>Campaign:</strong> ${normalizeText(campaignName || template?.label)}</p>` : ''}
      ${text.split('\n').map((line) => `<p>${line}</p>`).join('')}
    </div>
  `;
  return {
    subject: subjectLine,
    text,
    html,
    templateKey: template?.key || '',
    templateLabel: template?.label || ''
  };
};

const createFinanceTemplateError = (message = 'Invalid finance delivery template.', meta = {}) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.meta = meta;
  return error;
};

const assertKnownFinanceDeliveryTemplateKey = (templateKey = '') => {
  const normalizedKey = normalizeText(templateKey);
  const template = getFinanceDeliveryTemplateLibraryItem(normalizedKey);
  if (!template) {
    throw createFinanceTemplateError('template انتخاب‌شده در سیستم مالی شناخته نشد.', {
      invalidTemplateKey: normalizedKey
    });
  }
  return {
    normalizedKey,
    template
  };
};

const getFinanceDeliveryTemplateRegistry = async (templateKey = '') => {
  const normalizedKey = normalizeText(templateKey);
  if (!normalizedKey) return null;
  return FinanceDeliveryTemplate.findOne({ key: normalizedKey });
};

const getFinanceDeliveryTemplateNextVersionNumber = (registry = null) => {
  const versions = Array.isArray(registry?.versions) ? registry.versions : [];
  const highestVersion = versions.reduce((max, item) => Math.max(max, Number(item?.versionNumber || 0) || 0), 1);
  return highestVersion + 1;
};

async function saveFinanceDeliveryTemplateDraft(templateKey = '', payload = {}, req = null) {
  const { normalizedKey, template } = assertKnownFinanceDeliveryTemplateKey(templateKey);
  const actorId = normalizeObjectId(req?.user?.id || req?.user?._id || null);
  const actorLabel = getActorLabel(req);
  const subject = normalizeText(payload?.subject || payload?.messageTemplateSubject || payload?.defaultSubject || template?.defaultSubject || '');
  const body = normalizeText(payload?.body || payload?.messageTemplateBody || payload?.defaultBody || template?.defaultBody || '');
  const changeNote = normalizeText(payload?.changeNote || payload?.note || '');
  const validation = validateFinanceTemplateStrings({ subject, body });
  if (!validation.valid) {
    throw createFinanceTemplateError('در template پیام، placeholder نامعتبر وجود دارد.', {
      invalidVariables: validation.unknownVariables
    });
  }

  let registry = await getFinanceDeliveryTemplateRegistry(normalizedKey);
  if (!registry) {
    registry = new FinanceDeliveryTemplate({
      key: normalizedKey,
      currentPublishedVersion: 1,
      currentDraftVersion: null,
      versions: [],
      history: [],
      createdBy: actorId,
      updatedBy: actorId,
      createdByLabel: actorLabel,
      updatedByLabel: actorLabel
    });
  }

  registry.versions = Array.isArray(registry.versions) ? registry.versions : [];
  registry.history = Array.isArray(registry.history) ? registry.history : [];

  const existingDraft = Number(registry.currentDraftVersion || 0)
    ? registry.versions.find((entry) => Number(entry?.versionNumber || 0) === Number(registry.currentDraftVersion || 0))
    : null;
  const now = new Date();
  let versionNumber = Number(existingDraft?.versionNumber || 0) || null;

  if (existingDraft) {
    existingDraft.subject = subject;
    existingDraft.body = body;
    existingDraft.changeNote = changeNote;
    existingDraft.status = 'draft';
    existingDraft.approvalStage = 'draft';
    existingDraft.reviewRequestedAt = null;
    existingDraft.reviewRequestedBy = null;
    existingDraft.reviewRequestedByLabel = '';
    existingDraft.reviewNote = '';
    existingDraft.approvedAt = null;
    existingDraft.approvedBy = null;
    existingDraft.approvedByLabel = '';
    existingDraft.approvalNote = '';
    existingDraft.rejectedAt = null;
    existingDraft.rejectedBy = null;
    existingDraft.rejectedByLabel = '';
    existingDraft.rejectionNote = '';
    existingDraft.updatedBy = actorId;
    existingDraft.updatedByLabel = actorLabel;
    existingDraft.updatedAt = now;
  } else {
    versionNumber = getFinanceDeliveryTemplateNextVersionNumber(registry);
    registry.versions.push({
      versionNumber,
      status: 'draft',
      approvalStage: 'draft',
      subject,
      body,
      changeNote,
      source: 'custom',
      createdBy: actorId,
      createdByLabel: actorLabel,
      createdAt: now,
      updatedBy: actorId,
      updatedByLabel: actorLabel,
      updatedAt: now
    });
  }

  registry.currentDraftVersion = versionNumber;
  registry.updatedBy = actorId;
  registry.updatedByLabel = actorLabel;
  registry.history.push({
    action: 'draft_saved',
    versionNumber,
    fromVersionNumber: null,
    toVersionNumber: versionNumber,
    note: changeNote,
    by: actorId,
    byLabel: actorLabel,
    at: now
  });
  await registry.save();

  return buildFinanceDeliveryTemplateItem(template, registry.toObject());
}

async function requestFinanceDeliveryTemplateReview(templateKey = '', payload = {}, req = null) {
  const { normalizedKey, template } = assertKnownFinanceDeliveryTemplateKey(templateKey);
  const registry = await getFinanceDeliveryTemplateRegistry(normalizedKey);
  if (!registry) {
    throw createFinanceTemplateError('برای این template نسخه پیش‌نویس ثبت نشده است.');
  }
  const requestedVersion = Number(payload?.versionNumber || registry.currentDraftVersion || 0) || 0;
  const targetVersion = Array.isArray(registry.versions)
    ? registry.versions.find((entry) => Number(entry?.versionNumber || 0) === requestedVersion)
    : null;
  if (!targetVersion) {
    throw createFinanceTemplateError('نسخه موردنظر برای بازبینی پیدا نشد.', { versionNumber: requestedVersion });
  }
  if (String(targetVersion.status || '').trim() !== 'draft') {
    throw createFinanceTemplateError('فقط نسخه draft را می‌توان برای بازبینی ارسال کرد.');
  }
  const actorId = normalizeObjectId(req?.user?.id || req?.user?._id || null);
  const actorLabel = getActorLabel(req);
  const now = new Date();
  const note = normalizeText(payload?.note || payload?.changeNote || targetVersion?.changeNote || '');
  targetVersion.approvalStage = 'pending_review';
  targetVersion.reviewRequestedAt = now;
  targetVersion.reviewRequestedBy = actorId;
  targetVersion.reviewRequestedByLabel = actorLabel;
  targetVersion.reviewNote = note;
  targetVersion.rejectedAt = null;
  targetVersion.rejectedBy = null;
  targetVersion.rejectedByLabel = '';
  targetVersion.rejectionNote = '';
  targetVersion.updatedBy = actorId;
  targetVersion.updatedByLabel = actorLabel;
  targetVersion.updatedAt = now;
  registry.updatedBy = actorId;
  registry.updatedByLabel = actorLabel;
  registry.history.push({
    action: 'review_requested',
    versionNumber: requestedVersion,
    fromVersionNumber: requestedVersion,
    toVersionNumber: requestedVersion,
    note,
    by: actorId,
    byLabel: actorLabel,
    at: now
  });
  await registry.save();
  return buildFinanceDeliveryTemplateItem(template, registry.toObject());
}

async function approveFinanceDeliveryTemplateVersion(templateKey = '', payload = {}, req = null) {
  const { normalizedKey, template } = assertKnownFinanceDeliveryTemplateKey(templateKey);
  const registry = await getFinanceDeliveryTemplateRegistry(normalizedKey);
  if (!registry) {
    throw createFinanceTemplateError('برای این template نسخه‌ای برای تایید وجود ندارد.');
  }
  const requestedVersion = Number(payload?.versionNumber || registry.currentDraftVersion || 0) || 0;
  const targetVersion = Array.isArray(registry.versions)
    ? registry.versions.find((entry) => Number(entry?.versionNumber || 0) === requestedVersion)
    : null;
  if (!targetVersion) {
    throw createFinanceTemplateError('نسخه موردنظر برای تایید پیدا نشد.', { versionNumber: requestedVersion });
  }
  if (normalizeFinanceDeliveryTemplateApprovalStage(targetVersion.approvalStage) !== 'pending_review') {
    throw createFinanceTemplateError('فقط نسخه در بازبینی قابل تایید است.');
  }
  const actorId = normalizeObjectId(req?.user?.id || req?.user?._id || null);
  const actorLabel = getActorLabel(req);
  const now = new Date();
  const note = normalizeText(payload?.note || '');
  targetVersion.approvalStage = 'approved';
  targetVersion.approvedAt = now;
  targetVersion.approvedBy = actorId;
  targetVersion.approvedByLabel = actorLabel;
  targetVersion.approvalNote = note;
  targetVersion.rejectedAt = null;
  targetVersion.rejectedBy = null;
  targetVersion.rejectedByLabel = '';
  targetVersion.rejectionNote = '';
  targetVersion.updatedBy = actorId;
  targetVersion.updatedByLabel = actorLabel;
  targetVersion.updatedAt = now;
  registry.updatedBy = actorId;
  registry.updatedByLabel = actorLabel;
  registry.history.push({
    action: 'approved',
    versionNumber: requestedVersion,
    fromVersionNumber: requestedVersion,
    toVersionNumber: requestedVersion,
    note,
    by: actorId,
    byLabel: actorLabel,
    at: now
  });
  await registry.save();
  return buildFinanceDeliveryTemplateItem(template, registry.toObject());
}

async function rejectFinanceDeliveryTemplateVersion(templateKey = '', payload = {}, req = null) {
  const { normalizedKey, template } = assertKnownFinanceDeliveryTemplateKey(templateKey);
  const registry = await getFinanceDeliveryTemplateRegistry(normalizedKey);
  if (!registry) {
    throw createFinanceTemplateError('برای این template نسخه‌ای برای رد وجود ندارد.');
  }
  const requestedVersion = Number(payload?.versionNumber || registry.currentDraftVersion || 0) || 0;
  const targetVersion = Array.isArray(registry.versions)
    ? registry.versions.find((entry) => Number(entry?.versionNumber || 0) === requestedVersion)
    : null;
  if (!targetVersion) {
    throw createFinanceTemplateError('نسخه موردنظر برای رد پیدا نشد.', { versionNumber: requestedVersion });
  }
  if (normalizeFinanceDeliveryTemplateApprovalStage(targetVersion.approvalStage) !== 'pending_review') {
    throw createFinanceTemplateError('فقط نسخه در بازبینی قابل رد است.');
  }
  const actorId = normalizeObjectId(req?.user?.id || req?.user?._id || null);
  const actorLabel = getActorLabel(req);
  const now = new Date();
  const note = normalizeText(payload?.note || payload?.reason || '');
  targetVersion.approvalStage = 'rejected';
  targetVersion.rejectedAt = now;
  targetVersion.rejectedBy = actorId;
  targetVersion.rejectedByLabel = actorLabel;
  targetVersion.rejectionNote = note;
  targetVersion.approvedAt = null;
  targetVersion.approvedBy = null;
  targetVersion.approvedByLabel = '';
  targetVersion.approvalNote = '';
  targetVersion.updatedBy = actorId;
  targetVersion.updatedByLabel = actorLabel;
  targetVersion.updatedAt = now;
  registry.updatedBy = actorId;
  registry.updatedByLabel = actorLabel;
  registry.history.push({
    action: 'rejected',
    versionNumber: requestedVersion,
    fromVersionNumber: requestedVersion,
    toVersionNumber: requestedVersion,
    note,
    by: actorId,
    byLabel: actorLabel,
    at: now
  });
  await registry.save();
  return buildFinanceDeliveryTemplateItem(template, registry.toObject());
}

async function publishFinanceDeliveryTemplateVersion(templateKey = '', payload = {}, req = null) {
  const { normalizedKey, template } = assertKnownFinanceDeliveryTemplateKey(templateKey);
  const registry = await getFinanceDeliveryTemplateRegistry(normalizedKey);
  if (!registry) {
    throw createFinanceTemplateError('برای این template نسخه پیش‌نویس ثبت نشده است.');
  }

  const requestedVersion = Number(payload?.versionNumber || registry.currentDraftVersion || 0) || 0;
  const targetVersion = Array.isArray(registry.versions)
    ? registry.versions.find((entry) => Number(entry?.versionNumber || 0) === requestedVersion)
    : null;
  if (!targetVersion) {
    throw createFinanceTemplateError('نسخه موردنظر برای publish پیدا نشد.', {
      versionNumber: requestedVersion
    });
  }
  if (requestedVersion > 1 && normalizeFinanceDeliveryTemplateApprovalStage(targetVersion.approvalStage) !== 'approved') {
    throw createFinanceTemplateError('برای publish، نسخه باید ابتدا تایید شود.', {
      versionNumber: requestedVersion,
      approvalStage: normalizeFinanceDeliveryTemplateApprovalStage(targetVersion.approvalStage)
    });
  }

  const actorId = normalizeObjectId(req?.user?.id || req?.user?._id || null);
  const actorLabel = getActorLabel(req);
  const now = new Date();
  const previousPublishedVersion = Number(registry.currentPublishedVersion || 1) || 1;

  registry.versions.forEach((entry) => {
    if (Number(entry?.versionNumber || 0) === requestedVersion) {
      entry.status = 'published';
      entry.approvalStage = 'approved';
      if (!entry.approvedAt) entry.approvedAt = now;
      if (!entry.approvedBy && actorId) entry.approvedBy = actorId;
      if (!entry.approvedByLabel) entry.approvedByLabel = actorLabel;
      entry.publishedAt = now;
      entry.publishedBy = actorId;
      entry.publishedByLabel = actorLabel;
      entry.archivedAt = null;
      entry.archivedBy = null;
      entry.archivedByLabel = '';
      return;
    }
    if (Number(entry?.versionNumber || 0) !== requestedVersion && String(entry?.status || '').trim() === 'published') {
      entry.status = 'archived';
      entry.archivedAt = now;
      entry.archivedBy = actorId;
      entry.archivedByLabel = actorLabel;
    }
  });

  registry.currentPublishedVersion = requestedVersion;
  if (Number(registry.currentDraftVersion || 0) === requestedVersion) {
    registry.currentDraftVersion = null;
  }
  registry.updatedBy = actorId;
  registry.updatedByLabel = actorLabel;
  registry.history.push({
    action: 'published',
    versionNumber: requestedVersion,
    fromVersionNumber: previousPublishedVersion,
    toVersionNumber: requestedVersion,
    note: normalizeText(payload?.note || targetVersion?.changeNote || ''),
    by: actorId,
    byLabel: actorLabel,
    at: now
  });
  await registry.save();

  return buildFinanceDeliveryTemplateItem(template, registry.toObject());
}

async function archiveFinanceDeliveryTemplateVersion(templateKey = '', payload = {}, req = null) {
  const { normalizedKey, template } = assertKnownFinanceDeliveryTemplateKey(templateKey);
  const registry = await getFinanceDeliveryTemplateRegistry(normalizedKey);
  if (!registry) {
    throw createFinanceTemplateError('برای این template نسخه سفارشی پیدا نشد.');
  }

  const requestedVersion = Number(payload?.versionNumber || 0) || 0;
  if (requestedVersion <= 1) {
    throw createFinanceTemplateError('نسخه پایه سیستم قابل archive نیست.');
  }
  if (Number(registry.currentPublishedVersion || 1) === requestedVersion) {
    throw createFinanceTemplateError('برای archive نسخه منتشرشده، ابتدا rollback انجام دهید.');
  }
  const targetVersion = Array.isArray(registry.versions)
    ? registry.versions.find((entry) => Number(entry?.versionNumber || 0) === requestedVersion)
    : null;
  if (!targetVersion) {
    throw createFinanceTemplateError('نسخه موردنظر برای archive پیدا نشد.', {
      versionNumber: requestedVersion
    });
  }

  const actorId = normalizeObjectId(req?.user?.id || req?.user?._id || null);
  const actorLabel = getActorLabel(req);
  const now = new Date();
  targetVersion.status = 'archived';
  targetVersion.archivedAt = now;
  targetVersion.archivedBy = actorId;
  targetVersion.archivedByLabel = actorLabel;
  if (Number(registry.currentDraftVersion || 0) === requestedVersion) {
    registry.currentDraftVersion = null;
  }
  registry.updatedBy = actorId;
  registry.updatedByLabel = actorLabel;
  registry.history.push({
    action: 'archived',
    versionNumber: requestedVersion,
    fromVersionNumber: requestedVersion,
    toVersionNumber: requestedVersion,
    note: normalizeText(payload?.note || targetVersion?.changeNote || ''),
    by: actorId,
    byLabel: actorLabel,
    at: now
  });
  await registry.save();

  return buildFinanceDeliveryTemplateItem(template, registry.toObject());
}

async function rollbackFinanceDeliveryTemplateVersion(templateKey = '', payload = {}, req = null) {
  const { normalizedKey, template } = assertKnownFinanceDeliveryTemplateKey(templateKey);
  const registry = await getFinanceDeliveryTemplateRegistry(normalizedKey);
  if (!registry) {
    throw createFinanceTemplateError('برای این template نسخه سفارشی ثبت نشده است.');
  }

  const targetVersionNumber = Number(payload?.versionNumber || 0) || 0;
  const previousPublishedVersion = Number(registry.currentPublishedVersion || 1) || 1;
  if (!targetVersionNumber || previousPublishedVersion === targetVersionNumber) {
    return buildFinanceDeliveryTemplateItem(template, registry.toObject());
  }

  const actorId = normalizeObjectId(req?.user?.id || req?.user?._id || null);
  const actorLabel = getActorLabel(req);
  const now = new Date();

  if (targetVersionNumber === 1) {
    registry.versions.forEach((entry) => {
      if (String(entry?.status || '').trim() === 'published') {
        entry.status = 'archived';
        entry.archivedAt = now;
        entry.archivedBy = actorId;
        entry.archivedByLabel = actorLabel;
      }
    });
    registry.currentPublishedVersion = 1;
  } else {
    const targetVersion = Array.isArray(registry.versions)
      ? registry.versions.find((entry) => Number(entry?.versionNumber || 0) === targetVersionNumber)
      : null;
    if (!targetVersion) {
      throw createFinanceTemplateError('نسخه موردنظر برای rollback پیدا نشد.', {
        versionNumber: targetVersionNumber
      });
    }

    registry.versions.forEach((entry) => {
      if (Number(entry?.versionNumber || 0) === targetVersionNumber) {
        entry.status = 'published';
        entry.publishedAt = now;
        entry.publishedBy = actorId;
        entry.publishedByLabel = actorLabel;
        entry.archivedAt = null;
        entry.archivedBy = null;
        entry.archivedByLabel = '';
        return;
      }
      if (String(entry?.status || '').trim() === 'published') {
        entry.status = 'archived';
        entry.archivedAt = now;
        entry.archivedBy = actorId;
        entry.archivedByLabel = actorLabel;
      }
    });
    registry.currentPublishedVersion = targetVersionNumber;
  }

  registry.updatedBy = actorId;
  registry.updatedByLabel = actorLabel;
  registry.history.push({
    action: 'rolled_back',
    versionNumber: targetVersionNumber,
    fromVersionNumber: previousPublishedVersion,
    toVersionNumber: targetVersionNumber,
    note: normalizeText(payload?.note || ''),
    by: actorId,
    byLabel: actorLabel,
    at: now
  });
  await registry.save();

  return buildFinanceDeliveryTemplateItem(template, registry.toObject());
}

const buildSyntheticFinancePreviewArchive = ({
  payload = {},
  classTitle = '',
  academicYearTitle = '',
  templateLabel = ''
} = {}) => {
  const monthKey = normalizeText(payload?.monthKey || '');
  const documentType = normalizeText(payload?.documentType || 'batch_statement_pack') || 'batch_statement_pack';
  const subjectName = normalizeText(payload?.subjectName || (documentType === 'batch_statement_pack'
    ? (classTitle || 'Finance batch')
    : 'Preview Student'));
  const batchLabel = normalizeText(
    payload?.batchLabel
    || [classTitle, academicYearTitle, monthKey].filter(Boolean).join(' | ')
  );
  return {
    documentNo: 'PREVIEW-001',
    documentType,
    title: normalizeText(payload?.title || templateLabel || 'Finance delivery preview'),
    subjectName,
    batchLabel,
    verification: {
      url: 'https://preview.local/finance/verify/PREVIEW-001'
    },
    verificationUrl: 'https://preview.local/finance/verify/PREVIEW-001',
    monthKey,
    classTitle,
    academicYearTitle,
    status: 'active',
    __previewSource: 'synthetic'
  };
};

async function previewFinanceDeliveryTemplate(payload = {}) {
  const messageTemplateKey = normalizeText(payload?.messageTemplateKey);
  const requestedVersionNumber = Number(
    payload?.templateVersionNumber
    || payload?.messageTemplateVersionNumber
    || payload?.versionNumber
    || 0
  ) || null;
  const template = messageTemplateKey ? assertKnownFinanceDeliveryTemplateKey(messageTemplateKey).template : null;
  const templateRegistry = messageTemplateKey ? await getFinanceDeliveryTemplateRegistry(messageTemplateKey) : null;
  const templateVersion = messageTemplateKey
    ? resolveFinanceDeliveryTemplateVersion(template, templateRegistry?.toObject ? templateRegistry.toObject() : templateRegistry, {
      versionNumber: requestedVersionNumber
    })
    : null;
  if (false) {
    throw createFinanceTemplateError('template انتخاب‌شده در سیستم مالی شناخته نشد.', {
      invalidTemplateKey: messageTemplateKey
    });
  }

  const normalizedDocumentType = normalizeText(payload?.documentType || 'batch_statement_pack') || 'batch_statement_pack';
  const normalizedClassId = normalizeObjectId(payload?.classId);
  const normalizedAcademicYearId = normalizeObjectId(payload?.academicYearId);
  const normalizedMonthKey = normalizeText(payload?.monthKey);

  const archiveQuery = {
    status: 'active',
    documentType: normalizedDocumentType
  };
  if (normalizedClassId) archiveQuery.classId = normalizedClassId;
  if (normalizedAcademicYearId) archiveQuery.academicYearId = normalizedAcademicYearId;
  if (normalizedMonthKey) archiveQuery.monthKey = normalizedMonthKey;

  const [matchedArchive, matchedArchiveCount, schoolClass, academicYear] = await Promise.all([
    FinanceDocumentArchive.findOne(archiveQuery)
      .sort({ generatedAt: -1, createdAt: -1 })
      .lean(),
    FinanceDocumentArchive.countDocuments(archiveQuery),
    normalizedClassId ? SchoolClass.findById(normalizedClassId).select('title titleDari code').lean() : null,
    normalizedAcademicYearId ? AcademicYear.findById(normalizedAcademicYearId).select('title code').lean() : null
  ]);

  const classTitle = normalizeText(
    matchedArchive?.classTitle
    || schoolClass?.titleDari
    || schoolClass?.title
    || schoolClass?.code
    || ''
  );
  const academicYearTitle = normalizeText(
    matchedArchive?.academicYearTitle
    || academicYear?.title
    || academicYear?.code
    || ''
  );

  const previewArchive = matchedArchive || buildSyntheticFinancePreviewArchive({
    payload,
    classTitle,
    academicYearTitle,
    templateLabel: template?.label || ''
  });

  const effectiveSubjectTemplate = normalizeText(
    payload?.messageTemplateSubject || templateVersion?.subject || template?.defaultSubject || ''
  );
  const effectiveBodyTemplate = normalizeText(
    payload?.messageTemplateBody || templateVersion?.body || template?.defaultBody || ''
  );
  const validation = validateFinanceTemplateStrings({
    subject: effectiveSubjectTemplate,
    body: effectiveBodyTemplate
  });
  const context = buildFinanceDeliveryTemplateContext(previewArchive, {
    note: normalizeText(payload?.note),
    campaignName: normalizeText(payload?.campaignName || payload?.name),
    channel: normalizeChannel(payload?.channel || 'email')
  });
  const emptyVariables = validation.usedVariables.filter((key) => !normalizeText(context?.[key]));
  const preview = buildFinanceDeliveryMessage(previewArchive, {
    note: normalizeText(payload?.note),
    channel: normalizeChannel(payload?.channel || 'email'),
    campaignName: normalizeText(payload?.campaignName || payload?.name),
    messageTemplateKey,
    messageTemplateSubject: effectiveSubjectTemplate,
    messageTemplateBody: effectiveBodyTemplate
  });

  return {
    templateKey: messageTemplateKey,
    templateLabel: template?.label || '',
    templateVersionNumber: Number(templateVersion?.versionNumber || requestedVersionNumber || 0) || null,
    templateStatus: normalizeText(templateVersion?.status),
    valid: validation.valid,
    usedVariables: validation.usedVariables,
    unknownVariables: validation.unknownVariables,
    emptyVariables,
    warnings: [
      ...(matchedArchive ? [] : ['No archived finance document matched the current scope; preview uses synthetic sample data.']),
      ...(emptyVariables.length ? [`Some variables do not have sample values in the current preview: ${emptyVariables.join(', ')}`] : [])
    ],
    sampleSource: matchedArchive ? 'archive' : 'synthetic',
    sample: {
      documentNo: normalizeText(previewArchive?.documentNo),
      documentType: normalizeText(previewArchive?.documentType),
      subjectName: normalizeText(previewArchive?.subjectName || previewArchive?.batchLabel),
      classTitle,
      academicYearTitle,
      monthKey: normalizeText(previewArchive?.monthKey)
    },
    rolloutPreview: {
      matchedArchiveCount: Number(matchedArchiveCount || 0),
      recommendedChannels: Array.isArray(template?.recommendedChannels) ? template.recommendedChannels : [],
      scope: {
        documentType: normalizedDocumentType,
        classId: normalizedClassId,
        academicYearId: normalizedAcademicYearId,
        monthKey: normalizedMonthKey
      }
    },
    context,
    subjectTemplate: effectiveSubjectTemplate,
    bodyTemplate: effectiveBodyTemplate,
    renderedSubject: preview.subject,
    renderedBody: preview.text,
    renderedHtml: preview.html
  };
}

const assertValidFinanceDeliveryTemplatePayload = async (payload = {}) => {
  const messageTemplateKey = normalizeText(payload?.messageTemplateKey);
  const requestedVersionNumber = Number(
    payload?.templateVersionNumber
    || payload?.messageTemplateVersionNumber
    || payload?.versionNumber
    || 0
  ) || null;
  const template = messageTemplateKey ? assertKnownFinanceDeliveryTemplateKey(messageTemplateKey).template : null;
  const templateRegistry = messageTemplateKey ? await getFinanceDeliveryTemplateRegistry(messageTemplateKey) : null;
  const templateVersion = messageTemplateKey
    ? resolveFinanceDeliveryTemplateVersion(template, templateRegistry?.toObject ? templateRegistry.toObject() : templateRegistry, {
      versionNumber: requestedVersionNumber
    })
    : null;
  if (false) {
    throw createFinanceTemplateError('template انتخاب‌شده در سیستم مالی شناخته نشد.', {
      invalidTemplateKey: messageTemplateKey
    });
  }

  const effectiveSubjectTemplate = normalizeText(
    payload?.messageTemplateSubject || templateVersion?.subject || template?.defaultSubject || ''
  );
  const effectiveBodyTemplate = normalizeText(
    payload?.messageTemplateBody || templateVersion?.body || template?.defaultBody || ''
  );
  const validation = validateFinanceTemplateStrings({
    subject: effectiveSubjectTemplate,
    body: effectiveBodyTemplate
  });
  if (!validation.valid) {
    throw createFinanceTemplateError('در template پیام، placeholder نامعتبر وجود دارد.', {
      invalidVariables: validation.unknownVariables
    });
  }
  return {
    template,
    templateVersion,
    validation,
    effectiveSubjectTemplate,
    effectiveBodyTemplate
  };
};

async function resolveFinanceAudienceUserIds({ studentId, studentCoreId } = {}) {
  const audience = new Set();
  const normalizedStudentId = normalizeText(studentId);
  let normalizedStudentCoreId = normalizeText(studentCoreId);

  if (normalizedStudentId) {
    audience.add(normalizedStudentId);
  }

  if (!normalizedStudentCoreId && normalizedStudentId) {
    const studentCore = await StudentCore.findOne({ userId: normalizedStudentId }).select('_id').lean();
    normalizedStudentCoreId = studentCore?._id ? String(studentCore._id) : '';
  }

  if (!normalizedStudentCoreId) {
    return Array.from(audience);
  }

  const profile = await StudentProfile.findOne({ studentId: normalizedStudentCoreId }).select('guardians').lean();
  for (const guardian of Array.isArray(profile?.guardians) ? profile.guardians : []) {
    if (!guardian?.userId || guardian?.status === 'inactive') continue;
    audience.add(String(guardian.userId));
  }

  return Array.from(audience);
}

async function resolveFinanceAudiencePhones({ studentId, studentCoreId } = {}) {
  let normalizedStudentCoreId = normalizeText(studentCoreId);
  if (!normalizedStudentCoreId && studentId) {
    const studentCore = await StudentCore.findOne({ userId: studentId }).select('_id').lean();
    normalizedStudentCoreId = studentCore?._id ? String(studentCore._id) : '';
  }
  if (!normalizedStudentCoreId) return [];

  const [studentCore, profile] = await Promise.all([
    StudentCore.findById(normalizedStudentCoreId).select('phone').lean(),
    StudentProfile.findOne({ studentId: normalizedStudentCoreId })
      .select('contact background guardians')
      .lean()
  ]);

  return normalizeFinanceDeliveryPhones([
    studentCore?.phone || '',
    profile?.contact?.primaryPhone || '',
    profile?.contact?.alternatePhone || '',
    profile?.background?.emergencyPhone || '',
    ...(Array.isArray(profile?.guardians) ? profile.guardians.map((item) => item?.phone || '') : [])
  ]);
}

async function notifyFinanceAudience({
  req,
  userIds = [],
  title = '',
  message = '',
  type = 'finance',
  emailSubject,
  emailHtml,
  emailText,
  sendEmail = true
} = {}) {
  const normalizedUserIds = Array.from(new Set(
    userIds
      .map((item) => normalizeText(item))
      .filter(Boolean)
  ));

  if (!normalizedUserIds.length) return [];

  const notifications = await UserNotification.insertMany(
    normalizedUserIds.map((userId) => ({
      user: userId,
      title,
      message,
      type
    }))
  );

  const io = req?.app?.get?.('io');
  if (io) {
    notifications.forEach((notification) => {
      io.to(`user:${notification.user}`).emit('notify:new', notification.toObject());
    });
  }

  if (sendEmail !== false) {
    const users = await User.find({ _id: { $in: normalizedUserIds } }).select('email status').lean();
    await Promise.all(users.map(async (user) => {
      if (!user?.email || normalizeText(user.status).toLowerCase() === 'inactive') return null;
      try {
        await sendMail({
          to: user.email,
          subject: emailSubject || title,
          text: emailText || message,
          html: emailHtml || `<p>${message}</p>`
        });
      } catch {
        return null;
      }
      return null;
    }));
  }

  return notifications;
}

async function notifyFinanceAudienceForStudent({
  req,
  studentId,
  studentCoreId,
  title,
  message,
  emailSubject,
  emailHtml,
  emailText,
  sendEmail = true
} = {}) {
  const userIds = await resolveFinanceAudienceUserIds({ studentId, studentCoreId });
  return notifyFinanceAudience({
    req,
    userIds,
    title,
    message,
    type: 'finance',
    emailSubject,
    emailHtml,
    emailText,
    sendEmail
  });
}

const buildProviderStatusCallbackUrl = async ({ channel = 'sms', mode = 'webhook', req = null } = {}) => {
  const { statusWebhookUrl } = await getChannelProviderConfig(channel);
  if (statusWebhookUrl) return statusWebhookUrl;
  if (mode !== 'twilio' && mode !== 'meta') return '';
  const protocol = normalizeText(req?.headers?.['x-forwarded-proto']) || req?.protocol || 'http';
  const host = normalizeText(req?.headers?.['x-forwarded-host']) || normalizeText(req?.get?.('host')) || '';
  if (!host) return '';
  const providerKey = mode === 'meta' ? 'meta' : 'twilio';
  return `${protocol}://${host}/api/finance/delivery/providers/${providerKey}/status`;
};

const sendProviderHttpRequest = ({
  url = '',
  method = 'POST',
  headers = {},
  body = '',
  timeoutMs = FINANCE_DELIVERY_PROVIDER_TIMEOUT_MS
} = {}) => new Promise((resolve) => {
  const normalizedUrl = normalizeText(url);
  if (!normalizedUrl) {
    resolve({ ok: false, message: 'channel_not_configured', failureCode: 'channel_not_configured', retryable: false });
    return;
  }
  try {
    const target = new URL(normalizedUrl);
    const client = target.protocol === 'https:' ? https : http;
    const request = client.request({
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method,
      headers: {
        ...(headers || {}),
        'Content-Length': Buffer.byteLength(body || '')
      }
    }, (response) => {
      let raw = '';
      response.on('data', (chunk) => {
        raw += chunk.toString('utf8');
      });
      response.on('end', () => {
        let parsedBody = null;
        try {
          parsedBody = raw ? JSON.parse(raw) : null;
        } catch {
          parsedBody = null;
        }
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          statusCode: Number(response.statusCode || 0),
          rawBody: parsedBody || raw,
          body: parsedBody,
          text: raw
        });
      });
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('provider_timeout'));
    });
    request.on('error', (error) => {
      const normalizedFailure = normalizeFailureReason({
        message: normalizeText(error?.message || 'webhook_failed')
      });
      resolve({
        ok: false,
        message: normalizeText(error?.message || 'webhook_failed'),
        failureCode: normalizedFailure.failureCode,
        retryable: normalizedFailure.retryable
      });
    });
    request.write(body || '');
    request.end();
  } catch (error) {
    const normalizedFailure = normalizeFailureReason({
      message: normalizeText(error?.message || 'webhook_failed')
    });
    resolve({
      ok: false,
      message: normalizeText(error?.message || 'webhook_failed'),
      failureCode: normalizedFailure.failureCode,
      retryable: normalizedFailure.retryable
    });
  }
});

const postJsonToWebhook = ({ url = '', payload = {} } = {}) => sendProviderHttpRequest({
  url,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload || {})
}).then((result) => {
  if (!result?.ok) {
    const normalizedFailure = normalizeFailureReason({
      message: extractProviderMessage(result?.body || null) || normalizeText(result?.message || `webhook_status_${result?.statusCode || 500}`),
      statusCode: Number(result?.statusCode || 0),
      failureCode: extractProviderFailureCode(result?.body || null) || normalizeText(result?.failureCode || '')
    });
    return {
      ok: false,
      statusCode: Number(result?.statusCode || 0),
      message: extractProviderMessage(result?.body || null) || normalizeText(result?.message || `webhook_status_${result?.statusCode || 500}`),
      failureCode: normalizedFailure.failureCode,
      retryable: normalizedFailure.retryable,
      providerMessageId: extractProviderMessageId(result?.body || null),
      providerStatus: extractProviderStatus(result?.body || null) || '',
      rawBody: result?.rawBody || null
    };
  }
  const parsedBody = result?.body || null;
  const bodyRejected = parsedBody && (
    parsedBody.success === false
    || parsedBody.ok === false
    || parsedBody.accepted === false
  );
  if (bodyRejected) {
    const normalizedFailure = normalizeFailureReason({
      message: extractProviderMessage(parsedBody) || `webhook_status_${result?.statusCode || 500}`,
      statusCode: Number(result?.statusCode || 0),
      failureCode: extractProviderFailureCode(parsedBody)
    });
    return {
      ok: false,
      statusCode: Number(result?.statusCode || 0),
      message: extractProviderMessage(parsedBody) || `webhook_status_${result?.statusCode || 500}`,
      failureCode: normalizedFailure.failureCode,
      retryable: normalizedFailure.retryable,
      providerMessageId: extractProviderMessageId(parsedBody),
      providerStatus: extractProviderStatus(parsedBody) || '',
      rawBody: result?.rawBody || null
    };
  }
  return {
    ok: true,
    statusCode: Number(result?.statusCode || 0),
    providerMessageId: extractProviderMessageId(parsedBody),
    providerStatus: extractProviderStatus(parsedBody) || 'accepted',
    rawBody: result?.rawBody || null
  };
});

const buildTwilioRecipientHandle = (channel = 'sms', recipient = '') => {
  const normalizedRecipient = normalizeText(recipient).replace(/[\s()-]+/g, '');
  if (!normalizedRecipient) return '';
  return normalizeChannel(channel) === 'whatsapp' && !normalizedRecipient.startsWith('whatsapp:')
    ? `whatsapp:${normalizedRecipient}`
    : normalizedRecipient;
};

const buildBasicAuthHeader = (username = '', password = '') => (
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
);

async function deliverWithTwilioProvider({
  channel = 'sms',
  recipient = '',
  archive = {},
  subject = '',
  text = '',
  req = null
} = {}) {
  const config = await getChannelProviderConfig(channel);
  if (!config.accountSid || !config.authToken || !config.fromHandle) {
    return { ok: false, message: 'channel_not_configured', failureCode: 'channel_not_configured', retryable: false };
  }
  const apiBaseUrl = normalizeText(config.apiBaseUrl || `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`);
  const callbackUrl = await buildProviderStatusCallbackUrl({ channel, mode: 'twilio', req });
  const form = new URLSearchParams();
  form.set('To', buildTwilioRecipientHandle(channel, recipient));
  form.set('From', buildTwilioRecipientHandle(channel, config.fromHandle));
  form.set('Body', normalizeText(text || subject || archive?.documentNo || 'Finance document'));
  if (callbackUrl) form.set('StatusCallback', callbackUrl);
  if (normalizeText(archive?.mediaUrl || '')) {
    form.set('MediaUrl', normalizeText(archive.mediaUrl));
  }
  const result = await sendProviderHttpRequest({
    url: apiBaseUrl,
    method: 'POST',
    headers: {
      Authorization: buildBasicAuthHeader(config.accountSid, config.authToken),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });
  const responseBody = result?.body || null;
  if (!result?.ok) {
    const normalizedFailure = normalizeFailureReason({
      message: extractProviderMessage(responseBody) || normalizeText(result?.message || result?.text || 'twilio_request_failed'),
      statusCode: Number(result?.statusCode || 0),
      failureCode: extractProviderFailureCode(responseBody)
    });
    return {
      ok: false,
      statusCode: Number(result?.statusCode || 0),
      message: extractProviderMessage(responseBody) || normalizeText(result?.message || result?.text || 'twilio_request_failed'),
      failureCode: normalizedFailure.failureCode,
      retryable: normalizedFailure.retryable,
      providerMessageId: extractProviderMessageId(responseBody),
      providerStatus: extractProviderStatus(responseBody) || ''
    };
  }
  return {
    ok: true,
    statusCode: Number(result?.statusCode || 0),
    providerMessageId: extractProviderMessageId(responseBody),
    providerStatus: extractProviderStatus(responseBody) || 'queued'
  };
}

async function deliverWithMetaWhatsAppProvider({
  recipient = '',
  archive = {},
  subject = '',
  text = ''
} = {}) {
  const config = await getChannelProviderConfig('whatsapp');
  if (!config.accessToken || !config.phoneNumberId) {
    return { ok: false, message: 'channel_not_configured', failureCode: 'channel_not_configured', retryable: false };
  }
  const apiBaseUrl = normalizeText(config.apiBaseUrl || `https://graph.facebook.com/v20.0/${config.phoneNumberId}/messages`);
  const messageBody = normalizeText(text || subject || archive?.documentNo || 'Finance document');
  const result = await sendProviderHttpRequest({
    url: apiBaseUrl,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizeText(recipient).replace(/^\+/, ''),
      type: 'text',
      text: {
        preview_url: false,
        body: messageBody
      }
    })
  });
  const responseBody = result?.body || null;
  if (!result?.ok) {
    const normalizedFailure = normalizeFailureReason({
      message: extractProviderMessage(responseBody) || normalizeText(result?.message || result?.text || 'meta_request_failed'),
      statusCode: Number(result?.statusCode || 0),
      failureCode: extractProviderFailureCode(responseBody)
    });
    return {
      ok: false,
      statusCode: Number(result?.statusCode || 0),
      message: extractProviderMessage(responseBody) || normalizeText(result?.message || result?.text || 'meta_request_failed'),
      failureCode: normalizedFailure.failureCode,
      retryable: normalizedFailure.retryable,
      providerMessageId: extractProviderMessageId(responseBody),
      providerStatus: extractProviderStatus(responseBody) || ''
    };
  }
  const firstMessage = Array.isArray(responseBody?.messages) ? responseBody.messages[0] : null;
  return {
    ok: true,
    statusCode: Number(result?.statusCode || 0),
    providerMessageId: normalizeText(firstMessage?.id || extractProviderMessageId(responseBody)),
    providerStatus: 'accepted'
  };
}

async function deliverWithProviderChannel({
  channel = 'sms',
  recipients = [],
  archive = {},
  note = '',
  subject = '',
  text = '',
  req = null
} = {}) {
  const { channel: normalizedChannel, mode, provider, webhookUrl } = await getChannelProviderConfig(channel);
  if (normalizedChannel !== 'sms' && normalizedChannel !== 'whatsapp') {
    return {
      ok: false,
      deliveredCount: 0,
      failedRecipients: [],
      message: 'unsupported_channel',
      failureCode: 'unsupported_channel',
      retryable: false,
      provider
    };
  }

  let deliveredCount = 0;
  const successRecipients = [];
  const failedRecipients = [];
  for (const recipient of normalizeFinanceDeliveryPhones(recipients)) {
    const attemptAt = new Date();
    let result = null;
    if (mode === 'mock') {
      result = {
        ok: true,
        statusCode: 202,
        providerMessageId: `${provider}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        providerStatus: 'accepted'
      };
    } else if (mode === 'twilio') {
      result = await deliverWithTwilioProvider({
        channel: normalizedChannel,
        recipient,
        archive,
        subject,
        text,
        req
      });
    } else if (mode === 'meta') {
      result = normalizedChannel === 'whatsapp'
        ? await deliverWithMetaWhatsAppProvider({
          recipient,
          archive,
          subject,
          text
        })
        : {
          ok: false,
          statusCode: 400,
          message: 'unsupported_channel',
          failureCode: 'unsupported_channel',
          retryable: false
        };
    } else {
      result = await postJsonToWebhook({
        url: webhookUrl,
        payload: {
          provider,
          channel: normalizedChannel,
          recipient,
          subject: normalizeText(subject),
          text: normalizeText(text),
          note: normalizeText(note),
          documentNo: normalizeText(archive?.documentNo),
          documentType: normalizeText(archive?.documentType),
          title: normalizeText(archive?.title || archive?.subjectName || archive?.batchLabel),
          verificationUrl: normalizeText(archive?.verification?.url || archive?.verificationUrl || '')
        }
      });
    }
    if (result?.ok) {
      deliveredCount += 1;
      successRecipients.push({
        recipient,
        provider,
        providerMessageId: normalizeText(result?.providerMessageId),
        providerStatus: normalizeText(result?.providerStatus || 'accepted')
      });
    } else {
      const normalizedFailure = normalizeFailureReason({
        message: normalizeText(result?.message || 'channel_failed'),
        statusCode: Number(result?.statusCode || 0),
        failureCode: normalizeText(result?.failureCode || '')
      });
      const attemptNumber = failedRecipients.length + 1;
      failedRecipients.push({
        recipient,
        message: normalizeText(result?.message || 'channel_failed'),
        failureCode: normalizedFailure.failureCode,
        retryable: normalizedFailure.retryable,
        nextRetryAt: normalizedFailure.retryable ? buildNextRetryAt(attemptNumber, attemptAt) : null,
        provider,
        providerMessageId: normalizeText(result?.providerMessageId),
        providerStatus: normalizeText(result?.providerStatus)
      });
    }
  }

  const primarySuccess = successRecipients[0] || null;
  const primaryFailure = failedRecipients[0] || null;

  return {
    ok: deliveredCount > 0,
    deliveredCount,
    successRecipients,
    failedRecipients,
    message: failedRecipients[0]?.message || '',
    failureCode: primaryFailure?.failureCode || '',
    retryable: primaryFailure?.retryable === true,
    nextRetryAt: primaryFailure?.nextRetryAt || null,
    provider,
    providerMessageId: primarySuccess?.providerMessageId || primaryFailure?.providerMessageId || '',
    providerStatus: primarySuccess?.providerStatus || primaryFailure?.providerStatus || ''
  };
}

function buildDeliveryResultPayload({
  activeArchive = null,
  channel = 'email',
  deliverySucceeded = false,
  failureMessage = '',
  recipientLabel = '',
  recipientCount = 0,
  linkedAudienceNotified = false,
  deliverySubject = '',
  note = '',
  provider = '',
  providerMessageId = '',
  providerStatus = '',
  failureCode = '',
  retryable = false,
  nextRetryAt = null
} = {}) {
  const nextStatus = deliverySucceeded
    ? (Number(activeArchive?.deliveryCount || 0) > 0 ? 'resent' : 'sent')
    : 'failed';
  return {
    status: nextStatus,
    recipientLabel,
    recipientCount,
    linkedAudienceNotified,
    deliverySubject,
    note,
    failureMessage,
    channel: normalizeChannel(channel),
    provider: normalizeText(provider),
    providerMessageId: normalizeText(providerMessageId),
    providerStatus: normalizeText(providerStatus),
    failureCode: deliverySucceeded ? '' : normalizeText(failureCode),
    retryable: deliverySucceeded ? false : retryable === true,
    nextRetryAt: deliverySucceeded ? null : (nextRetryAt || null)
  };
}

async function deliverFinanceDocumentArchive({
  archiveId = '',
  archive = null,
  req,
  channel = 'email',
  emails = [],
  recipientHandles = [],
  includeLinkedAudience = true,
  campaignName = '',
  messageTemplateKey = '',
  messageTemplateSubject = '',
  messageTemplateBody = '',
  subject = '',
  note = ''
} = {}) {
  const activeArchive = archive || await getFinanceDocumentArchiveById(archiveId);
  if (!activeArchive) {
    return {
      ok: false,
      statusCode: 404,
      message: 'سند مالی موردنظر در آرشیف پیدا نشد.',
      item: null,
      failedRecipients: []
    };
  }
  if (normalizeText(activeArchive.status) !== 'active') {
    return {
      ok: false,
      statusCode: 400,
      message: 'فقط اسناد فعال قابل ارسال هستند.',
      item: activeArchive,
      failedRecipients: []
    };
  }

  const normalizedChannel = normalizeChannel(channel);
  const manualRecipients = normalizeFinanceDeliveryHandles(recipientHandles || emails || [], normalizedChannel);
  const normalizedNote = normalizeText(note);
  const supportsLinkedAudience = normalizeText(activeArchive.documentType) !== 'batch_statement_pack';
  const shouldNotifyLinkedAudience = includeLinkedAudience !== false && supportsLinkedAudience;
  const deliveryMessage = buildFinanceDeliveryMessage(activeArchive, {
    note: normalizedNote,
    channel: normalizedChannel,
    campaignName,
    messageTemplateKey,
    messageTemplateSubject,
    messageTemplateBody
  });
  const deliverySubject = normalizeText(subject || deliveryMessage.subject) || deliveryMessage.subject;

  const studentCoreId = normalizeText(activeArchive?.studentId?._id || activeArchive?.studentId || '');
  const studentUserId = normalizeText(activeArchive?.meta?.studentUserId || '');

  let linkedAudienceNotified = false;
  let deliveredManualCount = 0;
  let failedRecipients = [];
  let recipientLabel = '';
  let recipientCount = 0;
  let provider = '';
  let providerMessageId = '';
  let providerStatus = '';
  let failureCode = '';
  let retryable = false;
  let nextRetryAt = null;

  if (normalizedChannel === 'portal') {
    provider = 'portal_notification';
    if (!shouldNotifyLinkedAudience || (!studentCoreId && !studentUserId)) {
      return {
        ok: false,
        statusCode: 400,
        message: 'برای channel پرتال باید audience مرتبط متعلم در دسترس باشد.',
        item: activeArchive,
        failedRecipients: []
      };
    }
    const notifications = await notifyFinanceAudienceForStudent({
      req,
      studentId: studentUserId,
      studentCoreId,
      title: `سند مالی ${normalizeText(activeArchive.documentNo)}`.trim(),
      message: `سند مالی ${normalizeText(activeArchive.documentNo)} برای ${normalizeText(activeArchive.subjectName || activeArchive.batchLabel || 'متعلم')} در پرتال آماده شد.`,
      emailSubject: deliverySubject,
      emailHtml: deliveryMessage.html,
      emailText: deliveryMessage.text,
      sendEmail: false
    });
    linkedAudienceNotified = Array.isArray(notifications) && notifications.length > 0;
    recipientLabel = linkedAudienceNotified ? 'linked-audience' : '';
    recipientCount = linkedAudienceNotified ? notifications.length : 0;
    providerStatus = linkedAudienceNotified ? 'delivered' : 'failed';
  } else if (normalizedChannel === 'sms' || normalizedChannel === 'whatsapp') {
    const linkedAudiencePhones = shouldNotifyLinkedAudience
      ? await resolveFinanceAudiencePhones({ studentId: studentUserId, studentCoreId })
      : [];
    const recipients = Array.from(new Set([
      ...manualRecipients,
      ...linkedAudiencePhones
    ]));
    if (!recipients.length) {
      return {
        ok: false,
        statusCode: 400,
        message: 'برای این channel حداقل یک شماره تماس معتبر لازم است.',
        item: activeArchive,
        failedRecipients: []
      };
    }

    const channelResult = await deliverWithProviderChannel({
      channel: normalizedChannel,
      recipients,
      archive: activeArchive,
      note: normalizedNote,
      subject: deliverySubject,
      text: deliveryMessage.text,
      req
    });
    deliveredManualCount = Number(channelResult.deliveredCount || 0);
    provider = normalizeText(channelResult?.provider);
    providerMessageId = normalizeText(channelResult?.providerMessageId);
    providerStatus = normalizeText(channelResult?.providerStatus);
    failureCode = normalizeText(channelResult?.failureCode);
    retryable = channelResult?.retryable === true;
    nextRetryAt = channelResult?.nextRetryAt || null;
    failedRecipients = Array.isArray(channelResult.failedRecipients)
      ? channelResult.failedRecipients.map((entry) => ({
          email: normalizeText(entry?.recipient),
          message: normalizeText(entry?.message),
          failureCode: normalizeText(entry?.failureCode),
          retryable: entry?.retryable === true,
          nextRetryAt: entry?.nextRetryAt || null,
          provider: normalizeText(entry?.provider),
          providerMessageId: normalizeText(entry?.providerMessageId),
          providerStatus: normalizeText(entry?.providerStatus)
        }))
      : [];
    linkedAudienceNotified = linkedAudiencePhones.length > 0;
    recipientLabel = recipients.join(', ');
    recipientCount = recipients.length;
  } else {
    provider = 'smtp';
    if (!manualRecipients.length && !shouldNotifyLinkedAudience) {
      return {
        ok: false,
        statusCode: 400,
        message: 'حداقل یک گیرنده یا audience مرتبط برای ارسال لازم است.',
        item: activeArchive,
        failedRecipients: []
      };
    }

    for (const recipientEmail of manualRecipients) {
      try {
        const result = await sendMail({
          to: recipientEmail,
          subject: deliverySubject,
          text: deliveryMessage.text,
          html: deliveryMessage.html
        });
        if (result?.ok === false) {
          const normalizedFailure = normalizeFailureReason({ message: result?.message || 'send_failed' });
          failedRecipients.push({
            email: recipientEmail,
            message: result?.message || 'send_failed',
            failureCode: normalizedFailure.failureCode,
            retryable: normalizedFailure.retryable,
            nextRetryAt: normalizedFailure.retryable ? buildNextRetryAt(1) : null,
            provider: 'smtp',
            providerMessageId: '',
            providerStatus: 'failed'
          });
          failureCode = failureCode || normalizedFailure.failureCode;
          retryable = retryable || normalizedFailure.retryable;
        } else {
          deliveredManualCount += 1;
        }
      } catch (error) {
        const normalizedFailure = normalizeFailureReason({ message: normalizeText(error?.message || 'send_failed') });
        failedRecipients.push({
          email: recipientEmail,
          message: normalizeText(error?.message || 'send_failed'),
          failureCode: normalizedFailure.failureCode,
          retryable: normalizedFailure.retryable,
          nextRetryAt: normalizedFailure.retryable ? buildNextRetryAt(1) : null,
          provider: 'smtp',
          providerMessageId: '',
          providerStatus: 'failed'
        });
        failureCode = failureCode || normalizedFailure.failureCode;
        retryable = retryable || normalizedFailure.retryable;
      }
    }

    if (shouldNotifyLinkedAudience && (studentCoreId || studentUserId)) {
      await notifyFinanceAudienceForStudent({
        req,
        studentId: studentUserId,
        studentCoreId,
        title: `سند مالی ${normalizeText(activeArchive.documentNo)}`.trim(),
        message: `سند مالی ${normalizeText(activeArchive.documentNo)} برای ${normalizeText(activeArchive.subjectName || activeArchive.batchLabel || 'متعلم')} آماده شد.`,
        emailSubject: deliverySubject,
        emailHtml: deliveryMessage.html,
        emailText: deliveryMessage.text,
        sendEmail: true
      });
      linkedAudienceNotified = true;
    }
    recipientLabel = [manualRecipients.join(', '), linkedAudienceNotified ? 'linked-audience' : ''].filter(Boolean).join(' | ');
    recipientCount = manualRecipients.length + (linkedAudienceNotified ? 1 : 0);
    providerStatus = deliveredManualCount > 0 || linkedAudienceNotified ? 'sent' : '';
  }

  const deliverySucceeded = deliveredManualCount > 0 || (normalizedChannel === 'portal' && linkedAudienceNotified);
  if (!deliverySucceeded && retryable && !nextRetryAt) {
    nextRetryAt = buildNextRetryAt(1);
  }
  const failureMessage = failedRecipients[0]?.message || (deliverySucceeded ? '' : 'ارسال سند مالی ناموفق بود.');
  const deliveryResult = buildDeliveryResultPayload({
    activeArchive,
    channel: normalizedChannel,
    deliverySucceeded,
    failureMessage,
    recipientLabel,
    recipientCount,
    linkedAudienceNotified,
    deliverySubject,
    note: normalizedNote,
    provider,
    providerMessageId,
    providerStatus,
    failureCode,
    retryable,
    nextRetryAt
  });

  const updated = await recordFinanceDocumentDelivery({
    archiveId: activeArchive._id || archiveId,
    req,
    channel: deliveryResult.channel,
    status: deliveryResult.status,
    recipient: deliveryResult.recipientLabel,
    recipientCount: deliveryResult.recipientCount,
    linkedAudienceNotified: deliveryResult.linkedAudienceNotified,
    subject: deliveryResult.deliverySubject,
    provider: deliveryResult.provider,
    providerMessageId: deliveryResult.providerMessageId,
    providerStatus: deliveryResult.providerStatus,
    note: deliveryResult.note,
    errorMessage: deliverySucceeded ? '' : deliveryResult.failureMessage,
    failureCode: deliverySucceeded ? '' : deliveryResult.failureCode,
    retryable: deliveryResult.retryable,
    nextRetryAt: deliveryResult.nextRetryAt
  });

  return {
    ok: deliverySucceeded,
    statusCode: deliverySucceeded ? 200 : 503,
    message: deliverySucceeded ? 'سند مالی برای ارسال ثبت شد.' : deliveryResult.failureMessage,
    item: updated,
    failedRecipients,
    deliveredManualCount,
    linkedAudienceNotified: deliveryResult.linkedAudienceNotified,
    recipientCount: deliveryResult.recipientCount,
    channel: deliveryResult.channel,
    status: deliveryResult.status,
    provider: deliveryResult.provider,
    providerMessageId: deliveryResult.providerMessageId,
    providerStatus: deliveryResult.providerStatus,
    failureCode: deliveryResult.failureCode,
    retryable: deliveryResult.retryable,
    nextRetryAt: deliveryResult.nextRetryAt
  };
}

const populateCampaignQuery = (query) => query
  .populate('createdBy', 'name')
  .populate('updatedBy', 'name')
  .populate('classId', 'title titleDari code')
  .populate('academicYearId', 'title code');

const clampIntervalHours = (value) => Math.min(24 * 30, Math.max(6, Number(value || 24) || 24));
const clampMaxDocuments = (value) => Math.min(50, Math.max(1, Number(value || 10) || 10));
const clampRetryLimit = (value) => Math.min(50, Math.max(1, Number(value || 20) || 20));
const clampRecoveryLimit = (value) => Math.min(50, Math.max(1, Number(value || 20) || 20));

const buildNextRunAt = (intervalHours = 24, fromDate = new Date()) => {
  const next = new Date(fromDate);
  next.setHours(next.getHours() + clampIntervalHours(intervalHours));
  return next;
};

const buildTargetSummary = (targets = []) => ({
  total: targets.length,
  successful: targets.filter((target) => SUCCESS_DELIVERY_STATUSES.has(normalizeText(target?.status))).length,
  failed: targets.filter((target) => normalizeText(target?.status) === 'failed').length,
  skipped: targets.filter((target) => normalizeText(target?.status) === 'skipped').length
});

const normalizeProviderWebhookKey = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'twilio') return 'twilio';
  if (normalized === 'meta' || normalized === 'meta_whatsapp') return 'meta';
  return 'generic';
};

const normalizeRecoveryStateFilter = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  if ([
    'awaiting_callback',
    'retry_ready',
    'retry_waiting',
    'provider_failed',
    'status_unknown'
  ].includes(normalized)) {
    return normalized;
  }
  return '';
};

const normalizeProviderDeliveryEventAt = (value = null) => {
  if (!value && value !== 0) return new Date();
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    const milliseconds = String(Math.trunc(asNumber)).length <= 10 ? asNumber * 1000 : asNumber;
    const numericDate = new Date(milliseconds);
    if (!Number.isNaN(numericDate.getTime())) return numericDate;
  }
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date;
  return new Date();
};

const mapProviderDeliveryOutcome = ({
  providerStatus = '',
  failureCode = '',
  errorMessage = '',
  statusCode = 0
} = {}) => {
  const normalizedStatus = normalizeText(providerStatus).toLowerCase();
  if (['delivered', 'delivery_confirmed', 'read', 'seen', 'completed'].includes(normalizedStatus)) {
    return {
      terminal: true,
      status: 'delivered',
      retryable: false,
      failureCode: '',
      errorMessage: ''
    };
  }
  if (['failed', 'undelivered', 'rejected', 'invalid', 'blocked', 'expired', 'canceled', 'cancelled'].includes(normalizedStatus)) {
    const normalizedFailure = normalizeFailureReason({
      message: errorMessage || normalizedStatus || 'provider_failed',
      statusCode: Number(statusCode || 0),
      failureCode
    });
    return {
      terminal: true,
      status: 'failed',
      retryable: normalizedFailure.retryable,
      failureCode: normalizedFailure.failureCode,
      errorMessage: normalizeText(errorMessage || normalizedStatus || normalizedFailure.failureCode)
    };
  }
  return {
    terminal: false,
    status: null,
    retryable: false,
    failureCode: normalizeText(failureCode),
    errorMessage: normalizeText(errorMessage)
  };
};

const reconcileCampaignDeliverySummary = (campaign = null) => {
  if (!campaign) return;
  const summary = buildTargetSummary(Array.isArray(campaign.targets) ? campaign.targets : []);
  campaign.targetSummary = summary;
  campaign.successCount = summary.successful;
  campaign.failureCount = summary.failed;
  if (campaign.lastRunSummary && typeof campaign.lastRunSummary === 'object') {
    campaign.lastRunSummary = {
      ...campaign.lastRunSummary,
      deliveredDocuments: summary.successful,
      failedDocuments: summary.failed
    };
  }
};

async function syncFinanceDeliveryProviderStatus({
  provider = '',
  providerMessageId = '',
  providerStatus = '',
  failureCode = '',
  errorMessage = '',
  statusCode = 0,
  occurredAt = null,
  recipient = '',
  req = null
} = {}) {
  const normalizedMessageId = normalizeText(providerMessageId);
  if (!normalizedMessageId) {
    const error = new Error('provider message id is required.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedProvider = normalizeText(provider);
  const normalizedProviderStatus = normalizeText(providerStatus);
  const normalizedRecipient = normalizeText(recipient);
  const outcome = mapProviderDeliveryOutcome({
    providerStatus: normalizedProviderStatus,
    failureCode,
    errorMessage,
    statusCode
  });
  const eventAt = normalizeProviderDeliveryEventAt(occurredAt);

  const archive = await FinanceDocumentArchive.findOne({ 'deliveryLog.providerMessageId': normalizedMessageId });
  let archiveItem = null;
  if (archive) {
    archive.deliveryLog = Array.isArray(archive.deliveryLog) ? archive.deliveryLog : [];
    const archiveEntry = [...archive.deliveryLog].reverse().find((entry) => (
      normalizeText(entry?.providerMessageId) === normalizedMessageId
      && (!normalizedProvider || !normalizeText(entry?.provider) || normalizeText(entry?.provider) === normalizedProvider)
    ));
    if (archiveEntry) {
      if (normalizedProvider) archiveEntry.provider = normalizedProvider;
      if (normalizedRecipient) archiveEntry.recipient = normalizedRecipient;
      if (normalizedProviderStatus) archiveEntry.providerStatus = normalizedProviderStatus;
      if (outcome.terminal && outcome.status === 'delivered') {
        archiveEntry.status = 'delivered';
        archiveEntry.errorMessage = '';
        archiveEntry.failureCode = '';
        archiveEntry.retryable = false;
        archiveEntry.nextRetryAt = null;
        archive.lastDeliveryStatus = 'delivered';
        archive.lastDeliveredAt = eventAt;
      } else if (outcome.terminal && outcome.status === 'failed') {
        archiveEntry.status = 'failed';
        archiveEntry.errorMessage = outcome.errorMessage;
        archiveEntry.failureCode = outcome.failureCode;
        archiveEntry.retryable = outcome.retryable === true;
        archiveEntry.nextRetryAt = outcome.retryable === true ? buildNextRetryAt(1, eventAt) : null;
        archive.lastDeliveryStatus = 'failed';
      }
      await archive.save();
      const savedArchive = await getFinanceDocumentArchiveById(archive._id);
      archiveItem = savedArchive || null;
    }
  }

  const campaigns = await FinanceDeliveryCampaign.find({ 'targets.providerMessageId': normalizedMessageId });
  const updatedCampaigns = [];
  for (const campaign of campaigns) {
    campaign.targets = Array.isArray(campaign.targets) ? campaign.targets : [];
    let changed = false;
    campaign.targets.forEach((target) => {
      if (normalizeText(target?.providerMessageId) !== normalizedMessageId) return;
      if (normalizedProvider && normalizeText(target?.provider) && normalizeText(target?.provider) !== normalizedProvider) return;
      if (normalizedProvider) target.provider = normalizedProvider;
      if (normalizedRecipient) target.recipient = normalizedRecipient;
      if (normalizedProviderStatus) target.providerStatus = normalizedProviderStatus;
      if (outcome.terminal && outcome.status === 'delivered') {
        target.status = 'delivered';
        target.lastDeliveredAt = eventAt;
        target.lastError = '';
        target.lastFailureCode = '';
        target.retryable = false;
        target.nextRetryAt = null;
      } else if (outcome.terminal && outcome.status === 'failed') {
        target.status = 'failed';
        target.lastError = outcome.errorMessage;
        target.lastFailureCode = outcome.failureCode;
        target.retryable = outcome.retryable === true;
        target.nextRetryAt = outcome.retryable === true ? buildNextRetryAt(Number(target?.attempts || 1), eventAt) : null;
      }
      target.lastAttemptAt = eventAt;
      changed = true;
    });
    if (!changed) continue;
    reconcileCampaignDeliverySummary(campaign);
    campaign.updatedBy = normalizeObjectId(req?.user?.id || req?.user?._id || null);
    campaign.updatedByLabel = getActorLabel(req);
    await campaign.save();
    const savedCampaign = await populateCampaignQuery(
      FinanceDeliveryCampaign.findById(campaign._id)
    );
    updatedCampaigns.push(serializeFinanceDeliveryCampaign(savedCampaign));
  }

  return {
    provider: normalizedProvider,
    providerMessageId: normalizedMessageId,
    providerStatus: normalizedProviderStatus,
    matchedArchive: archiveItem ? 1 : 0,
    matchedCampaigns: updatedCampaigns.length,
    terminal: outcome.terminal,
    status: outcome.status || '',
    archive: archiveItem,
    campaigns: updatedCampaigns
  };
}

async function ingestFinanceDeliveryProviderWebhook({
  providerKey = '',
  payload = {},
  req = null
} = {}) {
  const normalizedProviderKey = normalizeProviderWebhookKey(providerKey);
  let events = [];
  if (normalizedProviderKey === 'twilio') {
    const recipientHandle = normalizeText(payload?.To || payload?.recipient || '');
    events = [{
      provider: normalizeText(payload?.Provider || payload?.provider || ''),
      providerMessageId: normalizeText(payload?.MessageSid || payload?.SmsSid || payload?.Sid || ''),
      providerStatus: normalizeText(payload?.MessageStatus || payload?.SmsStatus || payload?.Status || ''),
      failureCode: normalizeText(payload?.ErrorCode || payload?.errorCode || ''),
      errorMessage: normalizeText(payload?.ErrorMessage || payload?.errorMessage || ''),
      recipient: recipientHandle ? recipientHandle.replace(/^whatsapp:/i, '') : '',
      occurredAt: payload?.Timestamp || null
    }];
  } else if (normalizedProviderKey === 'meta') {
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    events = entries.flatMap((entry) => (
      Array.isArray(entry?.changes) ? entry.changes : []
    )).flatMap((change) => (
      Array.isArray(change?.value?.statuses) ? change.value.statuses : []
    )).map((statusEntry) => ({
      provider: normalizeText(statusEntry?.provider || 'meta_whatsapp_gateway'),
      providerMessageId: normalizeText(statusEntry?.id || ''),
      providerStatus: normalizeText(statusEntry?.status || ''),
      failureCode: normalizeText(statusEntry?.errors?.[0]?.code || ''),
      errorMessage: normalizeText(statusEntry?.errors?.[0]?.title || statusEntry?.errors?.[0]?.message || ''),
      recipient: normalizeText(statusEntry?.recipient_id || ''),
      occurredAt: statusEntry?.timestamp || null
    }));
  } else {
    events = [payload].map((entry) => ({
      provider: normalizeText(entry?.provider || ''),
      providerMessageId: normalizeText(entry?.providerMessageId || entry?.messageId || entry?.id || ''),
      providerStatus: normalizeText(entry?.providerStatus || entry?.status || ''),
      failureCode: normalizeText(entry?.failureCode || entry?.errorCode || ''),
      errorMessage: normalizeText(entry?.errorMessage || entry?.message || ''),
      recipient: normalizeText(entry?.recipient || ''),
      occurredAt: entry?.occurredAt || entry?.timestamp || null
    }));
  }

  const validEvents = events.filter((item) => normalizeText(item?.providerMessageId));
  const results = [];
  for (const event of validEvents) {
    results.push(await syncFinanceDeliveryProviderStatus({
      ...event,
      req
    }));
  }
  return {
    providerKey: normalizedProviderKey,
    receivedCount: events.length,
    processedCount: validEvents.length,
    results
  };
}

const serializeFinanceDeliveryCampaign = (item = null) => {
  if (!item) return null;
  const plain = item?.toObject ? item.toObject() : { ...(item || {}) };
  const targets = Array.isArray(plain.targets)
    ? plain.targets.map((target) => {
        const liveStatus = buildFinanceDeliveryLiveStatus({
          ...target,
          failureCode: target?.lastFailureCode,
          errorMessage: target?.lastError
        });
        return {
          ...target,
          documentNo: normalizeText(target?.documentNo),
          channel: normalizeChannel(target?.channel || plain.channel || 'email'),
          status: normalizeText(target?.status),
          recipient: normalizeText(target?.recipient),
          recipientCount: Number(target?.recipientCount || 0),
          provider: normalizeText(target?.provider),
          providerMessageId: normalizeText(target?.providerMessageId),
          providerStatus: normalizeText(target?.providerStatus),
          attempts: Number(target?.attempts || 0),
          lastAttemptAt: target?.lastAttemptAt || null,
          lastDeliveredAt: target?.lastDeliveredAt || null,
          lastError: normalizeText(target?.lastError),
          lastFailureCode: normalizeText(target?.lastFailureCode),
          retryable: target?.retryable === true,
          nextRetryAt: target?.nextRetryAt || null,
          liveStatus
        };
      })
    : [];
  const liveStatusSummary = buildFinanceDeliveryLiveSummary(
    targets.map((target) => target.liveStatus)
  );
  const recipientHandles = Array.isArray(plain.recipientHandles)
    ? plain.recipientHandles.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  return {
    ...plain,
    channel: normalizeChannel(plain.channel),
    createdBy: serializeArchiveUser(plain.createdBy, plain.createdByLabel),
    updatedBy: serializeArchiveUser(plain.updatedBy, plain.updatedByLabel),
    classTitle: plain.classId?.titleDari || plain.classId?.title || '',
    academicYearTitle: plain.academicYearId?.title || plain.academicYearId?.code || '',
    messageTemplateKey: normalizeText(plain.messageTemplateKey),
    messageTemplateSubject: normalizeText(plain.messageTemplateSubject),
    messageTemplateBody: normalizeText(plain.messageTemplateBody),
    recipientHandles,
    recipientEmails: recipientHandles,
    targets,
    targetSummary: buildTargetSummary(targets),
    liveStatus: liveStatusSummary.latest,
    liveStatusSummary
  };
};

async function listFinanceDeliveryCampaigns(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit || 12) || 12, 1), 50);
  const query = {};
  const status = normalizeText(filters.status);
  const documentType = normalizeText(filters.documentType);
  const channel = normalizeText(filters.channel);
  if (status) query.status = status;
  if (documentType) query.documentType = documentType;
  if (channel) query.channel = normalizeChannel(channel);

  const items = await populateCampaignQuery(
    FinanceDeliveryCampaign.find(query)
  )
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(limit);

  return items.map((item) => serializeFinanceDeliveryCampaign(item));
}

async function createFinanceDeliveryCampaign(payload = {}, req = null) {
  const actorId = normalizeObjectId(req?.user?.id || req?.user?._id || null);
  const automationEnabled = payload?.automationEnabled === true;
  const channel = normalizeChannel(payload.channel || 'email');
  const templatePayload = await assertValidFinanceDeliveryTemplatePayload(payload);
  const recipientHandles = normalizeFinanceDeliveryHandles(
    payload.recipientHandles || payload.recipientEmails || payload.emails || [],
    channel
  );

  const campaign = await FinanceDeliveryCampaign.create({
    name: normalizeText(payload.name) || 'Finance delivery campaign',
    status: normalizeText(payload.status) === 'paused' ? 'paused' : 'active',
    documentType: normalizeText(payload.documentType) || 'batch_statement_pack',
    channel,
    classId: normalizeObjectId(payload.classId),
    academicYearId: normalizeObjectId(payload.academicYearId),
    monthKey: normalizeText(payload.monthKey),
    messageTemplateKey: normalizeText(payload.messageTemplateKey),
    messageTemplateSubject: templatePayload.effectiveSubjectTemplate,
    messageTemplateBody: templatePayload.effectiveBodyTemplate,
    recipientHandles,
    includeLinkedAudience: payload?.includeLinkedAudience !== false,
    retryFailed: payload?.retryFailed !== false,
    automationEnabled,
    intervalHours: clampIntervalHours(payload.intervalHours),
    maxDocumentsPerRun: clampMaxDocuments(payload.maxDocumentsPerRun),
    note: normalizeText(payload.note),
    nextRunAt: automationEnabled ? buildNextRunAt(payload.intervalHours) : null,
    lastRunStatus: 'idle',
    createdBy: actorId,
    updatedBy: actorId,
    createdByLabel: getActorLabel(req),
    updatedByLabel: getActorLabel(req),
    targets: [],
    runLog: [],
    meta: payload?.meta && typeof payload.meta === 'object' ? payload.meta : {}
  });

  const saved = await populateCampaignQuery(
    FinanceDeliveryCampaign.findById(campaign._id)
  );
  return serializeFinanceDeliveryCampaign(saved);
}

async function setFinanceDeliveryCampaignStatus(campaignId = '', status = 'active', req = null) {
  const normalizedId = normalizeObjectId(campaignId);
  if (!normalizedId) return null;
  const campaign = await FinanceDeliveryCampaign.findById(normalizedId);
  if (!campaign) return null;

  const nextStatus = normalizeText(status) === 'paused' ? 'paused' : 'active';
  campaign.status = nextStatus;
  campaign.updatedBy = normalizeObjectId(req?.user?.id || req?.user?._id || null);
  campaign.updatedByLabel = getActorLabel(req);
  campaign.nextRunAt = nextStatus === 'active' && campaign.automationEnabled
    ? (campaign.nextRunAt || buildNextRunAt(campaign.intervalHours))
    : null;
  await campaign.save();

  const saved = await populateCampaignQuery(
    FinanceDeliveryCampaign.findById(campaign._id)
  );
  return serializeFinanceDeliveryCampaign(saved);
}

const getTargetEntry = (campaign = null, archiveId = '') => {
  if (!campaign || !Array.isArray(campaign.targets)) return null;
  return campaign.targets.find((entry) => String(entry?.archiveId || '') === String(archiveId || '')) || null;
};

const upsertCampaignTarget = (campaign, archive = {}, result = {}) => {
  if (!campaign) return;
  const archiveId = normalizeObjectId(archive?._id || archive?.id || null);
  if (!archiveId) return;
  campaign.targets = Array.isArray(campaign.targets) ? campaign.targets : [];
  const existing = getTargetEntry(campaign, archiveId);
  const latestLogEntry = Array.isArray(result?.item?.deliveryLog) ? result.item.deliveryLog.slice(-1)[0] : null;
  const nextAttempts = Number(existing?.attempts || 0) + 1;
  const normalizedRetryable = result?.ok ? false : (result?.retryable === true || latestLogEntry?.retryable === true);
  const nextPayload = {
    documentNo: normalizeText(archive?.documentNo),
    channel: normalizeChannel(result?.channel || latestLogEntry?.channel || campaign?.channel || 'email'),
    status: normalizeText(result?.status || existing?.status || 'skipped'),
    recipient: normalizeText(latestLogEntry?.recipient || result?.recipient || ''),
    recipientCount: Number(result?.recipientCount || latestLogEntry?.recipientCount || 0),
    provider: normalizeText(result?.provider || latestLogEntry?.provider || ''),
    providerMessageId: normalizeText(result?.providerMessageId || latestLogEntry?.providerMessageId || ''),
    providerStatus: normalizeText(result?.providerStatus || latestLogEntry?.providerStatus || ''),
    attempts: nextAttempts,
    lastAttemptAt: new Date(),
    lastDeliveredAt: result?.ok ? new Date() : existing?.lastDeliveredAt || null,
    lastError: result?.ok ? '' : normalizeText(result?.message || 'delivery_failed'),
    lastFailureCode: result?.ok ? '' : normalizeText(result?.failureCode || latestLogEntry?.failureCode || ''),
    retryable: normalizedRetryable,
    nextRetryAt: result?.ok
      ? null
      : (result?.nextRetryAt || latestLogEntry?.nextRetryAt || (normalizedRetryable ? buildNextRetryAt(nextAttempts) : null))
  };

  if (existing) {
    Object.assign(existing, nextPayload);
    return;
  }

  campaign.targets.push({
    archiveId,
    ...nextPayload
  });
};

const summarizeRunStatus = ({ deliveredDocuments = 0, failedDocuments = 0, matchedDocuments = 0 } = {}) => {
  if (matchedDocuments <= 0) return 'skipped';
  if (deliveredDocuments > 0 && failedDocuments > 0) return 'partial';
  if (deliveredDocuments > 0) return 'success';
  if (failedDocuments > 0) return 'failed';
  return 'skipped';
};

const buildCampaignArchiveQuery = (campaign = null) => {
  const archiveQuery = {
    status: 'active',
    documentType: normalizeText(campaign?.documentType)
  };
  if (campaign?.classId) archiveQuery.classId = campaign.classId;
  if (campaign?.academicYearId) archiveQuery.academicYearId = campaign.academicYearId;
  if (normalizeText(campaign?.monthKey)) archiveQuery.monthKey = normalizeText(campaign.monthKey);
  return archiveQuery;
};

function finalizeCampaignRun(campaign, {
  runtimeReq,
  mode,
  matchedDocuments,
  deliveredDocuments,
  failedDocuments,
  skippedDocuments
}) {
  const runStatus = summarizeRunStatus({ deliveredDocuments, failedDocuments, matchedDocuments });
  const now = new Date();
  const runSummary = {
    matchedDocuments,
    deliveredDocuments,
    failedDocuments,
    skippedDocuments,
    runAt: now.toISOString(),
    mode
  };

  campaign.lastRunAt = now;
  campaign.lastRunStatus = runStatus;
  campaign.lastRunSummary = runSummary;
  campaign.runCount = Number(campaign.runCount || 0) + 1;
  campaign.successCount = Number(campaign.successCount || 0) + deliveredDocuments;
  campaign.failureCount = Number(campaign.failureCount || 0) + failedDocuments;
  campaign.updatedBy = normalizeObjectId(runtimeReq?.user?.id || runtimeReq?.user?._id || null);
  campaign.updatedByLabel = getActorLabel(runtimeReq);
  campaign.nextRunAt = campaign.automationEnabled === true && normalizeText(campaign.status) === 'active'
    ? buildNextRunAt(campaign.intervalHours, now)
    : null;
  campaign.runLog = Array.isArray(campaign.runLog) ? campaign.runLog : [];
  campaign.runLog.unshift({
    runAt: now,
    mode,
    status: runStatus,
    matchedDocuments,
    deliveredDocuments,
    failedDocuments,
    skippedDocuments,
    note: normalizeText(campaign.note),
    actorId: normalizeText(runtimeReq?.user?.id || runtimeReq?.user?._id || ''),
    actorName: getActorLabel(runtimeReq)
  });
  campaign.runLog = campaign.runLog.slice(0, 20);
  return runSummary;
}

async function runFinanceDeliveryCampaign({
  campaignId = '',
  req = null,
  app = null,
  mode = 'manual',
  allowPaused = true
} = {}) {
  const normalizedId = normalizeObjectId(campaignId);
  if (!normalizedId) return null;
  const campaign = await FinanceDeliveryCampaign.findById(normalizedId);
  if (!campaign) return null;
  if (!allowPaused && normalizeText(campaign.status) !== 'active') {
    return {
      ok: true,
      skipped: true,
      reason: 'campaign_paused',
      item: serializeFinanceDeliveryCampaign(campaign)
    };
  }

  const runtimeReq = req || createSystemReq(app, normalizeObjectId(campaign.updatedBy || campaign.createdBy || null));
  const candidates = await FinanceDocumentArchive.find(buildCampaignArchiveQuery(campaign))
    .select('_id documentNo status documentType generatedAt')
    .sort({ generatedAt: -1, createdAt: -1 })
    .limit(clampMaxDocuments(campaign.maxDocumentsPerRun) * 5);

  const eligibleArchives = [];
  let skippedDocuments = 0;
  for (const candidate of candidates) {
    const target = getTargetEntry(campaign, candidate._id);
    const targetStatus = normalizeText(target?.status);
    if (SUCCESS_DELIVERY_STATUSES.has(targetStatus)) {
      skippedDocuments += 1;
      continue;
    }
    if (targetStatus === 'failed' && campaign.retryFailed !== true) {
      skippedDocuments += 1;
      continue;
    }
    if (targetStatus === 'failed' && target?.retryable === false) {
      skippedDocuments += 1;
      continue;
    }
    if (targetStatus === 'failed' && target?.nextRetryAt && new Date(target.nextRetryAt).getTime() > Date.now()) {
      skippedDocuments += 1;
      continue;
    }
    eligibleArchives.push(candidate);
    if (eligibleArchives.length >= clampMaxDocuments(campaign.maxDocumentsPerRun)) break;
  }

  let deliveredDocuments = 0;
  let failedDocuments = 0;
  for (const candidate of eligibleArchives) {
    const result = await deliverFinanceDocumentArchive({
      archiveId: candidate._id,
      req: runtimeReq,
      channel: campaign.channel,
      recipientHandles: campaign.recipientHandles,
      includeLinkedAudience: campaign.includeLinkedAudience,
      campaignName: campaign.name,
      messageTemplateKey: campaign.messageTemplateKey,
      messageTemplateSubject: campaign.messageTemplateSubject,
      messageTemplateBody: campaign.messageTemplateBody,
      note: [normalizeText(campaign.note), `Campaign: ${normalizeText(campaign.name)}`].filter(Boolean).join(' | ')
    });
    upsertCampaignTarget(campaign, candidate, result);
    if (result?.ok) deliveredDocuments += 1;
    else failedDocuments += 1;
  }

  const matchedDocuments = eligibleArchives.length;
  const runSummary = finalizeCampaignRun(campaign, {
    runtimeReq,
    mode,
    matchedDocuments,
    deliveredDocuments,
    failedDocuments,
    skippedDocuments
  });
  await campaign.save();

  await logActivity({
    req: runtimeReq,
    action: 'finance_run_delivery_campaign',
    targetType: 'FinanceDeliveryCampaign',
    targetId: String(campaign._id || ''),
    meta: {
      name: normalizeText(campaign.name),
      mode,
      channel: normalizeChannel(campaign.channel),
      matchedDocuments,
      deliveredDocuments,
      failedDocuments,
      skippedDocuments
    }
  });

  const saved = await populateCampaignQuery(
    FinanceDeliveryCampaign.findById(campaign._id)
  );
  return {
    ok: summarizeRunStatus(runSummary) !== 'failed',
    skipped: false,
    summary: runSummary,
    item: serializeFinanceDeliveryCampaign(saved)
  };
}

async function retryFinanceDeliveryTarget({
  campaignId = '',
  archiveId = '',
  req = null,
  app = null
} = {}) {
  const normalizedCampaignId = normalizeObjectId(campaignId);
  const normalizedArchiveId = normalizeObjectId(archiveId);
  if (!normalizedCampaignId || !normalizedArchiveId) return null;

  const campaign = await FinanceDeliveryCampaign.findById(normalizedCampaignId);
  if (!campaign) return null;

  const target = getTargetEntry(campaign, normalizedArchiveId);
  if (!target || !RETRYABLE_DELIVERY_STATUSES.has(normalizeText(target?.status))) {
    return {
      ok: false,
      statusCode: 409,
      message: 'این مورد در صف retry قابل‌اجرا نیست.',
      item: serializeFinanceDeliveryCampaign(campaign)
    };
  }

  const runtimeReq = req || createSystemReq(app, normalizeObjectId(campaign.updatedBy || campaign.createdBy || null));
  const result = await deliverFinanceDocumentArchive({
    archiveId: normalizedArchiveId,
    req: runtimeReq,
    channel: campaign.channel,
    recipientHandles: campaign.recipientHandles,
    includeLinkedAudience: campaign.includeLinkedAudience,
    campaignName: campaign.name,
    messageTemplateKey: campaign.messageTemplateKey,
    messageTemplateSubject: campaign.messageTemplateSubject,
    messageTemplateBody: campaign.messageTemplateBody,
    note: [normalizeText(campaign.note), `Retry: ${normalizeText(campaign.name)}`].filter(Boolean).join(' | ')
  });

  upsertCampaignTarget(campaign, { _id: normalizedArchiveId, documentNo: target.documentNo }, result);
  const runSummary = finalizeCampaignRun(campaign, {
    runtimeReq,
    mode: 'manual',
    matchedDocuments: 1,
    deliveredDocuments: result?.ok ? 1 : 0,
    failedDocuments: result?.ok ? 0 : 1,
    skippedDocuments: 0
  });
  await campaign.save();

  await logActivity({
    req: runtimeReq,
    action: 'finance_retry_delivery_target',
    targetType: 'FinanceDeliveryCampaign',
    targetId: String(campaign._id || ''),
    meta: {
      archiveId: String(normalizedArchiveId || ''),
      documentNo: normalizeText(target?.documentNo),
      channel: normalizeChannel(campaign.channel),
      result: result?.ok ? 'success' : 'failed'
    }
  });

  const saved = await populateCampaignQuery(
    FinanceDeliveryCampaign.findById(campaign._id)
  );
  return {
    ok: result?.ok === true,
    statusCode: result?.ok ? 200 : Number(result?.statusCode || 503),
    summary: runSummary,
    item: serializeFinanceDeliveryCampaign(saved),
    message: result?.message || (result?.ok ? 'retry موفق بود.' : 'retry ناموفق بود.')
  };
}

async function buildFinanceDeliveryAnalytics(filters = {}) {
  const now = new Date();
  const channel = normalizeText(filters.channel);
  const status = normalizeText(filters.status);
  const provider = normalizeText(filters.provider);
  const failureCode = normalizeText(filters.failureCode);
  const retryableFilter = normalizeOptionalBooleanFilter(filters.retryable);
  const recoveryQueue = await buildFinanceDeliveryRecoveryQueue(filters, { now });

  const campaignQuery = {};
  const archiveQuery = {};
  if (channel) {
    campaignQuery.channel = normalizeChannel(channel);
  }
  if (normalizeText(filters.documentType)) {
    campaignQuery.documentType = normalizeText(filters.documentType);
    archiveQuery.documentType = normalizeText(filters.documentType);
  }

  const [campaigns, archives] = await Promise.all([
    FinanceDeliveryCampaign.find(campaignQuery)
      .select('name status channel automationEnabled nextRunAt targets')
      .lean(),
    FinanceDocumentArchive.find(archiveQuery)
      .select('documentNo documentType subjectName batchLabel deliveryLog')
      .lean()
  ]);

  const deliveryEvents = [];
  for (const archive of archives) {
    for (const entry of Array.isArray(archive?.deliveryLog) ? archive.deliveryLog : []) {
      if (status && normalizeText(entry?.status) !== status) continue;
      if (channel && normalizeChannel(entry?.channel) !== normalizeChannel(channel)) continue;
      deliveryEvents.push({
        archiveId: String(archive?._id || ''),
        documentNo: normalizeText(archive?.documentNo),
        documentType: normalizeText(archive?.documentType),
        subjectName: normalizeText(archive?.subjectName || archive?.batchLabel),
        channel: normalizeChannel(entry?.channel),
        status: normalizeText(entry?.status),
        provider: normalizeText(entry?.provider),
        providerMessageId: normalizeText(entry?.providerMessageId),
        providerStatus: normalizeText(entry?.providerStatus),
        recipient: normalizeText(entry?.recipient),
        failureCode: normalizeText(entry?.failureCode),
        retryable: entry?.retryable === true,
        nextRetryAt: entry?.nextRetryAt || null,
        sentAt: entry?.sentAt || null
      });
    }
  }

  const filteredDeliveryEvents = deliveryEvents.filter((entry) => {
    if (provider && normalizeText(entry?.provider) !== provider) return false;
    if (failureCode && normalizeText(entry?.failureCode) !== failureCode) return false;
    if (retryableFilter !== null && (entry?.retryable === true) !== retryableFilter) return false;
    return true;
  });

  const byChannel = { email: 0, portal: 0, sms: 0, whatsapp: 0 };
  const byStatus = { sent: 0, resent: 0, delivered: 0, failed: 0 };
  const byProvider = {};
  const byFailureCode = {};
  filteredDeliveryEvents.forEach((entry) => {
    byChannel[normalizeChannel(entry.channel)] = Number(byChannel[normalizeChannel(entry.channel)] || 0) + 1;
    if (byStatus[normalizeText(entry.status)] != null) {
      byStatus[normalizeText(entry.status)] += 1;
    }
    if (entry.provider) {
      byProvider[entry.provider] = Number(byProvider[entry.provider] || 0) + 1;
    }
    if (entry.failureCode) {
      byFailureCode[entry.failureCode] = Number(byFailureCode[entry.failureCode] || 0) + 1;
    }
  });

  const retryQueue = [];
  for (const campaign of campaigns) {
    for (const target of Array.isArray(campaign?.targets) ? campaign.targets : []) {
      if (normalizeText(target?.status) !== 'failed') continue;
      if (channel && normalizeChannel(target?.channel || campaign?.channel) !== normalizeChannel(channel)) continue;
      retryQueue.push({
        campaignId: String(campaign?._id || ''),
        campaignName: normalizeText(campaign?.name),
        documentNo: normalizeText(target?.documentNo),
        archiveId: String(target?.archiveId || ''),
        channel: normalizeChannel(target?.channel || campaign?.channel),
        attempts: Number(target?.attempts || 0),
        lastAttemptAt: target?.lastAttemptAt || null,
        lastError: normalizeText(target?.lastError),
        lastFailureCode: normalizeText(target?.lastFailureCode),
        retryable: target?.retryable === true,
        nextRetryAt: target?.nextRetryAt || null,
        provider: normalizeText(target?.provider),
        providerMessageId: normalizeText(target?.providerMessageId),
        providerStatus: normalizeText(target?.providerStatus),
        recipient: normalizeText(target?.recipient),
        recipientCount: Number(target?.recipientCount || 0)
      });
    }
  }
  const filteredRetryQueue = retryQueue
    .filter((entry) => {
      if (status && normalizeText(entry?.status) !== status) return false;
      if (provider && normalizeText(entry?.provider) !== provider) return false;
      if (failureCode && normalizeText(entry?.lastFailureCode) !== failureCode) return false;
      if (retryableFilter !== null && (entry?.retryable === true) !== retryableFilter) return false;
      return true;
    })
    .sort((left, right) => new Date(right?.lastAttemptAt || 0).getTime() - new Date(left?.lastAttemptAt || 0).getTime());

  const readyToRetryCount = filteredRetryQueue.filter((entry) => (
    entry?.retryable === true && (!entry?.nextRetryAt || new Date(entry.nextRetryAt).getTime() <= now.getTime())
  )).length;
  const waitingRetryCount = filteredRetryQueue.filter((entry) => (
    entry?.retryable === true && entry?.nextRetryAt && new Date(entry.nextRetryAt).getTime() > now.getTime()
  )).length;
  const blockedRetryCount = filteredRetryQueue.filter((entry) => entry?.retryable !== true).length;
  const operationalProviderEntries = filteredRetryQueue.length
    ? filteredRetryQueue.map((entry) => normalizeText(entry?.provider)).filter(Boolean)
    : filteredDeliveryEvents.map((entry) => normalizeText(entry?.provider)).filter(Boolean);
  const operationalFailureEntries = filteredRetryQueue.length
    ? filteredRetryQueue.map((entry) => normalizeText(entry?.lastFailureCode)).filter(Boolean)
    : filteredDeliveryEvents.map((entry) => normalizeText(entry?.failureCode)).filter(Boolean);

  if (filteredRetryQueue.length) {
    Object.keys(byProvider).forEach((key) => { delete byProvider[key]; });
    Object.keys(byFailureCode).forEach((key) => { delete byFailureCode[key]; });
  }
  operationalProviderEntries.forEach((entry) => {
    byProvider[entry] = Number(byProvider[entry] || 0) + 1;
  });
  operationalFailureEntries.forEach((entry) => {
    byFailureCode[entry] = Number(byFailureCode[entry] || 0) + 1;
  });

  return {
    summary: {
      campaignsTotal: campaigns.length,
      campaignsActive: campaigns.filter((item) => normalizeText(item?.status) === 'active').length,
      campaignsPaused: campaigns.filter((item) => normalizeText(item?.status) === 'paused').length,
      automatedCampaigns: campaigns.filter((item) => item?.automationEnabled === true).length,
      dueCampaigns: campaigns.filter((item) => item?.automationEnabled === true && item?.status === 'active' && item?.nextRunAt && new Date(item.nextRunAt).getTime() <= now.getTime()).length,
      deliveriesTotal: filteredDeliveryEvents.length,
      failedQueueCount: filteredRetryQueue.length,
      recoveryQueueCount: recoveryQueue.length,
      awaitingWebhookCount: recoveryQueue.filter((item) => normalizeText(item?.recoveryState) === 'awaiting_callback').length,
      recoveryRetryableCount: recoveryQueue.filter((item) => item?.retryable === true).length,
      readyToRetryCount,
      waitingRetryCount,
      blockedRetryCount,
      byChannel,
      byStatus,
      byProvider,
      byFailureCode,
      byRecoveryState: recoveryQueue.reduce((acc, item) => {
        const key = normalizeText(item?.recoveryState);
        if (!key) return acc;
        acc[key] = Number(acc[key] || 0) + 1;
        return acc;
      }, {})
    },
    recentFailures: filteredRetryQueue.slice(0, 8)
  };
}

async function listFinanceDeliveryRetryQueue(filters = {}) {
  const limit = clampRetryLimit(filters.limit);
  const channel = normalizeText(filters.channel);
  const status = normalizeText(filters.status);
  const provider = normalizeText(filters.provider);
  const failureCode = normalizeText(filters.failureCode);
  const retryableFilter = normalizeOptionalBooleanFilter(filters.retryable);
  const campaigns = await FinanceDeliveryCampaign.find({})
    .select('name channel targets')
    .lean();

  const items = [];
  for (const campaign of campaigns) {
    for (const target of Array.isArray(campaign?.targets) ? campaign.targets : []) {
      if (normalizeText(target?.status) !== 'failed') continue;
      if (channel && normalizeChannel(target?.channel || campaign?.channel) !== normalizeChannel(channel)) continue;
      if (status && normalizeText(target?.status) !== status) continue;
      if (provider && normalizeText(target?.provider) !== provider) continue;
      if (failureCode && normalizeText(target?.lastFailureCode) !== failureCode) continue;
      if (retryableFilter !== null && (target?.retryable === true) !== retryableFilter) continue;
      items.push({
        campaignId: String(campaign?._id || ''),
        campaignName: normalizeText(campaign?.name),
        archiveId: String(target?.archiveId || ''),
        documentNo: normalizeText(target?.documentNo),
        channel: normalizeChannel(target?.channel || campaign?.channel),
        status: normalizeText(target?.status),
        recipient: normalizeText(target?.recipient),
        recipientCount: Number(target?.recipientCount || 0),
        attempts: Number(target?.attempts || 0),
        lastAttemptAt: target?.lastAttemptAt || null,
        lastError: normalizeText(target?.lastError),
        lastFailureCode: normalizeText(target?.lastFailureCode),
        retryable: target?.retryable === true,
        nextRetryAt: target?.nextRetryAt || null,
        provider: normalizeText(target?.provider),
        providerMessageId: normalizeText(target?.providerMessageId),
        providerStatus: normalizeText(target?.providerStatus)
      });
    }
  }

  return items
    .sort((left, right) => new Date(right?.lastAttemptAt || 0).getTime() - new Date(left?.lastAttemptAt || 0).getTime())
    .slice(0, limit);
}

const calculateFinanceDeliveryRecoveryAgeMinutes = (value = null, now = new Date()) => {
  if (!value) return null;
  const occurredAt = new Date(value);
  if (Number.isNaN(occurredAt.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - occurredAt.getTime()) / 60000));
};

function buildFinanceDeliveryRecoveryState({
  liveStatus = null,
  retryable = false,
  nextRetryAt = null,
  now = new Date()
} = {}) {
  const normalizedLiveStatus = liveStatus?.stage
    ? liveStatus
    : buildFinanceDeliveryLiveStatus(liveStatus || {});
  const stage = normalizeText(normalizedLiveStatus?.stage).toLowerCase();
  const ageMinutes = calculateFinanceDeliveryRecoveryAgeMinutes(normalizedLiveStatus?.occurredAt, now);
  const nextRetryTime = nextRetryAt ? new Date(nextRetryAt).getTime() : 0;
  const waitingForRetry = retryable === true && nextRetryTime && nextRetryTime > now.getTime();

  if (['queued', 'accepted', 'sent'].includes(stage)) {
    if (ageMinutes != null && ageMinutes >= FINANCE_DELIVERY_RECOVERY_GRACE_MINUTES) {
      return { key: 'awaiting_callback', ageMinutes };
    }
    return { key: '', ageMinutes };
  }
  if (stage === 'unknown') {
    if (ageMinutes != null && ageMinutes >= FINANCE_DELIVERY_RECOVERY_GRACE_MINUTES) {
      return { key: 'status_unknown', ageMinutes };
    }
    return { key: '', ageMinutes };
  }
  if (stage === 'failed') {
    return { key: waitingForRetry ? 'retry_waiting' : (retryable === true ? 'retry_ready' : 'provider_failed'), ageMinutes };
  }
  return { key: '', ageMinutes };
}

function appendFinanceDeliveryRecoveryGroup(groups, {
  messageId = '',
  provider = '',
  channel = '',
  recipient = '',
  providerStatus = '',
  deliveryStatus = '',
  failureCode = '',
  errorMessage = '',
  retryable = false,
  nextRetryAt = null,
  liveStatus = null,
  recoveryState = '',
  ageMinutes = null,
  archiveRef = null,
  campaignRef = null
} = {}) {
  const normalizedMessageId = normalizeText(messageId);
  if (!normalizedMessageId || !recoveryState) return;
  const key = normalizedMessageId;
  const current = groups.get(key) || {
    key,
    providerMessageId: normalizedMessageId,
    provider: '',
    providerStatus: '',
    deliveryStatus: '',
    channel: normalizeChannel(channel || 'email'),
    recipient: '',
    failureCode: '',
    errorMessage: '',
    retryable: false,
    nextRetryAt: null,
    liveStatus: null,
    recoveryState: '',
    ageMinutes: null,
    lastEventAt: null,
    archiveRefs: [],
    campaignRefs: []
  };

  const live = liveStatus?.stage
    ? liveStatus
    : buildFinanceDeliveryLiveStatus(liveStatus || {
      provider,
      providerStatus,
      status: deliveryStatus,
      channel,
      recipient,
      failureCode,
      errorMessage,
      retryable,
      nextRetryAt
    });
  const liveTime = live?.occurredAt ? new Date(live.occurredAt).getTime() : 0;
  const currentTime = current?.lastEventAt ? new Date(current.lastEventAt).getTime() : 0;
  const shouldReplaceSnapshot = liveTime >= currentTime;

  if (shouldReplaceSnapshot) {
    current.provider = normalizeText(provider || live?.provider || current.provider);
    current.providerStatus = normalizeText(providerStatus || live?.providerStatus || current.providerStatus);
    current.deliveryStatus = normalizeText(deliveryStatus || live?.deliveryStatus || current.deliveryStatus);
    current.channel = normalizeChannel(channel || live?.channel || current.channel || 'email');
    current.recipient = normalizeText(recipient || current.recipient);
    current.failureCode = normalizeText(failureCode || live?.failureCode || current.failureCode);
    current.errorMessage = normalizeText(errorMessage || live?.errorMessage || current.errorMessage);
    current.retryable = retryable === true;
    current.nextRetryAt = nextRetryAt || live?.nextRetryAt || null;
    current.liveStatus = live;
    current.recoveryState = recoveryState;
    current.ageMinutes = ageMinutes;
    current.lastEventAt = live?.occurredAt || current.lastEventAt;
  } else {
    current.provider = current.provider || normalizeText(provider || live?.provider);
    current.recipient = current.recipient || normalizeText(recipient);
    current.failureCode = current.failureCode || normalizeText(failureCode || live?.failureCode);
    current.errorMessage = current.errorMessage || normalizeText(errorMessage || live?.errorMessage);
    current.retryable = current.retryable || retryable === true;
    current.nextRetryAt = current.nextRetryAt || nextRetryAt || live?.nextRetryAt || null;
  }

  if (archiveRef?.archiveId && !current.archiveRefs.some((item) => String(item.archiveId || '') === String(archiveRef.archiveId || ''))) {
    current.archiveRefs.push(archiveRef);
  }
  if (campaignRef?.campaignId && !current.campaignRefs.some((item) => (
    String(item.campaignId || '') === String(campaignRef.campaignId || '')
    && String(item.archiveId || '') === String(campaignRef.archiveId || '')
  ))) {
    current.campaignRefs.push(campaignRef);
  }

  groups.set(key, current);
}

async function buildFinanceDeliveryRecoveryQueue(filters = {}, { now = new Date() } = {}) {
  const channel = normalizeText(filters.channel);
  const status = normalizeText(filters.status);
  const provider = normalizeText(filters.provider);
  const failureCode = normalizeText(filters.failureCode);
  const retryableFilter = normalizeOptionalBooleanFilter(filters.retryable);
  const recoveryStateFilter = normalizeRecoveryStateFilter(filters.recoveryState);

  const [campaigns, archives] = await Promise.all([
    FinanceDeliveryCampaign.find({})
      .select('name channel targets')
      .lean(),
    FinanceDocumentArchive.find({})
      .select('documentNo subjectName deliveryLog lastDeliveryStatus')
      .lean()
  ]);

  const groups = new Map();

  for (const archive of archives) {
    for (const entry of Array.isArray(archive?.deliveryLog) ? archive.deliveryLog : []) {
      const liveStatus = buildFinanceDeliveryLiveStatus(entry);
      const providerMessageId = normalizeText(liveStatus?.providerMessageId);
      if (!providerMessageId) continue;
      const state = buildFinanceDeliveryRecoveryState({
        liveStatus,
        retryable: entry?.retryable === true,
        nextRetryAt: entry?.nextRetryAt || null,
        now
      });
      if (!state.key) continue;
      appendFinanceDeliveryRecoveryGroup(groups, {
        messageId: providerMessageId,
        provider: normalizeText(entry?.provider),
        channel: normalizeChannel(entry?.channel || 'email'),
        recipient: normalizeText(entry?.recipient),
        providerStatus: normalizeText(entry?.providerStatus),
        deliveryStatus: normalizeText(entry?.status),
        failureCode: normalizeText(entry?.failureCode),
        errorMessage: normalizeText(entry?.errorMessage),
        retryable: entry?.retryable === true,
        nextRetryAt: entry?.nextRetryAt || null,
        liveStatus,
        recoveryState: state.key,
        ageMinutes: state.ageMinutes,
        archiveRef: {
          archiveId: String(archive?._id || ''),
          documentNo: normalizeText(archive?.documentNo),
          subjectName: normalizeText(archive?.subjectName),
          status: normalizeText(entry?.status || archive?.lastDeliveryStatus)
        }
      });
    }
  }

  for (const campaign of campaigns) {
    for (const target of Array.isArray(campaign?.targets) ? campaign.targets : []) {
      const liveStatus = buildFinanceDeliveryLiveStatus({
        ...target,
        failureCode: target?.lastFailureCode,
        errorMessage: target?.lastError
      });
      const providerMessageId = normalizeText(liveStatus?.providerMessageId);
      if (!providerMessageId) continue;
      const state = buildFinanceDeliveryRecoveryState({
        liveStatus,
        retryable: target?.retryable === true,
        nextRetryAt: target?.nextRetryAt || null,
        now
      });
      if (!state.key) continue;
      appendFinanceDeliveryRecoveryGroup(groups, {
        messageId: providerMessageId,
        provider: normalizeText(target?.provider),
        channel: normalizeChannel(target?.channel || campaign?.channel || 'email'),
        recipient: normalizeText(target?.recipient),
        providerStatus: normalizeText(target?.providerStatus),
        deliveryStatus: normalizeText(target?.status),
        failureCode: normalizeText(target?.lastFailureCode),
        errorMessage: normalizeText(target?.lastError),
        retryable: target?.retryable === true,
        nextRetryAt: target?.nextRetryAt || null,
        liveStatus,
        recoveryState: state.key,
        ageMinutes: state.ageMinutes,
        campaignRef: {
          campaignId: String(campaign?._id || ''),
          campaignName: normalizeText(campaign?.name),
          archiveId: String(target?.archiveId || ''),
          documentNo: normalizeText(target?.documentNo),
          status: normalizeText(target?.status)
        }
      });
    }
  }

  return Array.from(groups.values())
    .map((item) => ({
      ...item,
      documentNos: Array.from(new Set([
        ...item.archiveRefs.map((ref) => normalizeText(ref?.documentNo)),
        ...item.campaignRefs.map((ref) => normalizeText(ref?.documentNo))
      ].filter(Boolean))),
      campaignNames: Array.from(new Set(
        item.campaignRefs.map((ref) => normalizeText(ref?.campaignName)).filter(Boolean)
      )),
      archiveCount: item.archiveRefs.length,
      campaignCount: item.campaignRefs.length,
      replayRecommendedStatus: ['awaiting_callback', 'retry_ready', 'retry_waiting', 'status_unknown'].includes(normalizeText(item?.recoveryState))
        ? 'delivered'
        : 'failed'
    }))
    .filter((item) => {
      if (channel && normalizeChannel(item?.channel) !== normalizeChannel(channel)) return false;
      if (status && normalizeText(item?.deliveryStatus) !== status) return false;
      if (provider && normalizeText(item?.provider) !== provider) return false;
      if (failureCode && normalizeText(item?.failureCode) !== failureCode) return false;
      if (retryableFilter !== null && (item?.retryable === true) !== retryableFilter) return false;
      if (recoveryStateFilter && normalizeText(item?.recoveryState) !== recoveryStateFilter) return false;
      return true;
    })
    .sort((left, right) => new Date(right?.lastEventAt || 0).getTime() - new Date(left?.lastEventAt || 0).getTime());
}

async function listFinanceDeliveryRecoveryQueue(filters = {}) {
  const limit = clampRecoveryLimit(filters.limit);
  const items = await buildFinanceDeliveryRecoveryQueue(filters);
  return items.slice(0, limit);
}

async function replayFinanceDeliveryProviderStatus(payload = {}, req = null) {
  const normalizedProviderStatus = normalizeText(payload?.providerStatus || payload?.status || '');
  if (!normalizedProviderStatus) {
    const error = new Error('provider status is required.');
    error.statusCode = 400;
    throw error;
  }

  const result = await syncFinanceDeliveryProviderStatus({
    provider: payload?.provider || '',
    providerMessageId: payload?.providerMessageId || payload?.messageId || '',
    providerStatus: normalizedProviderStatus,
    failureCode: payload?.failureCode || '',
    errorMessage: payload?.errorMessage || payload?.message || '',
    statusCode: payload?.statusCode || 0,
    occurredAt: payload?.occurredAt || new Date(),
    recipient: payload?.recipient || '',
    req
  });

  if (!Number(result?.matchedArchive || 0) && !Number(result?.matchedCampaigns || 0)) {
    const error = new Error('هیچ delivery با این provider message id برای replay پیدا نشد.');
    error.statusCode = 404;
    throw error;
  }

  return {
    ...result,
    replayed: true,
    replayedAt: new Date().toISOString()
  };
}

async function runDueFinanceDeliveryCampaigns(app, { force = false } = {}) {
  if (!FINANCE_DELIVERY_AUTOMATION_ENABLED && !force) {
    return { ok: true, skipped: true, reason: 'finance_delivery_automation_disabled' };
  }
  if (automationRunning) {
    return { ok: true, skipped: true, reason: 'already_running' };
  }

  automationRunning = true;
  try {
    const now = new Date();
    const runtimeReq = createSystemReq(app);
    const dueCampaigns = await FinanceDeliveryCampaign.find({
      status: 'active',
      automationEnabled: true,
      nextRunAt: { $ne: null, $lte: now }
    }).select('_id').lean();

    let executed = 0;
    let deliveredDocuments = 0;
    let failedDocuments = 0;
    for (const campaign of dueCampaigns) {
      const result = await runFinanceDeliveryCampaign({
        campaignId: campaign._id,
        req: runtimeReq,
        app,
        mode: 'automation',
        allowPaused: false
      });
      if (result?.skipped) continue;
      executed += 1;
      deliveredDocuments += Number(result?.summary?.deliveredDocuments || 0);
      failedDocuments += Number(result?.summary?.failedDocuments || 0);
    }

    await logActivity({
      req: runtimeReq,
      action: 'finance_run_delivery_campaign_queue',
      targetType: 'FinanceDeliveryCampaign',
      targetId: '',
      meta: {
        executed,
        deliveredDocuments,
        failedDocuments,
        automated: !force
      }
    });

    return {
      ok: true,
      skipped: false,
      runsAt: now.toISOString(),
      executed,
      deliveredDocuments,
      failedDocuments
    };
  } finally {
    automationRunning = false;
  }
}

function startFinanceDeliveryCampaignAutomation(app) {
  if (!FINANCE_DELIVERY_AUTOMATION_ENABLED) {
    return { enabled: false, intervalMinutes: FINANCE_DELIVERY_INTERVAL_MINUTES };
  }

  const intervalMs = FINANCE_DELIVERY_INTERVAL_MINUTES * 60 * 1000;
  const timer = setInterval(() => {
    runDueFinanceDeliveryCampaigns(app).catch(() => {});
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  runDueFinanceDeliveryCampaigns(app).catch(() => {});

  return {
    enabled: true,
    intervalMinutes: FINANCE_DELIVERY_INTERVAL_MINUTES,
    stop: () => clearInterval(timer)
  };
}

module.exports = {
  FINANCE_DELIVERY_INTERVAL_MINUTES,
  buildFinanceDeliveryAnalytics,
  buildFinanceDeliveryMessage,
  approveFinanceDeliveryTemplateVersion,
  archiveFinanceDeliveryTemplateVersion,
  createFinanceDeliveryCampaign,
  deliverFinanceDocumentArchive,
  ingestFinanceDeliveryProviderWebhook,
  listFinanceDeliveryCampaigns,
  listFinanceDeliveryProviderConfigs,
  listFinanceDeliveryProviderWebhookTokens,
  listFinanceDeliveryRecoveryQueue,
  listFinanceDeliveryTemplates,
  listFinanceDeliveryTemplateVariables,
  listFinanceDeliveryRetryQueue,
  normalizeFinanceDeliveryEmails,
  normalizeFinanceDeliveryHandles,
  normalizeFinanceDeliveryPhones,
  publishFinanceDeliveryTemplateVersion,
  previewFinanceDeliveryTemplate,
  rejectFinanceDeliveryTemplateVersion,
  requestFinanceDeliveryTemplateReview,
  replayFinanceDeliveryProviderStatus,
  rollbackFinanceDeliveryTemplateVersion,
  rotateFinanceDeliveryProviderCredentials,
  retryFinanceDeliveryTarget,
  runDueFinanceDeliveryCampaigns,
  runFinanceDeliveryCampaign,
  saveFinanceDeliveryProviderConfig,
  saveFinanceDeliveryTemplateDraft,
  serializeFinanceDeliveryCampaign,
  setFinanceDeliveryCampaignStatus,
  syncFinanceDeliveryProviderStatus,
  startFinanceDeliveryCampaignAutomation
};
