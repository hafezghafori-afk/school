const SYSTEM_MESSAGE_PLACEHOLDER_FRAGMENTS = Object.freeze([
  'پیام سیستم به فارسی دری نمایش داده شد',
  'برای جزئیات با مدیریت سیستم تماس بگیرید'
]);

function findUnsafeStudentInput(value, path = '') {
  if (typeof value === 'string') {
    const matched = SYSTEM_MESSAGE_PLACEHOLDER_FRAGMENTS.find((fragment) => value.includes(fragment));
    return matched ? { path, fragment: matched } : null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = findUnsafeStudentInput(value[index], `${path}[${index}]`);
      if (match) return match;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    const match = findUnsafeStudentInput(child, childPath);
    if (match) return match;
  }
  return null;
}

function assertSafeStudentInput(payload = {}) {
  const match = findUnsafeStudentInput(payload);
  if (!match) return;
  const error = new Error('student_profile_system_message_placeholder_rejected');
  error.code = 'student_profile_system_message_placeholder_rejected';
  error.status = 400;
  error.field = match.path;
  throw error;
}

module.exports = {
  assertSafeStudentInput,
  findUnsafeStudentInput,
  SYSTEM_MESSAGE_PLACEHOLDER_FRAGMENTS
};
