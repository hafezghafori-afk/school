function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeFinanceDeliveryLiveStage({
  providerStatus = '',
  status = '',
  failureCode = '',
  errorMessage = ''
} = {}) {
  const normalizedProviderStatus = normalizeText(providerStatus).toLowerCase();
  const normalizedStatus = normalizeText(status).toLowerCase();
  const normalizedFailureCode = normalizeText(failureCode).toLowerCase();
  const normalizedError = normalizeText(errorMessage).toLowerCase();

  if (['read', 'seen'].includes(normalizedProviderStatus)) return 'read';
  if (['delivered', 'delivery_confirmed', 'completed', 'complete'].includes(normalizedProviderStatus)) return 'delivered';
  if ([
    'failed',
    'undelivered',
    'rejected',
    'expired',
    'cancelled',
    'canceled',
    'error',
    'timeout',
    'bounced'
  ].includes(normalizedProviderStatus)) return 'failed';
  if (['accepted', 'submitted', 'received'].includes(normalizedProviderStatus)) return 'accepted';
  if (['queued', 'pending', 'scheduled'].includes(normalizedProviderStatus)) return 'queued';
  if (['sent', 'dispatched', 'dispatching', 'in_transit'].includes(normalizedProviderStatus)) return 'sent';

  if (normalizedStatus === 'delivered') return 'delivered';
  if (normalizedStatus === 'failed') return 'failed';
  if (['sent', 'resent'].includes(normalizedStatus)) return 'sent';
  if (normalizedStatus === 'skipped') return 'skipped';

  if (normalizedFailureCode || normalizedError) return 'failed';
  return normalizedProviderStatus || normalizedStatus || 'unknown';
}

function buildFinanceDeliveryLiveStatus(payload = {}) {
  const stage = normalizeFinanceDeliveryLiveStage(payload);
  const occurredAt = payload?.lastDeliveredAt
    || payload?.lastAttemptAt
    || payload?.sentAt
    || payload?.occurredAt
    || null;
  return {
    stage,
    providerStatus: normalizeText(payload?.providerStatus),
    deliveryStatus: normalizeText(payload?.status),
    provider: normalizeText(payload?.provider),
    providerMessageId: normalizeText(payload?.providerMessageId),
    channel: normalizeText(payload?.channel),
    failureCode: normalizeText(payload?.failureCode || payload?.lastFailureCode),
    errorMessage: normalizeText(payload?.errorMessage || payload?.lastError),
    retryable: payload?.retryable === true,
    nextRetryAt: payload?.nextRetryAt || null,
    occurredAt,
    terminal: ['delivered', 'read', 'failed', 'skipped'].includes(stage)
  };
}

function buildFinanceDeliveryLiveSummary(items = []) {
  const liveItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!item) return null;
      return item?.stage ? {
        ...item,
        stage: normalizeText(item.stage).toLowerCase(),
        occurredAt: item?.occurredAt || null
      } : buildFinanceDeliveryLiveStatus(item);
    })
    .filter(Boolean);

  const counts = liveItems.reduce((acc, item) => {
    const key = normalizeText(item?.stage).toLowerCase();
    if (!key) return acc;
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});

  let latest = null;
  liveItems.forEach((item) => {
    if (!latest) {
      latest = item;
      return;
    }
    const itemTime = item?.occurredAt ? new Date(item.occurredAt).getTime() : 0;
    const latestTime = latest?.occurredAt ? new Date(latest.occurredAt).getTime() : 0;
    if (itemTime >= latestTime) latest = item;
  });

  return {
    total: liveItems.length,
    counts,
    latest,
    inFlight: Number(counts.queued || 0) + Number(counts.accepted || 0) + Number(counts.sent || 0),
    successful: Number(counts.delivered || 0) + Number(counts.read || 0),
    failed: Number(counts.failed || 0),
    read: Number(counts.read || 0)
  };
}

module.exports = {
  buildFinanceDeliveryLiveStatus,
  buildFinanceDeliveryLiveSummary,
  normalizeFinanceDeliveryLiveStage
};
