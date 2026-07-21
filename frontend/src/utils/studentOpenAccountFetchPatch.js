const accountByMembership = new Map();

const normalizeId = (value) => String(value || '').trim();
const getRequestUrl = (input) => typeof input === 'string' ? input : String(input?.url || '');

const storeAccount = (payload = {}) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const membershipIds = new Set([
    normalizeId(payload?.membership?.id),
    ...(Array.isArray(payload?.memberships) ? payload.memberships.map((item) => normalizeId(item?.id)) : []),
    ...items.map((item) => normalizeId(item?.studentMembershipId))
  ].filter(Boolean));
  const account = { items, summary: payload?.summary || {} };
  membershipIds.forEach((membershipId) => accountByMembership.set(membershipId, account));
};

const chooseOldestMembership = (body = {}) => {
  const membershipId = normalizeId(body?.studentMembershipId);
  const account = accountByMembership.get(membershipId);
  if (!account?.items?.length) return body;

  const oldest = account.items.find((item) => Number(item?.outstandingAmount || 0) > 0);
  const oldestMembershipId = normalizeId(oldest?.studentMembershipId);
  if (!oldestMembershipId || oldestMembershipId === membershipId) return body;

  const scopedOrderIds = account.items
    .filter((item) => normalizeId(item?.studentMembershipId) === oldestMembershipId && Number(item?.outstandingAmount || 0) > 0)
    .map((item) => normalizeId(item?.id))
    .filter(Boolean);

  return {
    ...body,
    studentMembershipId: oldestMembershipId,
    allocationMode: 'auto_selected',
    selectedFeeOrderIds: scopedOrderIds,
    feeOrderId: undefined,
    allocations: undefined
  };
};

if (typeof window !== 'undefined' && !window.__studentOpenAccountFetchPatched) {
  window.__studentOpenAccountFetchPatched = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = getRequestUrl(input);
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    let nextInit = init;

    if (
      method === 'POST'
      && (/\/api\/student-finance\/payments(?:\/preview-allocation)?(?:\?|$)/.test(url))
      && typeof init?.body === 'string'
      && String(init?.headers?.['Content-Type'] || init?.headers?.['content-type'] || '').includes('application/json')
    ) {
      try {
        const parsed = JSON.parse(init.body);
        const adjusted = chooseOldestMembership(parsed);
        nextInit = { ...init, body: JSON.stringify(adjusted) };
      } catch {
        // Keep the original request when the body is not valid JSON.
      }
    }

    const response = await originalFetch(input, nextInit);

    if (method === 'GET' && /\/api\/student-finance\/memberships\/[^/]+\/open-orders(?:\?|$)/.test(url)) {
      try {
        const payload = await response.clone().json();
        if (payload?.success) storeAccount(payload);
      } catch {
        // The finance page will handle the original response normally.
      }
    }

    return response;
  };
}
