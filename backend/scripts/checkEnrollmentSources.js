const assert = require('assert');
const { ENROLLMENT_SOURCES, inferEnrollmentSource } = require('../utils/enrollmentSource');

assert.strictEqual(inferEnrollmentSource({ registrationSource: 'online' }), ENROLLMENT_SOURCES.ONLINE);
assert.strictEqual(inferEnrollmentSource({ registrationSource: 'manual' }), ENROLLMENT_SOURCES.MANUAL);
assert.strictEqual(inferEnrollmentSource({ registrationId: 'MANUAL-1405-0019' }), ENROLLMENT_SOURCES.MANUAL);
assert.strictEqual(
  inferEnrollmentSource({ notes: 'ثبت مستقیم از صفحه ثبت شاگرد جدید' }),
  ENROLLMENT_SOURCES.MANUAL
);
assert.strictEqual(inferEnrollmentSource({ registrationId: 'REG-1405-0001' }), ENROLLMENT_SOURCES.ONLINE);
assert.strictEqual(inferEnrollmentSource({ registrationId: 'CUSTOM-ONLINE-1' }), ENROLLMENT_SOURCES.ONLINE);
assert.strictEqual(inferEnrollmentSource({ linkedStudentId: 'legacy-student-id' }), ENROLLMENT_SOURCES.MANUAL);
assert.strictEqual(inferEnrollmentSource({ status: 'pending' }), ENROLLMENT_SOURCES.ONLINE);

console.log('Enrollment source checks passed.');
