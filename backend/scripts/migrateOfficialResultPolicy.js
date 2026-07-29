require('dotenv').config();
const mongoose = require('mongoose');

const ExamType = require('../models/ExamType');
const ExamSession = require('../models/ExamSession');
const ExamDefaultMark = require('../models/ExamDefaultMark');
const ExamMark = require('../models/ExamMark');
const ExamResult = require('../models/ExamResult');
const {
  OFFICIAL_EXAM_POLICIES,
  getOfficialExamPolicy
} = require('../utils/officialResultPolicy');

const apply = process.argv.includes('--apply');
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

async function main() {
  await mongoose.connect(mongoUri);
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    examTypesToUpdate: 0,
    sessionsToUpdate: 0,
    sessionsSkippedWithRecordedMarks: 0,
    historicalSessionsPreserved: 0,
    manualReviewSessions: []
  };

  for (const policy of Object.values(OFFICIAL_EXAM_POLICIES)) {
    const examType = await ExamType.findOne({ code: policy.code });
    if (!examType) continue;
    const typeChanged = Number(examType.defaultTotalMark) !== policy.totalMark
      || Number(examType.defaultPassMark) !== policy.passMark
      || Number(examType.defaultConditionalMark) !== policy.conditionalMark;
    if (typeChanged) {
      summary.examTypesToUpdate += 1;
      if (apply) {
        examType.defaultTotalMark = policy.totalMark;
        examType.defaultPassMark = policy.passMark;
        examType.defaultConditionalMark = policy.conditionalMark;
        await examType.save();
      }
    }

    const sessions = await ExamSession.find({ examTypeId: examType._id }).populate('defaultMarkId');
    for (const session of sessions) {
      const sessionPolicy = getOfficialExamPolicy(examType);
      if (!session.defaultMarkId || !sessionPolicy) continue;
      if (['published', 'archived'].includes(String(session.status || ''))) {
        summary.historicalSessionsPreserved += 1;
        continue;
      }
      const recordedMarks = await ExamMark.countDocuments({ sessionId: session._id, markStatus: 'recorded' });
      if (recordedMarks > 0) {
        summary.sessionsSkippedWithRecordedMarks += 1;
        summary.manualReviewSessions.push({
          id: String(session._id),
          title: session.title,
          code: session.code,
          status: session.status,
          examType: policy.code,
          recordedMarks,
          currentTotalMark: Number(session.defaultMarkId.totalMark || 0)
        });
        continue;
      }
      const defaultMark = session.defaultMarkId;
      const componentKeys = ['attendanceMax', 'writtenMax', 'oralMax', 'classActivityMax', 'homeworkMax'];
      const changed = Number(defaultMark.totalMark) !== sessionPolicy.totalMark
        || Number(defaultMark.passMark) !== sessionPolicy.passMark
        || componentKeys.some((key) => Number(defaultMark.scoreComponents?.[key] || 0) !== Number(sessionPolicy.scoreComponents[key] || 0));
      if (!changed) continue;
      summary.sessionsToUpdate += 1;
      if (apply) {
        defaultMark.totalMark = sessionPolicy.totalMark;
        defaultMark.passMark = sessionPolicy.passMark;
        defaultMark.conditionalMark = sessionPolicy.conditionalMark;
        defaultMark.scoreComponents = { ...sessionPolicy.scoreComponents };
        await defaultMark.save();
        await ExamMark.updateMany(
          { sessionId: session._id, markStatus: { $ne: 'recorded' } },
          { $set: { totalMark: sessionPolicy.totalMark, obtainedMark: 0, percentage: 0 } }
        );
        await ExamResult.updateMany(
          { sessionId: session._id, markStatus: { $ne: 'recorded' } },
          { $set: { totalMark: sessionPolicy.totalMark, obtainedMark: 0, percentage: 0, averageMark: 0 } }
        );
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!apply && (summary.examTypesToUpdate || summary.sessionsToUpdate)) {
    console.log('Dry run only. Re-run with --apply to write safe changes.');
  }
  if (summary.sessionsSkippedWithRecordedMarks) {
    console.log('Sessions with recorded marks were not converted automatically; review and re-enter them under the official component limits.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
