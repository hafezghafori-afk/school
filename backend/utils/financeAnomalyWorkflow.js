const FINANCE_ANOMALY_WORKFLOW_STATUSES = ['open', 'assigned', 'snoozed', 'resolved'];
const FINANCE_ANOMALY_HISTORY_ACTIONS = ['created', 'assigned', 'noted', 'snoozed', 'resolved', 'reopened'];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableId(value) {
  if (!value) return '';
  return String(value);
}

function roundMoney(value) {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeFinanceAnomalyWorkflowStatus(value = '', fallback = 'open') {
  const normalized = normalizeText(value).toLowerCase();
  return FINANCE_ANOMALY_WORKFLOW_STATUSES.includes(normalized) ? normalized : fallback;
}

function normalizeFinanceAnomalyHistoryAction(value = '', fallback = 'noted') {
  const normalized = normalizeText(value).toLowerCase();
  return FINANCE_ANOMALY_HISTORY_ACTIONS.includes(normalized) ? normalized : fallback;
}

function getFinanceAnomalyTarget(item = {}) {
  if (normalizeNullableId(item?.orderId)) {
    return { targetType: 'FeeOrder', targetId: normalizeNullableId(item.orderId) };
  }
  if (normalizeNullableId(item?.paymentId)) {
    return { targetType: 'FeePayment', targetId: normalizeNullableId(item.paymentId) };
  }
  if (normalizeNullableId(item?.reliefId)) {
    return { targetType: 'FinanceRelief', targetId: normalizeNullableId(item.reliefId) };
  }
  if (normalizeNullableId(item?.membershipId)) {
    return { targetType: 'StudentMembership', targetId: normalizeNullableId(item.membershipId) };
  }
  return { targetType: '', targetId: '' };
}

function buildFinanceAnomalyCaseSnapshot(item = {}) {
  const { targetType, targetId } = getFinanceAnomalyTarget(item);
  return {
    anomalyId: normalizeText(item?.id),
    anomalyType: normalizeText(item?.anomalyType) || 'finance_signal',
    title: normalizeText(item?.title) || 'ناهنجاری مالی',
    description: normalizeText(item?.description),
    severity: normalizeText(item?.severity) || 'info',
    signalActionRequired: item?.rawActionRequired === true || item?.actionRequired === true,
    studentMembershipId: normalizeNullableId(item?.membershipId),
    studentUserId: normalizeNullableId(item?.studentUserId),
    studentName: normalizeText(item?.studentName),
    classId: normalizeNullableId(item?.classId),
    classTitle: normalizeText(item?.classTitle),
    academicYearId: normalizeNullableId(item?.academicYearId),
    academicYearTitle: normalizeText(item?.academicYearTitle),
    targetType,
    targetId,
    referenceNumber: normalizeText(item?.referenceNumber),
    secondaryReference: normalizeText(item?.secondaryReference),
    amount: roundMoney(item?.amount),
    amountLabel: normalizeText(item?.amountLabel),
    status: normalizeText(item?.status),
    dueDate: item?.dueDate || null,
    at: item?.at || null,
    currentSnapshot: {
      id: normalizeText(item?.id),
      anomalyType: normalizeText(item?.anomalyType),
      title: normalizeText(item?.title),
      description: normalizeText(item?.description),
      severity: normalizeText(item?.severity),
      studentMembershipId: normalizeNullableId(item?.membershipId),
      studentUserId: normalizeNullableId(item?.studentUserId),
      studentName: normalizeText(item?.studentName),
      classId: normalizeNullableId(item?.classId),
      classTitle: normalizeText(item?.classTitle),
      academicYearId: normalizeNullableId(item?.academicYearId),
      academicYearTitle: normalizeText(item?.academicYearTitle),
      referenceNumber: normalizeText(item?.referenceNumber),
      secondaryReference: normalizeText(item?.secondaryReference),
      amount: roundMoney(item?.amount),
      amountLabel: normalizeText(item?.amountLabel),
      status: normalizeText(item?.status),
      dueDate: item?.dueDate || null,
      at: item?.at || null,
      orderId: normalizeNullableId(item?.orderId),
      paymentId: normalizeNullableId(item?.paymentId),
      reliefId: normalizeNullableId(item?.reliefId),
      tags: Array.isArray(item?.tags) ? item.tags.map((entry) => normalizeText(entry)).filter(Boolean) : []
    }
  };
}

function resolveFinanceAnomalyWorkflowStatus(caseItem = null, asOf = new Date()) {
  const fallbackStatus = normalizeFinanceAnomalyWorkflowStatus(caseItem?.status, 'open');
  if (fallbackStatus !== 'snoozed') return fallbackStatus;
  const until = toDate(caseItem?.snoozedUntil);
  const now = toDate(asOf) || new Date();
  if (!until || until.getTime() < now.getTime()) return 'open';
  return 'snoozed';
}

function normalizeFinanceAnomalyHistory(history = []) {
  return [...(Array.isArray(history) ? history : [])]
    .map((entry) => ({
      action: normalizeFinanceAnomalyHistoryAction(entry?.action, 'noted'),
      status: normalizeFinanceAnomalyWorkflowStatus(entry?.status, 'open'),
      note: normalizeText(entry?.note),
      at: entry?.at || null,
      assignedLevel: normalizeText(entry?.assignedLevel),
      snoozedUntil: entry?.snoozedUntil || null,
      by: entry?.by || null,
      byName: normalizeText(entry?.by?.fullName || entry?.by?.name || entry?.by?.email || '')
    }))
    .sort((left, right) => {
      const leftAt = toDate(left?.at)?.getTime() || 0;
      const rightAt = toDate(right?.at)?.getTime() || 0;
      return rightAt - leftAt;
    });
}

function mergeFinanceAnomalyCases(items = [], cases = [], { asOf = new Date() } = {}) {
  const caseMap = new Map(
    (Array.isArray(cases) ? cases : [])
      .filter((item) => normalizeText(item?.anomalyId))
      .map((item) => [normalizeText(item.anomalyId), item])
  );

  return (Array.isArray(items) ? items : []).map((item) => {
    const anomalyCase = caseMap.get(normalizeText(item?.id)) || null;
    const workflowStatus = resolveFinanceAnomalyWorkflowStatus(anomalyCase, asOf);
    const history = normalizeFinanceAnomalyHistory(anomalyCase?.history);
    const latestHistory = history[0] || null;
    const assignedToName = normalizeText(
      anomalyCase?.assignedTo?.fullName
      || anomalyCase?.assignedTo?.name
      || anomalyCase?.assignedTo?.email
      || ''
    );
    const resolvedByName = normalizeText(
      anomalyCase?.resolvedBy?.fullName
      || anomalyCase?.resolvedBy?.name
      || anomalyCase?.resolvedBy?.email
      || ''
    );
    const latestActionByName = normalizeText(
      anomalyCase?.latestActionBy?.fullName
      || anomalyCase?.latestActionBy?.name
      || anomalyCase?.latestActionBy?.email
      || latestHistory?.byName
      || ''
    );
    const actionable = item?.actionRequired === true && !['resolved', 'snoozed'].includes(workflowStatus);

    return {
      ...item,
      rawActionRequired: item?.rawActionRequired === true || item?.actionRequired === true,
      actionRequired: actionable,
      workflowStatus,
      workflowAssignedLevel: normalizeText(anomalyCase?.assignedLevel),
      workflowAssignedToName: assignedToName,
      workflowSnoozedUntil: anomalyCase?.snoozedUntil || null,
      workflowResolvedAt: anomalyCase?.resolvedAt || null,
      workflowResolvedByName: resolvedByName,
      workflowResolutionNote: normalizeText(anomalyCase?.resolutionNote),
      workflowLatestNote: normalizeText(anomalyCase?.latestNote || latestHistory?.note),
      workflowLastActionAt: anomalyCase?.latestActionAt || latestHistory?.at || null,
      workflowLastActionByName: latestActionByName,
      workflowHistory: history,
      workflow: {
        id: normalizeNullableId(anomalyCase?._id),
        status: workflowStatus,
        assignedLevel: normalizeText(anomalyCase?.assignedLevel),
        assignedToName,
        snoozedUntil: anomalyCase?.snoozedUntil || null,
        resolvedAt: anomalyCase?.resolvedAt || null,
        resolvedByName,
        resolutionNote: normalizeText(anomalyCase?.resolutionNote),
        latestNote: normalizeText(anomalyCase?.latestNote || latestHistory?.note),
        lastActionAt: anomalyCase?.latestActionAt || latestHistory?.at || null,
        lastActionByName: latestActionByName,
        history
      }
    };
  });
}

function buildFinanceAnomalyWorkflowSummary(items = []) {
  const rows = Array.isArray(items) ? items : [];
  const summary = {
    open: 0,
    assigned: 0,
    snoozed: 0,
    resolved: 0,
    unresolved: 0,
    actionRequired: 0
  };

  rows.forEach((item) => {
    const status = normalizeFinanceAnomalyWorkflowStatus(item?.workflowStatus || item?.workflow?.status, 'open');
    summary[status] += 1;
    if (status !== 'resolved') summary.unresolved += 1;
    if (item?.actionRequired) summary.actionRequired += 1;
  });

  return summary;
}

module.exports = {
  FINANCE_ANOMALY_WORKFLOW_STATUSES,
  FINANCE_ANOMALY_HISTORY_ACTIONS,
  normalizeFinanceAnomalyWorkflowStatus,
  normalizeFinanceAnomalyHistoryAction,
  resolveFinanceAnomalyWorkflowStatus,
  buildFinanceAnomalyCaseSnapshot,
  mergeFinanceAnomalyCases,
  buildFinanceAnomalyWorkflowSummary
};
