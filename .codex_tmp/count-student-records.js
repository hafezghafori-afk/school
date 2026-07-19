const mongoose = require('../backend/node_modules/mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');
  const db = mongoose.connection.db;

  const count = (collection, query = {}) => db.collection(collection).countDocuments(query);
  const groupByStatus = (collection) => db.collection(collection)
    .aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])
    .toArray();

  const result = {
    enrollments: await count('enrollments'),
    enrollmentsLinkedStudent: await count('enrollments', { linkedStudentId: { $exists: true, $ne: null } }),
    enrollmentsLinkedUser: await count('enrollments', { linkedUserId: { $exists: true, $ne: null } }),
    afghanStudentsAll: await count('afghanstudents'),
    afghanStudentsActive: await count('afghanstudents', { status: 'active' }),
    afghanStudentsNotDeleted: await count('afghanstudents', { status: { $ne: 'deleted' } }),
    studentMembershipsAll: await count('studentmemberships'),
    studentMembershipsNotDeletedByAdmin: await count('studentmemberships', { endedReason: { $ne: 'deleted_by_admin' } }),
    studentMembershipsCurrent: await count('studentmemberships', { isCurrent: true }),
    enrollStatuses: await groupByStatus('enrollments'),
    afghanStatuses: await groupByStatus('afghanstudents'),
    membershipStatuses: await groupByStatus('studentmemberships'),
    afghanStudentsBySchool: await db.collection('afghanstudents')
      .aggregate([
        { $group: { _id: '$academicInfo.currentSchool', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
      .toArray(),
    membershipsByClass: await db.collection('studentmemberships')
      .aggregate([
        { $match: { endedReason: { $ne: 'deleted_by_admin' } } },
        { $group: { _id: '$classId', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
      .toArray()
  };

  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
