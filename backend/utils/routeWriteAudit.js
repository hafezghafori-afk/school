const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function normalizeActionPrefix(value = '') {
  return String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'route';
}

function extractBodyTargetId(body = null) {
  const candidates = [
    body?.item?._id,
    body?.item?.id,
    body?.module?._id,
    body?.module?.id,
    body?.lesson?._id,
    body?.lesson?.id,
    body?.threadId,
    body?.receiptId,
    body?._id,
    body?.id
  ];

  for (const value of candidates) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }

  return '';
}

function extractRequestTargetId(req = {}, body = null) {
  const paramCandidates = [
    req?.params?.id,
    req?.params?._id,
    req?.params?.academicYearId,
    req?.params?.academicTermId,
    req?.params?.ruleId,
    req?.params?.studentId,
    req?.params?.teacherId,
    req?.params?.schoolId,
    req?.params?.entryId,
    req?.params?.configId,
    req?.params?.configurationId,
    req?.params?.lessonId,
    req?.params?.moduleId,
    req?.params?.resultId,
    req?.params?.assignmentId,
    req?.params?.availabilityId,
    req?.params?.shiftId,
    req?.params?.weekConfigId
  ];

  for (const value of paramCandidates) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }

  return extractBodyTargetId(body);
}

function sampleKeys(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).slice(0, 12);
}

function attachWriteActivityAudit(router, { targetType = '', actionPrefix = '', audit } = {}) {
  if (!router || typeof router.use !== 'function' || typeof audit !== 'function') return router;

  router.use((req, res, next) => {
    const method = String(req?.method || '').toUpperCase();
    if (!WRITE_METHODS.has(method)) {
      return next();
    }

    const originalJson = res.json.bind(res);
    let logged = false;

    res.json = function patchedJson(body) {
      if (!logged && res.statusCode < 400 && body?.success !== false) {
        logged = true;
        const normalizedPrefix = normalizeActionPrefix(actionPrefix || targetType || req.baseUrl || 'route');
        void audit({
          req,
          action: `${normalizedPrefix}_${method.toLowerCase()}`,
          targetType: targetType || normalizedPrefix,
          targetId: extractRequestTargetId(req, body),
          meta: {
            routePattern: String(req?.route?.path || ''),
            statusCode: Number(res.statusCode || 200),
            paramKeys: sampleKeys(req?.params),
            queryKeys: sampleKeys(req?.query),
            responseKeys: sampleKeys(body)
          }
        });
      }

      return originalJson(body);
    };

    return next();
  });

  return router;
}

module.exports = {
  attachWriteActivityAudit
};
