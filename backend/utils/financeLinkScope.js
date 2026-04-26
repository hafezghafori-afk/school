const LINK_SCOPES = Object.freeze({
  MEMBERSHIP: 'membership',
  STUDENT: 'student'
});

function normalizeLinkScope(value = '', fallback = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === LINK_SCOPES.MEMBERSHIP || normalized === LINK_SCOPES.STUDENT) {
    return normalized;
  }
  return fallback ? normalizeLinkScope(fallback, '') : '';
}

function deriveLinkScope({ linkScope = '', studentMembershipId = null, classId = null } = {}) {
  if (studentMembershipId || classId) {
    return LINK_SCOPES.MEMBERSHIP;
  }
  return normalizeLinkScope(linkScope, LINK_SCOPES.STUDENT) || LINK_SCOPES.STUDENT;
}

function isMembershipLinkScope(value = '') {
  return normalizeLinkScope(value) === LINK_SCOPES.MEMBERSHIP;
}

function isStudentLinkScope(value = '') {
  return normalizeLinkScope(value) === LINK_SCOPES.STUDENT;
}

module.exports = {
  LINK_SCOPES,
  deriveLinkScope,
  isMembershipLinkScope,
  isStudentLinkScope,
  normalizeLinkScope
};
