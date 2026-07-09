const assert = require('assert');
const { applyDemoSchoolScope } = require('../middleware/auth');

const demoSchoolId = '507f1f77bcf86cd799439011';
const originalSchoolId = '507f191e810c19729de860ea';
const demoRequest = {
  headers: { 'x-school-id': originalSchoolId },
  query: {},
  params: { schoolId: originalSchoolId },
  body: { schoolId: originalSchoolId }
};

applyDemoSchoolScope(demoRequest, { isDemo: true, schoolId: demoSchoolId });
assert.equal(demoRequest.headers['x-school-id'], demoSchoolId);
assert.equal(demoRequest.query.schoolId, demoSchoolId);
assert.equal(demoRequest.params.schoolId, demoSchoolId);
assert.equal(demoRequest.body.schoolId, demoSchoolId);

const regularRequest = {
  headers: { 'x-school-id': originalSchoolId },
  query: {},
  params: { schoolId: originalSchoolId },
  body: { schoolId: originalSchoolId }
};
applyDemoSchoolScope(regularRequest, { isDemo: false, schoolId: demoSchoolId });
assert.equal(regularRequest.headers['x-school-id'], originalSchoolId);
assert.equal(regularRequest.query.schoolId, undefined);
assert.equal(regularRequest.params.schoolId, originalSchoolId);
assert.equal(regularRequest.body.schoolId, originalSchoolId);

console.log('check:demo-school-isolation PASS');
