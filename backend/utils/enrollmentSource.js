const ENROLLMENT_SOURCES = Object.freeze({
  ONLINE: 'online',
  MANUAL: 'manual'
});

const normalizeText = (value) => String(value || '').trim();

function inferEnrollmentSource(enrollment = {}) {
  const explicitSource = normalizeText(enrollment.registrationSource).toLowerCase();
  if (Object.values(ENROLLMENT_SOURCES).includes(explicitSource)) return explicitSource;

  const registrationId = normalizeText(enrollment.registrationId);
  const notes = normalizeText(enrollment.notes);
  if (
    /^MANUAL-/i.test(registrationId)
    || /ثبت مستقیم از صفحه ثبت شاگرد جدید|ساخته\/وصل شده از ثبت تدریسی/.test(notes)
  ) {
    return ENROLLMENT_SOURCES.MANUAL;
  }

  // Public registration always receives a generated, non-MANUAL registration ID.
  if (registrationId) return ENROLLMENT_SOURCES.ONLINE;

  // Legacy mirrored rows created from the administrative student form are linked
  // directly to the canonical AfghanStudent but often have no registration ID.
  if (enrollment.linkedStudentId) return ENROLLMENT_SOURCES.MANUAL;

  return ENROLLMENT_SOURCES.ONLINE;
}

module.exports = {
  ENROLLMENT_SOURCES,
  inferEnrollmentSource
};
